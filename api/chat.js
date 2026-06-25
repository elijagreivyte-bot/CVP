const { asyncHandler, authError, validationError, serverError } = require('../middleware/errorHandler');
const { validate, chatRequestSchema } = require('../validation/analyzeSchema');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../middleware/logger');
const { verifyToken, applyCors } = require('./security');
const { GENERAL_PROCUREMENT_KNOWLEDGE_BASE } = require('./knowledge/procurementKnowledgeBase');

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') throw validationError([{ field: 'method', message: 'POST required' }]);

  const user = verifyToken(req);
  if (!user) throw authError('Prisijunkite norėdami tęsti');

  const validation = validate(req.body || {}, chatRequestSchema);
  if (validation.error) throw validationError(validation.details);
  const { messages, context, mode } = validation.value;

  if (!process.env.ANTHROPIC_API_KEY) throw serverError('ANTHROPIC_API_KEY nenustatytas');

  let plan = 'free';
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('plan').eq('id', user.id).single();
      if (data) plan = data.plan || 'free';
    } catch (e) {
      logger.warn('DB error on plan check:', e.message);
    }
  }

  if (mode === 'chat' && plan === 'free') {
    throw validationError([{ field: 'mode', message: 'AI asistentas prieinamas tik Pro ir Komanda planams.' }]);
  }

  // Sluoksnis 1: bendras viešųjų pirkimų žinių pagrindas — veikia visada,
  // net jei vartotojas dar neįkėlė konkretaus konkurso.
  let systemPrompt = `Tu esi viešųjų pirkimų ekspertas Lietuvoje. Atsakyk lietuvių kalba, glaustai ir konkrečiai.

${GENERAL_PROCUREMENT_KNOWLEDGE_BASE}

Naudok šį žinių sluoksnį kaip pastovų pagrindą atsakymams apie bendrus viešųjų pirkimų klausimus. Tu NETEIKI galutinės teisinės išvados kaip advokatas — padedi vartotojui suprasti sąlygas, riziką ir pasiruošti veiksmams.`;

  // Sluoksnis 2: konkretaus konkurso kontekstas — pridedamas TIK kai vartotojas
  // įkėlė konkurso dokumentus/analizę. Bendra žinių bazė (sluoksnis 1) išlieka pagrindu,
  // konkurso duomenys naudojami kaip papildomas, laikinas analizės kontekstas.
  if (context) {
    const MAX_CONTEXT_CHARS = 50000;
    let c = typeof context === 'string' ? context : JSON.stringify(context);
    if (c.length > MAX_CONTEXT_CHARS) c = c.slice(0, MAX_CONTEXT_CHARS) + '... [kontekstas sutrumpintas]';
    systemPrompt = `Tu esi viešųjų pirkimų ekspertas Lietuvoje ir šio konkurso analizės asistentas.

${GENERAL_PROCUREMENT_KNOWLEDGE_BASE}

═══════════════════════════════════════════
SLUOKSNIS 2: KONKRETAUS KONKURSO ANALIZĖ (laikinas kontekstas)
═══════════════════════════════════════════
${c}

ATSAKYMO STRUKTŪRA (privaloma, kai klausimas susijęs su šio konkurso sąlygomis):
1. "Pagal bendrą viešųjų pirkimų logiką..." — paaiškink bendrą principą iš sluoksnio 1.
2. "Šiame konkrečiame konkurse nurodyta..." — pacituok/apibendrink, ką radai konkrečiuose dokumentuose (sluoksnis 2).
3. "Galima rizika..." — įvertink, ar sąlyga aiški, įprasta, perteklinė, rizikinga, ar verta papildomo klausimo perkančiajai organizacijai.
4. "Rekomenduojamas veiksmas..." — pasiūlyk konkretų žingsnį (pateikti klausimą PO, tikslinti dokumentus, paruošti įrodymus, įvertinti kainą, atsargiai vertinti sutarties sąlygą ir pan.).

Taisyklės:
- Atsakyk TIKTAI lietuvių kalba
- Aiškiai atskirk, kas paremta bendra taisykle (sluoksnis 1) ir kas paremta šio konkurso dokumentu (sluoksnis 2)
- Remkis konkrečiais duomenimis iš analizės, ne spėliojimais
- Būk praktiškas ir konkretus — ne bendros teorijos
- Jei klausimas yra bendro pobūdžio (nesusijęs su šio konkurso specifika) — atsakyk pagal sluoksnį 1 ir nenaudok 4 dalių struktūros
- Jei klausiama apie strategiją, kainą ar dokumentus — duok konkrečius patarimus pagal šį konkursą
- Tu NETEIKI galutinės teisinės išvados kaip advokatas — padedi suprasti sąlygas, riziką ir pasiruošti veiksmams`;
  }

  if (mode === 'letter') {
    systemPrompt = 'Tu esi viešųjų pirkimų ekspertas Lietuvoje. Rašai oficialius laiškus perkančiosioms organizacijoms. Grąžink TIKTAI raštą, be komentarų, be paaiškinimų.';
  }

  if (mode === 'supplier') {
    systemPrompt = 'Tu esi viešųjų pirkimų ekspertas Lietuvoje. Pateiki praktinius pasiūlymo parengimo sąrašus. Grąžink TIKTAI JSON objektą be markdown, be ```json.';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        temperature: mode === 'chat' ? 0.3 : 0,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('Anthropic API error in chat:', errText.slice(0, 300));
      let userMsg = 'AI asistentas laikinai neprieinamas. Bandykite dar kartą po minutės.';
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.error?.type === 'overloaded_error') userMsg = 'AI asistentas šiuo metu perkrautas. Bandykite po kelių minučių.';
        else if (errJson?.error?.type === 'rate_limit_error') userMsg = 'Pasiektas užklausų limitas. Bandykite po minutės.';
        else if (errJson?.error?.message?.includes('credit')) userMsg = 'Paslauga laikinai sustabdyta. Susisiekite su administracija.';
      } catch {}
      throw serverError(userMsg);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    logger.info('Chat completed', { userId: user.id, mode });
    return res.status(200).json({ text, plan });

  } catch (error) {
    logger.error('Chat error:', error);
    throw error;
  }
});

module.exports.config = { maxDuration: 120 };

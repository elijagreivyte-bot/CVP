// ═══════════════════════════════════════════════════════════
// BIDWISE AI — SUMANUS ONBOARDING
// step:'questions' → sugeneruoja klausimus
// step:'profile'   → sukuria įmonės profilį
// Struktūra suderinta su frontend (questions/profile, variantai)
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

module.exports.config = { maxDuration: 30 };

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

async function callClaude(system, user, maxTokens = 2000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: 0.3, system, messages: [{ role: 'user', content: user }] }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error('Claude API klaida: ' + r.status);
    const data = await r.json();
    return data.content.map(c => c.text || '').join('\n');
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function parseJSON(text, fallback = {}) {
  try {
    let clean = text.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s >= 0 && e > s) clean = clean.slice(s, e + 1);
    return JSON.parse(clean);
  } catch { return fallback; }
}

// Atsarginiai klausimai jei AI nepavyksta
function defaultQuestions(sector) {
  return [
    { klausimas: `Kiek metų dirbate ${sector} srityje?`, tipas: 'select', variantai: ['Mažiau nei 1 metai', '1–3 metai', '3–5 metai', '5–10 metų', 'Daugiau nei 10 metų'] },
    { klausimas: 'Kokia jūsų metinė apyvarta?', tipas: 'select', variantai: ['iki 100 000 EUR', '100 000–500 000 EUR', '500 000–2 000 000 EUR', 'virš 2 000 000 EUR'] },
    { klausimas: 'Kiek turite darbuotojų?', tipas: 'select', variantai: ['1–9', '10–49', '50–249', '250+'] },
    { klausimas: 'Kokius sertifikatus ar licencijas turite?', tipas: 'text', variantai: [] },
    { klausimas: 'Kokia jūsų pagrindinė specializacija ar stiprybė?', tipas: 'text', variantai: [] }
  ];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });

  // Priimam ir 'step', ir 'action' (atgaliniam suderinamumui)
  const step = req.body?.step || req.body?.action || '';

  // ── ŽINGSNIS: GENERUOTI KLAUSIMUS ──
  if (step === 'questions' || step === 'generate-questions') {
    const { name, sector } = req.body;
    if (!sector) return res.status(400).json({ error: 'Nurodykite veiklos sritį' });

    try {
      const system = `Tu esi viešųjų pirkimų konsultantas. Sukurk konkrečius klausimus įmonei jos profiliui sudaryti. Atsakyk TIK JSON.`;
      const userMsg = `Įmonė „${name || 'įmonė'}" veikia srityje: ${sector}.

Sukurk 5 konkrečius klausimus, pritaikytus šiam sektoriui, kurių atsakymai padės įvertinti įmonės galimybes laimėti viešuosius pirkimus. Klausimai apie: patirtį, apyvartą, darbuotojus, sertifikatus, specializaciją.

Grąžink TIKSLIAI tokios struktūros JSON:
{
  "questions": [
    {"klausimas": "klausimo tekstas", "tipas": "select", "variantai": ["variantas 1", "variantas 2", "variantas 3"]},
    {"klausimas": "atviras klausimas", "tipas": "text", "variantai": []}
  ]
}

Naudok "tipas":"select" su variantais kur tinka (patirtis, apyvarta, darbuotojai), ir "tipas":"text" atviriems klausimams (sertifikatai, specializacija).`;

      const aiRes = await callClaude(system, userMsg, 1500);
      const parsed = parseJSON(aiRes, {});
      let questions = parsed.questions || parsed.klausimai || [];
      // Validacija — jei tuščia ar bloga struktūra, naudojam atsarginius
      if (!Array.isArray(questions) || questions.length === 0 || !questions[0].klausimas) {
        questions = defaultQuestions(sector);
      }
      return res.status(200).json({ questions });
    } catch (e) {
      console.error('Klausimų generavimo klaida:', e);
      // Vietoj klaidos — grąžinam atsarginius klausimus
      return res.status(200).json({ questions: defaultQuestions(sector) });
    }
  }

  // ── ŽINGSNIS: SUKURTI PROFILĮ ──
  if (step === 'profile' || step === 'create-profile') {
    const { name, sector, answers } = req.body;
    if (!sector) return res.status(400).json({ error: 'Trūksta duomenų' });

    try {
      let answersText = '';
      const klausimynas = {};
      if (answers && typeof answers === 'object') {
        for (const [k, v] of Object.entries(answers)) {
          if (v) { answersText += `${k}: ${v}\n`; klausimynas[k] = v; }
        }
      }

      const system = `Tu esi viešųjų pirkimų ekspertas. Iš įmonės informacijos sukurk struktūruotą profilį AI analizei. Atsakyk TIK JSON.`;
      const userMsg = `Įmonė: ${name || 'Nenurodyta'}
Veiklos sritis: ${sector}

Klausimyno atsakymai:
${answersText || 'Nepateikta'}

Sukurk profilį. Grąžink JSON:
{
  "specializacija": "konkreti specializacija",
  "stiprybes": ["3-4 stiprybės"],
  "silpnybes": ["1-2 ribojimai"],
  "sertifikatai": ["sertifikatai jei minėti"],
  "apyvarta": "apyvarta jei minėta",
  "darbuotojai": "darbuotojų skaičius jei minėtas",
  "patirtis": "patirtis jei minėta",
  "kainuStrategija": "rekomenduojama kainodaros strategija",
  "profilioSantrauka": "2-3 sakinių santrauka apie įmonę ir jos poziciją viešųjų pirkimų rinkoje"
}`;

      const aiRes = await callClaude(system, userMsg, 2000);
      const aiProfile = parseJSON(aiRes, {});

      const fullProfile = {
        name: name || '',
        sector,
        ...aiProfile,
        klausimynas,
        sukurta: new Date().toISOString()
      };

      if (process.env.SUPABASE_URL) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await supabase.from('users').update({ company_profile: fullProfile }).eq('id', user.id);
      }

      return res.status(200).json({ profile: fullProfile });
    } catch (e) {
      console.error('Profilio kūrimo klaida:', e);
      // Atsarginis paprastas profilis
      const fallback = { name: name || '', sector, klausimynas: answers || {}, profilioSantrauka: `${name || 'Įmonė'} veikia ${sector} srityje.` };
      if (process.env.SUPABASE_URL) {
        try {
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
          await supabase.from('users').update({ company_profile: fallback }).eq('id', user.id);
        } catch {}
      }
      return res.status(200).json({ profile: fallback });
    }
  }

  return res.status(400).json({ error: 'Nežinomas žingsnis' });
};

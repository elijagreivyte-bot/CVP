const { asyncHandler, authError, validationError, serverError } = require('../middleware/errorHandler');
const { validate, chatRequestSchema } = require('../validation/analyzeSchema');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const { logger } = require('../middleware/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

module.exports = asyncHandler(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  let systemPrompt = 'Tu esi viešųjų pirkimų ekspertas Lietuvoje. Atsakyk lietuvių kalba, glaustai ir konkrečiai.';

  if (context) {
    const c = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    systemPrompt = `Tu esi viešųjų pirkimų ekspertas Lietuvoje ir šio konkurso analizės asistentas.

KONKURSO ANALIZĖ:
${c}

Taisyklės:
- Atsakyk TIKTAI lietuvių kalba
- Remkis konkrečiais duomenimis iš analizės
- Būk praktiškas ir konkretus — ne bendros teorijos
- Jei klausiama apie strategiją, kainą ar dokumentus — duok konkrečius patarimus pagal šį konkursą`;
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
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: mode === 'chat' ? 0.3 : 0,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw serverError('AI klaida: ' + err.slice(0, 200));
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

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Prisijunkite norėdami tęsti' });

  const { messages, context, mode } = req.body || {};
  // messages = [{role:'user'|'assistant', content:'...'}]
  // context = analysis result JSON (optional)
  // mode = 'chat' | 'letter' | 'supplier'

  if (!messages || !messages.length) {
    return res.status(400).json({ error: 'Žinutės būtinos' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY nenustatytas' });
  }

  // Check plan for assistant feature
  let plan = 'free';
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('plan').eq('id', user.id).single();
      if (data) plan = data.plan || 'free';
    } catch (e) { console.error('DB error:', e.message); }
  }

  // Letter and supplier modes are available to all (they're part of analysis)
  // Chat/assistant mode requires pro or team
  if (mode === 'chat' && plan === 'free') {
    return res.status(403).json({ error: 'AI asistentas prieinamas tik Pro ir Komanda planams.' });
  }

  // Build system prompt based on mode
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
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        temperature: mode === 'chat' ? 0.3 : 0,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'AI klaida: ' + err.slice(0, 200) });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    return res.status(200).json({ text, plan });

  } catch (e) {
    console.error('Chat error:', e.message);
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};

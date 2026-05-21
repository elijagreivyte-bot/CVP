// ═══════════════════════════════════════════════════════════
// BIDWISE AI — SUMANUS ONBOARDING
// 2 endpoint'ai: generate-questions + create-profile
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

async function callClaude(system, user, maxTokens = 2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  if (!r.ok) throw new Error('Claude API klaida: ' + r.status);
  const data = await r.json();
  return data.content.map(c => c.text || '').join('\n');
}

function parseJSON(text, fallback = {}) {
  try {
    let clean = text.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s >= 0 && e > s) clean = clean.slice(s, e + 1);
    return JSON.parse(clean);
  } catch { return fallback; }
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

  const { action } = req.body || {};

  // ─────────────────────────────────────────
  // ŽINGSNIS 2: Generuoti sektoriui pritaikytus klausimus
  // ─────────────────────────────────────────
  if (action === 'generate-questions') {
    const { name, sector } = req.body;
    if (!sector) return res.status(400).json({ error: 'Nurodykite veiklos sritį' });

    try {
      const system = `Tu esi viešųjų pirkimų konsultantas. Sukurk konkrečius klausimus įmonei, kad galėtum sukurti tikslų jos profilį viešųjų pirkimų analizei. Klausimai turi būti specifiški sektoriui. Atsakyk TIK JSON.`;
      const userMsg = `Įmonė „${name || 'įmonė'}" veikia srityje: ${sector}.

Sukurk 5-6 konkrečius klausimus, kurių atsakymai padės įvertinti šios įmonės galimybes laimėti viešuosius pirkimus būtent šiame sektoriuje. Klausimai turi būti apie: apyvartą, patirtį, sertifikatus, pajėgumus, specializaciją, geografiją — pritaikyti sektoriui.

Grąžink JSON:
{
  "klausimai": [
    {"id": "q1", "klausimas": "konkretus klausimas", "tipas": "text/number/select", "placeholder": "užuomina ką įvesti"}
  ]
}`;
      const res2 = await callClaude(system, userMsg, 1500);
      const parsed = parseJSON(res2, { klausimai: [] });
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─────────────────────────────────────────
  // ŽINGSNIS 3: Sukurti pilną įmonės profilį
  // ─────────────────────────────────────────
  if (action === 'create-profile') {
    const { name, sector, answers } = req.body;
    if (!sector) return res.status(400).json({ error: 'Trūksta duomenų' });

    try {
      // Surenkam klausimyno atsakymus į tekstą
      let answersText = '';
      const klausimynas = {};
      if (answers && typeof answers === 'object') {
        for (const [k, v] of Object.entries(answers)) {
          if (v) {
            answersText += `${k}: ${v}\n`;
            klausimynas[k] = v;
          }
        }
      }

      const system = `Tu esi viešųjų pirkimų ekspertas. Iš įmonės pateiktos informacijos sukurk struktūruotą profilį, kuris bus naudojamas AI analizei. Būk konkretus ir naudingas. Atsakyk TIK JSON.`;
      const userMsg = `Įmonė: ${name || 'Nenurodyta'}
Veiklos sritis: ${sector}

Klausimyno atsakymai:
${answersText || 'Nepateikta'}

Sukurk struktūruotą įmonės profilį viešųjų pirkimų analizei. Grąžink JSON:
{
  "specializacija": "konkreti įmonės specializacija",
  "stiprybes": ["3-4 stiprybės kurios padeda laimėti konkursus"],
  "silpnybes": ["1-2 galimi ribojimai"],
  "sertifikatai": ["paminėti sertifikatai jei buvo"],
  "kainuStrategija": "rekomenduojama kainodaron strategija šiai įmonei",
  "tikslai": "ko įmonė siekia viešuosiuose pirkimuose",
  "profilioSantrauka": "2-3 sakinių santrauka kuri apibūdina įmonę ir jos pozicija viešųjų pirkimų rinkoje"
}`;
      const aiRes = await callClaude(system, userMsg, 2000);
      const aiProfile = parseJSON(aiRes, {});

      // Sudedam pilną profilį
      const fullProfile = {
        name: name || '',
        sector,
        ...aiProfile,
        klausimynas,  // SVARBU: išsaugom visus klausimyno atsakymus
        sukurta: new Date().toISOString()
      };

      // Išsaugom į DB
      if (process.env.SUPABASE_URL) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await supabase.from('users').update({ company_profile: fullProfile }).eq('id', user.id);
      }

      return res.status(200).json({ profile: fullProfile });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Nežinomas veiksmas' });
};

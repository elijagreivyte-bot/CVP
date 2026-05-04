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

  const { text, documentName } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Dokumentų tekstas būtinas' });

  // Check Supabase only if configured
  let userData = { plan: 'free', free_analyses_left: 3 };
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) {
        userData = data;
        if (userData.plan === 'free' && userData.free_analyses_left <= 0) {
          return res.status(403).json({ error: 'Išnaudojote nemokamas analizes' });
        }
        if (userData.plan === 'free') {
          await supabase.from('users').update({ free_analyses_left: userData.free_analyses_left - 1 }).eq('id', user.id);
        }
      }
    } catch(e) { /* continue without DB check */ }
  }

  const prompt = `Išanalizuok šiuos CVP konkurso dokumentus ir grąžink TIKTAI JSON objektą be jokio kito teksto.

JSON struktūra:
{
  "pavadinimas": "konkurso pavadinimas",
  "score": 70,
  "scoreLabel": "Geros galimybės",
  "perkanciojiOrganizacija": "organizacijos pavadinimas",
  "pirkimoTipas": "tipas",
  "bendraVerte": "vertė €",
  "cpt": "kodas arba Nenurodyta",
  "terminai": {
    "pasiulymoTerminas": "data",
    "vokuAtplesimas": "data arba Nenurodyta",
    "vykdymoTerminas": "trukmė",
    "garantija": "laikotarpis",
    "klausimaiIki": "data arba Nenurodyta"
  },
  "kvalifikacija": {
    "apyvarta": "reikalavimas",
    "darbuotojai": "skaičius",
    "patirtis": "reikalavimas",
    "sertifikatai": "reikalavimai",
    "finansinis": "reikalavimas",
    "kita": "kiti reikalavimai"
  },
  "vertinimoKriterijai": [{"kriterijus": "pavadinimas", "svoris": "30%", "aprasas": "aprašas"}],
  "techninieReikalavimai": "techninių reikalavimų aprašas",
  "finansinesSalygos": {
    "avansas": "sąlygos",
    "apmokejimas": "terminai",
    "baudos": "nuobaudos",
    "garantinis": "išlaikymas",
    "indeksavimas": "sąlygos"
  },
  "draudimas": "draudimo reikalavimai",
  "subtiekejiai": "ar leidžiama",
  "konsorciumai": "ar galima",
  "rizikos": ["rizika 1", "rizika 2"],
  "galimybes": ["galimybė 1", "galimybė 2"],
  "strategija": "laimėjimo strategija",
  "butinaiIttraukti": [{"dokumentas": "pavadinimas", "pastaba": "pastaba"}],
  "dazniausiasKlaidos": ["klaida 1", "klaida 2"],
  "klausimaiPerkanciajai": ["klausimas 1", "klausimas 2"],
  "isViso": "bendra išvada 5-6 sakiniai"
}

DOKUMENTAI:
${text.slice(0, 60000)}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      return res.status(500).json({ error: 'AI klaida: ' + (data.error?.message || JSON.stringify(data)) });
    }

    const raw = data.content?.[0]?.text || '';
    let result;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : raw);
    } catch(e) {
      console.error('JSON parse error:', raw.slice(0, 500));
      return res.status(500).json({ error: 'Nepavyko apdoroti AI atsakymo. Bandykite dar kartą.' });
    }

    // Save to DB
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await supabase.from('analyses').insert([{
          user_id: user.id,
          document_name: documentName || 'Dokumentas',
          score: result.score || 0,
          result_json: result
        }]);
      } catch(e) { /* non-critical */ }
    }

    return res.status(200).json({ result });
  } catch(e) {
    console.error('Analyze error:', e.message);
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};


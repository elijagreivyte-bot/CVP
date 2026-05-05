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

  const { text, documentName, projectId, companyProfile } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Dokumentų tekstas būtinas' });

  // Get user data and check limits
  let userData = { plan: 'free', free_analyses_left: 3 };
  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) {
        userData = data;
        if (userData.plan === 'free' && userData.free_analyses_left <= 0) {
          return res.status(403).json({ error: 'Išnaudojote nemokamas analizes' });
        }
      }
    } catch(e) { console.error('DB read error:', e.message); }
  }

  // Build company context
  let profileContext = '';
  if (companyProfile && Object.keys(companyProfile).length > 0) {
    profileContext = `\n\nĮMONĖS PROFILIS (analizuok atsižvelgdamas į šią įmonę):
- Pavadinimas: ${companyProfile.name || 'Nenurodyta'}
- Veiklos sritis: ${companyProfile.sector || 'Nenurodyta'}
- Specializacija: ${companyProfile.specialization || 'Nenurodyta'}
- Įmonės dydis: ${companyProfile.size || 'Nenurodyta'}
- Patirtis: ${companyProfile.experience || 'Nenurodyta'}
- Sertifikatai: ${companyProfile.certificates || 'Nenurodyta'}
- Apyvarta: ${companyProfile.revenue || 'Nenurodyta'}\n`;
  }

  const prompt = `Tu esi aukščiausios kvalifikacijos viešųjų pirkimų ekspertas Lietuvoje.
Išanalizuok šiuos CVP konkurso dokumentus IŠSAMIAI ir grąžink TIKTAI JSON objektą be jokio kito teksto.
${profileContext}

Atlik DETALIĄ analizę – kiekvieną sekciją išplėsk, paaiškink, pateik konkrečius pavyzdžius.

JSON struktūra (visi laukai PRIVALOMI):
{
  "pavadinimas": "tikslus konkurso pavadinimas",
  "score": 70,
  "scoreLabel": "Geros galimybės",
  "perkanciojiOrganizacija": "tikslus organizacijos pavadinimas",
  "pirkimoTipas": "procedūros tipas",
  "bendraVerte": "vertė su valiuta",
  "cpt": "CPV kodas",
  "terminai": {
    "pasiulymoTerminas": "data ir valanda",
    "vokuAtplesimas": "data arba Nenurodyta",
    "vykdymoTerminas": "trukmė",
    "garantija": "garantijos laikotarpis",
    "klausimaiIki": "data klausimams"
  },
  "kvalifikacija": {
    "apyvarta": "konkretus reikalavimas",
    "darbuotojai": "skaičius su detalėmis",
    "patirtis": "DETALUS patirties reikalavimas",
    "sertifikatai": "VISI reikalingi sertifikatai",
    "finansinis": "finansiniai reikalavimai",
    "kita": "kiti specifiniai reikalavimai"
  },
  "vertinimoKriterijai": [{"kriterijus": "pavadinimas", "svoris": "30%", "aprasas": "DETALUS aprašas kaip vertinama"}],
  "techninieReikalavimai": "ITIN DETALUS techninių reikalavimų aprašas su visomis pozicijomis, parametrais, kiekiais",
  "finansinesSalygos": {
    "avansas": "avanso sąlygos",
    "apmokejimas": "apmokėjimo terminai",
    "baudos": "konkrečios nuobaudos su sumomis",
    "garantinis": "garantinio išlaikymo sąlygos",
    "indeksavimas": "kainos indeksavimo sąlygos"
  },
  "draudimas": "konkretūs draudimo reikalavimai su sumomis",
  "subtiekejiai": "ar leidžiama, kokiomis sąlygomis",
  "konsorciumai": "ar galima, sąlygos",
  "rizikos": ["KONKREČIOS rizikos su paaiškinimais"],
  "galimybes": ["KONKREČIOS galimybės"],
  "strategija": "ITIN DETALI laimėjimo strategija – ką tiksliai daryti, kaip pateikti pasiūlymą, į ką akcentuoti",
  "butinaiIttraukti": [{"dokumentas": "pavadinimas", "pastaba": "kodėl būtina ir kaip paruošti"}],
  "dazniausiasKlaidos": ["konkrečios klaidos"],
  "klausimaiPerkanciajai": ["konkretūs klausimai"],
  "isViso": "10-15 sakinių IŠSAMI išvada – ar dalyvauti, kodėl, ko atkreipti dėmesį, atsižvelgiant į įmonės profilį"
}

DOKUMENTAI:
${text.slice(0, 80000)}`;

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
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error('Anthropic error:', errData);
      return res.status(500).json({ error: 'AI klaida: ' + errData.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    let result;
    try {
      // Try to extract JSON from response
      let cleaned = raw.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      const match = cleaned.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : cleaned);
    } catch(e) {
      console.error('JSON parse error. Raw:', raw.slice(0, 1000));
      return res.status(500).json({ error: 'Nepavyko apdoroti AI atsakymo. Bandykite dar kartą.', debug: raw.slice(0, 300) });
    }

    // Decrement counter only on success
    if (supabase && userData.plan === 'free') {
      try {
        await supabase.from('users').update({ free_analyses_left: userData.free_analyses_left - 1 }).eq('id', user.id);
      } catch(e) { console.error('Counter update error:', e.message); }
    }

    // Save analysis
    if (supabase) {
      try {
        await supabase.from('analyses').insert([{
          user_id: user.id,
          project_id: projectId || null,
          document_name: documentName || 'Dokumentas',
          score: result.score || 0,
          result_json: result
        }]);
      } catch(e) { console.error('Save error:', e.message); }
    }

    return res.status(200).json({ result });
  } catch(e) {
    console.error('Analyze error:', e.message, e.stack);
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};

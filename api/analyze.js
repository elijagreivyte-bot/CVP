const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

const SYSTEM_PROMPT = `Tu esi aukščiausios kvalifikacijos viešųjų pirkimų ekspertas Lietuvoje su 15 metų patirtimi. 
Išanalizuok pateiktus CVP konkurso dokumentus itin detaliai ir profesionaliai. 
Grąžink TIKTAI validų JSON objektą be jokio kito teksto ir be markdown simbolių.`;

const JSON_SCHEMA = `{
  "pavadinimas": "trumpas konkurso pavadinimas",
  "score": 75,
  "scoreLabel": "Geros galimybės",
  "perkanciojiOrganizacija": "tikslus pavadinimas",
  "pirkimoTipas": "procedūros tipas",
  "bendraVerte": "vertė su valiuta arba Nenurodyta",
  "cpt": "CPT/CPV kodas arba Nenurodyta",
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
    "sertifikatai": "sertifikatai",
    "finansinis": "reikalavimas",
    "kita": "kiti reikalavimai"
  },
  "vertinimoKriterijai": [{"kriterijus": "pavadinimas", "svoris": "30%", "aprasas": "kaip vertinama"}],
  "techninieReikalavimai": "detalus aprašymas",
  "finansinesSalygos": {
    "avansas": "sąlygos",
    "apmokejimas": "terminai",
    "baudos": "nuobaudos",
    "garantinis": "išlaikymas",
    "indeksavimas": "sąlygos"
  },
  "draudimas": "rūšys ir sumos",
  "subtiekejiai": "ar leidžiama ir kokios sąlygos",
  "konsorciumai": "ar galima",
  "rizikos": ["konkreti rizika su paaiškinimu"],
  "galimybes": ["konkreti galimybė su paaiškinimu"],
  "strategija": "detalios konkrečios rekomendacijos kaip laimėti",
  "butinaiIttraukti": [{"dokumentas": "pavadinimas", "pastaba": "kodėl būtina"}],
  "dazniausiasKlaidos": ["tipinė klaida"],
  "klausimaiPerkanciajai": ["konkretus klausimas"],
  "isViso": "5-6 sakiniai: ar rekomenduojama dalyvauti, argumentai, patarimas"
}`;

async function callClaude(text) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analizuok šiuos CVP konkurso dokumentus ir grąžink JSON pagal šią struktūrą:\n${JSON_SCHEMA}\n\nDOKUMENTAI:\n${text}`
      }]
    })
  });
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function callGemini(text, focus) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Išanalizuok šią CVP konkurso dokumento dalį (${focus}). Grąžink JSON su rastais duomenimis:\n${text}` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    })
  });
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJSON(raw) {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw);
  } catch { return null; }
}

function mergeResults(r1, r2, r3) {
  const base = r1 || {};
  if (r2) {
    if (r2.techninieReikalavimai) base.techninieReikalavimai = r2.techninieReikalavimai;
    if (r2.vertinimoKriterijai) base.vertinimoKriterijai = r2.vertinimoKriterijai;
  }
  if (r3) {
    if (r3.finansinesSalygos) base.finansinesSalygos = r3.finansinesSalygos;
    if (r3.draudimas) base.draudimas = r3.draudimas;
  }
  return base;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Prisijunkite norėdami tęsti' });

  try {
    const { data: userData, error: ue } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (ue || !userData) return res.status(401).json({ error: 'Vartotojas nerastas' });

    if (userData.plan === 'free') {
      if (userData.free_analyses_left <= 0) {
        return res.status(403).json({
          error: 'Išnaudojote nemokamas analizes',
          upgradeUrl: '/api/create-checkout'
        });
      }
      await supabase.from('users').update({ free_analyses_left: userData.free_analyses_left - 1 }).eq('id', user.id);
    }

    const { text, documentName } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Dokumentų tekstas būtinas' });

    let result;
    const textLen = text.length;

    if (textLen < 80000) {
      // Single Claude call
      const raw = await callClaude(text.slice(0, 80000));
      result = parseJSON(raw);
    } else {
      // Large doc mode: split into 3 parts
      const third = Math.floor(textLen / 3);
      const part1 = text.slice(0, third); // kvalifikacija + terminai
      const part2 = text.slice(third, third * 2); // techniniai
      const part3 = text.slice(third * 2); // finansiniai

      const [raw1, raw2, raw3] = await Promise.all([
        callClaude(part1),
        callGemini(part2, 'techniniai reikalavimai'),
        callClaude(part3)
      ]);
      result = mergeResults(parseJSON(raw1), parseJSON(raw2), parseJSON(raw3));
    }

    if (!result) {
      result = { pavadinimas: 'Nepavyko išanalizuoti', score: 0, scoreLabel: 'Klaida', isViso: 'Dokumentų analizė nepavyko. Patikrinkite failų kokybę.' };
    }

    // Save to DB
    await supabase.from('analyses').insert([{
      user_id: user.id,
      document_name: documentName || 'Dokumentas',
      score: result.score || 0,
      result_json: result
    }]);

    return res.status(200).json({ result });
  } catch (e) {
    return res.status(500).json({ error: 'Analizės klaida: ' + e.message });
  }
};

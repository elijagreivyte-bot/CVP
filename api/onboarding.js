const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

async function callClaude(system, userMsg, maxTokens = 2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });
  if (!r.ok) throw new Error('Claude API klaida: ' + r.status);
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });

  const { step, sector, name, answers } = req.body || {};

  // ── STEP 1: Generate smart questions based on sector ──
  if (step === 'questions') {
    if (!sector) return res.status(400).json({ error: 'Sritis būtina' });

    const system = `Tu esi viešųjų pirkimų ekspertas Lietuvoje. Tavo užduotis — sugeneruoti tikslingus klausimus apie įmonę, kad vėliau galėtum personalizuoti CVP konkursų analizę.`;

    const prompt = `Įmonė veikia šioje srityje: "${sector}".
Sugeneruok 7 konkrečius klausimus apie šią įmonę, kurie padės personalizuoti viešųjų pirkimų konkursų analizę.

Klausimai turi atskleisti:
- Tikslią specializaciją ir patirtį
- Turimus sertifikatus ir licencijas
- Finansines galimybes (be konkrečių skaičių)
- Stipriąsias ir silpnąsias puses viešuosiuose pirkimuose
- Ankstesnę patirtį su panašiais konkursais

Grąžink TIK JSON masyvą, be markdown:
[
  {"id": "q1", "klausimas": "...", "tipas": "text|select|multiselect", "variantai": ["..."]}
]

"tipas" = "text" jei laisvas atsakymas, "select" jei vienas variantas, "multiselect" jei keli.
Variantai tik "select" ir "multiselect" tipams.`;

    try {
      const raw = await callClaude(system, prompt, 1500);
      let questions;
      try {
        const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
        const s = clean.indexOf('['), e = clean.lastIndexOf(']');
        questions = JSON.parse(clean.slice(s, e + 1));
      } catch (e) {
        // Fallback questions if parse fails
        questions = getDefaultQuestions(sector);
      }
      return res.status(200).json({ questions });
    } catch (e) {
      return res.status(200).json({ questions: getDefaultQuestions(sector) });
    }
  }

  // ── STEP 2: Process answers into rich company profile ──
  if (step === 'profile') {
    if (!answers || !sector) return res.status(400).json({ error: 'Trūksta duomenų' });

    const system = `Tu esi viešųjų pirkimų ekspertas Lietuvoje. Sukuri išsamų įmonės profilį, kuris bus naudojamas personalizuoti CVP konkursų analizę.`;

    const answersText = Object.entries(answers)
      .map(([q, a]) => `Klausimas: ${q}\nAtsakymas: ${a}`)
      .join('\n\n');

    const prompt = `Įmonė: "${name || 'Nenurodyta'}"
Sritis: "${sector}"

Atsakymai į profilinimo klausimus:
${answersText}

Sukurk išsamų įmonės profilį JSON formatu. Grąžink TIK JSON, be markdown:
{
  "name": "${name || ''}",
  "sector": "${sector}",
  "specializacija": "2-3 sakiniai apie tikslią specializaciją",
  "stiprybės": ["stiprybė1", "stiprybė2", "stiprybė3"],
  "silpnybės": ["silpnybė1", "silpnybė2"],
  "sertifikatai": "sertifikatų sąrašas",
  "patirtis": "patirties aprašymas",
  "tipinieKonkursai": "kokio tipo konkursai tinkamiausi",
  "vengtiniKonkursai": "kokių konkursų geriau vengti",
  "kainuStrategija": "kaip turi elgtis su kainodara",
  "finansinesStiprybe": "maža/vidutinė/didelė",
  "apyvartaGruppe": "iki100k/100k-500k/500k-2m/virs2m",
  "darbuotojuGrupe": "1-9/10-49/50-249/250+",
  "profilioSantrauka": "3-4 sakiniai — bendra santrauka kas yra ši įmonė viešųjų pirkimų kontekste"
}`;

    try {
      const raw = await callClaude(system, prompt, 2000);
      let profile;
      try {
        const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
        const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
        profile = JSON.parse(clean.slice(s, e + 1));
      } catch (e) {
        profile = { name, sector, specializacija: answersText.slice(0, 200), profilioSantrauka: 'Profilis išsaugotas' };
      }

      // Save to Supabase
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await supabase.from('users').update({ company_profile: profile }).eq('id', user.id);
      }

      return res.status(200).json({ profile });
    } catch (e) {
      console.error('Profile error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Nežinomas žingsnis' });
};

function getDefaultQuestions(sector) {
  return [
    { id: 'q1', klausimas: `Kiek metų jūsų įmonė dirba ${sector} srityje?`, tipas: 'select', variantai: ['Mažiau nei 1 metai', '1–3 metai', '3–5 metai', '5–10 metų', 'Daugiau nei 10 metų'] },
    { id: 'q2', klausimas: 'Kokia jūsų įmonės metinė apyvarta?', tipas: 'select', variantai: ['iki 100 000 EUR', '100 000 – 500 000 EUR', '500 000 – 2 000 000 EUR', 'virš 2 000 000 EUR'] },
    { id: 'q3', klausimas: 'Kiek darbuotojų dirba jūsų įmonėje?', tipas: 'select', variantai: ['1–9', '10–49', '50–249', '250 ir daugiau'] },
    { id: 'q4', klausimas: 'Kokie sertifikatai ar licencijos jūsų įmonei yra išduoti?', tipas: 'text', variantai: [] },
    { id: 'q5', klausimas: 'Ar jūsų įmonė anksčiau dalyvavo viešuosiuose pirkimuose?', tipas: 'select', variantai: ['Ne, pirmą kartą', 'Taip, bet nelaimėjome', 'Taip, turime laimėtų konkursų'] },
    { id: 'q6', klausimas: 'Koks yra didžiausias sutarties dydis, kurį galite vykdyti?', tipas: 'select', variantai: ['iki 50 000 EUR', '50 000–200 000 EUR', '200 000–1 000 000 EUR', 'virš 1 000 000 EUR'] },
    { id: 'q7', klausimas: 'Kokia yra jūsų pagrindinė konkurencinė privalumas prieš kitus tiekėjus?', tipas: 'text', variantai: [] }
  ];
}

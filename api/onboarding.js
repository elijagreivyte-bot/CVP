// ═══════════════════════════════════════════════════════════
// BIDWISE AI — SUMANUS ONBOARDING (patobulinta versija)
// Naudoja veiklos aprašymą + kritinius klausimus tiksliam scoring'ui
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

// Kritiniai klausimai — universalūs, dengia svarbiausius scoring faktorius
function coreQuestions(sector) {
  return [
    { klausimas: 'Kuriuose regionuose dirbate?', tipas: 'multiselect', variantai: ['Visa Lietuva', 'Vilnius ir aplinkinės', 'Kaunas ir aplinkinės', 'Klaipėda ir aplinkinės', 'Šiauliai', 'Panevėžys', 'Kiti regionai'] },
    { klausimas: 'Kokia didžiausia projekto vertė kurią galite įgyvendinti?', tipas: 'select', variantai: ['iki 5 000 EUR', '5 000–50 000 EUR', '50 000–200 000 EUR', '200 000–500 000 EUR', '500 000 EUR+'] },
    { klausimas: 'Kokia jūsų metinė apyvarta?', tipas: 'select', variantai: ['iki 100 000 EUR', '100 000–500 000 EUR', '500 000–2 mln. EUR', 'virš 2 mln. EUR'] },
    { klausimas: 'Ar turite viešųjų pirkimų patirties?', tipas: 'select', variantai: ['Taip, reguliariai dalyvaujame', 'Taip, kelis kartus', 'Tik bandėme', 'Ne, dar neturime'] },
    { klausimas: 'Kiek metų dirbate ' + sector + ' srityje?', tipas: 'select', variantai: ['Mažiau nei 1 metai', '1–3 metai', '3–5 metai', '5–10 metų', 'Daugiau nei 10 metų'] },
    { klausimas: 'Kokius sertifikatus ar licencijas turite?', tipas: 'text', variantai: [] },
    { klausimas: 'Kokio tipo konkursų vengiate ar nepageidaujate?', tipas: 'text', variantai: [] }
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

  const step = req.body?.step || req.body?.action || '';

  // ── PASIŪLYTI SRITĮ pagal veiklos aprašymą (AI klasifikacija) ──
  if (step === 'suggest-sector') {
    const { activity } = req.body;
    if (!activity || activity.length < 10) return res.status(400).json({ error: 'Aprašykite veiklą' });

    const SEKTORIAI = [
      'Statybos ir remontas', 'IT ir programinė įranga', 'Medicinos įranga ir farmacija',
      'Švietimas ir mokymai', 'Valymo paslaugos', 'Maisto tiekimas ir maitinimas',
      'Transportas ir logistika', 'Konsultacijos ir tyrimai', 'Inžinerinės paslaugos',
      'Aplinkosauga ir želdynas', 'Saugos ir apsaugos paslaugos'
    ];

    try {
      const system = `Tu esi viešųjų pirkimų klasifikatorius. Iš įmonės veiklos aprašymo nustatyk tinkamiausią sritį ir ištrauk visas veiklas. Atsakyk TIK JSON.`;
      const userMsg = `Įmonės veiklos aprašymas:
"${activity}"

Galimos sritys:
${SEKTORIAI.map((s, i) => (i + 1) + '. ' + s).join('\n')}
12. Kita

Nustatyk VISAS tinkamas sritis iš sąrašo (įmonė gali dirbti keliose). Jei veikla apima kelias sritis — nurodyk visas. Ištrauk atpažintas veiklas. Grąžink JSON:
{
  "sektoriai": ["tinkama sritis 1", "sritis 2"],
  "sektorius": "pagrindinė (svarbiausia) sritis",
  "veiklos": ["atpažinta veikla 1", "veikla 2", "veikla 3"],
  "aprasymas": "patobulintas struktūruotas veiklos aprašymas (2-3 sakiniai)",
  "paaiskinimas": "trumpas paaiškinimas kodėl šios sritys tinka (1 sakinys)"
}`;

      const aiRes = await callClaude(system, userMsg, 1200);
      const parsed = parseJSON(aiRes, {});
      if (!parsed.sektorius && !parsed.sektoriai) {
        return res.status(200).json({ sektorius: 'Kita', sektoriai: ['Kita'], veiklos: [], aprasymas: activity, paaiskinimas: 'Veikla apima kelias sritis.' });
      }
      // Užtikrinam kad būtų ir sektorius, ir sektoriai
      if (!parsed.sektoriai && parsed.sektorius) parsed.sektoriai = [parsed.sektorius];
      if (!parsed.sektorius && parsed.sektoriai && parsed.sektoriai.length) parsed.sektorius = parsed.sektoriai[0];
      return res.status(200).json(parsed);
    } catch (e) {
      console.error('Sektoriaus nustatymo klaida:', e);
      return res.status(200).json({ sektorius: 'Kita', veiklos: [], aprasymas: activity, paaiskinimas: 'Nepavyko automatiškai nustatyti.' });
    }
  }


  // ── GENERUOTI KLAUSIMUS ──
  if (step === 'questions' || step === 'generate-questions') {
    const { name, sector, activity } = req.body;
    if (!sector) return res.status(400).json({ error: 'Nurodykite veiklos sritį' });

    try {
      const system = `Tu esi viešųjų pirkimų konsultantas. Sukurk klausimus įmonės profiliui — kad AI galėtų tiksliai vertinti konkursų tinkamumą. Klausimai turi dengti: regioną, projektų dydį, pajėgumus, sertifikatus, patirtį, specializaciją ir ko įmonė vengia. Atsakyk TIK JSON.`;
      const userMsg = `Įmonė: „${name || 'įmonė'}"
Veiklos sritis: ${sector}
${activity ? 'Veiklos aprašymas: ' + activity : ''}

Sukurk 6-7 klausimus pritaikytus ${activity ? 'šios įmonės aprašytai veiklai' : 'šiam sektoriui'}. BŪTINAI įtrauk klausimus apie:
- Regioną (kur dirba)
- Didžiausią projekto vertę
- Viešųjų pirkimų patirtį
- Specializaciją/pajėgumus
- Sertifikatus
- Ko vengia

Grąžink TIKSLIAI tokios struktūros JSON:
{
  "questions": [
    {"klausimas": "tekstas", "tipas": "select", "variantai": ["v1", "v2", "v3"]},
    {"klausimas": "tekstas", "tipas": "multiselect", "variantai": ["v1", "v2"]},
    {"klausimas": "atviras", "tipas": "text", "variantai": []}
  ]
}

Naudok "select" vienam pasirinkimui, "multiselect" keliems (pvz. regionai), "text" atviriems.`;

      const aiRes = await callClaude(system, userMsg, 2000);
      const parsed = parseJSON(aiRes, {});
      let questions = parsed.questions || parsed.klausimai || [];
      if (!Array.isArray(questions) || questions.length === 0 || !questions[0].klausimas) {
        questions = coreQuestions(sector);
      }
      return res.status(200).json({ questions });
    } catch (e) {
      console.error('Klausimų klaida:', e);
      return res.status(200).json({ questions: coreQuestions(sector) });
    }
  }

  // ── SUKURTI PROFILĮ ──
  if (step === 'profile' || step === 'create-profile') {
    const { name, sector, answers, activity } = req.body;
    if (!sector) return res.status(400).json({ error: 'Trūksta duomenų' });

    try {
      let answersText = '';
      const klausimynas = {};
      if (answers && typeof answers === 'object') {
        for (const [k, v] of Object.entries(answers)) {
          if (v) { answersText += `${k}: ${v}\n`; klausimynas[k] = v; }
        }
      }

      const system = `Tu esi viešųjų pirkimų ekspertas. Sukurk išsamų struktūruotą įmonės profilį AI konkursų analizei. Iš veiklos aprašymo ištrauk visas paslaugas ir gebėjimus (capability tags). Atsakyk TIK JSON.`;
      const userMsg = `Įmonė: ${name || 'Nenurodyta'}
Pagrindinė sritis: ${sector}
${activity ? 'Veiklos aprašymas: ' + activity : ''}

Klausimyno atsakymai:
${answersText || 'Nepateikta'}

Sukurk išsamų profilį. Grąžink JSON:
{
  "specializacija": "konkreti specializacija",
  "veiklos": ["visos paslaugos/veiklos kurias teikia — ištrauk iš aprašymo"],
  "capabilityTags": ["gebėjimų žymos angliškai ir lietuviškai paieškai"],
  "regionai": ["kuriuose regionuose dirba"],
  "maxProjektoVerte": "didžiausia projekto vertė",
  "apyvarta": "metinė apyvarta",
  "darbuotojai": "darbuotojų/brigadų skaičius",
  "patirtis": "patirtis metais ir objektų tipai",
  "viesPirkPatirtis": "viešųjų pirkimų patirties lygis",
  "sertifikatai": ["sertifikatai/licencijos"],
  "stiprybes": ["3-4 stiprybės konkursams"],
  "silpnybes": ["1-2 ribojimai"],
  "vengia": ["ko įmonė vengia"],
  "kainuStrategija": "rekomenduojama kainodaros strategija",
  "profilioSantrauka": "3-4 sakinių santrauka apie įmonę, jos pajėgumus ir poziciją viešųjų pirkimų rinkoje"
}`;

      const aiRes = await callClaude(system, userMsg, 2500);
      const aiProfile = parseJSON(aiRes, {});

      const fullProfile = {
        name: name || '',
        sector,
        activity: activity || '',
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
      console.error('Profilio klaida:', e);
      const fallback = { name: name || '', sector, activity: activity || '', klausimynas: answers || {}, profilioSantrauka: `${name || 'Įmonė'} veikia ${sector} srityje. ${activity || ''}`.trim() };
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

// ═══════════════════════════════════════════════════════════
// BIDWISE AI — MULTI-AGENT ANALIZĖ
// 5 specializuoti agentai + stiprus kliento profilio naudojimas
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

// ── Anthropic API kvietimas ──
async function callClaude(system, user, maxTokens = 2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error('Claude API klaida: ' + r.status + ' ' + err.slice(0, 200));
  }
  const data = await r.json();
  return data.content.map(c => c.text || '').join('\n');
}

// ── Saugus JSON parse ──
function parseJSON(text, fallback = {}) {
  try {
    let clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) clean = clean.slice(start, end + 1);
    return JSON.parse(clean);
  } catch (e) {
    console.error('JSON parse failed:', e.message);
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════
// KLIENTO PROFILIO KONTEKSTAS — naudojamas VISUOSE agentuose
// ═══════════════════════════════════════════════════════════
function buildProfileContext(profile) {
  if (!profile || !profile.profilioSantrauka) {
    return {
      hasProfile: false,
      contextText: 'KLIENTO PROFILIS NEUŽPILDYTAS. Analizuok bendrai, bet pabrėžk, kad užpildžius įmonės profilį analizė būtų tikslesnė ir personalizuota.'
    };
  }

  // Surenkam VISĄ profilio informaciją į struktūruotą tekstą
  let ctx = 'KLIENTO ĮMONĖS PROFILIS (naudok šią informaciją kaip pagrindą vertinant atitikimą):\n\n';

  if (profile.name) ctx += `• Įmonės pavadinimas: ${profile.name}\n`;
  if (profile.sector) ctx += `• Veiklos sritis: ${profile.sector}\n`;
  if (profile.specializacija) ctx += `• Specializacija: ${profile.specializacija}\n`;
  if (profile.apyvarta) ctx += `• Metinė apyvarta: ${profile.apyvarta}\n`;
  if (profile.darbuotojai) ctx += `• Darbuotojų skaičius: ${profile.darbuotojai}\n`;
  if (profile.patirtis) ctx += `• Patirtis: ${profile.patirtis}\n`;

  if (Array.isArray(profile.sertifikatai) && profile.sertifikatai.length)
    ctx += `• Turimi sertifikatai: ${profile.sertifikatai.join(', ')}\n`;
  if (Array.isArray(profile.stiprybes) && profile.stiprybes.length)
    ctx += `• Stiprybės: ${profile.stiprybes.join('; ')}\n`;
  if (Array.isArray(profile.silpnybes) && profile.silpnybes.length)
    ctx += `• Silpnybės/ribojimai: ${profile.silpnybes.join('; ')}\n`;
  if (profile.kainuStrategija) ctx += `• Kainodaron strategija: ${profile.kainuStrategija}\n`;
  if (profile.tikslai) ctx += `• Tikslai: ${profile.tikslai}\n`;
  if (profile.regionas) ctx += `• Veiklos regionas: ${profile.regionas}\n`;

  // Klausimyno atsakymai — SVARBIAUSIA dalis personalizacijai
  if (profile.klausimynas && typeof profile.klausimynas === 'object') {
    ctx += '\nKLIENTO KLAUSIMYNO ATSAKYMAI (specifinė informacija apie įmonę — naudok šiuos atsakymus aktyviai):\n';
    for (const [klausimas, atsakymas] of Object.entries(profile.klausimynas)) {
      if (atsakymas) ctx += `  – ${klausimas}: ${atsakymas}\n`;
    }
  }

  if (profile.profilioSantrauka)
    ctx += `\nAI PROFILIO SANTRAUKA:\n${profile.profilioSantrauka}\n`;

  return { hasProfile: true, contextText: ctx };
}

// ═══════════════════════════════════════════════════════════
// AGENTAI
// ═══════════════════════════════════════════════════════════

// AGENTAS 1: Dokumentų parser
async function agentDocParser(docText) {
  const system = `Tu esi viešųjų pirkimų dokumentų analitikas. Ištrauk struktūruotą informaciją iš pirkimo dokumentų. Atsakyk TIK JSON formatu, be jokio papildomo teksto.`;
  const user = `Išanalizuok šį CVP pirkimo dokumentą ir ištrauk pagrindinę informaciją.

DOKUMENTAS:
${docText.slice(0, 30000)}

Grąžink JSON su laukais:
{
  "pavadinimas": "tikslus pirkimo pavadinimas",
  "perkancioji": "perkančiosios organizacijos pavadinimas",
  "verte": "numatoma vertė su valiuta arba 'nenurodyta'",
  "bvpzKodai": ["BVPŽ kodai jei nurodyti"],
  "pirkimoTipas": "atviras konkursas / supaprastintas / mažos vertės / kt.",
  "terminas": "pasiūlymų pateikimo terminas (data ir laikas)",
  "trukme": "sutarties trukmė",
  "pirkimoObjektas": "trumpas objekto aprašymas 2-3 sakiniai"
}`;
  const res = await callClaude(system, user, 1500);
  return parseJSON(res, { pavadinimas: 'Pirkimo dokumentas', perkancioji: 'Nenurodyta' });
}

// AGENTAS 2: Kvalifikacijos atitikimas — NAUDOJA PROFILĮ STIPRIAI
async function agentQualification(docText, profileCtx) {
  const system = `Tu esi viešųjų pirkimų kvalifikacijos ekspertas. Tavo užduotis — palyginti pirkimo kvalifikacinius reikalavimus su KONKREČIA kliento įmone ir tiksliai pasakyti ar ji atitinka. Būk konkretus ir remkis kliento profiliu. Atsakyk TIK JSON formatu.`;

  const user = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIRKIMO DOKUMENTAS:
${docText.slice(0, 28000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UŽDUOTIS: Palygink pirkimo kvalifikacinius reikalavimus su KONKREČIAIS kliento įmonės duomenimis aukščiau. ${profileCtx.hasProfile ? 'Aktyviai naudok kliento profilį ir klausimyno atsakymus — kiekvieną reikalavimą įvertink būtent šios įmonės kontekste.' : ''}

Grąžink JSON:
{
  "reikalavimai": [
    {
      "reikalavimas": "konkretus kvalifikacinis reikalavimas",
      "kliento_atitikimas": "TINKA / NETINKA / ABEJOTINA / TRŪKSTA_INFO",
      "paaiskinimas": "kodėl būtent ši įmonė atitinka ar ne, remiantis profiliu"
    }
  ],
  "bendrasAtitikimas": "TINKA / NETINKA / DALINAI",
  "kritiniaiTrukumai": ["ko trūksta šiai konkrečiai įmonei kad galėtų dalyvauti"],
  "atitikimoBalas": 75
}`;

  const res = await callClaude(system, user, 2500);
  return parseJSON(res, { bendrasAtitikimas: 'DALINAI', reikalavimai: [], atitikimoBalas: 50 });
}

// AGENTAS 3: Kainodara — naudoja kliento kainų strategiją
async function agentPricing(docText, profileCtx) {
  const system = `Tu esi viešųjų pirkimų kainodaron strategas. Analizuok vertinimo kriterijus ir patark kaip klientui formuoti kainą. Atsakyk TIK JSON formatu.`;

  const user = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIRKIMO DOKUMENTAS:
${docText.slice(0, 26000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UŽDUOTIS: Išanalizuok vertinimo kriterijus ir jų svorius. ${profileCtx.hasProfile ? 'Atsižvelk į kliento kainodaron strategiją ir galimybes iš profilio.' : ''} Patark kaip formuoti konkurencingą kainą.

Grąžink JSON:
{
  "vertinimoKriterijai": [
    {"kriterijus": "pvz. Kaina", "svoris": "60%", "komentaras": "ką tai reiškia klientui"}
  ],
  "kainosStrategija": "konkreti rekomendacija kaip formuoti kainą šiai įmonei",
  "konkurencingumas": "ar kliento įprasta kaina bus konkurencinga",
  "patarimai": ["konkretūs kainodaron patarimai"]
}`;

  const res = await callClaude(system, user, 2000);
  return parseJSON(res, { kainosStrategija: 'Reikia daugiau informacijos', vertinimoKriterijai: [] });
}

// AGENTAS 4: Rizikos
async function agentRisk(docText, profileCtx) {
  const system = `Tu esi viešųjų pirkimų rizikų analitikas. Ieškok paslėptų sąlygų, baudų, nepalankių nuostatų ir dažnų klaidų. Atsakyk TIK JSON formatu.`;

  const user = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIRKIMO DOKUMENTAS:
${docText.slice(0, 26000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UŽDUOTIS: Identifikuok rizikas ir paslėptas sąlygas. ${profileCtx.hasProfile ? 'Atkreipk dėmesį į rizikas kurios būtent šiai įmonei (pagal jos profilį) gali būti problematiškos.' : ''}

Grąžink JSON:
{
  "rizikos": [
    {"rizika": "konkreti rizika", "lygis": "AUKŠTA / VIDUTINĖ / ŽEMA", "rekomendacija": "ką daryti"}
  ],
  "paslėptosSalygos": ["nestandartinės ar nepalankios sąlygos"],
  "klausimaiPerkanciajai": ["klausimai kuriuos verta užduoti perkančiajai organizacijai"]
}`;

  const res = await callClaude(system, user, 2000);
  return parseJSON(res, { rizikos: [], paslėptosSalygos: [], klausimaiPerkanciajai: [] });
}

// AGENTAS 5: Strategijos sintezė — apjungia viską į tikimybę + strategiją
async function agentStrategy(docInfo, qualification, pricing, risk, profileCtx) {
  const system = `Tu esi vyriausiasis viešųjų pirkimų strategas. Apjungei keturių agentų analizę į vieną aiškų laimėjimo tikimybės balą ir konkrečią personalizuotą strategiją. Atsakyk TIK JSON formatu.`;

  const user = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENTŲ ANALIZĖS REZULTATAI:

DOKUMENTŲ INFO: ${JSON.stringify(docInfo)}

KVALIFIKACIJA: ${JSON.stringify(qualification)}

KAINODARA: ${JSON.stringify(pricing)}

RIZIKOS: ${JSON.stringify(risk)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UŽDUOTIS: Apjunk visą analizę. Apskaičiuok laimėjimo tikimybę (0-100%) būtent šiai įmonei ${profileCtx.hasProfile ? 'remiantis jos profiliu ir klausimyno atsakymais' : '(profilis neužpildytas — naudok bendrą vertinimą)'}. Pateik konkrečią laimėjimo strategiją — ką akcentuoti, kokius dokumentus paruošti.

Grąžink JSON:
{
  "tikimybesBalas": 72,
  "verdiktas": "REKOMENDUOJAMA / SĄLYGINAI / NEREKOMENDUOJAMA",
  "santrauka": "2-3 sakinių apibendrinimas kodėl būtent toks balas",
  "strategija": [
    "konkretus žingsnis 1 — ką akcentuoti pasiūlyme",
    "konkretus žingsnis 2",
    "konkretus žingsnis 3"
  ],
  "akcentuoti": ["kliento stiprybės kurias verta pabrėžti šiame konkurse"],
  "dokumentai": ["kokius dokumentus reikia paruošti"],
  "kitiZingsniai": "ką daryti pirmiausia"
}`;

  const res = await callClaude(system, user, 2500);
  return parseJSON(res, { tikimybesBalas: 50, verdiktas: 'SĄLYGINAI', strategija: [] });
}

// ═══════════════════════════════════════════════════════════
// PAGRINDINIS HANDLERIS
// ═══════════════════════════════════════════════════════════
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });

  const { documentText, documentName } = req.body || {};
  if (!documentText || documentText.length < 50) {
    return res.status(400).json({ error: 'Dokumento tekstas per trumpas arba tuščias' });
  }

  try {
    // Gaunam kliento profilį iš DB
    let profile = {};
    if (process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('company_profile').eq('id', user.id).single();
      profile = (data && data.company_profile) || {};
    }

    const profileCtx = buildProfileContext(profile);

    // Vykdom agentus nuosekliai
    const docInfo = await agentDocParser(documentText);
    const qualification = await agentQualification(documentText, profileCtx);
    const pricing = await agentPricing(documentText, profileCtx);
    const risk = await agentRisk(documentText, profileCtx);
    const strategy = await agentStrategy(docInfo, qualification, pricing, risk, profileCtx);

    // Apjungiam į galutinį rezultatą
    const result = {
      ...docInfo,
      score: strategy.tikimybesBalas || qualification.atitikimoBalas || 50,
      verdiktas: strategy.verdiktas,
      santrauka: strategy.santrauka,
      kvalifikacija: qualification,
      kainodara: pricing,
      rizikos: risk,
      strategija: strategy,
      personalizuota: profileCtx.hasProfile,
      _meta: { agentai: 5, profilisPanaudotas: profileCtx.hasProfile }
    };

    // Išsaugom į DB
    if (process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: saved } = await supabase.from('analyses').insert({
        user_id: user.id,
        document_name: documentName || result.pavadinimas || 'Analizė',
        score: result.score,
        result_json: result
      }).select('id').single();
      if (saved) result._analysisId = saved.id;

      // Sumažinam nemokamų analizių skaičių
      if (user.plan === 'free') {
        await supabase.rpc('decrement_free_analyses', { uid: user.id }).catch(() => {});
      }
    }

    return res.status(200).json({ result });

  } catch (e) {
    console.error('Analizės klaida:', e);
    return res.status(500).json({ error: 'Analizės klaida: ' + e.message });
  }
};

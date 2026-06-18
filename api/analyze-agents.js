// ═══════════════════════════════════════════════════════════
// BIDWISE AI — ANALIZĖ (vienas greitas kvietimas)
// Grąžina struktūrą suderintą su renderResult frontend'e.
// temperature:0 — vienodi rezultatai tam pačiam dokumentui.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, applyCors } = require('./security');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

module.exports.config = { maxDuration: 300 };

async function callClaude(system, user, maxTokens = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
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
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const err = await r.text();
      throw new Error('Claude API klaida: ' + r.status + ' ' + err.slice(0, 200));
    }
    const data = await r.json();
    return data.content.map(c => c.text || '').join('\n');
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Analizė užtruko per ilgai. Pabandykite atskirą dokumentą vietoj viso ZIP.');
    throw e;
  }
}

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

function buildProfileContext(profile) {
  if (!profile || (!profile.profilioSantrauka && !profile.sector && !profile.name)) {
    return {
      hasProfile: false,
      contextText: 'KLIENTO PROFILIS NEUŽPILDYTAS. Vertink bendrai pagal dokumento turinį. Balą skaičiuok objektyviai pagal reikalavimų sudėtingumą ir konkurencijos lygį.'
    };
  }
  let ctx = 'KLIENTO ĮMONĖS PROFILIS (naudok aktyviai vertindamas atitikimą ir tikimybę):\n\n';
  if (profile.name) ctx += `• Pavadinimas: ${profile.name}\n`;
  if (profile.sector) ctx += `• Veiklos sritis: ${profile.sector}\n`;
  if (profile.activity) ctx += `• Veiklos aprašymas: ${profile.activity}\n`;
  if (profile.specializacija) ctx += `• Specializacija: ${profile.specializacija}\n`;
  if (Array.isArray(profile.veiklos) && profile.veiklos.length)
    ctx += `• Teikiamos paslaugos: ${profile.veiklos.join(', ')}\n`;
  if (Array.isArray(profile.capabilityTags) && profile.capabilityTags.length)
    ctx += `• Gebėjimai (tags): ${profile.capabilityTags.join(', ')}\n`;
  if (Array.isArray(profile.regionai) && profile.regionai.length)
    ctx += `• Veiklos regionai: ${profile.regionai.join(', ')}\n`;
  if (profile.maxProjektoVerte) ctx += `• Didžiausia projekto vertė: ${profile.maxProjektoVerte}\n`;
  if (profile.apyvarta) ctx += `• Metinė apyvarta: ${profile.apyvarta}\n`;
  if (profile.darbuotojai) ctx += `• Darbuotojų/brigadų: ${profile.darbuotojai}\n`;
  if (profile.patirtis) ctx += `• Patirtis: ${profile.patirtis}\n`;
  if (profile.viesPirkPatirtis) ctx += `• Viešųjų pirkimų patirtis: ${profile.viesPirkPatirtis}\n`;
  if (Array.isArray(profile.sertifikatai) && profile.sertifikatai.length)
    ctx += `• Sertifikatai: ${profile.sertifikatai.join(', ')}\n`;
  if (Array.isArray(profile.stiprybes) && profile.stiprybes.length)
    ctx += `• Stiprybės: ${profile.stiprybes.join('; ')}\n`;
  if (Array.isArray(profile.silpnybes) && profile.silpnybes.length)
    ctx += `• Silpnybės: ${profile.silpnybes.join('; ')}\n`;
  if (Array.isArray(profile.vengia) && profile.vengia.length)
    ctx += `• Vengia (NESIŪLYK tokių konkursų): ${profile.vengia.join('; ')}\n`;
  if (profile.kainuStrategija) ctx += `• Kainodaros strategija: ${profile.kainuStrategija}\n`;
  if (profile.klausimynas && typeof profile.klausimynas === 'object') {
    ctx += '\nKLAUSIMYNO ATSAKYMAI (specifinė info — naudok aktyviai):\n';
    for (const [k, v] of Object.entries(profile.klausimynas)) {
      if (v) ctx += `  – ${k}: ${v}\n`;
    }
  }
  if (profile.profilioSantrauka) ctx += `\nPROFILIO SANTRAUKA:\n${profile.profilioSantrauka}\n`;
  return { hasProfile: true, contextText: ctx };
}

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });

  const { documentText, text, documentName, companyProfile } = req.body || {};
  const docText = documentText || text || '';
  if (!docText || docText.length < 50) {
    return res.status(400).json({ error: 'Dokumento tekstas per trumpas arba tuščias' });
  }
  const docTextSafe = String(docText).replace(/<[^>]*>/g, '').trim();

  try {
    let profile = companyProfile || {};
    if ((!profile || !profile.sector) && process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('company_profile').eq('id', user.id).single();
      if (data && data.company_profile) profile = data.company_profile;
    }
    const profileCtx = buildProfileContext(profile);

    const system = `Tu esi Bidwise AI — ekspertų komanda viešųjų pirkimų analizei (dokumentų, kvalifikacijos, kainodaros, rizikų ir strategijos analitikai). Analizuok lietuviškai. Būk objektyvus ir nuoseklus — tam pačiam dokumentui visada duok tą patį tikimybės balą. Grąžink TIK JSON, be jokio papildomo teksto.`;

    const userMsg = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIRKIMO DOKUMENTAS:
${docTextSafe.slice(0, 30000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Išanalizuok šį konkursą ${profileCtx.hasProfile ? 'KONKREČIAI šios įmonės kontekste — naudok jos profilį ir klausimyno atsakymus' : '(profilis neužpildytas — bendras objektyvus vertinimas)'}.

Grąžink TIKSLIAI tokios struktūros JSON (visi laukai privalomi, jei nėra informacijos — rašyk "Nenurodyta"):

{
  "pavadinimas": "tikslus pirkimo pavadinimas",
  "perkanciojiOrganizacija": "perkančiosios organizacijos pavadinimas",
  "pirkimoTipas": "atviras konkursas / supaprastintas / mažos vertės",
  "bendraVerte": "numatoma vertė su valiuta arba Nenurodyta",
  "cpt": "pagrindinis BVPŽ kodas",
  "score": 65,
  "scoreLabel": "Aukšta tikimybė / Vidutinė tikimybė / Žema tikimybė",
  "scorePaaiskinimas": "2-3 sakiniai kodėl būtent toks balas šiai įmonei",
  "terminai": {
    "pasiulymoTerminas": "data ir laikas",
    "vokuAtplesimas": "data arba Nenurodyta",
    "klausimaiIki": "data arba Nenurodyta",
    "vykdymoTerminas": "sutarties trukmė",
    "garantija": "garantinis terminas arba Nenurodyta"
  },
  "kvalifikacija": {
    "apyvarta": "reikalaujama apyvarta",
    "darbuotojai": "reikalavimai darbuotojams",
    "patirtis": "reikalaujama patirtis",
    "sertifikatai": "reikalaujami sertifikatai",
    "finansinis": "finansiniai reikalavimai"
  },
  "finansinesSalygos": {
    "avansas": "ar mokamas avansas",
    "apmokejimas": "apmokėjimo sąlygos",
    "baudos": "baudų sąlygos",
    "garantinis": "garantinio laikotarpio sąlygos"
  },
  "vertinimoKriterijai": [
    {"kriterijus": "pvz. Kaina", "svoris": "60%"}
  ],
  "rizikos": ["konkreti rizika 1", "rizika 2", "rizika 3"],
  "galimybes": ["galimybė 1", "galimybė 2"],
  "pasleptosNuostatos": ["nepalanki nuostata jei yra"],
  "strategija": "konkreti laimėjimo strategija šiai įmonei (1 pastraipa)",
  "prioritetiniaiZingsniai": [
    {"terminas": "Iki kada", "zingsnis": "ką padaryti"}
  ],
  "butinaiIttraukti": [
    {"dokumentas": "reikalingas dokumentas", "pastaba": "komentaras"}
  ],
  "isViso": "galutinė išvada ar verta dalyvauti ir kodėl (2-3 sakiniai)"
}`;

    const aiRes = await callClaude(system, userMsg, 4000);
    const result = parseJSON(aiRes, null);

    if (!result || !result.pavadinimas) {
      return res.status(500).json({ error: 'AI nepavyko struktūrizuoti atsakymo. Pabandykite dar kartą.' });
    }

    result.score = typeof result.score === 'number' ? result.score : 50;
    result.personalizuota = profileCtx.hasProfile;

    if (process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: saved } = await supabase.from('analyses').insert({
        user_id: user.id,
        document_name: documentName || result.pavadinimas || 'Analizė',
        score: result.score,
        result_json: result
      }).select('id').single();
      if (saved) result._analysisId = saved.id;
    }

    return res.status(200).json({ result });

  } catch (e) {
    console.error('Analizės klaida:', e);
    return res.status(500).json({ error: 'Analizės klaida: ' + e.message });
  }
};

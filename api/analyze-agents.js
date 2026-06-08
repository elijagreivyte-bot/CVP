// ═══════════════════════════════════════════════════════════
// BIDWISE AI — ANALIZĖ (vienas greitas kvietimas)
// Grąžina struktūrą suderintą su renderResult frontend'e.
// temperature:0 — vienodi rezultatai tam pačiam dokumentui.
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
let CVP_KNOWLEDGE = '';
try { CVP_KNOWLEDGE = require('./cvp-knowledge').CVP_KNOWLEDGE || ''; }
catch (e) { console.warn('cvp-knowledge.js nerastas, tęsiam be jo'); }

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

module.exports.config = { maxDuration: 300 };

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

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
  if (!text) return fallback;
  let clean = text.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  if (start >= 0) clean = clean.slice(start);
  // 1 bandymas: pilnas JSON
  try {
    const end = clean.lastIndexOf('}');
    if (end > 0) return JSON.parse(clean.slice(0, end + 1));
  } catch (e) { /* tęsiam į taisymą */ }
  // 2 bandymas: jei JSON nukirptas (per max_tokens) — taisom
  // Strategija: nukerpam iki paskutinio "saugaus" taško (po pilno elemento), tada uždarom skliaustus
  function tryClose(s) {
    const stack = []; let inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') stack.pop();
    }
    let out = s;
    if (inStr) out += '"';
    // uždarom likusius atvirus skliaustus teisinga (atvirkštine) tvarka
    for (let i = stack.length - 1; i >= 0; i--) {
      out += stack[i] === '{' ? '}' : ']';
    }
    return out;
  }
  // Nukerpam nebaigtą uodegą: ieškom paskutinio } arba ] ir bandom nuo ten
  for (let cut = clean.length; cut > 0; cut = clean.lastIndexOf('}', cut - 1)) {
    let candidate = clean.slice(0, cut);
    // pašalinam kabantį kablelį
    candidate = candidate.replace(/,\s*$/, '');
    try { return JSON.parse(tryClose(candidate)); } catch (e) { /* bandom trumpesnį */ }
    if (cut <= 1) break;
  }
  console.error('JSON parse failed: nepavyko sutaisyti');
  return fallback;
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

  try {
    let profile = companyProfile || {};
    if ((!profile || !profile.sector) && process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('company_profile').eq('id', user.id).single();
      if (data && data.company_profile) profile = data.company_profile;
    }
    const profileCtx = buildProfileContext(profile);

    const system = `Tu esi Bidwise AI ORKESTRATORIUS — koordinuoji 5 specializuotų agentų darbą viešųjų pirkimų analizei. Analizuok lietuviškai. Būk objektyvus ir nuoseklus — tam pačiam dokumentui visada duok tą patį tikimybės balą. Niekur neprasimanyk faktų — jei dokumente nėra informacijos, rašyk "Nenurodyta". Visur, kur įmanoma, naudok citatas ir puslapių numerius. Grąžink TIK JSON, be jokio papildomo teksto, be markdown žymėjimo.

DARBO PRINCIPAS — 5 SPECIALIZUOTI AGENTAI:
Tu vykdai 5 agentus sekvenciškai vienoje sesijoje, ir tada sujungi jų rezultatus į VIENĄ galutinį JSON. Kiekvienas agentas turi savo specializaciją ir grąžina savo lauko subset'ą. Galutiniame JSON taip pat pridedi "agentReports" lauką su kiekvieno agento statusu (status, summary, confidence).

${CVP_KNOWLEDGE}`;

    const userMsg = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIRKIMO DOKUMENTAS:
${docText.slice(0, 30000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VYKDYK 5 AGENTUS SEKVENCIŠKAI ${profileCtx.hasProfile ? '(naudok įmonės profilį kontekste, kur taikoma)' : '(profilis neužpildytas — bendras objektyvus vertinimas)'}:


╔══════════════════════════════════════════════╗
║ AGENTAS 1: documentsAgent                    ║
╠══════════════════════════════════════════════╣
ROLĖ: Pagrindinių pirkimo duomenų ekstraktorius.
UŽDUOTIS: Iš dokumento ištraukti faktinę informaciją:
  - pavadinimas, perkančioji organizacija, pirkimo tipas
  - bendra vertė, BVPŽ/CPV kodas
  - terminai (pasiūlymo terminas, vokų atplėšimas, klausimai iki, vykdymo trukmė, garantija)
ŠALTINIS: TIK dokumento tekstas. Nieko neprasimanyk.
CONFIDENCE: high (0.85+) jei radai visus pagrindinius laukus; mid (0.5-0.85) jei dalis trūksta; low (<0.5) jei tik skelbimas.
GRĄŽINA JSON laukus: pavadinimas, perkanciojiOrganizacija, pirkimoTipas, bendraVerte, cpt, terminai{}.


╔══════════════════════════════════════════════╗
║ AGENTAS 2: qualificationAgent                ║
╠══════════════════════════════════════════════╣
ROLĖ: Kvalifikacinių reikalavimų analitikas.
UŽDUOTIS: Iš dokumento ištraukti VISUS kvalifikacinius reikalavimus (apyvarta, darbuotojai, patirtis, sertifikatai, finansiniai pajėgumai, įvykdyti projektai).
ATITIKIMAS: Kiekvieną reikalavimą palygink su įmonės profiliu (jei pateiktas).
  - TINKA → įmonė aiškiai atitinka
  - NETINKA → įmonė aiškiai neatitinka (pvz. reikia 5m patirties, įmonė turi 2m)
  - ABEJOTINA → trūksta informacijos profilyje arba dviprasmiška
CITATA: Kiekvienam reikalavimui — puslapis (numeris arba 0) + trumpa citata (≤15 žodžių).
CONFIDENCE: high jei radai aiškius reikalavimus su citatomis; mid jei bendri; low jei tik užuominos.
GRĄŽINA JSON laukus: kvalifikacija{apyvarta, darbuotojai, patirtis, sertifikatai, finansinis, reikalavimai[]}.


╔══════════════════════════════════════════════╗
║ AGENTAS 3: pricingAgent                      ║
╠══════════════════════════════════════════════╣
ROLĖ: Vertinimo kriterijų ir kainodaros įžvalgų analitikas.
UŽDUOTIS:
  - Surask vertinimo kriterijus su svoriais (kaina X%, kokybė Y%, ekonominis naudingumas)
  - Surask finansines sąlygas (avansas, apmokėjimo terminai, baudos, garantinis laikotarpis)
  - Įvertink: ar pirkimas DAUGIAU kainos varomas (>70% kaina) ar yra kokybinių taškų galimybė
CONFIDENCE: high jei radai aiškius svorius; mid jei tik kriterijų sąrašą; low jei nieko nerasta.
GRĄŽINA JSON laukus: vertinimoKriterijai[], finansinesSalygos{}.


╔══════════════════════════════════════════════╗
║ AGENTAS 4: riskAgent                         ║
╠══════════════════════════════════════════════╣
ROLĖ: Rizikų ir paslėptų nuostatų detektorius.
UŽDUOTIS: Surask:
  - Konkrečias rizikas (neproporcingos baudos, vienašališkos sąlygos, neaiškūs terminai, didelės garantijos, vėluojantis atsiskaitymas, ribojanti specifikacija)
  - Paslėptas nepalankias nuostatas (gilesnės sutarties sąlygos)
  - Galimybes (jei matai privalumus konkrečiai šiai įmonei)
LYGIS: AUKŠTA (gali kainuoti pinigus arba užkirsti kelią), VIDUTINĖ (problemos einant į priekį), ŽEMA (nedidelės nepatogybės).
CITATA: kiekvienai rizikai — puslapis + citata (≤15 žodžių).
KLAUSIMAI: Sugeneruok 2-4 konkrečius klausimus perkančiajai organizacijai (dėl neaiškumo, dviprasmiškumo).
CONFIDENCE: high jei radai aiškias rizikas su citatomis; mid jei tik užuominos; low jei dokumentas labai bendro pobūdžio.
GRĄŽINA JSON laukus: rizikos[], pasleptosNuostatos[], galimybes[], klausimaiPerkanciajai[].


╔══════════════════════════════════════════════╗
║ AGENTAS 5: strategyAgent                     ║
╠══════════════════════════════════════════════╣
ROLĖ: Strategijos ir verdikto sintezatorius.
UŽDUOTIS: Naudoja PRIEŠ TAI 4 agentų rezultatus, kad sukurtų galutinį verdiktą.
SCORE APSKAIČIAVIMAS (0-100):
  - Kvalifikacijos atitikimas (40%): kiek reikalavimų TINKA / NETINKA
  - Rizikų lygis (25%): kuo daugiau AUKŠTŲ rizikų, tuo mažesnis balas
  - Vertinimo kriterijai (20%): ar įmonė gali konkuruoti kainoje arba kokybėje
  - Įmonės pajėgumai (15%): vertė vs įmonės dydis
  Be profilio — neutralus 50-65 balas, koreguok pagal rizikas/reikalavimus.
VERDIKTAS:
  - TINKA (žalia) — balas ≥70, esminiai kriterijai atitinka
  - SVARSTYTINA (geltona) — balas 40-69, dalies trūksta arba yra rimtų rizikų
  - NEREKOMENDUOJAMA (raudona) — balas <40 arba kritinis neatitikimas
PRESET QUESTIONS: Sugeneruok TIKSLIAI 5 konkrečius klausimus, kuriuos tiekėjas norėtų užduoti AI asistentui apie ŠĮ konkrečią konkursą. Klausimai SPECIFIŠKI šio dokumento turiniui — paminėk konkrečius reikalavimus/sertifikatus/sumas iš dokumento. PVZ. NE "Kokie reikalavimai?" o "Ar 3 metų patirties IT diegime reikalavimas mums tinka?".
GRĄŽINA JSON laukus: score, verdiktas, verdiktoPriezastys[], scoreLabel, scorePaaiskinimas, strategija, prioritetiniaiZingsniai[], butinaiIttraukti[], isViso, presetQuestions[].


╔══════════════════════════════════════════════╗
║ FINALAS: agentReports + SUJUNGIMAS           ║
╠══════════════════════════════════════════════╣
Sujunk visų 5 agentų rezultatus į VIENĄ JSON pagal žemiau pateiktą schemą.
Pridėk laukUS "agentReports" su kiekvieno agento ataskaita:
  - status: "completed" (jei rado duomenis), "limited" (jei dalis trūksta), "no_data" (jei dokumente nieko nebuvo)
  - summary: 1 sakinys (max 100 simbolių) — KĄ konkrečiai šis agentas rado
  - confidence: 0.0-1.0 (kiek pasitiki savo rezultatu — priklauso nuo dokumento išsamumo)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GALUTINĖ JSON SCHEMA (visi laukai privalomi, jei nėra duomenų — "Nenurodyta"):

{
  "pavadinimas": "tikslus pirkimo pavadinimas",
  "perkanciojiOrganizacija": "perkančiosios organizacijos pavadinimas",
  "pirkimoTipas": "atviras konkursas / supaprastintas / mažos vertės",
  "bendraVerte": "numatoma vertė su valiuta arba Nenurodyta",
  "cpt": "pagrindinis BVPŽ kodas",
  "score": 65,
  "verdiktas": "TINKA / SVARSTYTINA / NEREKOMENDUOJAMA",
  "verdiktoPriezastys": ["trumpa priežastis 1", "priežastis 2", "priežastis 3"],
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
    "finansinis": "finansiniai reikalavimai",
    "reikalavimai": [{"reikalavimas": "konkretus kvalifikacinis reikalavimas", "atitinka": "TINKA / NETINKA / ABEJOTINA", "puslapis": 0, "citata": "trumpa citata iš dokumento jei radai"}]
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
  "rizikos": [{"rizika": "konkreti rizika", "lygis": "AUKŠTA / VIDUTINĖ / ŽEMA", "puslapis": 0, "citata": "trumpa tiksli citata iš dokumento (iki 15 žodžių) jei radai, kitaip tuščia"}],
  "galimybes": ["galimybė 1", "galimybė 2"],
  "pasleptosNuostatos": ["nepalanki nuostata jei yra"],
  "klausimaiPerkanciajai": ["klausimas perkančiajai dėl neaiškios sąlygos", "klausimas dėl reikalavimo patikslinimo"],
  "strategija": "konkreti laimėjimo strategija šiai įmonei (1 pastraipa)",
  "prioritetiniaiZingsniai": [
    {"terminas": "Iki kada", "zingsnis": "ką padaryti"}
  ],
  "butinaiIttraukti": [
    {"dokumentas": "reikalingas dokumentas", "pastaba": "komentaras"}
  ],
  "isViso": "galutinė išvada ar verta dalyvauti ir kodėl (2-3 sakiniai)",
  "presetQuestions": [
    "5 konkretūs klausimai apie ŠĮ konkursą — su konkrečiomis sumomis/sertifikatais iš dokumento",
    "klausimas 2",
    "klausimas 3",
    "klausimas 4",
    "klausimas 5"
  ],
  "agentReports": {
    "documentsAgent": {"status": "completed", "summary": "Ką rado šis agentas (max 100 simb)", "confidence": 0.9},
    "qualificationAgent": {"status": "completed", "summary": "Ką rado", "confidence": 0.85},
    "pricingAgent": {"status": "completed", "summary": "Ką rado", "confidence": 0.75},
    "riskAgent": {"status": "completed", "summary": "Ką rado", "confidence": 0.8},
    "strategyAgent": {"status": "completed", "summary": "Verdikto pagrindimas", "confidence": 0.85}
  }
}

VERTINIMO GAIRĖS:
- verdiktas: TINKA (žalia) jei atitinka esminius kriterijus; SVARSTYTINA (geltona) jei trūksta dalies; NEREKOMENDUOJAMA (raudona) jei kritinis neatitikimas.
- Kur randi reikalavimą ar riziką dokumente, įrašyk "puslapis" (numerį jei matomas) ir "citata" (trumpa tiksli ištrauka iki 15 žodžių). Jei nematai puslapio — rašyk 0, citata tuščia.
- agentReports.summary turi būti KONKRETUS: NE "rado informacijos", o "Rasta 7 kvalifikaciniai reikalavimai, 3 ABEJOTINA" arba "Tik skelbimas — detalūs reikalavimai SAK faile, neįkeltas".
- agentReports.confidence: žiūrėk realiai į dokumento išsamumą. Jei tik skelbimas — visi agentai turi confidence ~0.3-0.5. Jei pilnas SAK — 0.8-0.95.`;

    const aiRes = await callClaude(system, userMsg, 8000);
    const result = parseJSON(aiRes, null);

    if (!result || !result.pavadinimas) {
      return res.status(500).json({ error: 'AI nepavyko struktūrizuoti atsakymo. Pabandykite dar kartą.' });
    }

    result.score = typeof result.score === 'number' ? result.score : 50;
    result.personalizuota = profileCtx.hasProfile;

    // Apsauga: jei AI negrąžino agentReports (sena versija ar klaida), užpildom default
    if (!result.agentReports || typeof result.agentReports !== 'object') {
      result.agentReports = {
        documentsAgent: { status: 'completed', summary: 'Pagrindiniai pirkimo duomenys ištraukti', confidence: 0.7 },
        qualificationAgent: { status: 'completed', summary: 'Kvalifikacijos reikalavimai išanalizuoti', confidence: 0.7 },
        pricingAgent: { status: 'completed', summary: 'Vertinimo kriterijai ir kainodara peržiūrėti', confidence: 0.7 },
        riskAgent: { status: 'completed', summary: 'Rizikos ir klausimai sugeneruoti', confidence: 0.7 },
        strategyAgent: { status: 'completed', summary: 'Verdiktas ir strategija parengti', confidence: 0.7 }
      };
    } else {
      // Užtikrinam, kad visi 5 agentai yra (jei AI praleido kažkurį)
      const defaultAgents = ['documentsAgent','qualificationAgent','pricingAgent','riskAgent','strategyAgent'];
      defaultAgents.forEach(name => {
        if (!result.agentReports[name]) {
          result.agentReports[name] = { status: 'completed', summary: 'Įvykdyta', confidence: 0.7 };
        } else {
          // Normalizuojam confidence į intervalą 0-1
          const c = result.agentReports[name].confidence;
          if (typeof c !== 'number' || c < 0 || c > 1) result.agentReports[name].confidence = 0.7;
        }
      });
    }

    if (process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      // doc_text apribojam iki 200KB (apie 50K tokenų) — saugumui ir vietai
      const docTextSafe = (documentText || '').slice(0, 200000);
      const presetQs = Array.isArray(result.presetQuestions) ? result.presetQuestions.slice(0, 5) : [];
      const { data: saved } = await supabase.from('analyses').insert({
        user_id: user.id,
        document_name: documentName || result.pavadinimas || 'Analizė',
        score: result.score,
        result_json: result,
        doc_text: docTextSafe,
        preset_questions: presetQs,
        chat_messages: []
      }).select('id').single();
      if (saved) result._analysisId = saved.id;
    }

    return res.status(200).json({ result });

  } catch (e) {
    console.error('Analizės klaida:', e);
    let msg = e.message || 'Nežinoma klaida';
    if (e.name === 'AbortError' || msg.includes('per ilgai')) {
      msg = 'Analizė užtruko per ilgai. Dokumentas per didelis — pabandykite įkelti tik svarbiausius failus (techninę specifikaciją ir pirkimo sąlygas), ne visą ZIP.';
    } else if (msg.includes('429') || msg.toLowerCase().includes('overload') || msg.includes('529')) {
      msg = 'AI serveris šiuo metu perkrautas. Palaukite minutę ir bandykite vėl.';
    } else if (msg.includes('401') || msg.includes('403')) {
      msg = 'Autentifikacijos klaida. Atsijunkite ir prisijunkite iš naujo.';
    }
    return res.status(500).json({ error: msg });
  }
};

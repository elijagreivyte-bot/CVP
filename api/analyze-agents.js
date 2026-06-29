// ═══════════════════════════════════════════════════════════
// BIDWISE AI — ANALIZĖ (vienas greitas kvietimas)
// Grąžina struktūrą suderintą su renderResult frontend'e.
// temperature:0 — vienodi rezultatai tam pačiam dokumentui.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, applyCors } = require('./security');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

async function callClaude(system, user, maxTokens = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 280000);
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
  let cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return fallback;
  cleaned = cleaned.slice(start);

  try { return JSON.parse(cleaned); } catch (e) {}

  // Atsakymas nutrūko per anksti (max_tokens) — bandome surasti paskutinį pilną „}" gylyje 0
  let depth = 0, inStr = false, esc = false, lastClose = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) lastClose = i; }
  }
  if (lastClose > 0) {
    try { return JSON.parse(cleaned.slice(0, lastClose + 1)); } catch (e) {}
  }

  // Vis tiek nepilnas — apkarpome nutrūkusį paskutinį lauką/elementą ir uždarome skliaustus
  if (depth > 0) {
    let attempt = cleaned;
    attempt = attempt.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
    attempt = attempt.replace(/,\s*"[^"]*":?\s*$/, '');
    attempt = attempt.replace(/,\s*\{[^{}]*$/, '');
    attempt = attempt.replace(/,\s*$/, '');
    let closeDepth = depth;
    while (closeDepth-- > 0) attempt += '}';
    try { return JSON.parse(attempt); } catch (e) {}
  }

  console.error('JSON parse failed completely');
  return fallback;
}

// ── Didelių dokumentų tvarkymas (map-reduce) ─────────────────
// Vienas Claude kvietimas turi konteksto ribą, todėl LABAI didelius
// dokumentus pirma kondensuojame dalimis: iš kiekvienos dalies ištraukiame
// tik su sprendimu susijusią informaciją, tada struktūrizuojame kondensuotą
// tekstą. Taip galima kelti bet kokio dydžio failus (iki Vercel ~4.5MB
// užklausos kūno ribos), nieko tyliai neapkerpant ir nemetant klaidos.
const SINGLE_CALL_CHAR_LIMIT = 280000; // ~70K tok — telpa su sistema + atsakymu
const CHUNK_CHARS = 120000;            // viena dalis ~30K tok
const CHUNK_OVERLAP = 2000;            // persidengimas, kad nesukirstume reikalavimo per pusę
const CHUNK_CONCURRENCY = 4;           // lygiagretūs kvietimai paketuose (rate limit apsauga)

async function condenseChunk(chunk, idx, total) {
  const sys = 'Tu esi viešųjų pirkimų dokumentų ištraukėjas. Iš pateiktos dokumento dalies ištrauk TIK su dalyvavimo sprendimu susijusią informaciją: pirkimo objektas, kvalifikaciniai ir techniniai reikalavimai, blokuojančios/privalomos sąlygos, terminai, kainodara ir vertinimo kriterijai, EBVPD/ESPD, reikalingi sertifikatai ir dokumentai, sutarties sąlygos bei baudos. Praleisk vandenį ir pasikartojimus. Cituok punktų numerius, jei matomi. Atsakyk glaustai lietuviškai, be įžangų.';
  try {
    const out = await callClaude(sys, 'Dokumento dalis ' + (idx + 1) + '/' + total + ':\n\n' + chunk, 4000);
    return (out || '').trim();
  } catch (e) {
    console.error('Kondensavimo klaida (dalis ' + (idx + 1) + '):', e.message);
    return ''; // degraduojam — neprarandam visos analizės dėl vienos dalies
  }
}

async function prepareDocText(fullText) {
  if (fullText.length <= SINGLE_CALL_CHAR_LIMIT) return fullText;

  const chunks = [];
  const stepSize = CHUNK_CHARS - CHUNK_OVERLAP;
  for (let i = 0; i < fullText.length; i += stepSize) {
    chunks.push(fullText.slice(i, i + CHUNK_CHARS));
  }

  const parts = [];
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks
      .slice(i, i + CHUNK_CONCURRENCY)
      .map((c, j) => condenseChunk(c, i + j, chunks.length));
    parts.push(...(await Promise.all(batch)));
  }

  const condensed = parts.filter(Boolean).join('\n\n────────── DOKUMENTO DALIS ──────────\n\n');
  return condensed.length > SINGLE_CALL_CHAR_LIMIT
    ? condensed.slice(0, SINGLE_CALL_CHAR_LIMIT)
    : condensed;
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

    const system = `Tu esi Bidwise AI — viešųjų pirkimų sprendimų analitikas. Tavo ataskaita nėra graži santrauka — tai praktinis sprendimų ir rizikų įrankis tiekėjui. Analizuok lietuviškai, objektyviai ir nuosekliai (tam pačiam dokumentui visada duok tą patį balą).

SVARBIAUSIAS PRINCIPAS: kiekviena reikšminga išvada turi būti pagrįsta (1) konkrečiu dokumento punktu, jei jis matomas tekste, (2) viešųjų pirkimų praktikos logika, (3) rizikos įvertinimu, (4) rekomenduojamu veiksmu. Jei dokumente konkretaus punkto nerandi, pažymėk saltinis:"Pagal bendrą praktiką" — NEGALVOK punkto numerio. Jei pačios informacijos (ne tik punkto numerio) dokumente NĖRA, lauko reikšmė turi būti tiksliai "Dokumente nenurodyta" — NIEKADA neišgalvok reikšmės.

Prie kiekvienos rizikos/reikalavimo nurodyk:
- "pasitikejimas": "aukštas" (tiksliai cituojamas punktas) | "vidutinis" (numanoma iš konteksto) | "žemas" (bendra praktika, dokumente neaišku)
- "paremta": "dokumentu" | "bendra_praktika"
- "privalomas": true/false — ar reikalavimas yra privalomas
- "arbaLygiavertis": true/false — ar dokumentas leidžia pateikti lygiavertį įrodymą/sprendimą vietoj nurodytojo

Blokuojanti sąlyga = tokia, dėl kurios pasiūlymas realiai gali būti atmestas (privalomas trūkstamas sertifikatas/dokumentas/EBVPD/kvalifikacija/techninis reikalavimas). Jei yra bent viena blokuojanti sąlyga ir tiekėjo profilyje nematyti, kad ji įvykdyta, bendras "sprendimas" NEGALI būti GO — turi būti CLARIFY arba NO-GO.

DVIEJŲ ETAPŲ ANALIZĖ (PRIVALOMA):
1) BENDRAS ETAPAS — pirma įvertink konkursą objektyviai: pirkimo objektas, privalomi kvalifikaciniai ir techniniai reikalavimai, blokuojančios sąlygos, terminai, kainodara ir vertinimo kriterijai. Šis etapas nepriklauso nuo kliento.
2) PERSONALIZUOTAS ETAPAS — jei pateiktas KLIENTO ĮMONĖS PROFILIS, kiekvieną reikalavimą ir spec. grupę (kvalifikacija, ekonominis/finansinis pajėgumas, techninis/profesinis pajėgumas, sertifikatai, EBVPD/ESPD, subtiekimas ir kt.) vertink KONKREČIAI pagal kliento veiklos sferą, specializaciją, klausimyno atsakymus ir pajėgumus. Kiekvienoje grupėje aiškiai nurodyk: ar klientas atitinka, ko trūksta ir ką daryti. Balą (score) ir sprendimą (GO/CLARIFY/NO-GO) formuok pagal šį realų atitikimą, ne vien pagal bendrą sudėtingumą. Jei reikalavimo atitikimo iš profilio nustatyti negali, žymėk „Neaišku" ir nurodyk, kokios informacijos trūksta. Vertindamas atsižvelk į kliento veiklos sferą — tos pačios spec. grupės skirtingoms sferoms reiškia skirtingą riziką. Privalomai užpildyk lauką "personalizuotaAnalize" ir jo "specGrupes" KIEKVIENAI spec. grupei, kurią mini dokumentas, vertindamas atitiktį pagal kliento klausimyno atsakymus ir veiklos sferą (Atitinka / Iš dalies / Neatitinka / Neaišku).
Jei kliento profilio NĖRA — atlik tik bendrą etapą, o atitikimo matricose „Tiekėjas turi?" žymėk „Neaišku".

Grąžink TIK JSON, be jokio papildomo teksto.`;

    const analyzableText = await prepareDocText(docTextSafe);

    const userMsg = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIRKIMO DOKUMENTAS:
${analyzableText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Išanalizuok šį konkursą ${profileCtx.hasProfile ? 'KONKREČIAI šios įmonės kontekste — naudok jos profilį ir klausimyno atsakymus, lygink su konkrečiais reikalavimais' : '(profilis neužpildytas — bendras objektyvus vertinimas, kvalifikacijos/technikos matricose "Tiekėjas turi?" = "Neaišku")'}.

Grąžink TIKSLIAI tokios struktūros JSON (jei nėra informacijos — rašyk "Nenurodyta", masyvus gali grąžinti tuščius []):

{
  "pavadinimas": "tikslus pirkimo pavadinimas",
  "perkanciojiOrganizacija": "perkančiosios organizacijos pavadinimas",
  "pirkimoTipas": "atviras konkursas / supaprastintas / mažos vertės",
  "bendraVerte": "numatoma vertė su valiuta arba Nenurodyta",
  "cpt": "pagrindinis BVPŽ kodas",

  "sprendimas": "GO | CLARIFY | NO-GO",
  "sprendimoPriezastis": "1-2 sakiniai kodėl toks sprendimas",

  "score": 65,
  "scoreLabel": "Geros galimybės / Vidutinės galimybės / Žemos galimybės",
  "scorePaaiskinimas": "2-3 sakiniai kodėl būtent toks balas šiai įmonei",

  "personalizuotaAnalize": {
    "bendrasVertinimas": "BENDRAS ETAPAS: objektyvus konkurso vertinimas, nepriklausomas nuo kliento (1-2 sakiniai)",
    "sferosKontekstas": "kaip kliento veiklos sfera ir specializacija veikia šio konkurso atitiktį (1-2 sakiniai)",
    "specGrupes": [
      {"grupe": "Pašalinimo pagrindai", "reikalavimas": "ką reikalauja dokumentai", "atitiktis": "Atitinka | Iš dalies | Neatitinka | Neaišku", "pagrindimas": "kodėl — pagal kliento profilį, klausimyną ir veiklos sferą", "koTruksta": "ko trūksta arba Nieko", "kaDaryti": "konkretus veiksmas"},
      {"grupe": "Teisė verstis veikla / kvalifikacija", "reikalavimas": "...", "atitiktis": "...", "pagrindimas": "...", "koTruksta": "...", "kaDaryti": "..."},
      {"grupe": "Ekonominis ir finansinis pajėgumas", "reikalavimas": "...", "atitiktis": "...", "pagrindimas": "...", "koTruksta": "...", "kaDaryti": "..."},
      {"grupe": "Techninis ir profesinis pajėgumas", "reikalavimas": "...", "atitiktis": "...", "pagrindimas": "...", "koTruksta": "...", "kaDaryti": "..."},
      {"grupe": "Sertifikatai ir kokybės standartai", "reikalavimas": "...", "atitiktis": "...", "pagrindimas": "...", "koTruksta": "...", "kaDaryti": "..."},
      {"grupe": "EBVPD/ESPD pildymas", "reikalavimas": "...", "atitiktis": "...", "pagrindimas": "...", "koTruksta": "...", "kaDaryti": "..."}
    ],
    "tinkamumoIsvada": "PERSONALIZUOTAS ETAPAS: galutinė išvada konkrečiai šiai įmonei pagal jos sferą ir klausimyną (2-3 sakiniai)"
  },

  "subBalai": {
    "tinkamumas": 68,
    "patrauklumas": 78,
    "rizikosLygis": "Žema | Vidutinė | Aukšta",
    "laimejimoPotencialas": 72
  },

  "terminai": {
    "pasiulymoTerminas": "YYYY-MM-DD HH:MM arba Nenurodyta",
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

  "kvalifikacijosMatrica": [
    {"reikalavimas": "Apyvarta", "reikalaujama": "min. 200 000 EUR / 3 metai arba Dokumente nenurodyta", "saltinisPunktas": "dokumento ir punkto nuoroda arba Pagal bendrą praktiką", "tiekejasTuri": "Taip | Ne | Neaišku", "irodymas": "finansinės ataskaitos", "rizika": "žema | vidutinė | aukšta | blokuojanti", "privalomas": true, "arbaLygiavertis": false, "pasitikejimas": "aukštas | vidutinis | žemas", "paremta": "dokumentu | bendra_praktika", "veiksmas": "ką patikrinti/padaryti"}
  ],

  "techninesSpecifikacijosMatrica": [
    {"reikalavimas": "24/7 pagalba", "saltinisPunktas": "dokumento ir punkto nuoroda arba Pagal bendrą praktiką", "privalomas": true, "arbaLygiavertis": false, "tiekejasAtitinka": "Taip | Ne | Neaišku", "kastuPoveikis": "žemas | vidutinis | aukštas", "aiskumoLygis": "aiškus | dviprasmiškas", "reikiaKlausimoPO": true, "pasitikejimas": "aukštas | vidutinis | žemas", "paremta": "dokumentu | bendra_praktika", "veiksmas": "rekomendacija"}
  ],

  "finansinesSalygos": {
    "avansas": "ar mokamas avansas",
    "apmokejimas": "apmokėjimo sąlygos",
    "baudos": "baudų sąlygos",
    "garantinis": "garantinio laikotarpio sąlygos"
  },

  "sutartiesRizikos": [
    {"salyga": "pvz. Apmokėjimas tik po priėmimo", "rizikosLygis": "žema | vidutinė | aukšta", "komentaras": "praktinis paaiškinimas"}
  ],

  "vertinimoKriterijai": [
    {"kriterijus": "pvz. Kaina", "svoris": "60%"}
  ],

  "vertinimoSimuliacija": [
    {"scenarijus": "Agresyvi kaina", "kaina": "trumpas apibūdinimas", "techninisBalas": "aukštas/vidutinis/žemas", "garantijosBalas": "aukštas/vidutinis/žemas", "prognozuojamasBalas": "pvz. 92/100", "tiketinaMarza": "žema | vidutinė | aukšta", "rekomendacija": "1 sakinys"}
  ],

  "blokuojanciosSalygos": [
    {"pavadinimas": "pvz. ISO 27001 reikalavimas", "rastaDokumente": "dokumento ir punkto nuoroda arba 'Pagal bendrą praktiką'", "salyga": "trumpa esmė arba 'Dokumente nenurodyta'", "aiVertinimas": "ką tai reiškia tiekėjui", "rizikosLygis": "blokuojanti", "privalomas": true, "arbaLygiavertis": false, "pasitikejimas": "aukštas | vidutinis | žemas", "paremta": "dokumentu | bendra_praktika", "veiksmas": "rekomenduojamas veiksmas"}
  ],
  "komercinesRizikos": [
    {"pavadinimas": "pvz. 24/7 pagalbos kaštai", "rastaDokumente": "...", "salyga": "...", "aiVertinimas": "...", "rizikosLygis": "vidutinė | aukšta", "privalomas": false, "arbaLygiavertis": false, "pasitikejimas": "aukštas | vidutinis | žemas", "paremta": "dokumentu | bendra_praktika", "veiksmas": "..."}
  ],
  "strateginesRizikos": [
    {"pavadinimas": "pvz. Kaina sudaro 60% vertinimo", "rastaDokumente": "...", "salyga": "...", "aiVertinimas": "...", "rizikosLygis": "žema | vidutinė | aukšta", "privalomas": false, "arbaLygiavertis": false, "pasitikejimas": "aukštas | vidutinis | žemas", "paremta": "dokumentu | bendra_praktika", "veiksmas": "..."}
  ],

  "klausimaiPO": [
    {"tema": "pvz. ISO 27001", "klausimas": "pilnai sutvarkytas profesionalus klausimas perkančiajai organizacijai"}
  ],

  "ebvpdSusieta": {
    "pasalinimoPagrindaiTaikomi": ["..."],
    "deklaruojamaDabar": ["kvalifikacijos punktai, kuriuos galima deklaruoti be papildomo įrodymo"],
    "reikesIrodymoVeliau": ["punktai, kuriems reikės įrodymo laimėjimo atveju"],
    "rizikingiAtsakymai": ["punktai, kur tiekėjo padėtis neaiški/rizikinga"]
  },

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

  "isViso": "galutinė išvada ar verta dalyvauti ir kodėl (2-3 sakiniai)",
  "isvadaStruktura": {
    "sprendimas": "GO | CLARIFY | NO-GO",
    "kodel": "1-2 sakiniai",
    "pagrindinesBlokuojancios": ["..."],
    "pagrindinesKomercines": ["..."],
    "kaPadarytiPriesTeikiant": ["žingsnis 1", "žingsnis 2"],
    "rekomenduojamaKainodara": "1 sakinys",
    "artiVertaDalyvauti": "1 sakinys"
  }
}

Pastaba: ši analizė nėra galutinė teisinė išvada — tai praktinis sprendimų ir rizikų įrankis tiekėjui.`;

    let aiRes = await callClaude(system, userMsg, 32000);
    let result = parseJSON(aiRes, null);

    // 1) Vienas pakartojimas, jei JSON nesusiparsino — dažnai užtenka antro bandymo.
    if (!result || !result.pavadinimas) {
      try {
        const retry = await callClaude(
          system,
          userMsg + '\n\nSVARBU: ankstesnis atsakymas buvo netinkamas. Grąžink TIK GALIOJANTĮ, pilną JSON pagal nurodytą struktūrą — be jokio teksto aplink, be ```json.',
          32000
        );
        const re = parseJSON(retry, null);
        if (re && re.pavadinimas) { result = re; aiRes = retry; }
      } catch (e) { console.error('Pakartotinė analizė nepavyko:', e.message); }
    }

    // 2) GARANTIJA: jei vis dar nėra struktūros, ištraukiam bazinę info mažu patikimu
    //    kvietimu, kad ataskaita NIEKADA nebūtų tuščia ar be pavadinimo.
    if (!result || !result.pavadinimas) {
      result = (result && typeof result === 'object') ? result : {};
      try {
        const basicSys = 'Tu esi viešųjų pirkimų dokumentų ištraukėjas. Grąžink TIK JSON su laukais: pavadinimas, pirkejas, cpv, terminai, objektas, isViso (2-3 sakinių santrauka). Lietuviškai. Jei reikšmės dokumente nėra — "Nenurodyta".';
        const basic = parseJSON(await callClaude(basicSys, 'Ištrauk bazinę informaciją iš šio pirkimo dokumento:\n\n' + docTextSafe.slice(0, 200000), 4000), null);
        if (basic && typeof basic === 'object') {
          result.pavadinimas = result.pavadinimas || basic.pavadinimas;
          result.pirkejas    = result.pirkejas    || basic.pirkejas;
          result.cpv         = result.cpv         || basic.cpv;
          result.terminai    = result.terminai    || basic.terminai;
          result.objektas    = result.objektas    || basic.objektas;
          result.isViso      = result.isViso      || basic.isViso;
        }
      } catch (e) { console.error('Bazinės info ištraukimas nepavyko:', e.message); }
      result.pavadinimas = result.pavadinimas || documentName || 'Konkurso analizė';
      result.isViso = result.isViso || 'Pavyko ištraukti pagrindinę informaciją iš dokumento. Detalesnių klausimų užduokite pokalbyje — atsakysiu remdamasis dokumento tekstu.';
      result._partial = true;
    }

    result.score = typeof result.score === 'number' ? result.score : 50;
    result.personalizuota = profileCtx.hasProfile;
    if (!result.sprendimas) result.sprendimas = result.score >= 70 ? 'GO' : result.score >= 40 ? 'CLARIFY' : 'NO-GO';
    if (Array.isArray(result.blokuojanciosSalygos) && result.blokuojanciosSalygos.length && result.sprendimas === 'GO') {
      result.sprendimas = 'CLARIFY';
    }

    if (process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: saved } = await supabase.from('analyses').insert({
        user_id: user.id,
        document_name: documentName || result.pavadinimas || 'Analizė',
        score: result.score,
        doc_text: docTextSafe.slice(0, 200000),
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

module.exports.config = { maxDuration: 300 };

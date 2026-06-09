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
  if (!profile || typeof profile !== 'object') {
    return {
      hasProfile: false,
      contextText: 'KLIENTO PROFILIS NEUŽPILDYTAS. Vertink bendrai pagal dokumento turinį. Balą skaičiuok objektyviai pagal reikalavimų sudėtingumą ir konkurencijos lygį.'
    };
  }
  // Patikra: ar profilis turi pakankamai naudingos informacijos
  const hasNew = !!(profile.imones_pavadinimas || profile.pagrindinis_sektorius || profile.apyvarta_metai_1);
  const hasOld = !!(profile.profilioSantrauka || profile.sector || profile.name);
  if (!hasNew && !hasOld) {
    return {
      hasProfile: false,
      contextText: 'KLIENTO PROFILIS NEUŽPILDYTAS. Vertink bendrai pagal dokumento turinį.'
    };
  }

  let ctx = 'KLIENTO ĮMONĖS PROFILIS (naudok aktyviai vertindamas atitikimą ir tikimybę):\n\n';

  // === A. PAGRINDINĖ INFORMACIJA ===
  ctx += '── A. PAGRINDINĖ INFORMACIJA ──\n';
  if (profile.imones_pavadinimas || profile.name) ctx += `• Pavadinimas: ${profile.imones_pavadinimas || profile.name}\n`;
  if (profile.imones_kodas) ctx += `• Įmonės kodas: ${profile.imones_kodas}\n`;
  if (profile.juridine_forma) ctx += `• Juridinė forma: ${profile.juridine_forma}\n`;
  if (profile.isikurimo_metai) ctx += `• Įsikūrimo metai: ${profile.isikurimo_metai}\n`;
  if (profile.darbuotoju_skaicius || profile.darbuotojai) ctx += `• Darbuotojų skaičius: ${profile.darbuotoju_skaicius || profile.darbuotojai}\n`;
  if (profile.darbuotoju_dinamika) ctx += `• Darbuotojų dinamika 12 mėn.: ${profile.darbuotoju_dinamika}\n`;
  if (profile.pagrindinis_sektorius || profile.sector) ctx += `• Veiklos sektorius: ${profile.pagrindinis_sektorius || profile.sector}\n`;
  if (profile.activity) ctx += `• Veiklos aprašymas: ${profile.activity}\n`;
  if (profile.specializacija) ctx += `• Specializacija: ${profile.specializacija}\n`;

  // === B. FINANSINIS PAJĖGUMAS ===
  if (profile.apyvarta_metai_1 || profile.apyvarta_metai_2 || profile.apyvarta_metai_3 || profile.apyvarta || profile.maksimali_ivykdyta_sutarties_verte || profile.komfortine_sutarties_verte || profile.banko_garantija_galima || profile.profesines_atsakomybes_draudimas){
    ctx += '\n── B. FINANSINIS PAJĖGUMAS ──\n';
    if (profile.apyvarta_metai_1) ctx += `• Apyvarta (paskutiniai metai): ${profile.apyvarta_metai_1} EUR\n`;
    if (profile.apyvarta_metai_2) ctx += `• Apyvarta prieš 2 metus: ${profile.apyvarta_metai_2} EUR\n`;
    if (profile.apyvarta_metai_3) ctx += `• Apyvarta prieš 3 metus: ${profile.apyvarta_metai_3} EUR\n`;
    if (profile.apyvarta && !profile.apyvarta_metai_1) ctx += `• Metinė apyvarta: ${profile.apyvarta}\n`;
    if (profile.maksimali_ivykdyta_sutarties_verte || profile.maxProjektoVerte) ctx += `• Didžiausia įvykdyta sutarties vertė: ${profile.maksimali_ivykdyta_sutarties_verte || profile.maxProjektoVerte} EUR\n`;
    if (profile.komfortine_sutarties_verte) ctx += `• Komfortinė sutarties vertė: ${profile.komfortine_sutarties_verte} EUR\n`;
    if (profile.banko_garantija_galima) ctx += `• Banko garantija: ${profile.banko_garantija_galima==='taip'?'Galima':'Negalima'}\n`;
    if (profile.banko_garantijos_limitas) ctx += `• Banko garantijos limitas: ${profile.banko_garantijos_limitas} EUR\n`;
    if (profile.profesines_atsakomybes_draudimas) ctx += `• Profesinės atsakomybės draudimas: ${profile.profesines_atsakomybes_draudimas} EUR\n`;
  }

  // === C. PATIRTIS IR REFERENCIJOS ===
  if (profile.patirtis_pagrindineje_veikloje_metais || profile.patirtis || profile.analogisku_projektu_skaicius_3m || profile.viesuju_pirkimu_laimeta_skaicius || profile.stambiausi_3_projektai || profile.viesPirkPatirtis){
    ctx += '\n── C. PATIRTIS IR REFERENCIJOS ──\n';
    if (profile.patirtis_pagrindineje_veikloje_metais) ctx += `• Patirtis pagrindinėje veikloje: ${profile.patirtis_pagrindineje_veikloje_metais} metai\n`;
    else if (profile.patirtis) ctx += `• Patirtis: ${profile.patirtis}\n`;
    if (profile.analogisku_projektu_skaicius_3m) ctx += `• Analogiškų projektų per 3 metus: ${profile.analogisku_projektu_skaicius_3m}\n`;
    if (profile.analogisku_projektu_bendra_verte_3m) ctx += `• Analogiškų projektų vertė per 3m: ${profile.analogisku_projektu_bendra_verte_3m} EUR\n`;
    if (profile.viesuju_pirkimu_laimeta_skaicius) ctx += `• Laimėtų viešųjų pirkimų: ${profile.viesuju_pirkimu_laimeta_skaicius}\n`;
    if (profile.viesuju_pirkimu_laimeta_verte) ctx += `• Laimėtų VP bendra vertė: ${profile.viesuju_pirkimu_laimeta_verte} EUR\n`;
    if (profile.viesPirkPatirtis && !profile.viesuju_pirkimu_laimeta_skaicius) ctx += `• Viešųjų pirkimų patirtis: ${profile.viesPirkPatirtis}\n`;
    if (profile.stambiausi_3_projektai) ctx += `• Stambiausi 3 projektai:\n${profile.stambiausi_3_projektai}\n`;
  }

  // === D. TECHNINIS PAJĖGUMAS ===
  if (profile.technine_baze_aprasymas || profile.subrangovai_naudojami || profile.kokybes_ar_erp_sistemos){
    ctx += '\n── D. TECHNINIS PAJĖGUMAS ──\n';
    if (profile.technine_baze_aprasymas) ctx += `• Techninė bazė: ${profile.technine_baze_aprasymas}\n`;
    if (profile.subrangovai_naudojami) ctx += `• Subrangovai: ${profile.subrangovai_naudojami==='taip'?'Naudoja':'Nenaudoja'}\n`;
    if (Array.isArray(profile.subrangovu_sritys) && profile.subrangovu_sritys.length) ctx += `• Subrangos sritys: ${profile.subrangovu_sritys.join(', ')}\n`;
    if (Array.isArray(profile.kokybes_ar_erp_sistemos) && profile.kokybes_ar_erp_sistemos.length) ctx += `• Valdymo sistemos: ${profile.kokybes_ar_erp_sistemos.join(', ')}\n`;
  }

  // === E. SERTIFIKATAI IR LEIDIMAI ===
  const iso = profile.iso_sertifikatai;
  if ((Array.isArray(iso) && iso.length) || profile.profesines_licencijos || profile.sertifikatu_galiojimo_datos || profile.statybos_atestatai || profile.sertifikatai){
    ctx += '\n── E. SERTIFIKATAI IR LEIDIMAI ──\n';
    if (Array.isArray(iso) && iso.length) ctx += `• ISO sertifikatai: ${iso.filter(x=>x!=='Neturime').join(', ') || 'Neturi'}\n`;
    if (profile.sertifikatu_galiojimo_datos) ctx += `• Sertifikatų galiojimas: ${profile.sertifikatu_galiojimo_datos}\n`;
    if (profile.profesines_licencijos) ctx += `• Profesinės licencijos: ${profile.profesines_licencijos}\n`;
    if (profile.statybos_atestatai) ctx += `• Statybos atestatai: ${profile.statybos_atestatai}\n`;
    if (Array.isArray(profile.it_saugumo_sertifikatai) && profile.it_saugumo_sertifikatai.length) ctx += `• IT saugumo sertifikatai: ${profile.it_saugumo_sertifikatai.join(', ')}\n`;
    if (Array.isArray(profile.sertifikatai) && profile.sertifikatai.length && !iso) ctx += `• Sertifikatai: ${profile.sertifikatai.join(', ')}\n`;
  }

  // === F. KOMANDA IR KOMPETENCIJOS ===
  if (profile.vadovu_patirtis_metais || profile.pagrindiniu_specialistu_skaicius || profile.specialistu_kompetencijos || profile.uzsienio_kalbos){
    ctx += '\n── F. KOMANDA IR KOMPETENCIJOS ──\n';
    if (profile.vadovu_patirtis_metais) ctx += `• Vadovų patirtis: ${profile.vadovu_patirtis_metais} m.\n`;
    if (profile.pagrindiniu_specialistu_skaicius) ctx += `• Pagrindinių specialistų: ${profile.pagrindiniu_specialistu_skaicius}\n`;
    if (profile.specialistu_kompetencijos) ctx += `• Specialistų kompetencijos: ${profile.specialistu_kompetencijos}\n`;
    if (Array.isArray(profile.uzsienio_kalbos) && profile.uzsienio_kalbos.length) ctx += `• Užsienio kalbos: ${profile.uzsienio_kalbos.join(', ')}\n`;
    if (profile.dedikuotos_komandos_galimybe) ctx += `• Dedikuota komanda: ${profile.dedikuotos_komandos_galimybe==='taip'?'Galima':'Negalima'}\n`;
  }

  // === G. GEOGRAFINĖ APRĖPTIS ===
  const regions = profile.aptarnaujami_regionai || profile.regionai;
  if ((Array.isArray(regions) && regions.length) || profile.filialai_ar_atstovybes || profile.tarptautine_patirtis){
    ctx += '\n── G. GEOGRAFINĖ APRĖPTIS ──\n';
    if (Array.isArray(regions) && regions.length) ctx += `• Aptarnaujami regionai: ${regions.join(', ')}\n`;
    if (profile.filialai_ar_atstovybes) ctx += `• Filialai/atstovybės: ${profile.filialai_ar_atstovybes}\n`;
    if (profile.tarptautine_patirtis) ctx += `• Tarptautinė patirtis: ${profile.tarptautine_patirtis==='taip'?'Turi':'Neturi'}\n`;
  }

  // === H. KOKYBĖS UŽTIKRINIMAS ===
  if (profile.garantinis_laikotarpis_menesiais || profile.reagavimo_laikas_valandomis || profile.kokybes_kontroles_procesas || profile.sla_lygis){
    ctx += '\n── H. KOKYBĖS UŽTIKRINIMAS ──\n';
    if (profile.garantinis_laikotarpis_menesiais) ctx += `• Tipinis garantinis laikotarpis: ${profile.garantinis_laikotarpis_menesiais} mėn.\n`;
    if (profile.reagavimo_laikas_valandomis) ctx += `• Reagavimo laikas: ${profile.reagavimo_laikas_valandomis} val.\n`;
    if (profile.kokybes_kontroles_procesas) ctx += `• Kokybės kontrolė: ${profile.kokybes_kontroles_procesas}\n`;
    if (profile.sla_lygis) ctx += `• SLA: ${profile.sla_lygis}\n`;
  }

  // === I. RIZIKOS PROFILIS ===
  if (profile.rizikos_tolerancija || profile.maksimalios_baudos_tolerancija_proc || profile.ilgu_terminu_tolerancija){
    ctx += '\n── I. RIZIKOS PROFILIS ──\n';
    if (profile.rizikos_tolerancija) ctx += `• Bendra rizikos tolerancija: ${profile.rizikos_tolerancija}\n`;
    if (profile.maksimalios_baudos_tolerancija_proc) ctx += `• Max baudų tolerancija: ${profile.maksimalios_baudos_tolerancija_proc}%\n`;
    if (profile.ilgu_terminu_tolerancija) ctx += `• Sutarties trukmės tolerancija: ${profile.ilgu_terminu_tolerancija}\n`;
    if (profile.avanso_poreikis) ctx += `• Avanso poreikis: ${profile.avanso_poreikis==='taip'?'Reikia':'Nereikia'}\n`;
    if (profile.grieztu_garantiju_patirtis) ctx += `• Griežtų garantijų patirtis: ${profile.grieztu_garantiju_patirtis==='taip'?'Turi':'Neturi'}\n`;
  }

  // === J. STRATEGINĖ POZICIJA ===
  if (profile.konkurenciniai_pranasumai || profile.tipine_pelno_marza_proc || profile.pageidaujama_konkurso_verte_min || profile.pageidaujama_konkurso_verte_max || profile.nesidomi_sritimis || profile.stiprybes){
    ctx += '\n── J. STRATEGINĖ POZICIJA ──\n';
    if (profile.konkurenciniai_pranasumai) ctx += `• Konkurenciniai pranašumai:\n${profile.konkurenciniai_pranasumai}\n`;
    else if (Array.isArray(profile.stiprybes) && profile.stiprybes.length) ctx += `• Stiprybės: ${profile.stiprybes.join('; ')}\n`;
    if (profile.tipine_pelno_marza_proc) ctx += `• Tipinė pelno marža: ${profile.tipine_pelno_marza_proc}%\n`;
    if (profile.pageidaujama_konkurso_verte_min) ctx += `• Pageidaujama min konkurso vertė: ${profile.pageidaujama_konkurso_verte_min} EUR\n`;
    if (profile.pageidaujama_konkurso_verte_max) ctx += `• Pageidaujama max konkurso vertė: ${profile.pageidaujama_konkurso_verte_max} EUR\n`;
    if (Array.isArray(profile.nesidomi_sritimis) && profile.nesidomi_sritimis.length) ctx += `• Vengia (NESIŪLYK tokių): ${profile.nesidomi_sritimis.join(', ')}\n`;
  }

  // === K. PAŠALINIMO PAGRINDAI ===
  if (profile.mokesciu_isiskolinimu_yra || profile.sodros_isiskolinimu_yra || profile.bankroto_restrukturizavimo_proceduros || profile.teistumo_ar_teismo_sprendimu_rizika || profile.nepatikimu_tiekeju_sarase){
    ctx += '\n── K. PAŠALINIMO PAGRINDAI (VPĮ 46 str.) ──\n';
    const warnings = [];
    if (profile.mokesciu_isiskolinimu_yra === 'taip') warnings.push('Mokesčių įsiskolinimai');
    if (profile.sodros_isiskolinimu_yra === 'taip') warnings.push('SODROS skolos');
    if (profile.bankroto_restrukturizavimo_proceduros === 'taip') warnings.push('Bankroto/restruktūrizavimo procedūros');
    if (profile.teistumo_ar_teismo_sprendimu_rizika === 'taip') warnings.push('Įsiteisėję teismo sprendimai');
    if (profile.nepatikimu_tiekeju_sarase === 'taip') warnings.push('Buvo nepatikimų tiekėjų sąraše');
    if (warnings.length) ctx += `⚠️ RIZIKA: ${warnings.join(', ')} — gali būti pašalinta iš pirkimo!\n`;
    else ctx += '✓ Pašalinimo pagrindų nedeklaruota\n';
  }

  // === L. SEKTORIAUS SPECIFIKA ===
  if (profile.statybos_darbu_vadovai || profile.it_programuotoju_skaicius || profile.it_technologiju_stackas || profile.apsaugos_licencija){
    ctx += '\n── L. SEKTORIAUS SPECIFIKA ──\n';
    if (profile.statybos_darbu_vadovai) ctx += `• Statybos darbų vadovai: ${profile.statybos_darbu_vadovai}\n`;
    if (profile.it_programuotoju_skaicius) ctx += `• IT specialistai: ${profile.it_programuotoju_skaicius}\n`;
    if (Array.isArray(profile.it_technologiju_stackas) && profile.it_technologiju_stackas.length) ctx += `• IT technologijos: ${profile.it_technologiju_stackas.join(', ')}\n`;
    if (profile.apsaugos_licencija) ctx += `• Apsaugos licencija: ${profile.apsaugos_licencija==='taip'?'Turi':'Neturi'}\n`;
  }

  // === SUDERINAMUMAS SU SENU FORMATU ===
  if (Array.isArray(profile.veiklos) && profile.veiklos.length && !profile.konkurenciniai_pranasumai) {
    ctx += `\n• Teikiamos paslaugos (senas profilis): ${profile.veiklos.join(', ')}\n`;
  }
  if (profile.profilioSantrauka) ctx += `\nPROFILIO SANTRAUKA:\n${profile.profilioSantrauka}\n`;

  // === META: profilio užpildymo informacija agentams ===
  const completeness = profile._wizard_completeness;
  if (completeness !== undefined) {
    ctx += `\n[PROFILIO IŠSAMUMAS: ${completeness}%`;
    if (completeness < 50) ctx += ' — REIKĖS DALĮ PRIELAIDŲ; verdiktas su platesniu paklaidos diapazonu';
    else if (completeness < 80) ctx += ' — geras pagrindas, kai kurios sritys gali būti neišsamios';
    else ctx += ' — labai išsamus profilis, AI rezultatas tikslus';
    ctx += ']\n';
  }

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

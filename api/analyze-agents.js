const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function extractJSON(raw) {
  let s = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch {}
  const f = s.indexOf('{'), l = s.lastIndexOf('}');
  if (f !== -1 && l !== -1) { try { return JSON.parse(s.slice(f, l + 1)); } catch {} }
  return null;
}

async function callAgent(systemPrompt, userContent, maxTokens = 4000) {
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
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Agent klaida ${r.status}: ${err.slice(0, 200)}`);
  }
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Prisijunkite norėdami tęsti' });

  const { text, documentName, projectId } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Dokumentų tekstas būtinas' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nenustatytas' });

  // Load user + company profile
  let userData = { plan: 'free', free_analyses_left: 3, company_profile: null };
  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) userData = data;
    } catch (e) { console.error('DB error:', e.message); }
  }

  const plan = userData.plan || 'free';
  if (plan === 'free' && (userData.free_analyses_left ?? 3) <= 0) {
    return res.status(403).json({ error: 'Išnaudojote nemokamas analizes. Atnaujinkite į Pro.' });
  }

  const cp = userData.company_profile || {};
  const docText = String(text).slice(0, 30000); // Each agent gets a portion

  // Build company profile context
  const companyCtx = cp.profilioSantrauka ? `
ĮMONĖS PROFILIS:
- Pavadinimas: ${cp.name || '–'}
- Sritis: ${cp.sector || '–'}
- Specializacija: ${cp.specializacija || '–'}
- Stiprybės: ${(cp.stiprybės || []).join(', ') || '–'}
- Sertifikatai: ${cp.sertifikatai || '–'}
- Patirtis: ${cp.patirtis || '–'}
- Tinkami konkursai: ${cp.tipinieKonkursai || '–'}
- Finansinė stiprybė: ${cp.finansinesStiprybe || '–'}
- Santrauka: ${cp.profilioSantrauka || '–'}
` : cp.name ? `ĮMONĖS PROFILIS: ${cp.name}, ${cp.sector || ''}, ${cp.specialization || ''}` : '';

  console.log(`Starting multi-agent analysis for user ${user.id}, plan: ${plan}`);

  try {
    // ══════════════════════════════════════════
    // AGENTAS 1: Dokumentų struktūros analizatorius
    // ══════════════════════════════════════════
    console.log('Agent 1: Document structure...');
    const agent1Raw = await callAgent(
      `Tu esi viešųjų pirkimų dokumentų analizatorius Lietuvoje. Ištraukei struktūruotą informaciją iš CVP dokumentų. Grąžink TIK JSON, be markdown.`,
      `Išanalizuok šio CVP konkurso dokumentus ir ištrauk struktūruotą informaciją.

DOKUMENTAI:
${docText}

Grąžink JSON:
{
  "pavadinimas": "tikslus konkurso pavadinimas",
  "perkanciojiOrganizacija": "pavadinimas",
  "pirkimoTipas": "tipas",
  "bendraVerte": "vertė EUR",
  "cpt": "CPV kodas",
  "terminai": {
    "pasiulymoTerminas": "data ir laikas",
    "vokuAtplesimas": "data",
    "klausimaiIki": "data",
    "vykdymoTerminas": "trukmė",
    "garantija": "laikotarpis"
  },
  "pirkimoObjektas": "3-4 sakiniai apie ką perkama",
  "dalys": "ar pirkimas suskirstytas į dalis",
  "geografija": "vykdymo vieta"
}`,
      2000
    );
    const agent1 = extractJSON(agent1Raw) || {};

    // ══════════════════════════════════════════
    // AGENTAS 2: Kvalifikacijos ir reikalavimų tikrintojas
    // ══════════════════════════════════════════
    console.log('Agent 2: Requirements check...');
    const agent2Raw = await callAgent(
      `Tu esi viešųjų pirkimų kvalifikacijos reikalavimų ekspertas Lietuvoje. Tiksliai išanalizuoji kvalifikacijos reikalavimus ir palygini su įmonės profiliu. Grąžink TIK JSON, be markdown.`,
      `${companyCtx ? companyCtx + '\n\n' : ''}Išanalizuok kvalifikacijos ir techninius reikalavimus.

DOKUMENTAI:
${docText}

Grąžink JSON:
{
  "kvalifikacija": {
    "apyvarta": "tikslus reikalavimas",
    "darbuotojai": "skaičius",
    "patirtis": "patirties reikalavimai",
    "sertifikatai": "reikalingi sertifikatai",
    "finansinis": "finansinės garantijos",
    "kita": "kiti reikalavimai"
  },
  "techninieReikalavimai": "techninių reikalavimų santrauka",
  "draudimas": "draudimo reikalavimai",
  "subtiekejiai": "ar leidžiami",
  "konsorciumai": "ar leidžiami",
  "atitikimasKvalifikacijai": "${companyCtx ? 'Ar įmonė atitinka? Kiekvienam reikalavimui - konkreti analizė pagal profilį.' : 'Bendri komentarai apie galimą atitikimą.'}",
  "trukstamiReikalavimai": ["ko gali trūkti", "..."],
  "butinaiIttraukti": [{"dokumentas": "pavadinimas", "pastaba": "komentaras"}]
}`,
      2500
    );
    const agent2 = extractJSON(agent2Raw) || {};

    // ══════════════════════════════════════════
    // AGENTAS 3: Kainų ir vertinimo kriterijų strategas
    // ══════════════════════════════════════════
    console.log('Agent 3: Pricing strategy...');
    const agent3Raw = await callAgent(
      `Tu esi viešųjų pirkimų kainodaron ir vertinimo kriterijų ekspertas Lietuvoje. Analizuoji kaip formuoti konkurencingą kainą. Grąžink TIK JSON, be markdown.`,
      `${companyCtx ? companyCtx + '\n\n' : ''}Išanalizuok vertinimo kriterijus ir kainodaron strategiją.

DOKUMENTAI:
${docText}

Grąžink JSON:
{
  "vertinimoKriterijai": [
    {"kriterijus": "pav", "svoris": "60%", "aprasas": "kaip vertinama"}
  ],
  "kainuStrategija": "3-4 sakiniai: kaip formuoti kainą, į ką atkreipti dėmesį, kokia strategija${cp.kainuStrategija ? ' (atsižvelk į įmonės kainodaron strategiją)' : ''}",
  "finansinesSalygos": {
    "avansas": "sąlygos",
    "apmokejimas": "terminas",
    "baudos": "baudų sąlygos",
    "garantinis": "laikotarpis",
    "indeksavimas": "ar taikoma"
  },
  "konkurencingumasIvertinimas": "kokia tikėtina konkurencija ir kaip išsiskirti${companyCtx ? ' pagal įmonės profilį' : ''}",
  "minimaliBudzetasPatarimas": "minimalus pasiūlymo dydis kurį verta teikti"
}`,
      2500
    );
    const agent3 = extractJSON(agent3Raw) || {};

    // ══════════════════════════════════════════
    // AGENTAS 4: Rizikų ir galimybių vertintojas
    // ══════════════════════════════════════════
    console.log('Agent 4: Risk assessment...');
    const agent4Raw = await callAgent(
      `Tu esi viešųjų pirkimų rizikų vertintojas Lietuvoje. Ieškai paslėptų sąlygų, baudų, nepalankių nuostatų. Grąžink TIK JSON, be markdown.`,
      `${companyCtx ? companyCtx + '\n\n' : ''}Išanalizuok rizikas ir galimybes.

DOKUMENTAI:
${docText}

Grąžink JSON:
{
  "rizikos": [
    {"rizika": "aprašymas", "sunkumas": "aukštas/vidutinis/žemas", "patarimas": "ką daryti"}
  ],
  "galimybes": [
    {"galimybe": "aprašymas", "svoris": "svarbi/vidutinė"}
  ],
  "pasleptosNuostatos": ["paslėpta sąlyga 1", "..."],
  "dazniausiasKlaidos": ["klaida1", "klaida2"],
  "klausimaiPerkanciajai": ["klausimas1?", "klausimas2?"],
  "bendrasRizikosBalis": "0-100 (0=labai rizikinga, 100=saugu)"
}`,
      2500
    );
    const agent4 = extractJSON(agent4Raw) || {};

    // ══════════════════════════════════════════
    // AGENTAS 5: Strategijos sintezatorius
    // ══════════════════════════════════════════
    console.log('Agent 5: Strategy synthesis...');
    const synthContext = JSON.stringify({
      pirkimas: agent1,
      reikalavimai: agent2,
      kainodara: agent3,
      rizikos: agent4
    }, null, 1).slice(0, 8000);

    const agent5Raw = await callAgent(
      `Tu esi viešųjų pirkimų strategijos ekspertas Lietuvoje. Sintetini visų agentų analizę į galutinę rekomendaciją. ${companyCtx ? 'Personalizuoji pagal įmonės profilį.' : ''} Grąžink TIK JSON, be markdown.`,
      `${companyCtx}

VISŲ AGENTŲ ANALIZĖ:
${synthContext}

Sintetink į galutinę ataskaitą:
{
  "score": 0-100,
  "scoreLabel": "Puikios/Geros/Vidutinės/Mažos galimybės",
  "scorePaaiskinimas": "2-3 sakiniai kodėl toks balas${companyCtx ? ' pagal įmonės profilį' : ''}",
  "strategija": "5-7 sakiniai konkrečios strategijos — ką daryti, kaip elgtis, į ką koncentruotis${companyCtx ? '. Personalizuota pagal įmonės stiprybes ir silpnybes.' : ''}",
  "prioritetiniaiZingsniai": [
    {"zingsnis": "1. Ką daryti pirmiausia", "terminas": "kada"},
    {"zingsnis": "2. Antras žingsnis", "terminas": "kada"}
  ],
  "isViso": "4-6 sakiniai — galutinė išvada: ar verta dalyvauti, pagrindiniai iššūkiai ir galimybės${companyCtx ? ', personalizuota įmonei' : ''}"
}`,
      3000
    );
    const agent5 = extractJSON(agent5Raw) || {};

    // ══════════════════════════════════════════
    // ASSEMBLE FINAL RESULT
    // ══════════════════════════════════════════
    const result = {
      // From Agent 1
      pavadinimas: agent1.pavadinimas || '',
      perkanciojiOrganizacija: agent1.perkanciojiOrganizacija || '',
      pirkimoTipas: agent1.pirkimoTipas || '',
      bendraVerte: agent1.bendraVerte || '',
      cpt: agent1.cpt || '',
      terminai: agent1.terminai || {},
      pirkimoObjektas: agent1.pirkimoObjektas || '',

      // From Agent 2
      kvalifikacija: agent2.kvalifikacija || {},
      techninieReikalavimai: agent2.techninieReikalavimai || '',
      draudimas: agent2.draudimas || '',
      subtiekejiai: agent2.subtiekejiai || '',
      konsorciumai: agent2.konsorciumai || '',
      atitikimasKvalifikacijai: agent2.atitikimasKvalifikacijai || '',
      trukstamiReikalavimai: agent2.trukstamiReikalavimai || [],
      butinaiIttraukti: agent2.butinaiIttraukti || [],

      // From Agent 3
      vertinimoKriterijai: agent3.vertinimoKriterijai || [],
      kainuStrategija: agent3.kainuStrategija || '',
      finansinesSalygos: agent3.finansinesSalygos || {},
      konkurencingumasIvertinimas: agent3.konkurencingumasIvertinimas || '',

      // From Agent 4
      rizikos: (agent4.rizikos || []).map(r => typeof r === 'string' ? r : `${r.rizika} (${r.sunkumas || ''})`),
      galimybes: (agent4.galimybes || []).map(g => typeof g === 'string' ? g : g.galimybe),
      pasleptosNuostatos: agent4.pasleptosNuostatos || [],
      dazniausiasKlaidos: agent4.dazniausiasKlaidos || [],
      klausimaiPerkanciajai: agent4.klausimaiPerkanciajai || [],

      // From Agent 5 (synthesis)
      score: agent5.score || 50,
      scoreLabel: agent5.scoreLabel || 'Vidutinės galimybės',
      scorePaaiskinimas: agent5.scorePaaiskinimas || '',
      strategija: agent5.strategija || '',
      prioritetiniaiZingsniai: agent5.prioritetiniaiZingsniai || [],
      isViso: agent5.isViso || '',

      // Metadata
      _agentVersion: 'v1',
      _hasCompanyProfile: !!cp.profilioSantrauka,
    };

    // Save to DB
    if (supabase) {
      try {
        if (plan === 'free') {
          await supabase.from('users').update({ free_analyses_left: Math.max(0, (userData.free_analyses_left ?? 3) - 1) }).eq('id', user.id);
        }
        await supabase.from('analyses').insert([{
          user_id: user.id,
          project_id: projectId || null,
          document_name: documentName || 'Dokumentas',
          score: result.score,
          result_json: result
        }]);
      } catch (e) { console.error('Save error:', e.message); }
    }

    console.log(`Multi-agent analysis complete. Score: ${result.score}`);
    return res.status(200).json({ result, agentVersion: 'multi-agent-v1' });

  } catch (e) {
    console.error('Multi-agent error:', e.message, e.stack);
    return res.status(500).json({ error: 'Agentų klaida: ' + e.message });
  }
};

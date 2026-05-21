// ═══════════════════════════════════════════════════════════
// BIDWISE AI — ANALIZĖ (vienas greitas kvietimas, be timeout)
// Vienas išsamus AI kvietimas vietoj 5 atskirų — greičiau ir
// neviršija Vercel funkcijos laiko limito.
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

module.exports.config = { maxDuration: 60 };

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

async function callClaude(system, user, maxTokens = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
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
    if (e.name === 'AbortError') throw new Error('Analizė užtruko per ilgai. Pabandykite su mažesniu dokumentu.');
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
      contextText: 'KLIENTO PROFILIS NEUŽPILDYTAS. Analizuok bendrai. Pabaigoje pažymėk, kad užpildžius įmonės profilį analizė būtų tikslesnė.'
    };
  }
  let ctx = 'KLIENTO ĮMONĖS PROFILIS (naudok aktyviai vertindamas atitikimą):\n\n';
  if (profile.name) ctx += `• Pavadinimas: ${profile.name}\n`;
  if (profile.sector) ctx += `• Veiklos sritis: ${profile.sector}\n`;
  if (profile.specializacija) ctx += `• Specializacija: ${profile.specializacija}\n`;
  if (profile.apyvarta) ctx += `• Metinė apyvarta: ${profile.apyvarta}\n`;
  if (profile.darbuotojai) ctx += `• Darbuotojų skaičius: ${profile.darbuotojai}\n`;
  if (profile.patirtis) ctx += `• Patirtis: ${profile.patirtis}\n`;
  if (Array.isArray(profile.sertifikatai) && profile.sertifikatai.length)
    ctx += `• Sertifikatai: ${profile.sertifikatai.join(', ')}\n`;
  if (Array.isArray(profile.stiprybes) && profile.stiprybes.length)
    ctx += `• Stiprybės: ${profile.stiprybes.join('; ')}\n`;
  if (Array.isArray(profile.silpnybes) && profile.silpnybes.length)
    ctx += `• Silpnybės/ribojimai: ${profile.silpnybes.join('; ')}\n`;
  if (profile.kainuStrategija) ctx += `• Kainodaron strategija: ${profile.kainuStrategija}\n`;
  if (profile.regionas) ctx += `• Regionas: ${profile.regionas}\n`;
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

    const system = `Tu esi Bidwise AI — ekspertų komanda viešųjų pirkimų analizei. Tavyje veikia 5 specializuoti analitikai:
1. Dokumentų analitikas — ištraukia pirkimo informaciją
2. Kvalifikacijos ekspertas — vertina ar klientas atitinka reikalavimus
3. Kainodaron strategas — analizuoja vertinimo kriterijus
4. Rizikų analitikas — randa paslėptas sąlygas ir rizikas
5. Vyriausiasis strategas — apskaičiuoja laimėjimo tikimybę ir strategiją

Atlik VISŲ 5 analitikų darbą ir grąžink TIK JSON formatu, be jokio papildomo teksto.`;

    const userMsg = `${profileCtx.contextText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIRKIMO DOKUMENTAS:
${docText.slice(0, 45000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Išanalizuok šį konkursą ${profileCtx.hasProfile ? 'KONKREČIAI šios įmonės kontekste — naudok jos profilį ir klausimyno atsakymus vertindamas kiekvieną aspektą' : '(profilis neužpildytas — bendras vertinimas)'}. Grąžink JSON:

{
  "pavadinimas": "tikslus pirkimo pavadinimas",
  "perkancioji": "perkančiosios organizacijos pavadinimas",
  "verte": "numatoma vertė arba 'nenurodyta'",
  "bvpzKodai": ["BVPŽ kodai jei nurodyti"],
  "pirkimoTipas": "atviras konkursas / supaprastintas / mažos vertės",
  "terminas": "pasiūlymų pateikimo terminas",
  "trukme": "sutarties trukmė",
  "pirkimoObjektas": "trumpas objekto aprašymas",
  "score": 72,
  "verdiktas": "REKOMENDUOJAMA / SĄLYGINAI / NEREKOMENDUOJAMA",
  "santrauka": "2-3 sakinių apibendrinimas kodėl būtent toks tikimybės balas",
  "kvalifikacija": {
    "bendrasAtitikimas": "TINKA / NETINKA / DALINAI",
    "reikalavimai": [
      {"reikalavimas": "konkretus reikalavimas", "kliento_atitikimas": "TINKA / NETINKA / ABEJOTINA", "paaiskinimas": "kodėl ši įmonė atitinka ar ne"}
    ],
    "kritiniaiTrukumai": ["ko trūksta šiai įmonei"]
  },
  "kainodara": {
    "vertinimoKriterijai": [{"kriterijus": "pvz. Kaina", "svoris": "60%", "komentaras": "ką reiškia klientui"}],
    "kainosStrategija": "konkreti rekomendacija šiai įmonei",
    "patarimai": ["kainodaron patarimai"]
  },
  "rizikos": {
    "rizikos": [{"rizika": "konkreti rizika", "lygis": "AUKŠTA / VIDUTINĖ / ŽEMA", "rekomendacija": "ką daryti"}],
    "paslėptosSalygos": ["nepalankios sąlygos"],
    "klausimaiPerkanciajai": ["klausimai perkančiajai organizacijai"]
  },
  "strategija": {
    "zingsniai": ["konkretus žingsnis 1", "žingsnis 2", "žingsnis 3"],
    "akcentuoti": ["kliento stiprybės kurias pabrėžti"],
    "dokumentai": ["kokius dokumentus paruošti"]
  }
}`;

    const aiRes = await callClaude(system, userMsg, 4000);
    const result = parseJSON(aiRes, null);

    if (!result || !result.pavadinimas) {
      return res.status(500).json({ error: 'AI nepavyko struktūrizuoti atsakymo. Pabandykite dar kartą.' });
    }

    result.score = result.score || 50;
    result.personalizuota = profileCtx.hasProfile;
    result._meta = { agentai: 5, profilisPanaudotas: profileCtx.hasProfile };

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

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// Robust JSON extractor — handles truncated or slightly malformed responses
function extractJSON(raw) {
  let cleaned = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  // Direct parse first
  try { return JSON.parse(cleaned); } catch {}

  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  // Parse from first brace to end
  try { return JSON.parse(cleaned.slice(start)); } catch {}

  // Track depth to find outermost closing brace
  let depth = 0, inStr = false, esc = false, lastClose = -1;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) lastClose = i; }
  }
  if (lastClose > 0) {
    try { return JSON.parse(cleaned.slice(start, lastClose + 1)); } catch {}
  }

  // Last resort — close open braces on truncated response
  if (depth > 0) {
    let attempt = cleaned.slice(start);
    attempt = attempt.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
    attempt = attempt.replace(/,\s*"[^"]*":?\s*$/, '');
    attempt = attempt.replace(/,\s*$/, '');
    while (depth-- > 0) attempt += '}';
    try { return JSON.parse(attempt); } catch {}
  }

  return null;
}

// Plan limits
const PLAN_FEATURES = {
  free: { analyses: 3, assistant: false, pdf: false, questionLetter: false },
  pro:  { analyses: Infinity, assistant: true, pdf: true, questionLetter: true },
  team: { analyses: Infinity, assistant: true, pdf: true, questionLetter: true },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Prisijunkite norėdami tęsti' });

  const { text, documentName, projectId, companyProfile, mode } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Dokumentų tekstas būtinas' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY nenustatytas' });
  }

  // Load user from DB
  let userData = { plan: 'free', free_analyses_left: 3 };
  let supabase = null;

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data, error } = await supabase
        .from('users')
        .select('id, plan, free_analyses_left, company_profile')
        .eq('id', user.id)
        .single();
      if (!error && data) userData = data;
    } catch (e) {
      console.error('DB read error:', e.message);
    }
  }

  const plan = userData.plan || 'free';
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

  // Check free limit (server-side — cannot be bypassed)
  if (plan === 'free' && (userData.free_analyses_left ?? 3) <= 0) {
    return res.status(403).json({ error: 'Išnaudojote nemokamas analizes. Atnaujinkite į Pro.' });
  }

  // Check feature access for assistant/letter modes
  if (mode === 'assistant' && !features.assistant) {
    return res.status(403).json({ error: 'AI asistentas prieinamas tik Pro ir Komanda planams.' });
  }
  if (mode === 'letter' && !features.questionLetter) {
    return res.status(403).json({ error: 'Klausimų raštas prieinamas tik Pro ir Komanda planams.' });
  }

  // Build company profile context
  let profileContext = '';
  const cp = companyProfile || (userData.company_profile) || null;
  if (cp && typeof cp === 'object' && Object.keys(cp).length > 0) {
    profileContext = `\n\nĮMONĖS PROFILIS (analizuok atsižvelgdamas į šią įmonę):
- Pavadinimas: ${cp.name || 'Nenurodyta'}
- Veiklos sritis: ${cp.sector || 'Nenurodyta'}
- Įmonės dydis: ${cp.size || 'Nenurodyta'}
- Specializacija: ${cp.specialization || 'Nenurodyta'}
- Patirtis: ${cp.experience || 'Nenurodyta'}
- Sertifikatai: ${cp.certificates || 'Nenurodyta'}
- Apyvarta: ${cp.revenue || 'Nenurodyta'}\n`;
  }

  const prompt = `Tu esi viešųjų pirkimų ekspertas Lietuvoje. Išanalizuok CVP konkurso dokumentus ir grąžink TIK JSON objektą — be markdown žymių, be \`\`\`json, tiesiog grynas JSON.

Atsakymas turi būti KOMPAKTIŠKAS — kiekvienas laukas trumpas bet informatyvus (1–2 sakiniai). Tik "strategija" ir "isViso" gali būti iki 6 sakinių.

SVARBU: Kainų kriterijų svoriai ir kvalifikacijos atitikimas yra patys svarbiausi laukai — juos pildyk ypač tiksliai ir išsamiai.
${profileContext}

Grąžink šią JSON struktūrą:
{
  "pavadinimas": "trumpas konkurso pavadinimas",
  "score": 70,
  "scoreLabel": "Geros galimybės",
  "perkanciojiOrganizacija": "pavadinimas",
  "pirkimoTipas": "tipas",
  "bendraVerte": "vertė EUR",
  "cpt": "CPV kodas",
  "terminai": {
    "pasiulymoTerminas": "data",
    "vokuAtplesimas": "data arba –",
    "vykdymoTerminas": "trukmė",
    "garantija": "laikotarpis",
    "klausimaiIki": "data arba –"
  },
  "kvalifikacija": {
    "apyvarta": "reikalavimas",
    "darbuotojai": "skaičius",
    "patirtis": "patirties reikalavimai",
    "sertifikatai": "reikalingi sertifikatai",
    "finansinis": "finansinės garantijos",
    "kita": "kiti reikalavimai"
  },
  "atitikimasKvalifikacijai": "Ar įmonė atitinka reikalavimus? Konkreti analizė pagal profilį arba bendroji rekomendacija.",
  "vertinimoKriterijai": [
    {"kriterijus": "Kaina", "svoris": "60%", "aprasas": "Kaip vertinama kaina"},
    {"kriterijus": "Kokybė", "svoris": "40%", "aprasas": "Kokie kokybės rodikliai"}
  ],
  "kainuStrategija": "Kaip formuoti kainą — ar ji lemia ir kiek. Kokie kiti kriterijai svarbūs ir kokį svorį turi. 2–3 sakiniai.",
  "techninieReikalavimai": "Techninių reikalavimų santrauka. 3–4 sakiniai.",
  "finansinesSalygos": {
    "avansas": "trumpas",
    "apmokejimas": "mokėjimo sąlygos",
    "baudos": "baudų sąlygos",
    "garantinis": "garantinis laikotarpis",
    "indeksavimas": "kainų indeksavimas arba –"
  },
  "draudimas": "draudimo reikalavimai",
  "subtiekejiai": "subtiekėjų galimybės",
  "konsorciumai": "konsorciumų galimybės",
  "rizikos": [
    "1–2 sakiniai konkreti rizika",
    "1–2 sakiniai konkreti rizika",
    "1–2 sakiniai konkreti rizika"
  ],
  "galimybes": [
    "konkreti galimybė",
    "konkreti galimybė",
    "konkreti galimybė"
  ],
  "strategija": "Iki 6 sakinių konkrečių patarimų kaip parengti pasiūlymą — kokius aspektus akcentuoti, kaip struktūruoti kainą, kokius dokumentus gerai paruošti.",
  "butinaiIttraukti": [
    {"dokumentas": "dokumento pavadinimas", "pastaba": "komentaras"}
  ],
  "dazniausiasKlaidos": [
    "konkreti klaida kurią daro tiekėjai",
    "konkreti klaida"
  ],
  "klausimaiPerkanciajai": [
    "Konkretus klausimas perkančiajai?",
    "Konkretus klausimas?"
  ],
  "isViso": "Iki 6 sakinių išvada — ar verta dalyvauti, ką ypač svarbu žinoti, kokie pagrindiniai iššūkiai."
}

DOKUMENTAI:
${String(text).slice(0, 100000)}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return res.status(500).json({ error: 'AI klaida: ' + errText.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const stopReason = data.stop_reason;

    const result = extractJSON(raw);

    if (!result) {
      console.error('JSON parse failed. stopReason:', stopReason, 'rawLength:', raw.length);
      console.error('Raw start:', raw.slice(0, 500));
      return res.status(500).json({
        error: 'AI atsakymas neteisingo formato. Bandykite su mažiau dokumentų arba pakartokite.',
        debug: { stopReason, rawLength: raw.length }
      });
    }

    // Decrement free counter
    if (supabase && plan === 'free') {
      try {
        const newLeft = Math.max(0, (userData.free_analyses_left ?? 3) - 1);
        await supabase
          .from('users')
          .update({ free_analyses_left: newLeft })
          .eq('id', user.id);
      } catch (e) {
        console.error('Counter update error:', e.message);
      }
    }

    // Save analysis
    if (supabase) {
      try {
        await supabase.from('analyses').insert([{
          user_id: user.id,
          project_id: projectId || null,
          document_name: documentName || 'Dokumentas',
          score: result.score || 0,
          result_json: result
        }]);
      } catch (e) {
        console.error('Save error:', e.message);
      }
    }

    return res.status(200).json({
      result,
      plan,
      features: {
        assistant: features.assistant,
        pdf: features.pdf,
        questionLetter: features.questionLetter
      }
    });

  } catch (e) {
    console.error('Analyze error:', e.message, e.stack);
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};

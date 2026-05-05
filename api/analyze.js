const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// Try to extract valid JSON even from truncated responses
function extractJSON(raw) {
  let cleaned = raw.trim();
  // Remove markdown code fences
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '');
  cleaned = cleaned.replace(/```\s*$/, '');
  cleaned = cleaned.trim();

  // Try direct parse
  try { return JSON.parse(cleaned); } catch(e) {}

  // Find JSON object boundaries
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  // Try parsing from { to end
  try { return JSON.parse(cleaned.slice(start)); } catch(e) {}

  // Try to find matching closing brace
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastValidEnd = -1;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) lastValidEnd = i;
    }
  }
  if (lastValidEnd > 0) {
    try { return JSON.parse(cleaned.slice(start, lastValidEnd + 1)); } catch(e) {}
  }

  // Last resort: try to fix truncated JSON by closing braces
  if (depth > 0) {
    let attempt = cleaned.slice(start);
    // Remove trailing partial value (everything after last comma or last key)
    attempt = attempt.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
    attempt = attempt.replace(/,\s*"[^"]*":?\s*$/, '');
    attempt = attempt.replace(/,\s*$/, '');
    // Close open braces
    while (depth > 0) { attempt += '}'; depth--; }
    try { return JSON.parse(attempt); } catch(e) {}
  }

  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Prisijunkite norėdami tęsti' });

  const { text, documentName, projectId, companyProfile } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Dokumentų tekstas būtinas' });

  let userData = { plan: 'free', free_analyses_left: 3 };
  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) {
        userData = data;
        if (userData.plan === 'free' && userData.free_analyses_left <= 0) {
          return res.status(403).json({ error: 'Išnaudojote nemokamas analizes' });
        }
      }
    } catch(e) { console.error('DB read error:', e.message); }
  }

  let profileContext = '';
  if (companyProfile && Object.keys(companyProfile).length > 0) {
    profileContext = `\n\nĮMONĖS PROFILIS (analizuok atsižvelgdamas į šią įmonę):
- Pavadinimas: ${companyProfile.name || 'Nenurodyta'}
- Veiklos sritis: ${companyProfile.sector || 'Nenurodyta'}
- Specializacija: ${companyProfile.specialization || 'Nenurodyta'}
- Įmonės dydis: ${companyProfile.size || 'Nenurodyta'}
- Patirtis: ${companyProfile.experience || 'Nenurodyta'}
- Sertifikatai: ${companyProfile.certificates || 'Nenurodyta'}
- Apyvarta: ${companyProfile.revenue || 'Nenurodyta'}\n`;
  }

  const prompt = `Tu esi viešųjų pirkimų ekspertas Lietuvoje. Išanalizuok CVP konkurso dokumentus ir grąžink TIK JSON objektą be markdown žymių, be ```json fence, tiesiog grynas JSON.

Atsakymas turi būti KOMPAKTIŠKAS – kiekvieno lauko reikšmė trumpa bet informatyvi (1-3 sakiniai). Tik "strategija" ir "isViso" gali būti ilgesnės (5-8 sakiniai).
${profileContext}

Privalomi laukai:
{
  "pavadinimas": "trumpas",
  "score": 70,
  "scoreLabel": "Geros galimybės",
  "perkanciojiOrganizacija": "trumpas",
  "pirkimoTipas": "trumpas",
  "bendraVerte": "vertė",
  "cpt": "kodas",
  "terminai": {"pasiulymoTerminas":"data","vokuAtplesimas":"data","vykdymoTerminas":"trukmė","garantija":"laikotarpis","klausimaiIki":"data"},
  "kvalifikacija": {"apyvarta":"reikalavimas","darbuotojai":"skaičius","patirtis":"trumpas","sertifikatai":"trumpas","finansinis":"trumpas","kita":"trumpas"},
  "vertinimoKriterijai": [{"kriterijus":"pavad","svoris":"30%","aprasas":"trumpas"}],
  "techninieReikalavimai": "santrauka 3-5 sakiniai",
  "finansinesSalygos": {"avansas":"trumpas","apmokejimas":"trumpas","baudos":"trumpas","garantinis":"trumpas","indeksavimas":"trumpas"},
  "draudimas": "trumpas",
  "subtiekejiai": "trumpas",
  "konsorciumai": "trumpas",
  "rizikos": ["rizika1","rizika2","rizika3"],
  "galimybes": ["galimybe1","galimybe2","galimybe3"],
  "strategija": "5-8 sakiniai konkrečių patarimų",
  "butinaiIttraukti": [{"dokumentas":"pavad","pastaba":"trumpas"}],
  "dazniausiasKlaidos": ["klaida1","klaida2"],
  "klausimaiPerkanciajai": ["k1","k2"],
  "isViso": "5-8 sakinių išvada"
}

DOKUMENTAI:
${text.slice(0, 100000)}`;

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
      const errData = await response.text();
      console.error('Anthropic error:', errData);
      return res.status(500).json({ error: 'AI klaida: ' + errData.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const stopReason = data.stop_reason;

    let result = extractJSON(raw);

    if (!result) {
      console.error('JSON parse failed. Stop reason:', stopReason, 'Length:', raw.length);
      console.error('Raw start:', raw.slice(0, 500));
      console.error('Raw end:', raw.slice(-500));
      return res.status(500).json({ 
        error: 'AI atsakymas buvo per ilgas arba neteisingo formato. Bandykite dar kartą su mažiau dokumentų.',
        debug: { stopReason, length: raw.length }
      });
    }

    if (supabase && userData.plan === 'free') {
      try {
        await supabase.from('users').update({ free_analyses_left: userData.free_analyses_left - 1 }).eq('id', user.id);
      } catch(e) { console.error('Counter update error:', e.message); }
    }

    if (supabase) {
      try {
        await supabase.from('analyses').insert([{
          user_id: user.id,
          project_id: projectId || null,
          document_name: documentName || 'Dokumentas',
          score: result.score || 0,
          result_json: result
        }]);
      } catch(e) { console.error('Save error:', e.message); }
    }

    return res.status(200).json({ result });
  } catch(e) {
    console.error('Analyze error:', e.message, e.stack);
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};

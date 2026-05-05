const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify token
  let user;
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Prisijunkite norėdami tęsti' });
    }
    user = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Sesija pasibaigė. Prisijunkite iš naujo.' });
  }

  const body = req.body || {};
  const text = body.text;
  const documentName = body.documentName || 'Dokumentas';
  const projectId = body.projectId || null;
  const companyProfile = body.companyProfile || null;

  if (!text) {
    return res.status(400).json({ error: 'Dokumentų tekstas būtinas' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY nenustatytas Vercel' });
  }

  // Check user limits
  let supabase = null;
  let userData = null;
  
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      userData = data;
      
      if (userData && userData.plan === 'free' && userData.free_analyses_left <= 0) {
        return res.status(403).json({ error: 'Išnaudojote nemokamas analizes' });
      }
    } catch (e) {
      console.error('DB error:', e.message);
    }
  }

  // Build profile context
  let profileText = '';
  if (companyProfile && typeof companyProfile === 'object') {
    profileText = '\n\nĮMONĖS PROFILIS:\n';
    if (companyProfile.name) profileText += '- Pavadinimas: ' + companyProfile.name + '\n';
    if (companyProfile.sector) profileText += '- Sritis: ' + companyProfile.sector + '\n';
    if (companyProfile.specialization) profileText += '- Specializacija: ' + companyProfile.specialization + '\n';
    if (companyProfile.size) profileText += '- Dydis: ' + companyProfile.size + '\n';
    if (companyProfile.experience) profileText += '- Patirtis: ' + companyProfile.experience + '\n';
    if (companyProfile.certificates) profileText += '- Sertifikatai: ' + companyProfile.certificates + '\n';
    if (companyProfile.revenue) profileText += '- Apyvarta: ' + companyProfile.revenue + '\n';
  }

  const prompt = 'Esi viešųjų pirkimų ekspertas Lietuvoje. Išanalizuok CVP konkurso dokumentus. Grąžink TIK JSON, be markdown žymių, be ```json fence.\n\n' +
'Atsakymai TURI BŪTI TRUMPI - po 1-2 sakinius kiekvienam laukui. Tik strategija ir isViso gali būti 3-5 sakiniai.' +
profileText +
'\n\nJSON struktūra:\n' +
'{\n' +
'  "pavadinimas": "trumpas",\n' +
'  "score": 70,\n' +
'  "scoreLabel": "Geros galimybės",\n' +
'  "perkanciojiOrganizacija": "pavadinimas",\n' +
'  "pirkimoTipas": "tipas",\n' +
'  "bendraVerte": "vertė EUR",\n' +
'  "cpt": "CPV",\n' +
'  "terminai": {"pasiulymoTerminas":"data","vokuAtplesimas":"data","vykdymoTerminas":"trukmė","garantija":"laikotarpis","klausimaiIki":"data"},\n' +
'  "kvalifikacija": {"apyvarta":"reikalavimas","darbuotojai":"sk","patirtis":"trumpas","sertifikatai":"trumpas","finansinis":"trumpas","kita":"trumpas"},\n' +
'  "vertinimoKriterijai": [{"kriterijus":"pav","svoris":"30%","aprasas":"trumpas"}],\n' +
'  "techninieReikalavimai": "santrauka 2-3 sakiniai",\n' +
'  "finansinesSalygos": {"avansas":"t","apmokejimas":"t","baudos":"t","garantinis":"t","indeksavimas":"t"},\n' +
'  "draudimas": "trumpas",\n' +
'  "subtiekejiai": "trumpas",\n' +
'  "konsorciumai": "trumpas",\n' +
'  "rizikos": ["r1","r2","r3"],\n' +
'  "galimybes": ["g1","g2","g3"],\n' +
'  "strategija": "3-5 sakiniai",\n' +
'  "butinaiIttraukti": [{"dokumentas":"pav","pastaba":"trumpas"}],\n' +
'  "dazniausiasKlaidos": ["k1","k2"],\n' +
'  "klausimaiPerkanciajai": ["k1","k2"],\n' +
'  "isViso": "3-5 sakiniai"\n' +
'}\n\n' +
'DOKUMENTAI:\n' + String(text).slice(0, 80000);

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
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return res.status(500).json({ error: 'AI klaida: ' + errText.slice(0, 200) });
    }

    const data = await response.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || '';

    // Extract JSON
    let jsonStr = raw.trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, '');
    jsonStr = jsonStr.replace(/^```\s*/, '');
    jsonStr = jsonStr.replace(/\s*```$/, '');
    jsonStr = jsonStr.trim();
    
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      console.error('First 500 chars:', raw.slice(0, 500));
      return res.status(500).json({ error: 'AI atsakymas neteisingo formato. Bandykite dar kartą.' });
    }

    // Update counter and save
    if (supabase && userData) {
      try {
        if (userData.plan === 'free') {
          await supabase.from('users').update({ 
            free_analyses_left: userData.free_analyses_left - 1 
          }).eq('id', user.id);
        }
        await supabase.from('analyses').insert([{
          user_id: user.id,
          project_id: projectId,
          document_name: documentName,
          score: result.score || 0,
          result_json: result
        }]);
      } catch (e) {
        console.error('Save error:', e.message);
      }
    }

    return res.status(200).json({ result: result });
    
  } catch (e) {
    console.error('Function error:', e.message);
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};

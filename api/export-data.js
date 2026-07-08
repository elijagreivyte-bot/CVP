// ═══════════════════════════════════════════════════════════
// GET /api/export-data
// BDAR 20 str. — teisė gauti duomenis susistemintu, mašininiu
// formatu. Vartotojas gauna VISUS savo duomenis vienu JSON failu.
// SVARBU: šis endpoint'as NEĮTRAUKIA kitų vartotojų duomenų (net
// agreguotų) — tik tai, kas priklauso būtent šiam user_id.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, applyCors } = require('./security');

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const [profileRes, analysesRes, projectsRes, feedbackRes] = await Promise.all([
      supabase.from('users')
        .select('id, name, email, plan, created_at, company_profile')
        .eq('id', user.id).single(),
      supabase.from('analyses')
        .select('id, document_name, result_json, score, created_at, outcome, outcome_at')
        .eq('user_id', user.id),
      supabase.from('projects')
        .select('id, name, created_at')
        .eq('user_id', user.id),
      supabase.from('analysis_quality_log')
        .select('analysis_id, user_feedback, user_feedback_comment, user_feedback_at')
        .eq('user_id', user.id).not('user_feedback', 'is', null)
    ]);

    const exportPayload = {
      _info: 'Bidwise AI — jūsų duomenų eksportas pagal BDAR 20 str. (teisė gauti duomenis susistemintu formatu)',
      exported_at: new Date().toISOString(),
      profile: profileRes.data || null,
      analyses: analysesRes.data || [],
      projects: projectsRes.data || [],
      feedback: feedbackRes.data || []
    };

    res.setHeader('Content-Disposition', 'attachment; filename="bidwiseai-duomenys.json"');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify(exportPayload, null, 2));
  } catch (e) {
    console.error('export-data klaida:', e);
    return res.status(500).json({ error: 'Klaida eksportuojant duomenis: ' + e.message });
  }
};

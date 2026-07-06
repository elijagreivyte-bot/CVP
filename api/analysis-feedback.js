// ═══════════════════════════════════════════════════════════
// POST /api/analysis-feedback
// Vartotojo grįžtamasis ryšys apie konkrečią analizę (👍/👎 + komentaras).
// Maitina Mokymosi ciklą — be šito duomens Prompt/Model Quality Score
// negalėtų atsižvelgti į realų vartotojų vertinimą, ne tik vidinius signalus.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, applyCors } = require('./security');

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });

  const { analysisId, feedback, comment } = req.body || {};
  if (!analysisId || !['up', 'down'].includes(feedback)) {
    return res.status(400).json({ error: 'Reikalingas analysisId ir feedback ("up" arba "down")' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Patikriname, kad analizė priklauso šiam vartotojui — apsauga nuo IDOR.
    const { data: analysis } = await supabase.from('analyses').select('id, user_id').eq('id', analysisId).single();
    if (!analysis || analysis.user_id !== user.id) {
      return res.status(404).json({ error: 'Analizė nerasta' });
    }

    const { error } = await supabase
      .from('analysis_quality_log')
      .update({
        user_feedback: feedback,
        user_feedback_comment: (comment || '').slice(0, 1000) || null,
        user_feedback_at: new Date().toISOString()
      })
      .eq('analysis_id', analysisId);

    if (error) {
      // Jei quality_log įrašo dar nėra (sena analizė be logo) — sukuriame minimalų.
      await supabase.from('analysis_quality_log').insert({
        analysis_id: analysisId,
        user_id: user.id,
        user_feedback: feedback,
        user_feedback_comment: (comment || '').slice(0, 1000) || null,
        user_feedback_at: new Date().toISOString()
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('analysis-feedback klaida:', e);
    return res.status(500).json({ error: 'Klaida: ' + e.message });
  }
};

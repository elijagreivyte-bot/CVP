// ═══════════════════════════════════════════════════════════
// BIDWISE AI — CHAT HISTORY loader
// GET /api/chat-history?analysisId=xxx
// Grąžina: { messages: [...], doc_text: "...", preset_questions: [...] }
// Naudojama kai vartotojas atidaro seną analizę iš istorijos —
// chat tęsiamas su visomis žinutėmis ir teisinga dokumento kontekstu.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./security');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: 'DB neprijungta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // GET — pakrauti chat istoriją + doc_text + preset_questions
  if (req.method === 'GET') {
    const analysisId = req.query?.analysisId || req.query?.id;
    if (!analysisId) return res.status(400).json({ error: 'analysisId būtinas' });

    try {
      const { data, error } = await supabase
        .from('analyses')
        .select('id, chat_messages, doc_text, preset_questions, result_json')
        .eq('id', analysisId)
        .eq('user_id', user.id)
        .single();

      if (error || !data) return res.status(404).json({ error: 'Analizė nerasta' });

      return res.status(200).json({
        messages: Array.isArray(data.chat_messages) ? data.chat_messages : [],
        doc_text: data.doc_text || '',
        preset_questions: Array.isArray(data.preset_questions) ? data.preset_questions : [],
        has_doc_text: !!(data.doc_text && data.doc_text.length > 100)
      });
    } catch (e) {
      console.error('chat-history GET klaida:', e);
      return res.status(500).json({ error: 'Klaida: ' + e.message });
    }
  }

  // DELETE — išvalyti chat istoriją konkrečiai analizei (be ištrinti pačios analizės)
  if (req.method === 'DELETE') {
    const { analysisId } = req.body || {};
    if (!analysisId) return res.status(400).json({ error: 'analysisId būtinas' });

    try {
      const { error } = await supabase
        .from('analyses')
        .update({ chat_messages: [] })
        .eq('id', analysisId)
        .eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ cleared: true });
    } catch (e) {
      return res.status(500).json({ error: 'Klaida: ' + e.message });
    }
  }

  return res.status(405).json({ error: 'Metodas neleidžiamas' });
};

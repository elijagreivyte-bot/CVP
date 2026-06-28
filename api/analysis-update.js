// ═══════════════════════════════════════════════════════════
// BIDWISE AI — analysis-update
// Atnaujina esamos analizės doc_text — naudojama kai vartotojas
// chat'e prideda papildomus dokumentus (PDF, SAK ir t.t.)
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./security');
const MAX_DOC_TEXT = 300000; // ~75K tokenų — saugumui ir vietai DB

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: 'DB neprijungta' });

  const { analysisId, appendText, action } = req.body || {};
  if (!analysisId) return res.status(400).json({ error: 'analysisId būtinas' });
  if (typeof appendText !== 'string' || !appendText.trim()) {
    return res.status(400).json({ error: 'appendText būtinas' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Pakraunam esamą doc_text
    const { data: row, error: e1 } = await supabase
      .from('analyses')
      .select('doc_text')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single();
    if (e1 || !row) return res.status(404).json({ error: 'Analizė nerasta' });

    const existing = row.doc_text || '';
    // Pridedam naują tekstą su separator'iumi
    let combined = existing + '\n\n═══ PAPILDOMI DOKUMENTAI (pridėti vėliau) ═══\n' + appendText;
    // Apribojam dydį (paliekam paskutinę dalį — naujausi dokumentai svarbiausi)
    if (combined.length > MAX_DOC_TEXT) {
      combined = combined.slice(-MAX_DOC_TEXT);
    }

    const { error: e2 } = await supabase
      .from('analyses')
      .update({ doc_text: combined })
      .eq('id', analysisId)
      .eq('user_id', user.id);
    if (e2) throw e2;

    return res.status(200).json({
      ok: true,
      total_length: combined.length,
      appended_length: appendText.length
    });
  } catch (e) {
    console.error('analysis-update klaida:', e);
    return res.status(500).json({ error: 'Klaida: ' + e.message });
  }
};

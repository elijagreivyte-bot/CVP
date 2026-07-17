// ═══════════════════════════════════════════════════════════
// BIDWISE AI — /api/analyze-start
// Pradeda asinchroninę analizę: patikrina hard-stop, rezervuoja
// kvotą, padalina dokumentą į dalis, sukuria job'ą DB ir GRĄŽINA
// jobId per <2s. Visas sunkusis darbas vyksta per vėlesnius
// /api/analyze-continue kvietimus — todėl dokumento dydis
// NEBEPRIKLAUSO nuo Vercel vieno kvietimo laiko ribos.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, applyCors } = require('./security');
const { checkHardStops } = require('./_validation-engine/hard-stops');
const { splitIntoChunks, CHUNK_CHARS } = require('./_analysis-core');

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: 'Duomenų bazė nepasiekiama' });

  const { documentText, text, documentName, companyProfile, projectId } = req.body || {};
  const docText = documentText || text || '';
  if (!docText || docText.length < 50) {
    return res.status(400).json({ error: 'Dokumento tekstas per trumpas arba tuščias' });
  }
  const docTextSafe = String(docText).replace(/<[^>]*>/g, '').trim();

  const hardStop = checkHardStops(docTextSafe);
  if (hardStop.stopped) {
    return res.status(422).json({ error: hardStop.message, code: hardStop.code, hardStop: true });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let profile = companyProfile || {};
  let userPlan = 'free';
  let freeLeft = null;
  let reserved = false;

  try {
    const { data: urow } = await supabase
      .from('users')
      .select('plan, free_analyses_left, company_profile')
      .eq('id', user.id)
      .single();
    if (urow) {
      userPlan = urow.plan || 'free';
      freeLeft = (typeof urow.free_analyses_left === 'number') ? urow.free_analyses_left : null;
      if ((!profile || !profile.sector) && urow.company_profile) profile = urow.company_profile;
    }

    if (userPlan === 'free') {
      const avail = (typeof freeLeft === 'number') ? freeLeft : 0;
      if (avail <= 0) {
        return res.status(403).json({ error: 'Išnaudojote nemokamas analizes. Atnaujinkite planą, kad tęstumėte.', code: 'QUOTA_EXCEEDED', freeAnalysesLeft: 0 });
      }
      const { data: rez } = await supabase
        .from('users')
        .update({ free_analyses_left: avail - 1 })
        .eq('id', user.id)
        .eq('free_analyses_left', avail)
        .select('free_analyses_left');
      if (!rez || !rez.length) {
        return res.status(403).json({ error: 'Išnaudojote nemokamas analizes. Atnaujinkite planą, kad tęstumėte.', code: 'QUOTA_EXCEEDED' });
      }
      reserved = true;
    }

    // Jei dokumentas mažas, kondensavimas nereikalingas — chunks bus tuščias
    // masyvas ir analyze-continue iškart pereis prie generavimo etapo.
    const needsCondensing = docTextSafe.length > 280000;
    const chunks = needsCondensing ? splitIntoChunks(docTextSafe) : [];

    const { data: job, error: jobErr } = await supabase
      .from('analysis_jobs')
      .insert({
        user_id: user.id,
        status: needsCondensing ? 'chunking' : 'generating',
        chunks: needsCondensing ? chunks : null,
        done_chunks: 0,
        condensed_parts: [],
        doc_text_full_len: docTextSafe.length,
        document_name: documentName || null,
        company_profile: profile,
        project_id: projectId || null,
        free_analysis_reserved: reserved,
        // Mažam dokumentui iškart saugom pilną tekstą kaip "kondensuotą" —
        // continue endpoint'as tiesiog naudos jį be papildomo žingsnio.
        result_json: needsCondensing ? null : { _rawText: docTextSafe }
      })
      .select('id, status')
      .single();

    if (jobErr || !job) {
      if (reserved) await supabase.from('users').update({ free_analyses_left: freeLeft }).eq('id', user.id);
      return res.status(500).json({ error: 'Nepavyko sukurti analizės užduoties: ' + (jobErr ? jobErr.message : 'nežinoma klaida') });
    }

    return res.status(200).json({
      jobId: job.id,
      status: job.status,
      totalChunks: chunks.length,
      freeAnalysesLeft: userPlan === 'free' ? Math.max(0, (freeLeft || 0) - 1) : null
    });

  } catch (e) {
    console.error('analyze-start klaida:', e);
    if (reserved) {
      try { await supabase.from('users').update({ free_analyses_left: freeLeft }).eq('id', user.id); } catch (_) {}
    }
    return res.status(500).json({ error: 'Klaida pradedant analizę: ' + e.message });
  }
};

module.exports.config = { maxDuration: 30 };

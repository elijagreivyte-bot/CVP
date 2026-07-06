// ═══════════════════════════════════════════════════════════
// BIDWISE AI — admin metrikų endpoint
// GET /api/admin-stats  (reikalauja x-admin-secret antraštės)
// SVARBU: ADMIN_SECRET turi būti nustatytas Vercel env kintamuosiuose.
// Be jo šis endpoint'as visiems grąžins 500 (saugu pagal nutylėjimą).
// ═══════════════════════════════════════════════════════════
const { computeMetrics, flagRegressions } = require('./_utils/metrics');
const { computeWeeklyQuality } = require('./weekly-quality-report');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'ADMIN_SECRET nesukonfigūruotas Vercel aplinkoje — dashboard neaktyvus dėl saugumo.' });
  }
  const provided = req.headers['x-admin-secret'];
  if (!provided || provided !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Neteisingas administratoriaus raktas' });
  }

  try {
    const metrics = await computeMetrics();
    const regressions = flagRegressions(metrics);
    const quality = await computeWeeklyQuality();

    // Knowledge Base dydis — kiek objektų sukaupta (paprasti COUNT'ai, ne fabrikuota statistika)
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { count: totalAnalysesAllTime } = await supabase.from('analyses').select('id', { count: 'exact', head: true });
    const { data: distinctCpvRows } = await supabase.from('analysis_quality_log').select('cpv').not('cpv', 'is', null);
    const { data: distinctPoRows } = await supabase.from('analysis_quality_log').select('perkancioji_organizacija').not('perkancioji_organizacija', 'is', null);
    const knowledgeBase = {
      totalAnalysesAllTime: totalAnalysesAllTime || 0,
      distinctCpvCodes: new Set((distinctCpvRows || []).map(r => r.cpv)).size,
      distinctOrganizations: new Set((distinctPoRows || []).map(r => r.perkancioji_organizacija)).size
    };

    return res.status(200).json({ metrics, regressions, quality, knowledgeBase });
  } catch (e) {
    console.error('admin-stats klaida:', e);
    return res.status(500).json({ error: 'Klaida skaičiuojant metrikas: ' + e.message });
  }
};

// ═══════════════════════════════════════════════════════════
// KNOWLEDGE BASE (ne atskira graph DB — agregacijos virš esamų lentelių)
// Objektai: Perkančioji organizacija, CPV, Rizika, Rule Engine radiniai —
// visi jau natūraliai susieti per analysis_id, nes atėjo iš TO PATIES
// analizuoto dokumento. Jokie ryšiai NEKURIAMI dirbtinai — tik faktas
// "šis reikalavimas/rizika buvo rastas ŠIAME konkrečiame dokumente".
//
// SVARBIAUSIA TAISYKLĖ (iš specifikacijos): jei duomenų nepakanka,
// aiškiai tai pažymėti, o ne fabrikuoti tendenciją iš 1-2 pavyzdžių.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');

const MIN_SAMPLES_FOR_INSIGHT = 3; // mažiau nei 3 ankstesnės analizės = nepakanka duomenų tendencijai

function supa() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

function topN(counter, n = 8) {
  return Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
}

/**
 * Surenka visas analizes (result_json), kurios atitinka CPV arba PO, IŠSKYRUS
 * pačią dabartinę analizę (excludeAnalysisId) — kad "istorija" nerodytų pati savęs.
 */
async function fetchRelatedAnalyses({ cpv, perkanciojiOrganizacija, excludeAnalysisId }) {
  const supabase = supa();
  let query = supabase.from('analysis_quality_log').select('analysis_id, cpv, perkancioji_organizacija, risk_classes');

  if (cpv && perkanciojiOrganizacija) {
    query = query.or(`cpv.eq.${cpv},perkancioji_organizacija.eq.${perkanciojiOrganizacija}`);
  } else if (cpv) {
    query = query.eq('cpv', cpv);
  } else if (perkanciojiOrganizacija) {
    query = query.eq('perkancioji_organizacija', perkanciojiOrganizacija);
  } else {
    return { logs: [], analyses: [] };
  }
  if (excludeAnalysisId) query = query.neq('analysis_id', excludeAnalysisId);

  const { data: logs } = await query;
  if (!logs || logs.length === 0) return { logs: [], analyses: [] };

  const ids = logs.map(l => l.analysis_id).filter(Boolean);
  if (ids.length === 0) return { logs, analyses: [] };

  const { data: analyses } = await supabase.from('analyses').select('id, result_json, score').in('id', ids);
  return { logs, analyses: analyses || [] };
}

/**
 * Pagrindinė "Procurement Intelligence" funkcija — kviečiama TIEK Validatoriui
 * (kaip papildomas, ne-autoritetinis kontekstas), TIEK frontend'ui rodyti vartotojui.
 * Grąžina null (ne fabrikuotą tuščią struktūrą), jei duomenų nepakanka.
 */
async function getProcurementIntelligence({ cpv, perkanciojiOrganizacija, excludeAnalysisId }) {
  const { analyses } = await fetchRelatedAnalyses({ cpv, perkanciojiOrganizacija, excludeAnalysisId });

  if (analyses.length < MIN_SAMPLES_FOR_INSIGHT) {
    return { insufficientData: true, sampleSize: analyses.length, minRequired: MIN_SAMPLES_FOR_INSIGHT };
  }

  const qualCounter = {};
  const criteriaCounter = {};
  const missingDocsCounter = {};
  const riskClassCounter = {};
  const scores = [];

  for (const a of analyses) {
    const r = a.result_json || {};
    if (typeof a.score === 'number') scores.push(a.score);

    for (const k of (r.kvalifikacijosMatrica || [])) {
      const key = (k.reikalavimas || '').trim();
      if (key) qualCounter[key] = (qualCounter[key] || 0) + 1;
    }
    for (const k of (r.vertinimoKriterijai || [])) {
      const key = (k.kriterijus || '').trim();
      if (key) criteriaCounter[key] = (criteriaCounter[key] || 0) + 1;
    }
    for (const d of (r.butinaiIttraukti || [])) {
      const key = (d.dokumentas || d || '').trim();
      if (key) missingDocsCounter[key] = (missingDocsCounter[key] || 0) + 1;
    }
  }

  // Rizikų klasės — jau surinktos analysis_quality_log.risk_classes (parašyta analizės metu)
  const { logs } = await fetchRelatedAnalyses({ cpv, perkanciojiOrganizacija, excludeAnalysisId });
  for (const log of logs) {
    for (const rc of (log.risk_classes || [])) {
      riskClassCounter[rc.class] = (riskClassCounter[rc.class] || 0) + 1;
    }
  }

  return {
    insufficientData: false,
    sampleSize: analyses.length,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    commonQualifications: topN(qualCounter, 5),
    commonCriteria: topN(criteriaCounter, 5),
    commonRequiredDocuments: topN(missingDocsCounter, 5),
    commonRiskClasses: topN(riskClassCounter, 6)
  };
}

/**
 * PO / CPV profiliai adminui — panašus principas, bet visai statistikai,
 * ne tik "insight" vartotojui.
 */
async function getPOProfile(poName) {
  const { analyses } = await fetchRelatedAnalyses({ perkanciojiOrganizacija: poName });
  if (analyses.length === 0) return { insufficientData: true };
  const cpvCounter = {};
  for (const a of analyses) {
    const cpv = a.result_json && a.result_json.cpt;
    if (cpv) cpvCounter[cpv] = (cpvCounter[cpv] || 0) + 1;
  }
  return { insufficientData: false, totalAnalyses: analyses.length, topCpv: topN(cpvCounter, 5) };
}

module.exports = { getProcurementIntelligence, getPOProfile, MIN_SAMPLES_FOR_INSIGHT };

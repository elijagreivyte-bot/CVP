// ═══════════════════════════════════════════════════════════
// GET/POST /api/weekly-quality-report
// Kviečiama Vercel Cron kartą per savaitę (žr. vercel.json).
// SVARBU: skaičiai žemiau yra TIKRA SQL agregacija realiais duomenimis,
// ne "pattern discovery" AI magija. Su mažu analizių kiekiu skaičiai
// bus maži ir mažiau statistiškai reikšmingi — tai pasakoma atvirai,
// ne nuslepiama.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');

function supa() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

async function computeWeeklyQuality() {
  const supabase = supa();
  const since = new Date(Date.now() - 30 * 86400000).toISOString(); // 30 dienų langas (didesnis nei savaitė — mažam srautui reikia daugiau duomenų taškų)

  const { data: logs } = await supabase
    .from('analysis_quality_log')
    .select('rule_findings, validator_ran, validator_result, confidence_score, user_feedback, cpv, perkancioji_organizacija, document_type, created_at')
    .gte('created_at', since);

  const rows = logs || [];
  const total = rows.length;

  if (total === 0) {
    return { insufficientData: true, message: 'Per paskutines 30 dienų nėra jokių analizių su kokybės duomenimis. Ataskaita bus prasminga, kai bus bent keliolika analizių.' };
  }

  // TOP taisyklių suveikimai (tikras COUNT/GROUP BY, ne spėjimas)
  const ruleCounts = {};
  for (const row of rows) {
    for (const f of row.rule_findings || []) {
      ruleCounts[f.code] = ruleCounts[f.code] || { code: f.code, title: f.title, count: 0 };
      ruleCounts[f.code].count++;
    }
  }
  const topRules = Object.values(ruleCounts).sort((a, b) => b.count - a.count).slice(0, 20);

  // Validatoriaus nesutarimo dažnis
  const validatorRuns = rows.filter(r => r.validator_ran);
  const disagreements = validatorRuns.filter(r => r.validator_result && r.validator_result.sutinkaSuGeneratoriumi === false);
  const disagreementRate = validatorRuns.length ? +((disagreements.length / validatorRuns.length) * 100).toFixed(1) : null;

  // Vartotojo grįžtamasis ryšys
  const feedbackRows = rows.filter(r => r.user_feedback);
  const negativeFeedback = feedbackRows.filter(r => r.user_feedback === 'down');
  const negativeFeedbackRate = feedbackRows.length ? +((negativeFeedback.length / feedbackRows.length) * 100).toFixed(1) : null;

  // Vidutinis confidence
  const confScores = rows.map(r => r.confidence_score).filter(n => typeof n === 'number');
  const avgConfidence = confScores.length ? Math.round(confScores.reduce((a, b) => a + b, 0) / confScores.length) : null;

  // Top CPV / PO / dokumentų tipai
  const countBy = (key) => {
    const m = {};
    for (const r of rows) { if (r[key]) m[r[key]] = (m[r[key]] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ value: k, count: v }));
  };

  // ── PROMPT QUALITY SCORE — SĄMONINGAI PAŽYMĖTA KAIP EURISTIKA ──
  // Formulė: 100 - (validatoriaus nesutarimo % * 0.4) - (vid. taisyklių suveikimų/analizei * 5) - (neigiamo atsiliepimo % * 0.3)
  // Tai NĖRA moksliškai išvesta formulė — tai pradinis atskaitos taškas, kurį reikės
  // perkalibruoti su realiais duomenimis po kelių mėnesių.
  const avgFindingsPerAnalysis = total ? rows.reduce((sum, r) => sum + (r.rule_findings || []).length, 0) / total : 0;
  let promptQualityScore = 100;
  if (disagreementRate !== null) promptQualityScore -= disagreementRate * 0.4;
  promptQualityScore -= avgFindingsPerAnalysis * 5;
  if (negativeFeedbackRate !== null) promptQualityScore -= negativeFeedbackRate * 0.3;
  promptQualityScore = Math.max(0, Math.min(100, Math.round(promptQualityScore)));

  return {
    insufficientData: false,
    periodDays: 30,
    totalAnalyses: total,
    topRules,
    validator: { runs: validatorRuns.length, disagreementRate },
    feedback: { total: feedbackRows.length, negativeRate: negativeFeedbackRate },
    avgConfidence,
    promptQualityScore: total >= 15 ? promptQualityScore : null, // per mažai duomenų prasmingam balui
    promptQualityScoreNote: total >= 15 ? 'Euristinė formulė — reikės perkalibruoti su daugiau duomenų.' : `Reikia bent 15 analizių prasmingam balui (dabar: ${total}).`,
    topCpv: countBy('cpv'),
    topPerkanciosios: countBy('perkancioji_organizacija'),
    topDocumentTypes: countBy('document_type')
  };
}

async function sendWeeklyEmail(to, report) {
  if (!process.env.RESEND_API_KEY) return false;
  let html;
  if (report.insufficientData) {
    html = `<p>${report.message}</p>`;
  } else {
    html = `
    <h2>Bidwise AI · Savaitės kokybės ataskaita (paskutinės 30 d.)</h2>
    <p>Iš viso analizių: <strong>${report.totalAnalyses}</strong> · Vid. confidence: <strong>${report.avgConfidence}%</strong></p>
    ${report.promptQualityScore !== null ? `<p>Prompt Quality Score (euristika): <strong>${report.promptQualityScore}/100</strong> — ${report.promptQualityScoreNote}</p>` : `<p style="color:#888">${report.promptQualityScoreNote}</p>`}
    <h3>TOP taisyklės, kurios suveikė dažniausiai</h3>
    <ol>${report.topRules.map(r => `<li>${r.code} — ${r.title} (${r.count}x)</li>`).join('')}</ol>
    <p>Validatorius nesutiko su Generatoriumi: <strong>${report.validator.disagreementRate ?? 'n/a'}%</strong> (${report.validator.runs} kvietimų)</p>
    <p>Neigiamas vartotojų atsiliepimas: <strong>${report.feedback.negativeRate ?? 'n/a'}%</strong> (${report.feedback.total} atsiliepimų iš viso)</p>
    <p style="color:#888;font-size:12px">Jei kuri nors taisyklė suveikia dažnai — verta peržiūrėti Generatoriaus promptą tai sričiai rankiniu būdu. Sistema NEKEIČIA promptų automatiškai.</p>
    `;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'Bidwise AI <noreply@bidwiseai.lt>',
      to: [to],
      subject: 'Bidwise AI · Savaitės kokybės ataskaita',
      html
    })
  });
  return r.ok;
}

async function handler(req, res) {
  if (req.method === 'POST') {
    const provided = req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || provided !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'Neteisingas administratoriaus raktas' });
    }
  } else if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodas neleidžiamas' });
  }

  try {
    const report = await computeWeeklyQuality();
    let sent = false;
    if (process.env.ADMIN_EMAIL) sent = await sendWeeklyEmail(process.env.ADMIN_EMAIL, report);
    return res.status(200).json({ ok: true, sent, report });
  } catch (e) {
    console.error('weekly-quality-report klaida:', e);
    return res.status(500).json({ error: 'Klaida: ' + e.message });
  }
}

module.exports = handler;
module.exports.computeWeeklyQuality = computeWeeklyQuality;

// ═══════════════════════════════════════════════════════════
// BIDWISE AI — automatinė dienos ataskaita
// Kviečiama Vercel Cron kartą per dieną (žr. vercel.json).
// Suskaičiuoja verslo metrikas ir išsiunčia santrauką el. paštu.
// Jei koks nors KPI krito >10% (7d vs ankstesnė savaitė) — pažymima
// kaip prioritetinė problema laiško viršuje.
// ═══════════════════════════════════════════════════════════
const { computeMetrics, flagRegressions } = require('./_utils/metrics');

async function sendReportEmail(to, metrics, regressions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('daily-report: RESEND_API_KEY nenustatytas, ataskaita neišsiųsta, tik sugeneruota logе');
    return false;
  }
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('lt-LT') : n);
  const changeColor = (pct) => (pct < 0 ? '#ef4444' : pct > 0 ? '#10b981' : '#64748b');
  const changeSign = (pct) => (pct > 0 ? '+' : '');

  const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#1a56db">Bidwise AI · Dienos ataskaita</h2>
  <div style="color:#64748b;font-size:13px;margin-bottom:20px">${new Date(metrics.generated_at).toLocaleString('lt-LT')}</div>

  ${regressions.length ? `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin-bottom:20px">
    <div style="font-weight:700;color:#dc2626;margin-bottom:8px">⚠️ Prioritetinės problemos (KPI kritimas &gt;10%)</div>
    ${regressions.map(r => `<div style="font-size:13px;color:#7f1d1d;padding:2px 0">• ${r}</div>`).join('')}
  </div>` : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;margin-bottom:20px;color:#166534;font-size:13px">✓ Jokių >10% KPI kritimų nerasta</div>`}

  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:8px 0;color:#64748b">Vartotojai iš viso</td><td style="text-align:right;font-weight:700">${fmt(metrics.users.total)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">— free / pro / team</td><td style="text-align:right">${metrics.users.free} / ${metrics.users.pro} / ${metrics.users.team}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Naujos registracijos (7d)</td><td style="text-align:right;font-weight:700">${fmt(metrics.new_users_7d)} <span style="color:${changeColor(metrics.new_users_change_pct)};font-size:12px">(${changeSign(metrics.new_users_change_pct)}${metrics.new_users_change_pct}%)</span></td></tr>
    <tr><td style="padding:12px 0 8px;color:#64748b;border-top:1px solid #e2e8f0">MRR (mėnesinės pajamos)</td><td style="text-align:right;font-weight:700;border-top:1px solid #e2e8f0">${fmt(metrics.revenue.mrr)}€</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Mokantys klientai</td><td style="text-align:right">${fmt(metrics.revenue.paying_users)} (${metrics.revenue.conversion_rate_pct}% konversija)</td></tr>
    <tr><td style="padding:12px 0 8px;color:#64748b;border-top:1px solid #e2e8f0">Analizių iš viso</td><td style="text-align:right;font-weight:700;border-top:1px solid #e2e8f0">${fmt(metrics.analyses.total)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Analizės (7d)</td><td style="text-align:right">${fmt(metrics.analyses.last_7d)} <span style="color:${changeColor(metrics.analyses.change_pct)};font-size:12px">(${changeSign(metrics.analyses.change_pct)}${metrics.analyses.change_pct}%)</span></td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Vid. analizių / vartotojui</td><td style="text-align:right">${metrics.analyses.avg_per_user}</td></tr>
    <tr><td style="padding:12px 0 8px;color:#64748b;border-top:1px solid #e2e8f0">Chat naudojimas (free)</td><td style="text-align:right;border-top:1px solid #e2e8f0">${metrics.chat_engagement_rate_pct}%</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Šiuo metu užrakintos paskyros</td><td style="text-align:right">${metrics.security.locked_accounts_now}</td></tr>
  </table>

  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Funnel'ai, retention (7/30d), DAU/WAU/MAU ir sesijos trukmė — žr. PostHog dashboard, ne šį laišką.</p>
</body></html>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'Bidwise AI <noreply@bidwiseai.lt>',
      to: [to],
      subject: regressions.length ? `⚠️ Bidwise AI dienos ataskaita — ${regressions.length} įspėjimas(-ai)` : 'Bidwise AI dienos ataskaita',
      html
    })
  });
  return r.ok;
}

module.exports = async (req, res) => {
  // Vercel Cron kviečia su GET; leidžiam ir rankinį POST testavimui su admin raktu.
  if (req.method === 'POST') {
    const provided = req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || provided !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'Neteisingas administratoriaus raktas' });
    }
  } else if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodas neleidžiamas' });
  }

  if (!process.env.ADMIN_EMAIL) {
    return res.status(500).json({ error: 'ADMIN_EMAIL nesukonfigūruotas — nėra kam siųsti ataskaitos.' });
  }

  try {
    const metrics = await computeMetrics();
    const regressions = flagRegressions(metrics);
    const sent = await sendReportEmail(process.env.ADMIN_EMAIL, metrics, regressions);
    return res.status(200).json({ ok: true, sent, regressions, metrics });
  } catch (e) {
    console.error('daily-report klaida:', e);
    return res.status(500).json({ error: 'Klaida: ' + e.message });
  }
};

const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./security');

async function sendViaResend(to, subject, html, from) {
  const fromAddr = from || process.env.EMAIL_FROM || 'Bidwise AI <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY
    },
    body: JSON.stringify({ from: fromAddr, to: [to], subject, html })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || d.error || 'Resend klaida ' + r.status);
  return d;
}

function buildReportHtml(result, senderName) {
  const sc = result.score || 0;
  const scColor = sc >= 70 ? '#10b981' : sc >= 40 ? '#f59e0b' : '#ef4444';
  const t = result.terminai || {};

  const section = (icon, title, content, bg = '#f8faff', border = '#e2e8f0') =>
    content ? `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:16px 20px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:8px">${icon} ${title}</div>
      <div style="font-size:13px;color:#334155;line-height:1.7">${content}</div>
    </div>` : '';

  const row = (k, v) => v && v !== '–' ? `<tr><td style="padding:6px 12px 6px 0;font-size:12px;color:#64748b;white-space:nowrap">${k}</td><td style="padding:6px 0;font-size:12px;color:#1e293b;font-weight:500">${v}</td></tr>` : '';

  const listItems = (arr, color = '#334155') =>
    (arr || []).filter(Boolean).map(item =>
      `<li style="color:${color};font-size:13px;padding:4px 0;line-height:1.5">${typeof item === 'string' ? item : (item.rizika || item.galimybe || JSON.stringify(item))}</li>`
    ).join('');

  return `<!DOCTYPE html>
<html lang="lt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:640px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a56db,#7c3aed);padding:28px 32px">
    <div style="font-family:Georgia,serif;font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">Bidwise <span style="color:#a5b4fc">AI</span></div>
    <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:4px;letter-spacing:2px;text-transform:uppercase">Analizės ataskaita</div>
  </div>

  <div style="padding:24px 32px">

    <!-- Score block -->
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;display:flex;align-items:center;gap:20px">
      <div style="font-size:52px;font-weight:900;color:${scColor};font-family:Georgia,serif;line-height:1">${sc}%</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px">${result.scoreLabel || 'Įvertinimas'}</div>
        <div style="font-size:13px;color:#64748b">${result.pavadinimas || ''}</div>
        ${result.scorePaaiskinimas ? `<div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.5">${result.scorePaaiskinimas}</div>` : ''}
      </div>
    </div>

    <!-- Info table -->
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:10px">📋 BENDRA INFORMACIJA</div>
      <table style="width:100%;border-collapse:collapse">
        ${row('Perkančioji org.', result.perkanciojiOrganizacija)}
        ${row('Pirkimo tipas', result.pirkimoTipas)}
        ${row('Vertė', result.bendraVerte)}
        ${row('Pasiūlymo terminas', t.pasiulymoTerminas)}
        ${row('Klausimai iki', t.klausimaiIki)}
        ${row('Vykdymo trukmė', t.vykdymoTerminas)}
      </table>
    </div>

    ${result.kainuStrategija ? section('💰', 'KAINŲ STRATEGIJA', result.kainuStrategija, '#eff6ff', '#bfdbfe') : ''}
    ${result.atitikimasKvalifikacijai ? section('🎓', 'KVALIFIKACIJOS ATITIKIMAS', result.atitikimasKvalifikacijai) : ''}
    ${result.strategija ? section('🎯', 'REKOMENDUOJAMA STRATEGIJA', result.strategija, '#f5f3ff', '#c4b5fd') : ''}

    ${result.rizikos && result.rizikos.length ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#dc2626;margin-bottom:8px">⚠️ RIZIKOS</div>
      <ul style="margin:0;padding-left:16px">${listItems(result.rizikos, '#7f1d1d')}</ul>
    </div>` : ''}

    ${result.galimybes && result.galimybes.length ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#16a34a;margin-bottom:8px">✅ GALIMYBĖS</div>
      <ul style="margin:0;padding-left:16px">${listItems(result.galimybes, '#14532d')}</ul>
    </div>` : ''}

    ${result.prioritetiniaiZingsniai && result.prioritetiniaiZingsniai.length ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 20px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ea580c;margin-bottom:8px">📋 PRIORITETINIAI ŽINGSNIAI</div>
      <ol style="margin:0;padding-left:16px">${result.prioritetiniaiZingsniai.map(z => `<li style="font-size:13px;color:#7c2d12;padding:3px 0">${z.zingsnis || z}${z.terminas ? ` <em style="color:#9a3412">(${z.terminas})</em>` : ''}</li>`).join('')}</ol>
    </div>` : ''}

    ${result.isViso ? section('📝', 'IŠVADA', result.isViso, '#f0fdf4', '#bbf7d0') : ''}

    ${result.klausimaiPerkanciajai && result.klausimaiPerkanciajai.length ? `
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:8px">❓ KLAUSIMAI PERKANČIAJAI</div>
      <ol style="margin:0;padding-left:16px">${result.klausimaiPerkanciajai.map(q => `<li style="font-size:13px;color:#334155;padding:3px 0">${q}</li>`).join('')}</ol>
    </div>` : ''}

  </div>

  <!-- Footer -->
  <div style="background:#f8faff;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center">
    <div style="font-size:12px;color:#94a3b8">Ataskaita sugeneruota: ${new Date().toLocaleString('lt-LT')}</div>
    ${senderName ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">Siuntė: ${senderName}</div>` : ''}
    <div style="font-size:11px;color:#cbd5e1;margin-top:8px">Bidwise AI · Išmani CVP analizė · bidwiseai.lt</div>
  </div>
</div>
</body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY nenustatytas Vercel aplinkos kintamuosiuose' });
  }

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });

  const { to, result, subject } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Gavėjo el. paštas būtinas' });
  if (!result) return res.status(400).json({ error: 'Analizės rezultatas būtinas' });

  // Get sender name
  let senderName = '';
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('name').eq('id', user.id).single();
      if (data) senderName = data.name;
    } catch (e) {}
  }

  const emailSubject = subject || `Bidwise AI analizė: ${result.pavadinimas || 'Konkurso ataskaita'}`;
  const html = buildReportHtml(result, senderName);

  try {
    await sendViaResend(to, emailSubject, html);
    return res.status(200).json({ sent: true, to });
  } catch (e) {
    console.error('Email error:', e.message);
    return res.status(500).json({ error: 'El. pašto klaida: ' + e.message });
  }
};

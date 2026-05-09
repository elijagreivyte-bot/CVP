const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

/* =========================
   AUTH
========================= */

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');

  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/* =========================
   EMAIL SENDER
========================= */

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY missing');
    return false;
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'Bidwise AI <noreply@bidwise.lt>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });

  return r.ok;
}

/* =========================
   ANALYSIS EMAIL TEMPLATE
========================= */

function buildEmailHTML(r) {
  const scores = r.score || 0;

  const scoreColor =
    scores >= 70
      ? '#7dccaa'
      : scores >= 40
      ? '#f5a623'
      : '#e74c3c';

  const risks = (r.rizikos || [])
    .map(x => `<li style="color:#e74c3c;margin:4px 0">⚠ ${x}</li>`)
    .join('');

  const opps = (r.galimybes || [])
    .map(x => `<li style="color:#7dccaa;margin:4px 0">✓ ${x}</li>`)
    .join('');

  const docs = (r.butinaiIttraukti || [])
    .map(
      d =>
        `<li style="margin:4px 0">📎 <strong>${d.dokumentas}</strong> – ${d.pastaba}</li>`
    )
    .join('');

  const criteria = (r.vertinimoKriterijai || [])
    .map(
      c => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #333">${c.kriterijus}</td>
        <td style="padding:8px;border-bottom:1px solid #333;color:#7dccaa;font-weight:bold">${c.svoris}</td>
        <td style="padding:8px;border-bottom:1px solid #333;font-size:12px">${c.aprasas}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>

<body style="margin:0;padding:0;background:#111;font-family:sans-serif">

<div style="max-width:700px;margin:0 auto;background:#1a1a1a;color:#f4f1ea">

  <div style="background:#1a3a2a;padding:40px;text-align:center">
    <h1 style="color:#7dccaa;margin:0;font-size:28px">
      Bidwise AI
    </h1>

    <p style="color:#aaa;margin:8px 0 0">
      Konkurso analizė – ${new Date().toLocaleDateString('lt-LT')}
    </p>
  </div>

  <div style="padding:32px">

    <h2 style="color:#7dccaa">
      ${r.pavadinimas || 'Konkurso analizė'}
    </h2>

    <div style="background:#0d2518;border-radius:12px;padding:24px;text-align:center;margin:24px 0">

      <div style="font-size:64px;font-weight:bold;color:${scoreColor}">
        ${scores}%
      </div>

      <div style="color:#aaa;font-size:18px">
        ${r.scoreLabel || ''}
      </div>

    </div>

    <table style="width:100%;border-collapse:collapse;margin:16px 0">

      <tr>
        <td style="padding:8px;color:#aaa;width:40%">
          Perkančioji organizacija
        </td>

        <td style="padding:8px;font-weight:600">
          ${r.perkanciojiOrganizacija || '–'}
        </td>
      </tr>

      <tr>
        <td style="padding:8px;color:#aaa">
          Pirkimo tipas
        </td>

        <td style="padding:8px">
          ${r.pirkimoTipas || '–'}
        </td>
      </tr>

      <tr>
        <td style="padding:8px;color:#aaa">
          Bendra vertė
        </td>

        <td style="padding:8px;color:#7dccaa;font-weight:600">
          ${r.bendraVerte || 'Nenurodyta'}
        </td>
      </tr>

      <tr>
        <td style="padding:8px;color:#aaa">
          Pasiūlymo terminas
        </td>

        <td style="padding:8px;color:#e74c3c;font-weight:600">
          ${r.terminai?.pasiulymoTerminas || '–'}
        </td>
      </tr>

    </table>

    ${
      opps || risks
        ? `
      <div style="display:flex;gap:16px;margin:24px 0">

        <div style="flex:1">
          <h3 style="color:#7dccaa">✓ Galimybės</h3>
          <ul style="padding-left:16px">${opps}</ul>
        </div>

        <div style="flex:1">
          <h3 style="color:#e74c3c">⚠ Rizikos</h3>
          <ul style="padding-left:16px">${risks}</ul>
        </div>

      </div>
    `
        : ''
    }

    ${
      criteria
        ? `
      <h3 style="color:#7dccaa">
        Vertinimo kriterijai
      </h3>

      <table style="width:100%;border-collapse:collapse;background:#111;border-radius:8px;overflow:hidden">

        <thead>
          <tr style="background:#0d2518">
            <th style="padding:10px;text-align:left;color:#7dccaa">Kriterijus</th>
            <th style="padding:10px;text-align:left;color:#7dccaa">Svoris</th>
            <th style="padding:10px;text-align:left;color:#7dccaa">Aprašas</th>
          </tr>
        </thead>

        <tbody>
          ${criteria}
        </tbody>

      </table>
    `
        : ''
    }

    ${
      r.strategija
        ? `
      <h3 style="color:#7dccaa;margin-top:24px">
        🎯 Laimėjimo strategija
      </h3>

      <p style="line-height:1.7;color:#ccc">
        ${r.strategija}
      </p>
    `
        : ''
    }

    ${
      docs
        ? `
      <h3 style="color:#7dccaa">
        📎 Būtini dokumentai
      </h3>

      <ul style="padding-left:16px">
        ${docs}
      </ul>
    `
        : ''
    }

    ${
      r.isViso
        ? `
      <div style="background:#0d2518;border-radius:12px;padding:24px;margin-top:24px">

        <h3 style="color:#7dccaa;margin-top:0">
          📊 Bendra išvada
        </h3>

        <p style="line-height:1.8;color:#ddd">
          ${r.isViso}
        </p>

      </div>
    `
        : ''
    }

    <div style="background:#332900;border:1px solid #665500;border-radius:8px;padding:16px;margin-top:24px;font-size:12px;color:#aaa">
      ⚠ Šis įrankis naudoja dirbtinį intelektą ir yra skirtas tik kaip pagalbinė priemonė.
      Prieš pateikdami pasiūlymą visada patikrinkite originalius dokumentus cvpis.lt.
      Kūrėjai neprisiima atsakomybės.
    </div>

  </div>

  <div style="background:#111;padding:20px;text-align:center;color:#555;font-size:12px">
    © 2025 Bidwise AI – Išmani CVP analizė
  </div>

</div>

</body>
</html>
`;
}

/* =========================
   REMINDER TEMPLATE
========================= */

function reminderHtml(title, deadline, days) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">

<div style="background:#1a56db;padding:20px;border-radius:12px 12px 0 0;text-align:center">
  <img src="https://cvp.bidwise.lt/logo.png" style="height:48px" alt="Bidwise AI">
</div>

<div style="background:#f8faff;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">

  <h2 style="color:#1a56db;margin:0 0 12px">
    ${days === 1 ? '🚨 Rytoj terminas!' : '⚠️ Liko 7 dienos!'}
  </h2>

  <p style="color:#334155;font-size:15px">
    <strong>${title}</strong>
  </p>

  <p style="color:#64748b">
    Pasiūlymo pateikimo terminas:
    <strong>${new Date(deadline).toLocaleString('lt-LT')}</strong>
  </p>

  <a href="https://bidwise.lt"
     style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">
     Atidaryti Bidwise AI →
  </a>

</div>

<p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">
  Bidwise AI · Atsisakyti priminimų:
  <a href="https://bidwise.lt/account">paskyros nustatymai</a>
</p>

</body>
</html>
`;
}

/* =========================
   ANALYSIS EMAIL HANDLER
========================= */

async function handleAnalysisEmail(req, res) {
  const user = verifyToken(req);

  if (!user) {
    return res.status(401).json({
      error: 'Prisijunkite norėdami tęsti'
    });
  }

  const { to, result } = req.body || {};

  if (!to || !result) {
    return res.status(400).json({
      error: 'Trūksta duomenų'
    });
  }

  try {
    const ok = await sendEmail({
      to,
      subject: `Bidwise AI: ${result.pavadinimas || 'Konkurso analizė'} – ${result.score || 0}%`,
      html: buildEmailHTML(result)
    });

    if (!ok) {
      throw new Error('Nepavyko išsiųsti laiško');
    }

    return res.status(200).json({
      success: true
    });

  } catch (e) {
    return res.status(500).json({
      error: e.message
    });
  }
}

/* =========================
   SAVE REMINDER HANDLER
========================= */

async function handleSaveReminder(req, res) {
  const user = verifyToken(req);

  if (!user) {
    return res.status(401).json({
      error: 'Neprisijungta'
    });
  }

  const { analysisId, deadline, title } = req.body || {};

  if (!deadline) {
    return res.status(400).json({
      error: 'Terminas būtinas'
    });
  }

  if (!process.env.SUPABASE_URL) {
    return res.status(200).json({
      saved: false,
      reason: 'no_db'
    });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: userData } = await supabase
      .from('users')
      .select('email,name')
      .eq('id', user.id)
      .single();

    await supabase
      .from('reminders')
      .upsert(
        [
          {
            user_id: user.id,
            analysis_id: analysisId || null,
            email: userData?.email,
            title: title || 'Konkursas',
            deadline: new Date(deadline).toISOString(),
            sent_7d: false,
            sent_1d: false
          }
        ],
        {
          onConflict: 'user_id,analysis_id'
        }
      );

    return res.status(200).json({
      saved: true
    });

  } catch (e) {
    console.error('Reminder save error:', e.message);

    return res.status(500).json({
      error: e.message
    });
  }
}

/* =========================
   CRON HANDLER
========================= */

async function handleCron(res) {
  if (!process.env.SUPABASE_URL) {
    return res.status(200).json({
      sent: 0
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const now = new Date();

  let sent = 0;

  try {
    const { data: reminders } = await supabase
      .from('reminders')
      .select('*')
      .gt('deadline', now.toISOString());

    for (const r of reminders || []) {
      const deadline = new Date(r.deadline);

      const daysLeft = Math.ceil(
        (deadline - now) / 86400000
      );

      if (daysLeft === 7 && !r.sent_7d) {
        const ok = await sendEmail({
          to: r.email,
          subject: `⚠️ Liko 7 dienos — ${r.title}`,
          html: reminderHtml(r.title, r.deadline, 7)
        });

        if (ok) {
          await supabase
            .from('reminders')
            .update({ sent_7d: true })
            .eq('id', r.id);

          sent++;
        }
      }

      else if (daysLeft === 1 && !r.sent_1d) {
        const ok = await sendEmail({
          to: r.email,
          subject: `🚨 Rytoj terminas — ${r.title}`,
          html: reminderHtml(r.title, r.deadline, 1)
        });

        if (ok) {
          await supabase
            .from('reminders')
            .update({ sent_1d: true })
            .eq('id', r.id);

          sent++;
        }
      }
    }

    return res.status(200).json({
      sent,
      checked: reminders?.length || 0
    });

  } catch (e) {
    return res.status(500).json({
      error: e.message
    });
  }
}

/* =========================
   MAIN HANDLER
========================= */

module.exports = async (req, res) => {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // CRON
  if (req.method === 'GET') {

    const cronSecret = req.headers['x-cron-secret'];

    if (
      cronSecret !== process.env.CRON_SECRET &&
      process.env.CRON_SECRET
    ) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    return handleCron(res);
  }

  // ONLY POST BELOW
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Metodas neleidžiamas'
    });
  }

  const { action } = req.body || {};

  switch (action) {

    case 'send-analysis-email':
      return handleAnalysisEmail(req, res);

    case 'save-reminder':
      return handleSaveReminder(req, res);

    default:
      return res.status(400).json({
        error: 'Invalid action'
      });
  }
};

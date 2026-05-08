const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// Send email via Resend (or log if not configured)
async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set — email not sent to:', to, subject);
    return false;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify({
      from: 'Bidwise AI <noreply@bidwise.lt>',
      to: [to],
      subject,
      html
    })
  });
  return r.ok;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cron trigger (Vercel cron sends GET)
  if (req.method === 'GET') {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return handleCron(res);
  }

  // Manual save reminder (POST from frontend)
  if (req.method === 'POST') {
    const user = verifyToken(req);
    if (!user) return res.status(401).json({ error: 'Neprisijungta' });
    const { analysisId, deadline, title } = req.body || {};
    if (!deadline) return res.status(400).json({ error: 'Terminas būtinas' });

    if (!process.env.SUPABASE_URL) return res.status(200).json({ saved: false, reason: 'no_db' });

    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: userData } = await supabase.from('users').select('email,name').eq('id', user.id).single();
      
      // Save reminder to DB (requires reminders table — see SQL below)
      await supabase.from('reminders').upsert([{
        user_id: user.id,
        analysis_id: analysisId || null,
        email: userData?.email,
        title: title || 'Konkursas',
        deadline: new Date(deadline).toISOString(),
        sent_7d: false,
        sent_1d: false
      }], { onConflict: 'user_id,analysis_id' });

      return res.status(200).json({ saved: true });
    } catch (e) {
      console.error('Reminder save error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Metodas neleidžiamas' });
};

async function handleCron(res) {
  if (!process.env.SUPABASE_URL) return res.status(200).json({ sent: 0 });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const now = new Date();
  let sent = 0;

  try {
    const { data: reminders } = await supabase
      .from('reminders')
      .select('*')
      .gt('deadline', now.toISOString());

    for (const r of reminders || []) {
      const deadline = new Date(r.deadline);
      const daysLeft = Math.ceil((deadline - now) / 86400000);

      if (daysLeft === 7 && !r.sent_7d) {
        const html = reminderHtml(r.title, r.deadline, 7);
        const ok = await sendEmail(r.email, `⚠️ Liko 7 dienos — ${r.title}`, html);
        if (ok) { await supabase.from('reminders').update({ sent_7d: true }).eq('id', r.id); sent++; }
      } else if (daysLeft === 1 && !r.sent_1d) {
        const html = reminderHtml(r.title, r.deadline, 1);
        const ok = await sendEmail(r.email, `🚨 Rytoj terminas — ${r.title}`, html);
        if (ok) { await supabase.from('reminders').update({ sent_1d: true }).eq('id', r.id); sent++; }
      }
    }
    return res.status(200).json({ sent, checked: reminders?.length || 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function reminderHtml(title, deadline, days) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a56db;padding:20px;border-radius:12px 12px 0 0;text-align:center">
      <img src="https://cvp.bidwise.lt/logo.png" style="height:48px" alt="Bidwise AI">
    </div>
    <div style="background:#f8faff;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">
      <h2 style="color:#1a56db;margin:0 0 12px">${days === 1 ? '🚨 Rytoj terminas!' : '⚠️ Liko 7 dienos!'}</h2>
      <p style="color:#334155;font-size:15px"><strong>${title}</strong></p>
      <p style="color:#64748b">Pasiūlymo pateikimo terminas: <strong>${new Date(deadline).toLocaleString('lt-LT')}</strong></p>
      <a href="https://bidwise.lt" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Atidaryti Bidwise AI →</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">Bidwise AI · Atsisakyti priminimų: <a href="https://bidwise.lt/account">paskyros nustatymai</a></p>
  </body></html>`;
}

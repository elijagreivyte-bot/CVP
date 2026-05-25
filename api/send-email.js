const { asyncHandler, authError, validationError, serverError } = require('../middleware/errorHandler');
const { validate, sendEmailSchema } = require('../validation/analyzeSchema');
const jwt = require('jsonwebtoken');
const { logger } = require('../middleware/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function buildEmailHTML(r) {
  const scores = r.score || 0;
  const scoreColor = scores >= 70 ? '#7dccaa' : scores >= 40 ? '#f5a623' : '#e74c3c';
  
  const risks = (r.rizikos || []).map(x => `<li style="color:#e74c3c;margin:4px 0">⚠ ${x}</li>`).join('');
  const opps = (r.galimybes || []).map(x => `<li style="color:#7dccaa;margin:4px 0">✓ ${x}</li>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#111;font-family:sans-serif">
<div style="max-width:700px;margin:0 auto;background:#1a1a1a;color:#f4f1ea">
  <div style="background:#1a3a2a;padding:40px;text-align:center">
    <h1 style="color:#7dccaa;margin:0;font-size:28px">Bidwise AI</h1>
    <p style="color:#aaa;margin:8px 0 0">Konkurso analizė – ${new Date().toLocaleDateString('lt-LT')}</p>
  </div>
  <div style="padding:32px">
    <h2 style="color:#7dccaa">${r.pavadinimas || 'Konkurso analizė'}</h2>
    <div style="background:#0d2518;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
      <div style="font-size:64px;font-weight:bold;color:${scoreColor}">${scores}%</div>
      <div style="color:#aaa;font-size:18px">${r.scoreLabel || ''}</div>
    </div>
    ${opps ? `<div style="margin:16px 0"><h3 style="color:#7dccaa">✓ Galimybės</h3><ul style="padding-left:16px">${opps}</ul></div>` : ''}
    ${risks ? `<div style="margin:16px 0"><h3 style="color:#e74c3c">⚠ Rizikos</h3><ul style="padding-left:16px">${risks}</ul></div>` : ''}
    ${r.isViso ? `<div style="background:#0d2518;border-radius:12px;padding:24px;margin-top:24px"><h3 style="color:#7dccaa;margin-top:0">📊 Bendra išvada</h3><p style="line-height:1.8;color:#ddd">${r.isViso}</p></div>` : ''}
  </div>
  <div style="background:#111;padding:20px;text-align:center;color:#555;font-size:12px">
    © 2025 Bidwise AI – Išmani CVP analizė
  </div>
</div></body></html>`;
}

module.exports = asyncHandler(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') throw validationError([{ field: 'method', message: 'POST required' }]);

  const user = verifyToken(req);
  if (!user) throw authError('Prisijunkite norėdami tęsti');

  const validation = validate(req.body || {}, sendEmailSchema);
  if (validation.error) throw validationError(validation.details);
  const { to, result } = validation.value;

  try {
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || 'info@bidwise.lt',
        to,
        subject: `Bidwise AI: ${result.pavadinimas || 'Konkurso analizė'} – ${result.score || 0}%`,
        html: buildEmailHTML(result)
      })
    });
    const data = await emailResp.json();
    if (!emailResp.ok) throw new Error(data.message || 'El. pašto siuntimo klaida');
    
    logger.info('Email sent', { userId: user.id, to });
    return res.status(200).json({ success: true });
  } catch (e) {
    throw serverError(e.message);
  }
});

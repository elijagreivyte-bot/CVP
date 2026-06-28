const jwt = require('jsonwebtoken');

// Fail-closed: be JWT_SECRET env kintamojo NEnaudojame jokio atsarginio rakto.
// Geriau garsiai lūžti nei tyliai pasirašinėti/tikrinti tokenus žinomu (viešu) raktu.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET aplinkos kintamasis nenustatytas — atsisakoma generuoti/tikrinti tokenus.');
  }
  return secret;
}

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, getJwtSecret()); } catch { return null; }
}

function applyCors(res, methods = 'POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', methods);
}

module.exports = { getJwtSecret, verifyToken, applyCors };

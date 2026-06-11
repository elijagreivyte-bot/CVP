const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://bidwise.app',
  'https://www.bidwise.app'
];

function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS;

  if (!envOrigins) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return envOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function setCorsHeaders(req, res) {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.origin;

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }

  return secret;
}

function sendServerError(res, error, message = 'Serverio klaida. Bandykite dar kartą.') {
  console.error(error);
  return res.status(500).json({ error: message });
}

module.exports = {
  setCorsHeaders,
  getJwtSecret,
  sendServerError
};

const DEFAULT_ALLOWED_ORIGINS = [
  'https://bidwise.lt',
  'https://www.bidwise.lt',
  'https://bidwise.app',
  'https://www.bidwise.app'
];

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return [...new Set([...fromEnv, ...DEFAULT_ALLOWED_ORIGINS])];
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin
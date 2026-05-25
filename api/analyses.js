const { asyncHandler, authError, serverError } = require('../middleware/errorHandler');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const { logger } = require('../middleware/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

module.exports = asyncHandler(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) throw authError('Neprisijungta');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('analyses')
    .select('id, document_name, score, result_json, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw serverError(error.message);
  logger.info('Analyses fetched', { userId: user.id, count: data?.length || 0 });
  return res.status(200).json({ analyses: data });
});

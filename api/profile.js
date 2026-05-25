const { asyncHandler, validationError, authError, serverError } = require('../middleware/errorHandler');
const { validate, profileSchema } = require('../validation/analyzeSchema');
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

  if (req.method === 'POST' || req.method === 'PUT') {
    const validation = validate(req.body || {}, profileSchema);
    if (validation.error) throw validationError(validation.details);
    const { companyProfile } = validation.value;
    
    const { data, error } = await supabase
      .from('users')
      .update({ company_profile: companyProfile })
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw serverError(error.message);
    logger.info('Profile updated', { userId: user.id });
    return res.status(200).json({ user: data });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, plan, free_analyses_left, company_profile')
      .eq('id', user.id)
      .single();
    if (error) throw serverError(error.message);
    return res.status(200).json({ user: data });
  }

  throw validationError([{ field: 'method', message: 'Metodas neleidžiamas' }]);
});

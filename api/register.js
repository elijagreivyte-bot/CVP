const { asyncHandler, validationError, serverError } = require('../middleware/errorHandler');
const { validate, registerSchema } = require('../validation/analyzeSchema');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logger } = require('../middleware/logger');
const { JWT_SECRET, applyCors } = require('./security');

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') throw validationError([{ field: 'method', message: 'POST required' }]);

  const validation = validate(req.body || {}, registerSchema);
  if (validation.error) throw validationError(validation.details);
  const { name, email, password, companyProfile } = validation.value;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
  
  if (existing) {
    logger.warn('Registration failed: email already exists', { email });
    throw validationError([{ field: 'email', message: 'Šis el. paštas jau registruotas' }]);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const insertData = { name, email, password_hash, plan: 'free', free_analyses_left: 3 };
  if (companyProfile) insertData.company_profile = companyProfile;

  const { data: user, error } = await supabase.from('users').insert([insertData]).select().single();
  if (error) throw serverError('Registracijos klaida: ' + error.message);

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  logger.info('User registered', { userId: user.id, email });
  
  return res.status(200).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      free_analyses_left: user.free_analyses_left,
      company_profile: user.company_profile
    }
  });
});

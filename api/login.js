const { asyncHandler, validationError, authError, serverError } = require('../middleware/errorHandler');
const { validate, loginSchema } = require('../validation/analyzeSchema');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logger } = require('../middleware/logger');
const { getJwtSecret, applyCors } = require('./security');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') throw validationError([{ field: 'method', message: 'POST required' }]);

  const validation = validate(req.body || {}, loginSchema);
  if (validation.error) throw validationError(validation.details);
  const { email, password } = validation.value;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
  
  if (error || !user) {
    logger.warn('Login failed: user not found', { email });
    throw authError('Neteisingas el. paštas arba slaptažodis');
  }

  // Brute-force apsauga: jei paskyra užrakinta, atmetame net nebandydami tikrinti slaptažodžio.
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    logger.warn('Login blocked: account locked', { email, minutesLeft });
    throw authError(`Per daug nesėkmingų bandymų. Paskyra užrakinta dar ${minutesLeft} min. Pabandykite vėliau arba atkurkite slaptažodį.`);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    const update = { failed_login_attempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
    }
    await supabase.from('users').update(update).eq('id', user.id);
    logger.warn('Login failed: invalid password', { email, attempts });
    throw authError('Neteisingas el. paštas arba slaptažodis');
  }

  // Sėkmingas prisijungimas — atstatome skaitiklį.
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await supabase.from('users').update({ failed_login_attempts: 0, locked_until: null }).eq('id', user.id);
  }

  const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), { expiresIn: '30d' });
  logger.info('User logged in', { userId: user.id, email });
  
  return res.status(200).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      free_analyses_left: user.free_analyses_left,
      free_chat_left: (typeof user.free_chat_left === 'number') ? user.free_chat_left : 1,
      subscription_end: user.subscription_end,
      company_profile: user.company_profile
    }
  });
});

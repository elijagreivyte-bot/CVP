const { asyncHandler, validationError, serverError } = require('../middleware/errorHandler');
const { validate, registerSchema } = require('../validation/analyzeSchema');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logger } = require('../middleware/logger');
const { getJwtSecret, applyCors } = require('./security');

const MAX_REGISTRATIONS_PER_HOUR = 5; // vienam IP — apsauga nuo nemokamų analizių fermų

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') throw validationError([{ field: 'method', message: 'POST required' }]);

  const validation = validate(req.body || {}, registerSchema);
  if (validation.error) throw validationError(validation.details);
  const { name, email, password, companyProfile } = validation.value;

  // ── DIAGNOSTIKA (laikina) — parodo, ką funkcija realiai gauna iš Vercel env,
  // NESAUGIAI neatskleidžiant viso rakto. Matoma TIK Vercel Function Logs, ne vartotojui. ──
  const _u = process.env.SUPABASE_URL || '';
  const _k = process.env.SUPABASE_SERVICE_KEY || '';
  console.error('[DIAGNOSTIKA] SUPABASE_URL =', JSON.stringify(_u));
  console.error('[DIAGNOSTIKA] SUPABASE_SERVICE_KEY ilgis =', _k.length, ', pradžia =', JSON.stringify(_k.slice(0, 12)), ', pabaiga =', JSON.stringify(_k.slice(-6)));

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── IP throttling: apsauga nuo automatinio registracijų skriptavimo, kuris
  // fermintų nemokamas analizes (kiekviena registracija = 3 realūs Claude API kvietimai). ──
  const ip = getClientIp(req);
  const oneHourAgo = new Date(Date.now() - 60 * 60000).toISOString();
  const { count, error: throttleErr } = await supabase
    .from('registration_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', oneHourAgo);
  if (throttleErr) {
    // Supabase užklausa nepavyko (pvz. neteisingas raktas) — parodome saugią diagnostiką
    // tiesiai vartotojui matomame pranešime, kad nereikėtų kasti per Vercel Logs.
    throw serverError(`Registracijos klaida: DB ryšys nepavyko (${throttleErr.message}). URL="${_u}" | RAKTO ilgis=${_k.length} | pradžia="${_k.slice(0,12)}" | pabaiga="${_k.slice(-6)}"`);
  }
  if ((count || 0) >= MAX_REGISTRATIONS_PER_HOUR) {
    logger.warn('Registration throttled: too many attempts from IP', { ip, count });
    throw validationError([{ field: 'email', message: 'Per daug registracijų iš šio tinklo per trumpą laiką. Pabandykite vėliau.' }]);
  }
  await supabase.from('registration_attempts').insert({ ip });
  // Progine valymas — pašalinam senesnius nei 24h įrašus, kad lentelė neaugtų be ribų.
  supabase.from('registration_attempts').delete().lt('created_at', new Date(Date.now() - 24 * 3600000).toISOString()).then(() => {}, () => {});

  const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
  
  if (existing) {
    logger.warn('Registration failed: email already exists', { email });
    throw validationError([{ field: 'email', message: 'Šis el. paštas jau registruotas' }]);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const insertData = { name, email, password_hash, plan: 'free', free_analyses_left: 3, free_chat_left: 1 };
  if (companyProfile) insertData.company_profile = companyProfile;

  const { data: user, error } = await supabase.from('users').insert([insertData]).select().single();
  if (error) throw serverError('Registracijos klaida: ' + error.message);

  const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), { expiresIn: '30d' });
  logger.info('User registered', { userId: user.id, email });
  
  return res.status(200).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      free_analyses_left: user.free_analyses_left,
      free_chat_left: (typeof user.free_chat_left === 'number') ? user.free_chat_left : 1,
      company_profile: user.company_profile
    }
  });
});

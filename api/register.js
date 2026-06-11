const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { setCorsHeaders, getJwtSecret, sendServerError } = require('./_security');
const { validate, registerSchema } = require('../validation/analyzeSchema');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BETA_MODE = process.env.BETA_MODE === 'true';

module.exports = async (req, res) => {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodas neleidžiamas' });
  }

  // ── VALIDACIJA: vardas / el. paštas / slaptažodis (Joi) ──
  const { error: vErr, details } = validate(req.body, registerSchema);
  if (vErr) {
    return res.status(400).json({ error: 'Patikrinkite laukus', details });
  }

  const name = req.body.name.trim();
  const email = req.body.email.trim().toLowerCase();
  const password = req.body.password;
  // companyProfile imamas RAW — wizard'as turi ~50 naujų laukų,
  // kurių sena registerSchema dar neturi (kitaip stripUnknown juos ištrintų).
  const companyProfile = req.body.companyProfile;

  try {
    const jwtSecret = getJwtSecret();

    // Greita patikra gražiam pranešimui; tikroji apsauga — UNIQUE ant email DB
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Šis el. paštas jau registruotas' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const insertData = BETA_MODE
      ? { name, email, password_hash, plan: 'pro', free_analyses_left: 999 }
      : { name, email, password_hash, plan: 'free', free_analyses_left: 3 };

    if (companyProfile && typeof companyProfile === 'object') {
      insertData.company_profile = companyProfile;
    }

    const { data: user, error } = await supabase
      .from('users')
      .insert([insertData])
      .select('id, name, email, plan, free_analyses_left, company_profile')
      .single();

    if (error) {
      // 23505 = Postgres unique violation (jei lenktynės prasprūdo pro patikrą)
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Šis el. paštas jau registruotas' });
      }
      throw error;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, plan: user.plan },
      jwtSecret,
      { expiresIn: '30d' }
    );

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
  } catch (error) {
    return sendServerError(res, error);
  }
};

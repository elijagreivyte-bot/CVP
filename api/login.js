const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { setCorsHeaders, getJwtSecret, sendServerError } = require('./_security');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodas neleidžiamas' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Įveskite el. paštą ir slaptažodį' });
  }

  try {
    const jwtSecret = getJwtSecret();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Neteisingas el. paštas arba slaptažodis' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Neteisingas el. paštas arba slaptažodis' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        plan: user.plan
      },
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
        subscription_end: user.subscription_end,
        company_profile: user.company_profile
      }
    });
  } catch (error) {
    return sendServerError(res, error);
  }
};

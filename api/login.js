const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Įveskite el. paštą ir slaptažodį' });

  try {
    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !user) return res.status(401).json({ error: 'Neteisingas el. paštas arba slaptažodis' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Neteisingas el. paštas arba slaptažodis' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    return res.status(200).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, free_analyses_left: user.free_analyses_left, subscription_end: user.subscription_end }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};

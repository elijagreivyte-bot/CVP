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

  const { name, email, password, companyProfile } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Užpildykite visus laukus' });
  if (password.length < 6) return res.status(400).json({ error: 'Slaptažodis turi būti bent 6 simboliai' });

  try {
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(400).json({ error: 'Šis el. paštas jau registruotas' });

    const password_hash = await bcrypt.hash(password, 10);
    const insertData = { name, email, password_hash, plan: 'free', free_analyses_left: 3 };
    if (companyProfile) insertData.company_profile = companyProfile;

    const { data: user, error } = await supabase.from('users').insert([insertData]).select().single();
    if (error) throw error;

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    return res.status(200).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, free_analyses_left: user.free_analyses_left, company_profile: user.company_profile }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Serverio klaida: ' + e.message });
  }
};

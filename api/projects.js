const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('projects')
        .select('*, analyses(count)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ projects: data });
    }

    if (req.method === 'POST') {
      const { name, description } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Pavadinimas būtinas' });
      const { data, error } = await supabase
        .from('projects')
        .insert([{ user_id: user.id, name, description: description || '' }])
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ project: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID būtinas' });
      const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Metodas neleidžiamas' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};

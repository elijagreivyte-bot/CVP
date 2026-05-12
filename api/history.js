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
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: 'DB neprijungta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('analyses')
        .select('id, document_name, score, result_json, created_at, project_id, projects(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const analyses = (data || []).map(a => ({
        ...a, project_name: a.projects?.name || null, projects: undefined
      }));
      return res.status(200).json({ analyses });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID būtinas' });
    try {
      const { error } = await supabase
        .from('analyses')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id); // saugumas — tik savos analizės
      if (error) throw error;
      return res.status(200).json({ deleted: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Metodas neleidžiamas' });
};

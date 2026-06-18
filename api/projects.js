const { asyncHandler, validationError, authError, serverError } = require('../middleware/errorHandler');
const { validate, createProjectSchema, deleteProjectSchema } = require('../validation/analyzeSchema');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../middleware/logger');
const { verifyToken, applyCors } = require('./security');

module.exports = asyncHandler(async (req, res) => {
  applyCors(res, 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) throw authError('Neprisijungta');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*, analyses(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw serverError(error.message);
    return res.status(200).json({ projects: data });
  }

  if (req.method === 'POST') {
    const validation = validate(req.body || {}, createProjectSchema);
    if (validation.error) throw validationError(validation.details);
    const { name, description } = validation.value;
    
    const { data, error } = await supabase
      .from('projects')
      .insert([{ user_id: user.id, name, description: description || '' }])
      .select()
      .single();
    if (error) throw serverError(error.message);
    logger.info('Project created', { userId: user.id, projectId: data.id });
    return res.status(200).json({ project: data });
  }

  if (req.method === 'DELETE') {
    const validation = validate(req.body || {}, deleteProjectSchema);
    if (validation.error) throw validationError(validation.details);
    const { id } = validation.value;
    
    const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw serverError(error.message);
    logger.info('Project deleted', { userId: user.id, projectId: id });
    return res.status(200).json({ success: true });
  }

  throw validationError([{ field: 'method', message: 'Metodas neleidžiamas' }]);
});

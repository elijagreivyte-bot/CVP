const { asyncHandler, validationError, authError, serverError } = require('../middleware/errorHandler');
const { validate, deleteAnalysisSchema, updateOutcomeSchema } = require('../validation/analyzeSchema');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../middleware/logger');
const { verifyToken, applyCors } = require('./security');

module.exports = asyncHandler(async (req, res) => {
  applyCors(res, 'GET, DELETE, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) throw authError('Neprisijungta');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('analyses')
      .select('id, document_name, score, result_json, created_at, project_id, outcome, projects(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw serverError(error.message);
    const analyses = (data || []).map(a => ({
      ...a, project_name: a.projects?.name || null, projects: undefined
    }));
    return res.status(200).json({ analyses });
  }

  if (req.method === 'DELETE') {
    const validation = validate(req.body || {}, deleteAnalysisSchema);
    if (validation.error) throw validationError(validation.details);
    const { id } = validation.value;
    
    const { error } = await supabase.from('analyses').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw serverError(error.message);
    logger.info('Analysis deleted', { userId: user.id, analysisId: id });
    return res.status(200).json({ deleted: true });
  }

  if (req.method === 'PATCH') {
    const validation = validate(req.body || {}, updateOutcomeSchema);
    if (validation.error) throw validationError(validation.details);
    const { id, outcome } = validation.value;
    
    const { error } = await supabase
      .from('analyses')
      .update({ outcome, outcome_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw serverError(error.message);
    logger.info('Outcome updated', { userId: user.id, analysisId: id, outcome });
    return res.status(200).json({ updated: true, outcome });
  }

  throw validationError([{ field: 'method', message: 'Metodas neleidžiamas' }]);
});

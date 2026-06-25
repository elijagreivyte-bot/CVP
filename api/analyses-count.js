const { asyncHandler, serverError } = require('../middleware/errorHandler');
const { createClient } = require('@supabase/supabase-js');
const { applyCors } = require('./security');

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ count: 0 });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { count } = await supabase
      .from('analyses')
      .select('*', { count: 'exact', head: true });

    return res.status(200).json({ count: count || 0 });
  } catch {
    return res.status(200).json({ count: 0 });
  }
});

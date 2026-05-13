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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });

  const { q = '', cpv = '', min = '', max = '', page = '1' } = req.query;
  const pageNum = Math.max(1, parseInt(page)) - 1;
  const searchUrl = `https://viesiejipirkimai.lt/epps/searchNotices.do?searchText=${encodeURIComponent(q)}&noticeType=CONTRACT_NOTICE`;

  const endpoints = [
    `https://cvpp.eviesiejipirkimai.lt/api/public/procurements?page=${pageNum}&size=20&sort=publishedDate,desc&status=PUBLISHED${q?'&title='+encodeURIComponent(q):''}${cpv?'&cpvCode='+cpv:''}`,
    `https://cvpp.eviesiejipirkimai.lt/api/procurements?pageNo=${pageNum}&pageSize=20&orderBy=publishDate&orderDir=DESC&status=ACTIVE${q?'&searchText='+encodeURIComponent(q):''}`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'BidwiseAI/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) continue;
      const data = await r.json();
      const items = data.content || data.procurements || data.data || data.items || [];
      if (!Array.isArray(items) || !items.length) continue;

      const mapped = items.map(p => ({
        id: p.id || p.procurementId,
        title: p.name || p.title || p.procurementName || 'Nenurodyta',
        buyer: p.contractingAuthority?.name || p.buyerName || p.organizationName || '–',
        value: p.estimatedValue ? Number(p.estimatedValue).toLocaleString('lt-LT') + ' EUR' : '–',
        cpv: p.cpvCode || p.mainCpvCode || '–',
        deadline: fmt(p.submissionDeadline || p.tenderDeadline),
        published: fmt(p.publishedDate || p.publishDate),
        url: p.url || `https://cvpp.eviesiejipirkimai.lt/procurement/${p.id}`,
        type: p.procedureType || p.procurementType || '–'
      }));

      return res.status(200).json({
        procurements: mapped,
        total: data.totalElements || data.total || mapped.length,
        page: pageNum + 1
      });
    } catch (e) { console.warn('CVP endpoint failed:', e.message); }
  }

  // API unavailable — return link to portal
  return res.status(200).json({
    procurements: [], total: 0, apiUnavailable: true, searchUrl
  });
};

function fmt(d) {
  if (!d) return '–';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return String(d).slice(0, 10);
    return dt.toLocaleDateString('lt-LT') + (dt.getHours() ? ' ' + dt.toLocaleTimeString('lt-LT', {hour:'2-digit',minute:'2-digit'}) : '');
  } catch { return String(d).slice(0, 10); }
}

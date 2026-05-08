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

  try {
    // CVP.lt public API (eviesiejipirkimai.lt open data)
    const params = new URLSearchParams({
      pageSize: '20',
      pageNumber: String(parseInt(page) - 1),
      ...(q && { description: q }),
      ...(cpv && { cpvCode: cpv }),
      ...(min && { estimatedValueFrom: min }),
      ...(max && { estimatedValueTo: max }),
      status: 'ACTIVE',
      sortField: 'publishDate',
      sortDirection: 'DESC',
    });

    const url = `https://cvpp.eviesiejipirkimai.lt/api/procurements?${params}`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BidwiseAI/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!r.ok) {
      // Fallback: return mock data so UI works even if CVP.lt is down
      return res.status(200).json({ procurements: getMockData(q), total: 3, mock: true });
    }

    const data = await r.json();
    const items = (data.content || data.procurements || data.data || []).map(p => ({
      id: p.id || p.procurementId,
      title: p.name || p.description || p.title || 'Nenurodyta',
      buyer: p.contractingAuthority?.name || p.buyerName || '–',
      value: p.estimatedValue ? `${Number(p.estimatedValue).toLocaleString('lt-LT')} EUR` : '–',
      cpv: p.cpvCode || p.mainCpvCode || '–',
      deadline: p.tenderDeadline || p.submissionDeadline || '–',
      published: p.publishDate || p.publicationDate || '–',
      url: p.url || `https://cvpp.eviesiejipirkimai.lt/procurement/${p.id}`,
      type: p.procedureType || p.procurementType || '–'
    }));

    return res.status(200).json({
      procurements: items,
      total: data.totalElements || data.total || items.length,
      page: parseInt(page)
    });
  } catch (e) {
    console.error('CVP search error:', e.message);
    return res.status(200).json({ procurements: getMockData(q), total: 3, mock: true });
  }
};

function getMockData(q) {
  return [
    {
      id: 'demo-1',
      title: q ? `${q} — pavyzdinis konkursas` : 'IT infrastruktūros atnaujinimas',
      buyer: 'Vilniaus miesto savivaldybė',
      value: '150 000 EUR',
      cpv: '30200000-1',
      deadline: new Date(Date.now() + 14 * 86400000).toLocaleDateString('lt-LT'),
      published: new Date().toLocaleDateString('lt-LT'),
      url: 'https://cvpp.eviesiejipirkimai.lt',
      type: 'Atviras konkursas'
    },
    {
      id: 'demo-2',
      title: 'Valymo paslaugų pirkimas biuro patalpoms',
      buyer: 'Lietuvos nacionalinis muziejus',
      value: '48 000 EUR',
      cpv: '90910000-9',
      deadline: new Date(Date.now() + 10 * 86400000).toLocaleDateString('lt-LT'),
      published: new Date(Date.now() - 2 * 86400000).toLocaleDateString('lt-LT'),
      url: 'https://cvpp.eviesiejipirkimai.lt',
      type: 'Skelbiama apklausa'
    },
    {
      id: 'demo-3',
      title: 'Mokymo paslaugų pirkimas darbuotojams',
      buyer: 'Valstybinė mokesčių inspekcija',
      value: '62 000 EUR',
      cpv: '80500000-9',
      deadline: new Date(Date.now() + 21 * 86400000).toLocaleDateString('lt-LT'),
      published: new Date(Date.now() - 1 * 86400000).toLocaleDateString('lt-LT'),
      url: 'https://cvpp.eviesiejipirkimai.lt',
      type: 'Atviras konkursas'
    }
  ];
}

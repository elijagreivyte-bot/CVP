const { logger } = require('./logger');

// ══════════════════════════════════════════════════════════════════════════════
// CORS CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://bidwise.lt',
      'https://www.bidwise.lt',
      'http://localhost:3000',
      'http://localhost:5000'
    ];

    // Allow requests without origin (like mobile apps or Postman)
    if (!origin || origin === 'undefined') {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS rejected', { origin });
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 3600
};

function cors(req, res, next) {
  const origin = req.headers.origin || req.headers.referer;
  const allowedOrigins = corsOptions.origin.allowedOrigins || [
    'https://bidwise.lt',
    'https://www.bidwise.lt'
  ];

  if (!origin || allowedOrigins.some(o => origin?.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
}

module.exports = { cors, corsOptions };

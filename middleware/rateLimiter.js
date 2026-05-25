const rateLimit = require('express-rate-limit');
const { logger } = require('./logger');

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL RATE LIMITER
// ══════════════════════════════════════════════════════════════════════════════

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Per daug prašymų. Pabandykite vėliau.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      error: 'Per daug prašymų. Pabandykite vėliau.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH RATE LIMITER (stricter)
// ══════════════════════════════════════════════════════════════════════════════

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  message: 'Per daug bandymų. Pabandykite vėliau.',
  skipSuccessfulRequests: true, // Don't count successful logins
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip, email: req.body?.email });
    res.status(429).json({
      error: 'Per daug bandymų. Pabandykite vėliau.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ANALYZE RATE LIMITER (token-based — requires JWT)
// ══════════════════════════════════════════════════════════════════════════════

const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 analyses per hour per user
  keyGenerator: (req) => {
    // Extract user ID from JWT token
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return req.ip;
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'bidwise-secret-2025');
      return decoded.id || req.ip;
    } catch {
      return req.ip;
    }
  },
  message: 'Viršijote analizių limitą (10 per valandą). Atnaujinkite planą.',
  handler: (req, res) => {
    logger.warn('Analyze rate limit exceeded', { userId: req.userId, ip: req.ip });
    res.status(429).json({
      error: 'Viršijote analizių limitą. Atnaujinkite planą.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// STRIPE WEBHOOK LIMITER (allow internal traffic)
// ══════════════════════════════════════════════════════════════════════════════

const stripeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Generous for webhooks
  skip: (req) => {
    // Only apply to external IPs
    return req.ip === '127.0.0.1' || req.ip === 'localhost';
  }
});

module.exports = {
  globalLimiter,
  authLimiter,
  analyzeLimiter,
  stripeLimiter
};

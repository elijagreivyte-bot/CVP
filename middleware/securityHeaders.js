const helmet = require('helmet');
const { logger } = require('./logger');

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY HEADERS WITH HELMET
// ══════════════════════════════════════════════════════════════════════════════

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.anthropic.com', 'https://api.stripe.com', 'https://api.resend.com'],
      frameSrc: ["'self'", 'https://js.stripe.com']
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
});

module.exports = securityHeaders;

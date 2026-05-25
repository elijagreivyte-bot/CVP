const DOMPurify = require('isomorphic-dompurify');
const { logger } = require('./logger');

// ══════════════════════════════════════════════════════════════════════════════
// INPUT SANITIZATION
// ══════════════════════════════════════════════════════════════════════════════

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.trim().slice(0, 10000); // Max 10k chars
}

function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.toLowerCase().trim().slice(0, 255);
}

function sanitizeObject(obj, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return {};
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Reject suspicious keys
    if (key.startsWith('__') || key.includes('$')) {
      logger.warn('Suspicious key rejected', { key });
      continue;
    }
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Middleware to sanitize request body
const sanitizeMiddleware = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
};

module.exports = {
  sanitizeString,
  sanitizeEmail,
  sanitizeObject,
  sanitizeMiddleware
};

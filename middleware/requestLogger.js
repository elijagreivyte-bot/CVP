const { logger } = require('./logger');

// ══════════════════════════════════════════════════════════════════════════════
// REQUEST LOGGING MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Log request
  logger.debug('Request received', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 50)
  });

  // Log response when it's sent
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      logger.warn('Request completed', {
        method: req.method,
        path: req.path,
        status: statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      });
    } else {
      logger.debug('Request completed', {
        method: req.method,
        path: req.path,
        status: statusCode,
        duration: `${duration}ms`
      });
    }

    return originalSend.call(this, data);
  };

  next();
}

module.exports = { requestLogger };

const { logger } = require('./logger');

// ═══════════════════════════════════════════════════════════════
// CUSTOM ERROR CLASSES
// ═══════════════════════════════════════════════════════════════

class AppError extends Error {
  constructor(message, statusCode = 500, details = []) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validacijos klaida', details = []) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class AuthError extends AppError {
  constructor(message = 'Autentifikacijos klaida') {
    super(message, 401, []);
    this.name = 'AuthError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Priėjimas uždrausta') {
    super(message, 403, []);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Nerasta') {
    super(message, 404, []);
    this.name = 'NotFoundError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Per daug prašymų. Pabandykite vėliau.') {
    super(message, 429, []);
    this.name = 'RateLimitError';
  }
}

class TimeoutError extends AppError {
  constructor(message = 'Užklausa užtruko per ilgai') {
    super(message, 504, []);
    this.name = 'TimeoutError';
  }
}

class ServerError extends AppError {
  constructor(message = 'Serverio klaida', details = []) {
    super(message, 500, details);
    this.name = 'ServerError';
  }
}

// ═══════════════════════════════════════════════════════════════
// ERROR FORMATTER
// ═══════════════════════════════════════════════════════════════

function formatErrorResponse(error) {
  const response = {
    error: error.message || 'Nežinoma klaida',
    statusCode: error.statusCode || 500
  };

  if (error.details && error.details.length > 0) {
    response.details = error.details;
  }

  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  return response;
}

// ═══════════════════════════════════════════════════════════════
// ASYNC HANDLER WRAPPER
// ═══════════════════════════════════════════════════════════════

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    // Handle Joi validation errors
    if (err.isJoi) {
      const details = err.details.map(d => ({
        field: d.path.join('.'),
        message: d.message.replace(/"/g, '')
      }));
      const error = new ValidationError('Validacijos klaida', details);
      return handleError(error, res);
    }

    // Handle our custom errors
    if (err.isOperational) {
      return handleError(err, res);
    }

    // Handle unexpected errors
    logger.error('Unexpected error:', err);
    const error = new ServerError('Serverio klaida');
    return handleError(error, res);
  });
};

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

function handleError(error, res) {
  const statusCode = error.statusCode || 500;
  const response = formatErrorResponse(error);

  // Log errors
  if (statusCode >= 500) {
    logger.error('5xx Error:', error.message, error);
  } else if (statusCode >= 400) {
    logger.warn('4xx Error:', error.message);
  }

  res.status(statusCode).json(response);
}

// ═══════════════════════════════════════════════════════════════
// LOGGER (Simple console logger, use Sentry later)
// ═══════════════════════════════════════════════════════════════

const loggerModule = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, data),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, data),
  error: (msg, data = {}, context = {}) => console.error(`[ERROR] ${msg}`, data, context)
};

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ServerError,

  // Utilities
  asyncHandler,
  handleError,
  formatErrorResponse,
  logger: loggerModule,

  // Shortcuts for throwing errors
  validationError: (details = []) => {
    throw new ValidationError('Validacijos klaida', details);
  },
  authError: (message = 'Autentifikacijos klaida') => {
    throw new AuthError(message);
  },
  forbiddenError: (message = 'Priėjimas uždrausta') => {
    throw new ForbiddenError(message);
  },
  notFoundError: (message = 'Nerasta') => {
    throw new NotFoundError(message);
  },
  rateLimitError: (message = 'Per daug prašymų') => {
    throw new RateLimitError(message);
  },
  timeoutError: (message = 'Užklausa užtruko per ilgai') => {
    throw new TimeoutError(message);
  },
  serverError: (message = 'Serverio klaida', details = []) => {
    throw new ServerError(message, details);
  }
};

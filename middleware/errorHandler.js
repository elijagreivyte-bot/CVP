// Centralized error handling for API handlers.
// Reconstructed to match usage: asyncHandler wraps handlers and serializes
// thrown errors to { error: <message> } with the right HTTP status.

function makeError(status, message, details) {
  const err = new Error(message || 'Serverio klaida');
  err.status = status;
  if (details) err.details = details;
  return err;
}

function validationError(details) {
  let message = 'Netinkami duomenys';
  if (Array.isArray(details) && details.length) {
    const msgs = details.map(d => (d && d.message) ? d.message : null).filter(Boolean);
    if (msgs.length) message = msgs.join(', ');
  } else if (typeof details === 'string') {
    message = details;
  }
  return makeError(400, message, Array.isArray(details) ? details : undefined);
}

function authError(message) {
  return makeError(401, message || 'Neprisijungta');
}

function serverError(message) {
  return makeError(500, message || 'Serverio klaida');
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      return await fn(req, res);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      const body = { error: (err && err.message) ? err.message : 'Serverio klaida' };
      if (err && err.details) body.details = err.details;
      if (!res.headersSent) {
        return res.status(status).json(body);
      }
    }
  };
}

module.exports = { asyncHandler, validationError, authError, serverError, makeError };

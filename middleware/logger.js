// Simple logger — later replace with Sentry
const logger = {
  info: (msg, data = {}) => {
    console.log(`[${new Date().toISOString()}] INFO: ${msg}`, data);
  },
  warn: (msg, data = {}) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${msg}`, data);
  },
  error: (msg, error = {}, context = {}) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, error, context);
  },
  debug: (msg, data = {}) => {
    if (process.env.DEBUG === 'true') {
      console.debug(`[${new Date().toISOString()}] DEBUG: ${msg}`, data);
    }
  }
};

module.exports = { logger };

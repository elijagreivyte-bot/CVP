// ═══════════════════════════════════════════════════════════
// Testų pagalbininkas — imituoja Anthropic API atsakymus be realaus
// tinklo kvietimo. Naudojamas visuose telemetry.*.test.js failuose.
// ═══════════════════════════════════════════════════════════

function mockFetchSuccess(text, usage = { input_tokens: 1000, output_tokens: 200 }) {
  return async () => ({
    ok: true,
    json: async () => ({ id: 'msg_test_' + Math.random().toString(36).slice(2), content: [{ text }], usage })
  });
}

function mockFetchHttpError(status = 429, body = 'rate limit exceeded') {
  return async () => ({
    ok: false,
    status,
    text: async () => body
  });
}

function mockFetchTimeout(delayMs) {
  return (url, opts) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve({ ok: true, json: async () => ({ content: [{ text: '{}' }], usage: {} }) }), delayMs);
    if (opts && opts.signal) {
      opts.signal.addEventListener('abort', () => {
        clearTimeout(t);
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    }
  });
}

let originalFetch = null;
function installMock(fn) {
  originalFetch = global.fetch;
  global.fetch = fn;
}
function restoreFetch() {
  if (originalFetch) global.fetch = originalFetch;
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}

module.exports = { mockFetchSuccess, mockFetchHttpError, mockFetchTimeout, installMock, restoreFetch, assert };

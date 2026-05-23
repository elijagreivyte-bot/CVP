// Centralizuota klaidos tvarkyba
class BidwiseError extends Error {
  constructor(message, code = 'UNKNOWN', statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function handleError(e, context = '') {
  console.error(`[${context}]`, e);

  if (e instanceof BidwiseError) {
    return { statusCode: e.statusCode, error: e.message, code: e.code };
  }

  if (e.name === 'AbortError') {
    return { statusCode: 504, error: 'Užklausa užtruko per ilgai', code: 'TIMEOUT' };
  }

  if (e.message?.includes('Claude API')) {
    return { statusCode: 503, error: 'AI nepasiekiamas. Pabandykite vėliau.', code: 'AI_ERROR' };
  }

  if (e.message?.includes('JSON')) {
    return { statusCode: 500, error: 'Duomenų formato klaida', code: 'PARSE_ERROR' };
  }

  return { statusCode: 500, error: 'Serverio klaida: ' + e.message, code: 'INTERNAL' };
}

module.exports = { BidwiseError, handleError };

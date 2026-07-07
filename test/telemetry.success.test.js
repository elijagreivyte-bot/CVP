// ═══════════════════════════════════════════════════════════
// TEST 1: sėkmingas Generatoriaus kvietimas → teisingai suformuotas
// llm_calls įrašas. Šis testas būtų sugavęs "step: undefined" bug'ą,
// nes tikrina, kad step lauko reikšmė IŠLIEKA po telemetryOf() spread.
// ═══════════════════════════════════════════════════════════
process.env.ANTHROPIC_API_KEY = 'test-key';
const { mockFetchSuccess, installMock, restoreFetch, assert } = require('./_helpers');
const { _test } = require('../api/analyze-agents');

async function run() {
  installMock(mockFetchSuccess('{"pavadinimas":"Test konkursas"}'));
  try {
    const res = await _test.callClaude('sistema', 'vartotojas', 4000);
    const entry = { step: 'generator', ..._test.telemetryOf(res) };

    assert(entry.step === 'generator', `step turėtų būti "generator", gavome "${entry.step}"`);
    assert(entry.status === 'success', `status turėtų būti "success", gavome "${entry.status}"`);
    assert(entry.started_at !== null && entry.started_at !== undefined, 'started_at neturėtų būti tuščias');
    assert(entry.finished_at !== null && entry.finished_at !== undefined, 'finished_at neturėtų būti tuščias');
    assert(typeof entry.duration_ms === 'number' && entry.duration_ms >= 0, `duration_ms turėtų būti >= 0, gavome ${entry.duration_ms}`);
    assert(entry.input_tokens === 1000, `input_tokens turėtų būti 1000, gavome ${entry.input_tokens}`);
    assert(entry.output_tokens === 200, `output_tokens turėtų būti 200, gavome ${entry.output_tokens}`);
    assert(entry.error === null, 'error turėtų būti null sėkmės atveju');
    assert(entry.provider_request_id !== null, 'provider_request_id turėtų būti užpildytas');

    console.log('✓ TEST 1 PASSED: sėkmingas kvietimas → teisingas llm_calls įrašas');
  } finally {
    restoreFetch();
  }
}

run().catch(e => { console.error('✗ TEST 1 FAILED:', e.message); process.exit(1); });

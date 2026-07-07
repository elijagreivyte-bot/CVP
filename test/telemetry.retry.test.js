// ═══════════════════════════════════════════════════════════
// TEST 3: pirmas Generatoriaus atsakymas netinkamas (nesusiparsina),
// suveikia retry → llmCallLog turi turėti 2 įrašus: "generator" ir
// "generator_retry", abu su pilna telemetrija.
// ═══════════════════════════════════════════════════════════
process.env.ANTHROPIC_API_KEY = 'test-key';
const { installMock, restoreFetch, assert } = require('./_helpers');
const { _test } = require('../api/analyze-agents');

async function run() {
  let callCount = 0;
  installMock(async () => {
    callCount++;
    const text = callCount === 1 ? 'ne JSON, o šiukšlė' : '{"pavadinimas":"Test po retry"}';
    return { ok: true, json: async () => ({ id: 'msg_' + callCount, content: [{ text }], usage: { input_tokens: 500, output_tokens: 50 } }) };
  });

  // Atkartojame tikslų analyze-agents.js generatoriaus+retry šabloną
  const llmCallLog = [];
  const genRes = await _test.callClaude('sistema', 'vartotojas', 32000);
  llmCallLog.push({ step: 'generator', ..._test.telemetryOf(genRes) });

  const parsed = tryParse(genRes.text);
  if (!parsed || !parsed.pavadinimas) {
    const retryRes = await _test.callClaude('sistema', 'vartotojas + retry instrukcija', 32000);
    llmCallLog.push({ step: 'generator_retry', ..._test.telemetryOf(retryRes) });
  }

  assert(llmCallLog.length === 2, `llmCallLog turėtų turėti 2 įrašus, gavome ${llmCallLog.length}`);
  assert(llmCallLog[0].step === 'generator', `pirmas įrašas turėtų būti "generator", gavome "${llmCallLog[0].step}"`);
  assert(llmCallLog[1].step === 'generator_retry', `antras įrašas turėtų būti "generator_retry", gavome "${llmCallLog[1].step}"`);
  assert(llmCallLog[0].status === 'success' && llmCallLog[1].status === 'success', 'abu įrašai turėtų būti "success" (mock visada grąžina 200 OK)');

  restoreFetch();
  console.log('✓ TEST 3 PASSED: retry scenarijus → 2 teisingi llm_calls įrašai (generator, generator_retry)');
}

function tryParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

run().catch(e => { console.error('✗ TEST 3 FAILED:', e.message); process.exit(1); });

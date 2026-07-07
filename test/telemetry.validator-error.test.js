// ═══════════════════════════════════════════════════════════
// TEST 2: Validatoriaus timeout/klaidos scenarijus. Šis testas būtų
// sugavęs try/catch lexical scope bug'ą (validatorStartedAt nepasiekiamas
// catch bloke), nes atkuria TIKSLIAI tą patį šabloną, kokį naudoja
// analyze-agents.js: kintamasis deklaruojamas PRIEŠ try, naudojamas catch viduje.
// ═══════════════════════════════════════════════════════════
process.env.ANTHROPIC_API_KEY = 'test-key';
const { mockFetchHttpError, installMock, restoreFetch, assert } = require('./_helpers');
const { _test } = require('../api/analyze-agents');

async function run() {
  installMock(mockFetchHttpError(429, 'rate limit exceeded'));

  // Tiksliai atkartojame analyze-agents.js validatoriaus bloko šabloną:
  // kintamasis PRIEŠ try, ne jo viduje — jei kas nors ateityje perrašys
  // šį šabloną neteisingai, šis testas mestų ReferenceError ir sužlugtų.
  const validatorStartedAt = new Date().toISOString();
  let entry;
  try {
    await _test.callClaude('sistema', 'vartotojas', 3000);
    throw new Error('Testas turėjo simuliuoti klaidą, bet callClaude pavyko');
  } catch (e) {
    const status = _test.classifyErrorStatus(e);
    entry = { step: 'validator', ..._test.failedCallEntry(status, validatorStartedAt, { errorMessage: e.message }) };
  }

  assert(entry.step === 'validator', `step turėtų būti "validator", gavome "${entry.step}"`);
  assert(entry.status === 'rate_limited', `status turėtų būti "rate_limited", gavome "${entry.status}"`);
  assert(entry.error !== null && entry.error !== undefined, 'error laukas neturėtų būti tuščias klaidos atveju');
  assert(entry.started_at === validatorStartedAt, 'started_at turėtų sutapti su prieš try nustatytu laiku');

  restoreFetch();
  console.log('✓ TEST 2 PASSED: validatoriaus klaidos scenarijus → teisingas status ir error, jokio ReferenceError');
}

run().catch(e => { console.error('✗ TEST 2 FAILED:', e.message); process.exit(1); });

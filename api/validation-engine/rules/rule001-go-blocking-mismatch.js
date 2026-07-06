const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_001',
  title: 'GO su neuždengta blokuojančia sąlyga',
  severity: 100,
  confidencePenalty: -30,
  forceValidator: true,
  appliesTo: (ctx) => Array.isArray(ctx.result.blokuojanciosSalygos),
  check: (ctx) => {
    const r = ctx.result;
    if (r.sprendimas === 'GO' && (r.blokuojanciosSalygos || []).length > 0) {
      return { reason: `Sprendimas GO, bet yra ${r.blokuojanciosSalygos.length} blokuojanti(-čios) sąlyga(-os), kurių atitikimas nepatvirtintas.`, recommendation: 'Peržiūrėti blokuojančias sąlygas prieš patvirtinant GO sprendimą.' };
    }
    return null;
  }
});

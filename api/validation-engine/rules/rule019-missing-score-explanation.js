const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_019',
  title: 'Balo pagrindimas nepateiktas',
  severity: 30,
  confidencePenalty: -5,
  appliesTo: (ctx) => typeof ctx.result.score === 'number' && !ctx.result._scoreDefaulted,
  check: (ctx) => {
    if (!ctx.result.scorePaaiskinimas || String(ctx.result.scorePaaiskinimas).trim().length < 10) {
      return { reason: 'Balas pateiktas, bet nėra paaiškinimo, kodėl būtent toks balas priskirtas.', recommendation: 'Pridėti balo pagrindimą.' };
    }
    return null;
  }
});

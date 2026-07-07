const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_014',
  title: 'Vertinimo kriterijų svoriai nesusumuoja į 100%',
  severity: 40,
  confidencePenalty: -8,
  appliesTo: (ctx) => Array.isArray(ctx.result.vertinimoKriterijai) && ctx.result.vertinimoKriterijai.length > 0,
  check: (ctx) => {
    const sum = (ctx.result.vertinimoKriterijai || []).reduce((acc, k) => {
      const n = parseFloat(String(k.svoris || '').replace('%', '').replace(',', '.'));
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    if (sum > 0 && Math.abs(sum - 100) > 10) {
      return { reason: `Vertinimo kriterijų svoriai sudaro ${sum}%, ne ~100%.`, recommendation: 'Patikrinti, ar visi vertinimo kriterijai buvo užfiksuoti.' };
    }
    return null;
  }
});

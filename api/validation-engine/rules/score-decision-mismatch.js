const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_002',
  title: 'Balo ir sprendimo nesutapimas',
  severity: 90,
  confidencePenalty: -25,
  forceValidator: true,
  appliesTo: (ctx) => typeof ctx.result.score === 'number' && !!ctx.result.sprendimas,
  check: (ctx) => {
    const { score, sprendimas } = ctx.result;
    if (score >= 70 && sprendimas === 'NO-GO') {
      return { reason: `Balas ${score} (aukštas), bet sprendimas NO-GO — logiškai prieštarauja.`, recommendation: 'Peržiūrėti, ar balas ar sprendimas atspindi tikrąją situaciją.' };
    }
    if (score < 40 && sprendimas === 'GO') {
      return { reason: `Balas ${score} (žemas), bet sprendimas GO — logiškai prieštarauja.`, recommendation: 'Peržiūrėti, ar balas ar sprendimas atspindi tikrąją situaciją.' };
    }
    return null;
  }
});

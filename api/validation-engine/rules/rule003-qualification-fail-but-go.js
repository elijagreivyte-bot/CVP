const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_003',
  title: 'Privalomas kvalifikacijos reikalavimas neatitinka, bet GO',
  severity: 95,
  confidencePenalty: -25,
  forceValidator: true,
  appliesTo: (ctx) => Array.isArray(ctx.result.kvalifikacijosMatrica) && ctx.result.kvalifikacijosMatrica.length > 0,
  check: (ctx) => {
    const r = ctx.result;
    if (r.sprendimas !== 'GO') return null;
    const failing = (r.kvalifikacijosMatrica || []).filter(k => k.privalomas === true && k.tiekejasTuri === 'Ne');
    if (failing.length > 0) {
      return { reason: `Sprendimas GO, bet ${failing.length} privalomas reikalavimas pažymėtas kaip neatitinkantis ("${failing[0].reikalavimas}").`, recommendation: 'Peržiūrėti kvalifikacijos matricą prieš patvirtinant GO.' };
    }
    return null;
  }
});

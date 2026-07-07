const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_015',
  title: 'Dokumentų sąrašas tuščias, nors yra privalomų reikalavimų',
  severity: 60,
  confidencePenalty: -12,
  appliesTo: (ctx) => Array.isArray(ctx.result.kvalifikacijosMatrica),
  check: (ctx) => {
    const r = ctx.result;
    const hasMandatory = (r.kvalifikacijosMatrica || []).some(k => k.privalomas === true);
    if (hasMandatory && (!Array.isArray(r.butinaiIttraukti) || r.butinaiIttraukti.length === 0)) {
      return { reason: 'Yra privalomų kvalifikacijos reikalavimų, bet "būtinų dokumentų" sąrašas tuščias.', recommendation: 'Sugeneruoti dokumentų sąrašą pagal privalomus reikalavimus.' };
    }
    return null;
  }
});

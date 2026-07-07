const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_012',
  title: 'Pasiūlymo pateikimo terminas nenurodytas',
  severity: 90,
  confidencePenalty: -20,
  appliesTo: (ctx) => !!ctx.result.terminai,
  check: (ctx) => {
    const t = ctx.result.terminai || {};
    if (!t.pasiulymoTerminas || t.pasiulymoTerminas === 'Nenurodyta') {
      return { reason: 'Svarbiausias laukas tiekėjui — pasiūlymo pateikimo terminas — nenurodytas arba nerastas dokumente.', recommendation: 'Rankiniu būdu patikrinti dokumentą dėl termino.' };
    }
    return null;
  }
});

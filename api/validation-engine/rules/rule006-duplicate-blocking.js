const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_006',
  title: 'Dubliuoti blokuojančių sąlygų įrašai',
  severity: 40,
  confidencePenalty: -8,
  appliesTo: (ctx) => Array.isArray(ctx.result.blokuojanciosSalygos) && ctx.result.blokuojanciosSalygos.length > 1,
  check: (ctx) => {
    const names = ctx.result.blokuojanciosSalygos.map(s => (s.pavadinimas || '').trim().toLowerCase()).filter(Boolean);
    const seen = new Set();
    const dupes = new Set();
    for (const n of names) { if (seen.has(n)) dupes.add(n); seen.add(n); }
    if (dupes.size > 0) {
      return { reason: `Rasti dubliuoti blokuojančių sąlygų pavadinimai: ${[...dupes].join(', ')}.`, recommendation: 'Sujungti arba pašalinti dublikatus.' };
    }
    return null;
  }
});

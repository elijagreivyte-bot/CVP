const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_020',
  title: 'Yra blokuojančių sąlygų, bet nėra klausimų perkančiajai',
  severity: 45,
  confidencePenalty: -8,
  appliesTo: (ctx) => Array.isArray(ctx.result.blokuojanciosSalygos),
  check: (ctx) => {
    const r = ctx.result;
    if ((r.blokuojanciosSalygos || []).length > 0 && (!Array.isArray(r.klausimaiPO) || r.klausimaiPO.length === 0)) {
      return { reason: `${r.blokuojanciosSalygos.length} blokuojanti(-čios) sąlyga(-os) nustatyta(-os), bet nė vienas klausimas perkančiajai nesugeneruotas.`, recommendation: 'Sugeneruoti bent po vieną klausimą kiekvienai blokuojančiai sąlygai.' };
    }
    return null;
  }
});

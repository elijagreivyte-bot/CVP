const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_005',
  title: 'Subalio ir bendro balo didelis skirtumas',
  severity: 60,
  confidencePenalty: -10,
  appliesTo: (ctx) => !!(ctx.result.subBalai && typeof ctx.result.subBalai.tinkamumas === 'number' && typeof ctx.result.score === 'number'),
  check: (ctx) => {
    const diff = Math.abs(ctx.result.subBalai.tinkamumas - ctx.result.score);
    if (diff > 30) {
      return { reason: `Bendras balas ${ctx.result.score}, o tinkamumo subalis ${ctx.result.subBalai.tinkamumas} — skirtumas ${diff} balų.`, recommendation: 'Patikrinti, ar subalio ir bendro balo skaičiavimas nuoseklus.' };
    }
    return null;
  }
});

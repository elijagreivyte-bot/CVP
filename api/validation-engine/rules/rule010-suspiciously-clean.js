const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_010',
  title: 'Įtartinai "švarus" rezultatas — jokių rizikų, bet labai aukštas balas',
  severity: 65,
  confidencePenalty: -15,
  forceValidator: true,
  appliesTo: (ctx) => typeof ctx.result.score === 'number',
  check: (ctx) => {
    const r = ctx.result;
    const totalRisks = (r.rizikos || []).length + (r.komercinesRizikos || []).length + (r.strateginesRizikos || []).length + (r.blokuojanciosSalygos || []).length;
    if (r.score > 85 && totalRisks === 0) {
      return { reason: `Balas ${r.score}, bet nė viena rizikos kategorija netuščia — realiuose konkursuose retai būna visiškai be rizikų.`, recommendation: 'Patikrinti, ar AI tikrai nuodugniai išanalizavo dokumentą, ar tiesiog nerado ko ieškoti.' };
    }
    return null;
  }
});

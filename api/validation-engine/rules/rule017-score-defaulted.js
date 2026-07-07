const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_017',
  title: 'Balas nebuvo pateiktas, naudota numatytoji reikšmė',
  severity: 100,
  confidencePenalty: -30,
  forceValidator: true,
  appliesTo: () => true,
  check: (ctx) => {
    if (ctx.result._scoreDefaulted) {
      return { reason: 'Generatorius nepateikė skaitinio balo — sistema panaudojo numatytąją (neutralią) reikšmę, ne tikrą AI įvertinimą.', recommendation: 'Peržiūrėti analizę rankiniu būdu — balas nėra patikimas.' };
    }
    return null;
  }
});

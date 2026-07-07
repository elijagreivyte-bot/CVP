const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_018',
  title: 'Generatoriaus atsakymas nutrūko generavimo metu',
  severity: 80,
  confidencePenalty: -15,
  forceValidator: true,
  appliesTo: () => true,
  check: (ctx) => {
    if (ctx.result._truncated) {
      return { reason: 'JSON atsakymas buvo nepilnas (max_tokens pasiektas) ir turėjo būti taisomas automatiškai — dalis duomenų (paskutiniai masyvo įrašai) gali trūkti.', recommendation: 'Patikrinti, ar visi tikėtini reikalavimai/rizikos yra sąrašuose.' };
    }
    return null;
  }
});

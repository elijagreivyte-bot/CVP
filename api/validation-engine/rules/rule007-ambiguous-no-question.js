const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_007',
  title: 'Dviprasmiškas technikos punktas be klausimo PO',
  severity: 50,
  confidencePenalty: -8,
  appliesTo: (ctx) => Array.isArray(ctx.result.techninesSpecifikacijosMatrica) && ctx.result.techninesSpecifikacijosMatrica.length > 0,
  check: (ctx) => {
    const ambiguous = (ctx.result.techninesSpecifikacijosMatrica || []).filter(t => t.aiskumoLygis === 'dviprasmiškas' && t.reikiaKlausimoPO !== true);
    if (ambiguous.length > 0) {
      return { reason: `${ambiguous.length} dviprasmiškas techninis punktas pažymėtas, bet klausimas perkančiajai nesugeneruotas.`, recommendation: 'Pridėti klausimą PO dviprasmiškiems punktams.' };
    }
    return null;
  }
});

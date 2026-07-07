const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_016',
  title: 'EBVPD pašalinimo pagrindai neturi atitikmens kvalifikacijos matricoje',
  severity: 35,
  confidencePenalty: -6,
  appliesTo: (ctx) => !!(ctx.result.ebvpdSusieta && Array.isArray(ctx.result.ebvpdSusieta.pasalinimoPagrindaiTaikomi)),
  check: (ctx) => {
    const r = ctx.result;
    const grounds = r.ebvpdSusieta.pasalinimoPagrindaiTaikomi || [];
    if (grounds.length > 0 && (!Array.isArray(r.kvalifikacijosMatrica) || r.kvalifikacijosMatrica.length === 0)) {
      return { reason: 'EBVPD pašalinimo pagrindai nurodyti, bet kvalifikacijos matrica tuščia — neatitikimas tarp dviejų sekcijų.', recommendation: 'Sinchronizuoti EBVPD ir kvalifikacijos matricos sekcijas.' };
    }
    return null;
  }
});

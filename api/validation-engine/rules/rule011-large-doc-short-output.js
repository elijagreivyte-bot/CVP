const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_011',
  title: 'Didelis dokumentas, bet neįprastai trumpi analizės masyvai',
  severity: 50,
  confidencePenalty: -10,
  appliesTo: (ctx) => typeof ctx.docLength === 'number' && ctx.docLength > 100000,
  check: (ctx) => {
    const r = ctx.result;
    const totalItems = (r.kvalifikacijosMatrica || []).length + (r.techninesSpecifikacijosMatrica || []).length + (r.rizikos || []).length;
    if (totalItems < 2) {
      return { reason: `Dokumentas ${Math.round(ctx.docLength / 1000)}k simbolių, bet analizėje tik ${totalItems} reikalavimo/rizikos įrašas(-ai) — panašu, kad AI neapdorojo viso teksto gylio.`, recommendation: 'Patikrinti, ar dokumentas nebuvo per didelis vienam kvietimui apdoroti.' };
    }
    return null;
  }
});

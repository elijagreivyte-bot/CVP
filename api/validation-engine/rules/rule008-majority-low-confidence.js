const { defineRule } = require('../rule-helper');

function collectConfidences(result) {
  const arrays = [result.kvalifikacijosMatrica, result.techninesSpecifikacijosMatrica, result.blokuojanciosSalygos, result.komercinesRizikos, result.strateginesRizikos].filter(Array.isArray);
  const items = [].concat(...arrays);
  return items.map(i => i.pasitikejimas).filter(Boolean);
}

module.exports = defineRule({
  id: 'RULE_008',
  title: 'Daugiau nei pusė matricos įrašų su žemu pasitikėjimu',
  severity: 55,
  confidencePenalty: -12,
  appliesTo: (ctx) => collectConfidences(ctx.result).length >= 4,
  check: (ctx) => {
    const conf = collectConfidences(ctx.result);
    const low = conf.filter(c => c === 'žemas').length;
    const pct = low / conf.length;
    if (pct > 0.5) {
      return { reason: `${Math.round(pct * 100)}% (${low}/${conf.length}) reikalavimų/rizikų pažymėti žemu pasitikėjimu.`, recommendation: 'Dokumentas gali būti neaiškus arba prastai apdorotas — verta perskaityti originalą.' };
    }
    return null;
  }
});

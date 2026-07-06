const { defineRule } = require('../rule-helper');

function collectSources(result) {
  const arrays = [result.kvalifikacijosMatrica, result.techninesSpecifikacijosMatrica, result.blokuojanciosSalygos, result.komercinesRizikos, result.strateginesRizikos].filter(Array.isArray);
  const items = [].concat(...arrays);
  return items.map(i => i.paremta).filter(Boolean);
}

module.exports = defineRule({
  id: 'RULE_009',
  title: 'Dauguma laukų remiasi bendra praktika, ne dokumentu',
  severity: 45,
  confidencePenalty: -10,
  appliesTo: (ctx) => collectSources(ctx.result).length >= 4,
  check: (ctx) => {
    const sources = collectSources(ctx.result);
    const general = sources.filter(s => s === 'bendra_praktika').length;
    const pct = general / sources.length;
    if (pct > 0.6) {
      return { reason: `${Math.round(pct * 100)}% (${general}/${sources.length}) laukų paremti bendra praktika, ne konkrečia dokumento citata.`, recommendation: 'Galimai dokumentas neišsamus arba tekstas prastai ištrauktas — verta peržiūrėti originalą.' };
    }
    return null;
  }
});

const { defineRule } = require('../rule-helper');

module.exports = defineRule({
  id: 'RULE_004',
  title: 'Executive Summary sprendimas nesutampa su pagrindiniu',
  severity: 70,
  confidencePenalty: -15,
  forceValidator: true,
  appliesTo: (ctx) => !!(ctx.result.executiveSummary && ctx.result.executiveSummary.artaVerta),
  check: (ctx) => {
    const r = ctx.result;
    if (r.executiveSummary.artaVerta !== r.sprendimas) {
      return { reason: `Executive Summary sako "${r.executiveSummary.artaVerta}", bet pagrindinis sprendimas — "${r.sprendimas}".`, recommendation: 'Sinchronizuoti executiveSummary su top-level sprendimu.' };
    }
    return null;
  }
});

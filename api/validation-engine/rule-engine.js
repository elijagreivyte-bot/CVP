// ═══════════════════════════════════════════════════════════
// RULE ENGINE — vykdo RULES registrą (0 LLM kvietimų, ~5-20ms).
// Grąžina: findings (suveikusios taisyklės), coverage (kiek % taisyklių
// buvo pritaikyta šiai analizei), preConfidencePenalty (suma baudų),
// forceValidator (ar bent viena taisyklė reikalauja Validatoriaus).
// ═══════════════════════════════════════════════════════════
const { RULES } = require('./rules');

function runRuleEngine(ctx) {
  const findings = [];
  const applied = [];
  const notApplicable = [];

  for (const rule of RULES) {
    const res = rule.evaluate(ctx);
    if (!res.applied) {
      notApplicable.push(rule.id);
      continue;
    }
    applied.push(rule.id);
    if (res.triggered) findings.push(res.finding);
  }

  const preConfidencePenalty = findings.reduce((sum, f) => sum + f.confidencePenalty, 0);
  const forceValidator = findings.some(f => f.forceValidator);
  const maxSeverity = findings.length ? Math.max(...findings.map(f => f.severity)) : 0;

  return {
    findings,
    coverage: {
      totalRules: RULES.length,
      applied: applied.length,
      notApplicable,
      appliedPct: RULES.length ? Math.round((applied.length / RULES.length) * 100) : 0
    },
    preConfidencePenalty,
    forceValidator,
    maxSeverity
  };
}

module.exports = { runRuleEngine };

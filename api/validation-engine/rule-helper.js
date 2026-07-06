// ═══════════════════════════════════════════════════════════
// Rule Registry — bendras taisyklės apibrėžimo šablonas.
// Kiekviena taisyklė (rules/ruleNNN-*.js) naudoja šią funkciją,
// kad visos turėtų vienodą, paaiškinamą struktūrą (žr. audito
// pastabą: "kiekviena taisyklė turi grąžinti code/title/reason/
// confidencePenalty/severity/recommendation").
// ═══════════════════════════════════════════════════════════

/**
 * @param {Object} def
 * @param {string} def.id - unikalus ID, pvz. 'RULE_001'
 * @param {string} def.title - trumpas pavadinimas
 * @param {number} def.severity - 10-100, kiek rimta, jei suveikia
 * @param {number} def.confidencePenalty - neigiamas skaičius, kiek atimti iš confidence, jei suveikia
 * @param {boolean} [def.forceValidator] - ar radus šią problemą PRIVALOMA kviesti Validatorių
 * @param {function(ctx):boolean} def.appliesTo - ar ši taisyklė iš viso taikytina šiam kontekstui (coverage skaičiavimui)
 * @param {function(ctx):(Object|null)} def.check - grąžina detales, jei taisyklė SUVEIKĖ (rado problemą), arba null jei viskas gerai
 */
function defineRule(def) {
  return {
    id: def.id,
    title: def.title,
    severity: def.severity,
    appliesTo: def.appliesTo || (() => true),
    evaluate(ctx) {
      if (!this.appliesTo(ctx)) return { applied: false };
      let hit;
      try {
        hit = def.check(ctx);
      } catch (e) {
        console.error(`Taisyklės ${def.id} klaida:`, e.message);
        return { applied: false };
      }
      if (!hit) return { applied: true, triggered: false };
      return {
        applied: true,
        triggered: true,
        finding: {
          code: def.id,
          title: def.title,
          reason: typeof hit === 'string' ? hit : hit.reason,
          confidencePenalty: def.confidencePenalty,
          severity: def.severity,
          recommendation: def.recommendation || (typeof hit === 'object' && hit.recommendation) || 'Peržiūrėkite šią vietą rankiniu būdu.',
          forceValidator: !!def.forceValidator
        }
      };
    }
  };
}

module.exports = { defineRule };

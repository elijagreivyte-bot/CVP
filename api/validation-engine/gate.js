// ═══════════════════════════════════════════════════════════
// ADAPTIVE GATE — sprendžia, ar Validatorius (LLM) reikalingas.
// Taip pat sudaro TIKSLINĮ kontekstą Validatoriui — jei Rule Engine
// jau žino, KAS įtartina, siunčiame tik tas vietas, ne visą analizę.
// ═══════════════════════════════════════════════════════════

const PRE_CONFIDENCE_THRESHOLD = 65;

/**
 * @param {Object} ruleEngineResult
 * @param {number} preConfidence - bazinis confidence po Rule Engine (prieš Validatorių)
 * @param {number} remainingBudgetMs
 * @param {boolean} shadowMode - jei true, visada vykdyti Validatorių kalibravimui,
 *   bet grąžinti ir "hipotetinį" gate sprendimą atskirai (žr. analyze-agents.js)
 */
function shouldRunValidator(ruleEngineResult, preConfidence, remainingBudgetMs, shadowMode) {
  const hypotheticalDecision =
    ruleEngineResult.forceValidator || preConfidence < PRE_CONFIDENCE_THRESHOLD;

  // Avarinis išjungiklis — atskirai nuo shadow mode. Naudoti, jei reikia
  // nedelsiant sustabdyti visus Validatoriaus kvietimus (pvz. netikėtas kaštų
  // šuolis, Anthropic incidentas). Aukščiausio prioriteto patikra.
  if (process.env.FEATURE_VALIDATOR === 'false') {
    return { run: false, reason: 'FEATURE_VALIDATOR=false — rankinis avarinis išjungimas', hypotheticalDecision };
  }

  if (remainingBudgetMs < 12000) {
    return { run: false, reason: 'Laiko biudžetas nepakankamas (< 12s liko)', hypotheticalDecision };
  }
  if (shadowMode) {
    return { run: true, reason: 'Shadow mode — kalibravimo laikotarpis, Validatorius visada vykdomas', hypotheticalDecision };
  }
  if (ruleEngineResult.forceValidator) {
    return { run: true, reason: 'Rule Engine rado kietą prieštaravimą (forceValidator)', hypotheticalDecision };
  }
  if (preConfidence < PRE_CONFIDENCE_THRESHOLD) {
    return { run: true, reason: `Pre-confidence (${preConfidence}%) žemesnis nei slenkstis (${PRE_CONFIDENCE_THRESHOLD}%)`, hypotheticalDecision };
  }
  return { run: false, reason: `Rule Engine nerado problemų, pre-confidence (${preConfidence}%) pakankamas`, hypotheticalDecision };
}

/**
 * Tikslinis kontekstas Validatoriui: jei yra konkrečių Rule Engine radinių,
 * nurodome patikrinti PIRMIAUSIA tas vietas — sutrumpina atsakymo laiką ir kainą.
 */
function buildFocusInstruction(findings) {
  if (!findings || findings.length === 0) {
    return 'Rule Engine nerado vidinių prieštaravimų — atlik bendrą kritinę peržiūrą, ypač citatų tikslumą.';
  }
  const list = findings.map(f => `- [${f.code}] ${f.title}: ${f.reason}`).join('\n');
  return `Rule Engine (automatinis, ne-LLM patikrinimas) jau rado šias įtartinas vietas — PIRMIAUSIA patikrink būtent jas, tada atlik trumpą bendrą peržiūrą likusiai daliai:\n${list}`;
}

module.exports = { shouldRunValidator, buildFocusInstruction, PRE_CONFIDENCE_THRESHOLD };

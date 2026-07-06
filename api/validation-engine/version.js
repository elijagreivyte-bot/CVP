// ═══════════════════════════════════════════════════════════
// VERSIJAVIMAS — rankiniu būdu keliamas skaičius, kai keičiasi
// taisyklių logika (ne kai pridedama nauja taisyklė be pakeitimų
// senoms — tada užtenka RULES.length pasikeitimo, kuris jau
// automatiškai atsispindi). Naudojama analysis_quality_log lentelėje,
// kad po mėnesių būtų galima tiksliai pasakyti, kuri variklio versija
// sukūrė konkrečią analizę.
// ═══════════════════════════════════════════════════════════
const { RULES } = require('./rules');

const RULE_ENGINE_LOGIC_VERSION = '1.0.0'; // pakelti rankiniu būdu keičiant taisyklių logiką/svorius

function getRuleEngineVersion() {
  return `${RULE_ENGINE_LOGIC_VERSION}+${RULES.length}rules`;
}

module.exports = { getRuleEngineVersion, RULE_ENGINE_LOGIC_VERSION };

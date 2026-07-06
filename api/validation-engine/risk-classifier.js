// ═══════════════════════════════════════════════════════════
// RIZIKŲ KLASIFIKATORIUS — raktažodžiais paremtas, 0 LLM kvietimų.
// Sąmoningai NE semantinis/AI — tai reiškia, kad klasifikacija bus
// netobula (gali praleisti niuansuotus atvejus), bet visada
// paaiškinama ir nuosekli. Jei reikės tikslesnio, tai bus atskiras,
// apgalvotas sprendimas vėliau, ne šio žingsnio dalis.
// ═══════════════════════════════════════════════════════════

const RISK_CLASSES = {
  terminu: {
    label: 'Terminų rizika',
    keywords: ['terminas', 'termino', 'vėluoti', 'vėlavimas', 'iki ', 'laiku', 'dienų', 'savaičių', 'mėnesių', 'delspinigi']
  },
  finansine: {
    label: 'Finansinė rizika',
    keywords: ['kaina', 'biudžet', 'sąnaud', 'finans', 'apyvart', 'bauda', 'baudos', 'nuostoli', 'garantinis indėlis', 'užstat']
  },
  teisine: {
    label: 'Teisinė rizika',
    keywords: ['sutart', 'teis', 'atsakomyb', 'pažeid', 'įstatym', 'reglament', 'ginč', 'nutraukim']
  },
  technine: {
    label: 'Techninė rizika',
    keywords: ['technin', 'specifikacij', 'įrang', 'sistem', 'parametr', 'suderinamum', 'diegim']
  },
  konkurencijos: {
    label: 'Konkurencijos rizika',
    keywords: ['konkurenc', 'vienintel', 'gamintoj', 'prekės ženkl', 'lygiavert', 'ribojant']
  },
  dokumentacijos: {
    label: 'Dokumentacijos rizika',
    keywords: ['dokument', 'sertifikat', 'pažym', 'priedas', 'priedai', 'forma', 'ebvpd', 'espd']
  }
};

/**
 * @param {string} text - rizikos aprašymo tekstas
 * @returns {string} klasės raktas arba 'nezinoma', jei nė vienas raktažodis nerastas
 */
function classifyRisk(text) {
  if (!text || typeof text !== 'string') return 'nezinoma';
  const lower = text.toLowerCase();
  for (const [key, def] of Object.entries(RISK_CLASSES)) {
    if (def.keywords.some(kw => lower.includes(kw))) return key;
  }
  return 'nezinoma';
}

function classifyAllRisks(result) {
  const arrays = [result.rizikos, result.komercinesRizikos, result.strateginesRizikos].filter(Array.isArray);
  const items = [].concat(...arrays);
  return items.map(item => {
    const text = typeof item === 'string' ? item : (item.aprasymas || item.pavadinimas || JSON.stringify(item));
    return { text, class: classifyRisk(text) };
  });
}

module.exports = { classifyRisk, classifyAllRisks, RISK_CLASSES };

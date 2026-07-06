// ═══════════════════════════════════════════════════════════
// CONFIDENCE BUILDER — deklaratyvus faktorių sąrašas, ne tiesinė
// kietai užkoduota formulė. Rule Engine radiniai jau neša savo
// confidencePenalty (žr. rules/*.js) — čia papildomai apibrėžti
// tik VALIDATORIAUS išvestos signalai (citatos, OCR, sutarimas).
// Norint pridėti naują faktorių — prideda vieną eilutę į
// VALIDATOR_FACTORS, nereikia liesti likusio kodo.
// ═══════════════════════════════════════════════════════════

const BASE_CONFIDENCE = 50;

const VALIDATOR_FACTORS = [
  {
    id: 'CIT_ALL_CORRECT',
    weight: 20,
    description: 'Visos patikrintos citatos rastos ir teisingos',
    condition: (v) => v && v.citatuPatikrintos > 0 && v.citatuTeisingos === v.citatuPatikrintos
  },
  {
    id: 'CIT_MISMATCH',
    weight: -10,
    description: (v) => `Rasta neatitikimų citatose (${v.citatuTeisingos}/${v.citatuPatikrintos} teisingos)`,
    condition: (v) => v && v.citatuPatikrintos > 0 && v.citatuTeisingos < v.citatuPatikrintos
  },
  {
    id: 'OCR_GOOD',
    weight: 10,
    description: 'OCR/teksto kokybė gera',
    condition: (v) => v && v.ocrKokybe === 'gera'
  },
  {
    id: 'OCR_POOR',
    weight: -15,
    description: 'Maža OCR/teksto ištraukimo kokybė',
    condition: (v) => v && v.ocrKokybe === 'prasta'
  },
  {
    id: 'NO_MISSING_DATA',
    weight: 10,
    description: 'Visi reikalingi duomenys rasti',
    condition: (v) => v && Array.isArray(v.trukstamiDuomenys) && v.trukstamiDuomenys.length === 0
  },
  {
    id: 'MISSING_DATA',
    weight: -15,
    description: (v) => `Trūksta duomenų: ${(v.trukstamiDuomenys || []).slice(0, 3).join(', ')}`,
    condition: (v) => v && Array.isArray(v.trukstamiDuomenys) && v.trukstamiDuomenys.length > 0
  },
  {
    id: 'CONTRADICTION_FOUND',
    weight: -10,
    description: (v) => `Aptikta ${(v.klaidos || []).filter(k => k.tipas === 'prieštaravimu').length} prieštaravimų`,
    condition: (v) => v && (v.klaidos || []).some(k => k.tipas === 'prieštaravimu')
  },
  {
    id: 'VALIDATOR_DISAGREES',
    weight: -20,
    description: 'Validatorius nesutinka su Generatoriaus išvada',
    condition: (v) => v && v.sutinkaSuGeneratoriumi === false
  }
];

/**
 * @param {Object} ruleEngineResult - runRuleEngine() rezultatas
 * @param {Object|null} validation - Validatoriaus JSON atsakymas arba null, jei nevykdyta
 * @returns {{confidence:number, breakdown:Array}}
 */
function buildConfidence(ruleEngineResult, validation) {
  let conf = BASE_CONFIDENCE;
  const breakdown = [];

  // 1) Rule Engine radiniai — kiekvienas jau turi savo confidencePenalty (žr. rules/*.js)
  for (const f of ruleEngineResult.findings) {
    conf += f.confidencePenalty;
    breakdown.push({ delta: f.confidencePenalty, label: f.title, source: 'rule', code: f.code });
  }

  // 2) Validatoriaus faktoriai — tik jei Validatorius realiai vykdytas
  if (validation) {
    for (const factor of VALIDATOR_FACTORS) {
      if (factor.condition(validation)) {
        const label = typeof factor.description === 'function' ? factor.description(validation) : factor.description;
        conf += factor.weight;
        breakdown.push({ delta: factor.weight, label, source: 'validator', code: factor.id });
      }
    }
    const otherErrors = (validation.klaidos || []).filter(k => k.tipas !== 'prieštaravimu').length;
    if (otherErrors > 0) {
      const penalty = -Math.min(otherErrors * 5, 20);
      conf += penalty;
      breakdown.push({ delta: penalty, label: `Validatorius rado ${otherErrors} kitą(-as) klaidą(-as)`, source: 'validator', code: 'OTHER_ERRORS' });
    }
  } else {
    breakdown.push({ delta: 0, label: 'Validacija nevykdyta — pasitikėjimas nepatvirtintas nepriklausomai', source: 'system', code: 'NO_VALIDATION' });
    conf = Math.min(conf, 55); // niekada nerodome aukšto pasitikėjimo be nepriklausomo patikrinimo
  }

  conf = Math.max(0, Math.min(100, Math.round(conf)));
  return { confidence: conf, breakdown };
}

module.exports = { buildConfidence, VALIDATOR_FACTORS, BASE_CONFIDENCE };

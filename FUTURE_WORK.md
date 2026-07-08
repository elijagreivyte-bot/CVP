# Ateities darbai — Growth etapui (ne dabar)

Šis dokumentas egzistuoja, kad rekomendacijos neprapultų per kelis mėnesius
telemetrijos kaupimo laikotarpio. Nė vienas punktas čia NĖRA skubus —
visi laukia realių eksploatacijos duomenų arba sąmoningo sprendimo pradėti
Growth etapą.

## 1. Elgsenos (behavior) integraciniai testai

Skiriasi nuo `test/telemetry.*.test.js` — tie tikrina telemetrijos DUOMENŲ
STRUKTŪRĄ, šie tikrintų viso PRODUKTO ELGESĮ. Reikės mock'inti Supabase
klientą ir `verifyToken`, ne tik `fetch`.

- [ ] **Happy path**: vienas Generatoriaus kvietimas → `result_json` turi
  `schemaVersion`, `llm_calls` turi tiksliai 1 įrašą, `analysis_quality_log`
  eilutė sukurta ir užpildyta.
- [ ] **Validator timeout**: Generatorius sėkmingas, Validatorius baigiasi
  timeout'u → analizė VIS TIEK grąžinama vartotojui (ne 500 klaida),
  `patikimumoLentele.validatoriausVertinimas` rodo timeout, confidence
  sumažintas pagal `buildConfidence()` taisykles.
- [ ] **`FEATURE_VALIDATOR=false`**: Validatorius apskritai nekviečiamas
  (0 `llm_calls` įrašų su `step:'validator'`), bet grąžinama pilna bazinė
  analizė su aiškia žyma vartotojui, kad validacija buvo išjungta.

## 2. `provider_request_id` incidentų diagnostikai

Dabar tik saugomas `analysis_quality_log.llm_calls[].provider_request_id`.
Kai atsiras pirmas realus incidentas (Anthropic klaida, neaiškus rezultatas):

- [ ] Patikrinti, ar Anthropic palaiko šio ID paiešką jų pagalbos/support kanale
- [ ] Jei taip — pridėti trumpą vidinę instrukciją (runbook), kaip naudoti
  šį ID pranešant apie problemą Anthropic
- [ ] Apsvarstyti, ar rodyti šį ID admin dashboard prie kiekvienos analizės
  (dabar nerodoma — tik saugoma DB)

## Kada grįžti prie šio dokumento

Kai pasieksite bent kelis šimtus analizių IR/ARBA nuspręsite pradėti
Growth etapo architektūros darbus (Queue, Redis, Priority Queue —
žr. ankstesnę architektūros diskusiją). Ne anksčiau.

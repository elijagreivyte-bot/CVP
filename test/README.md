# Telemetrijos testai

Trys lengvi regresijos testai, apsaugantys nuo dviejų realių bug'ų,
rastų kuriant llm_calls telemetriją (žr. sesijos istoriją).

## Paleidimas
```
node test/telemetry.success.test.js
node test/telemetry.validator-error.test.js
node test/telemetry.retry.test.js
```
Arba visi iš karto:
```
for f in test/*.test.js; do node "$f" || exit 1; done
```

## Ką tikrina
1. **telemetry.success.test.js** — sėkmingas kvietimas duoda teisingai
   suformuotą llm_calls įrašą (step išlieka, ne "undefined").
2. **telemetry.validator-error.test.js** — klaidos/timeout atveju status
   ir error laukai užpildomi teisingai. RIBA: tikrina failedCallEntry/
   classifyErrorStatus funkcijas izoliuotai, NE tiesiogiai analyze-agents.js
   vidinį try/catch bloką (jis nėra atskirai eksportuojamas).
3. **telemetry.retry.test.js** — retry scenarijus duoda 2 atskirus
   llm_calls įrašus su teisingais step pavadinimais.

## Kaip pridėti naują testą
Naudok `test/_helpers.js` mockFetchSuccess/mockFetchHttpError/mockFetchTimeout,
importuok `_test` eksportus iš `../api/analyze-agents`.

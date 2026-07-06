// ═══════════════════════════════════════════════════════════
// HARD STOPS — jei bent viena suveikia, NEI Generatorius, NEI
// Validatorius nekviečiami. Nėra prasmės leisti pinigus AI
// kvietimams, jei dokumentas objektyviai neanalizuojamas.
// ═══════════════════════════════════════════════════════════

const HARD_STOPS = [
  {
    code: 'HS_EMPTY_TEXT',
    title: 'Tekstas tuščias arba per trumpas',
    check: (text) => !text || text.trim().length < 50,
    message: 'Iš dokumento nepavyko ištraukti teksto (tuščias arba per trumpas). Įsitikinkite, kad failas neužrakintas, nėra tuščias, ir bandykite dar kartą.'
  },
  {
    code: 'HS_OCR_GARBAGE',
    title: 'Teksto kokybė per prasta (galimai nepavykęs OCR)',
    check: (text) => {
      const sample = text.slice(0, 20000);
      const replacementChars = (sample.match(/\uFFFD/g) || []).length;
      if (sample.length > 200 && replacementChars / sample.length > 0.03) return true;
      const alnum = (sample.match(/[a-zA-ZąčęėįšųūžĄČĘĖĮŠŲŪŽ0-9]/g) || []).length;
      return sample.length > 500 && (alnum / sample.length) < 0.25;
    },
    message: 'Dokumento tekstas atrodo sugadintas arba blogos OCR kokybės — per mažai skaitomo teksto. Pabandykite įkelti aiškesnę dokumento versiją (pvz. originalų PDF, ne nuskenuotą kopiją).'
  },
  {
    code: 'HS_REPETITIVE_NOISE',
    title: 'Tekstas per daug pasikartojantis (galimai ekstrakcijos klaida)',
    check: (text) => {
      const sample = text.slice(0, 5000).trim();
      if (sample.length < 500) return false;
      const uniqueChars = new Set(sample.replace(/\s/g, '')).size;
      return uniqueChars < 15; // realiame tekste visada daug skirtingų simbolių
    },
    message: 'Dokumento tekstas atrodo kaip ekstrakcijos klaida (per mažai unikalių simbolių). Pabandykite kitą failo formatą arba rankinį teksto kopijavimą.'
  }
];

function checkHardStops(text) {
  for (const stop of HARD_STOPS) {
    try {
      if (stop.check(text)) {
        return { stopped: true, code: stop.code, title: stop.title, message: stop.message };
      }
    } catch (e) {
      console.error(`Hard stop ${stop.code} klaida:`, e.message);
    }
  }
  return { stopped: false };
}

module.exports = { checkHardStops, HARD_STOPS };

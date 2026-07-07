const { defineRule } = require('../rule-helper');

function parseLooseDate(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = defineRule({
  id: 'RULE_013',
  title: 'Pateikimo terminas jau praeityje',
  severity: 85,
  confidencePenalty: -20,
  forceValidator: true,
  appliesTo: (ctx) => !!(ctx.result.terminai && ctx.result.terminai.pasiulymoTerminas),
  check: (ctx) => {
    const d = parseLooseDate(ctx.result.terminai.pasiulymoTerminas);
    if (d && d.getTime() < Date.now() - 24 * 3600000) {
      return { reason: `Nurodytas pateikimo terminas (${ctx.result.terminai.pasiulymoTerminas}) jau praėjęs — tikėtina AI klaidingai perskaitė datą arba dokumentas pasenęs.`, recommendation: 'Patikrinti datą originaliame dokumente.' };
    }
    return null;
  }
});

// ═══════════════════════════════════════════════════════════
// PROXY — perduoda visus kvietimus į analyze-agents.js
// Tai būtina, nes vercel.json nuoroda į api/analyze.js, bet
// pagrindinė analizės logika yra analyze-agents.js (multi-agent).
// Jei kada nors atsikratysite vercel.json nuoroda — galite šitą failą ištrinti.
// ═══════════════════════════════════════════════════════════
module.exports = require('./analyze-agents.js');

// Perduodam ir config eksportą (maxDuration ir kt.)
const handler = require('./analyze-agents.js');
if (handler && handler.config) {
  module.exports.config = handler.config;
}

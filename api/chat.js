// ═══════════════════════════════════════════════════════════
// BIDWISE AI — GROUNDED CONTEXT CHAT + laiškų generavimas
// chat režimas: AI atsako TIK pagal konkretaus konkurso dokumentus
// letter režimas: generuoja klausimų raštą perkančiajai
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { CVP_KNOWLEDGE } = require('./cvp-knowledge');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

module.exports.config = { maxDuration: 60 };

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// Iš analizės rezultato (curResult) sudaro teksto kontekstą AI
function contextToText(ctx) {
  if (!ctx) return '';
  if (typeof ctx === 'string') return ctx;
  // ctx yra analizės result objektas
  let t = '';
  // PILNAS DOKUMENTŲ TEKSTAS — svarbiausias šaltinis (jei yra)
  if (ctx._fullText && ctx._fullText.trim().length > 50) {
    t += '═══ PILNAS PIRKIMO DOKUMENTŲ TEKSTAS ═══\n' + ctx._fullText + '\n\n═══ AI ANALIZĖS SANTRAUKA (pagalbinė) ═══\n';
  }
  if (ctx.pavadinimas) t += `Pirkimo pavadinimas: ${ctx.pavadinimas}\n`;
  if (ctx.perkanciojiOrganizacija) t += `Perkančioji organizacija: ${ctx.perkanciojiOrganizacija}\n`;
  if (ctx.pirkimoTipas) t += `Pirkimo tipas: ${ctx.pirkimoTipas}\n`;
  if (ctx.bendraVerte) t += `Vertė: ${ctx.bendraVerte}\n`;
  if (ctx.cpt) t += `BVPŽ kodas: ${ctx.cpt}\n`;
  if (ctx.terminai) {
    const tr = ctx.terminai;
    t += `Terminai: pasiūlymai iki ${tr.pasiulymoTerminas || '?'}, vykdymas ${tr.vykdymoTerminas || '?'}, garantija ${tr.garantija || '?'}\n`;
  }
  if (ctx.kvalifikacija) {
    const k = ctx.kvalifikacija;
    t += `Kvalifikaciniai reikalavimai: apyvarta ${k.apyvarta || '?'}, darbuotojai ${k.darbuotojai || '?'}, patirtis ${k.patirtis || '?'}, sertifikatai ${k.sertifikatai || '?'}\n`;
    if (Array.isArray(k.reikalavimai)) {
      k.reikalavimai.forEach(r => { t += `  - ${r.reikalavimas || ''} ${r.citata ? '(citata: ' + r.citata + ')' : ''}\n`; });
    }
  }
  if (ctx.finansinesSalygos) {
    const f = ctx.finansinesSalygos;
    t += `Finansinės sąlygos: avansas ${f.avansas || '?'}, apmokėjimas ${f.apmokejimas || '?'}, baudos ${f.baudos || '?'}\n`;
  }
  if (Array.isArray(ctx.vertinimoKriterijai)) {
    t += `Vertinimo kriterijai: ${ctx.vertinimoKriterijai.map(v => (v.kriterijus || '') + ' ' + (v.svoris || '')).join(', ')}\n`;
  }
  if (Array.isArray(ctx.rizikos)) {
    t += `Rizikos: ${ctx.rizikos.map(r => typeof r === 'string' ? r : (r.rizika || '') + (r.citata ? ' (citata: ' + r.citata + ')' : '')).join('; ')}\n`;
  }
  if (Array.isArray(ctx.pasleptosNuostatos)) t += `Paslėptos nuostatos: ${ctx.pasleptosNuostatos.join('; ')}\n`;
  if (ctx.strategija) t += `Strategija: ${ctx.strategija}\n`;
  if (ctx.isViso) t += `Išvada: ${ctx.isViso}\n`;
  return t;
}

const GROUNDED_SYSTEM = (kontekstas) => `Tu esi BidwiseAI asistentas — patyręs Lietuvos viešųjų pirkimų konsultantas. Padedi vartotojui suprasti KONKRETŲ konkursą. Atsakai lietuvių kalba — natūraliai ir dalykiškai, kaip protingas kolega, ne kaip robotas.

KAIP ATSAKAI:
1. Faktus apie ŠĮ konkursą (terminus, reikalavimus, kainas, specifikacijas) imk TIK iš pateikto dokumentų teksto. Nieko neprasimanyk.
2. Kai randi atsakymą dokumente — NURODYK PUSLAPĮ. Dokumento tekste yra žymekliai [Psl. X]. Cituok taip: "Sąlygose nurodyta, kad reikia ISO 9001 (Psl. 14)." Jei puslapio žymeklio nėra, nurodyk dokumento dalį/sekciją.
3. Naudok faktinę kalbą: "Dokumente nurodyta...", "Sąlygose reikalaujama...". Venk "tikriausiai", "manau", "tikėtina" kalbant apie konkurso faktus.
4. PROAKTYVIAI žymėk rizikas: jei matai dviprasmybių ar sąlygų, galinčių pakenkti tiekėjui (neproporcingos baudos, neaiškus kvalifikacijos vertinimas, trumpi terminai, neaiškios formos reikalavimai) — atkreipk dėmesį, net jei vartotojas neklausė. Pradėk tokią pastabą su "⚠️".
5. Jei atsakymo NĖRA pateiktame tekste — neišgalvok. Bet būk naudingas: paaiškink, kad to nėra įkeltuose dokumentuose, pasakyk kuriame dokumente tai paprastai būna (pvz. "techninė specifikacija paprastai yra SAK dokumente"), ir pasiūlyk įkelti pilnus pirkimo dokumentus (visą ZIP iš CVP, ne tik skelbimą).
6. Atsakymai aiškūs ir šilti. Trumpiems klausimams — trumpas atsakymas. Sudėtingiems — gali naudoti sąrašus ar sekcijas, bet natūraliai, ne pagal griežtą šabloną.
7. Dėl sprendimų — primink, kad galutinį sprendimą priima vartotojas, patikrinęs originalą.

CVP DOKUMENTŲ NIUANSAS: Skelbimas (anonsas) turi tik bendrą info (vertė, terminai, CPV). Detalūs reikalavimai ir techninės specifikacijos būna atskiruose dokumentuose (SAK, techninė specifikacija). Jei matai tik skelbimą — mandagiai pasiūlyk įkelti pilnus dokumentus.

ŠIO KONKURSO DOKUMENTŲ INFORMACIJA:
${kontekstas || 'Informacija nepateikta.'}

${CVP_KNOWLEDGE}

PRIMINIMAS: Bendros žinios (VPĮ) yra tik kontekstas suprasti situaciją. Konkretaus konkurso faktus imk TIK iš dokumentų ir nurodyk puslapius. Jei VPĮ žinios padeda pastebėti riziką (pvz. neproporcingą reikalavimą) — gali tai paminėti kaip pastabą, bet aiškiai atskirk kas iš konkurso dokumento, o kas iš bendros praktikos.

Atsakyk natūraliai, su puslapių nuorodomis ir, jei reikia, rizikų pastabomis.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });
  // BETA režimas — chat prieinamas visiems testuotojams
  const BETA_MODE = true;
  if (!BETA_MODE && user.plan === 'free') {
    return res.status(403).json({ error: 'AI asistentas prieinamas Pro ir Komanda planuose' });
  }

  const { messages, context, mode } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Tuščia žinutė' });
  }

  try {
    let systemPrompt;
    let apiMessages = messages.slice(-12).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 3000)
    }));

    if (mode === 'letter') {
      // Laiško generavimas — leidžiam platesnį kontekstą
      systemPrompt = 'Tu esi viešųjų pirkimų ekspertas. Generuoji profesionalų klausimų raštą perkančiajai organizacijai lietuvių kalba. Rašyk dalykiškai, mandagiai, konkrečiai.';
    } else {
      // GROUNDED CHAT režimas
      const kontekstas = contextToText(context).slice(0, 60000);
      if (!kontekstas || kontekstas.trim().length < 20) {
        return res.status(400).json({ error: 'Pirmiausia atlikite konkurso analizę — tada galėsite apie jį klausti.' });
      }
      systemPrompt = GROUNDED_SYSTEM(kontekstas);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: mode === 'letter' ? 2000 : 1500,
        temperature: 0.2,
        system: systemPrompt,
        messages: apiMessages
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const err = await r.text();
      throw new Error('Claude API klaida: ' + r.status + ' ' + err.slice(0, 150));
    }

    const data = await r.json();
    const reply = data.content.map(c => c.text || '').join('\n');

    return res.status(200).json({ reply, response: reply, content: reply, text: reply });

  } catch (e) {
    console.error('Chat klaida:', e);
    if (e.name === 'AbortError') return res.status(500).json({ error: 'Atsakymas užtruko per ilgai.' });
    return res.status(500).json({ error: 'Klaida: ' + e.message });
  }
};

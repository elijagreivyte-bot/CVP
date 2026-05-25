// ═══════════════════════════════════════════════════════════
// BIDWISE AI — GROUNDED CONTEXT CHAT + laiškų generavimas
// chat režimas: AI atsako TIK pagal konkretaus konkurso dokumentus
// letter režimas: generuoja klausimų raštą perkančiajai
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');

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
  if (ctx._fullText) t += `\nPilnas dokumento tekstas:\n${ctx._fullText}\n`;
  return t;
}

const GROUNDED_SYSTEM = (kontekstas) => `Tu esi BidwiseAI asistentas, padedantis vartotojui suprasti KONKRETŲ viešojo pirkimo konkursą. Atsakai lietuvių kalba.

GRIEŽTOS TAISYKLĖS:
1. Atsakai TIK remdamasis žemiau pateiktu pirkimo dokumento tekstu — tai vienintelis tavo žinių šaltinis apie šį konkursą.
2. Negali naudoti bendrųjų žinių apie pasaulį, kitus konkursus ar teisės aktus kalbant apie ŠIO konkurso sąlygas. Remkis tik pateiktu tekstu.
3. Jei atsakymo NĖRA pateiktame tekste, atsakyk TIKSLIAI: "Pateiktuose pirkimo dokumentuose ši informacija nenurodyta." Nespėliok.
4. Kur įmanoma, nurodyk iš kurios dalies paėmei informaciją (pvz. "(Kvalifikaciniai reikalavimai)" ar "(psl. X)").
5. Atsakyk trumpai, dalykiškai. Naudok sąrašus kur tinka.
6. Jei klausia patarimo dėl sprendimo — primink, kad galutinį sprendimą priima vartotojas, patikrinęs originalą.

ŠIO KONKURSO DOKUMENTŲ INFORMACIJA:
${kontekstas || 'Informacija nepateikta.'}

Atsakyk laikydamasis visų taisyklių.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });
  if (user.plan === 'free') {
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
      const kontekstas = contextToText(context).slice(0, 40000);
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

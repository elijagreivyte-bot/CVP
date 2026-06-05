// ═══════════════════════════════════════════════════════════
// BIDWISE AI — CHAT v2: STREAMING + PROMPT CACHING + HISTORY
// - Streaming atsakymai (Server-Sent Events) → UI rodo tekstą realiu laiku
// - Anthropic prompt caching → 2+ žinutė ~5x greitesnė, 90% pigesnė
// - Chat history saugoma analyses.chat_messages (Supabase)
// - Doc text gali būti pakraunamas iš DB (jei senesnė analizė be _fullText)
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

let CVP_KNOWLEDGE = '';
try { CVP_KNOWLEDGE = require('./cvp-knowledge').CVP_KNOWLEDGE || ''; }
catch (e) { console.warn('cvp-knowledge.js nerastas'); }

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

// Konvertuoja analizės result objektą į tekstinę santrauką (jei nėra _fullText)
function contextToText(ctx) {
  if (!ctx) return '';
  if (typeof ctx === 'string') return ctx;
  let t = '';
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

// SYSTEM PROMPT — padalintas į 2 dalis prompt caching'ui
// Dalis 1 (maža, dinamiška) — instrukcijos, nesikartoja tarp pokalbių
// Dalis 2 (didelė, statinė tame pačiame pokalbyje) — dokumento tekstas + CVP žinios — CACHEINAMA
const SYSTEM_INSTRUCTIONS = `Tu esi BidwiseAI asistentas — patyręs Lietuvos viešųjų pirkimų konsultantas. Padedi vartotojui suprasti KONKRETŲ konkursą. Atsakai lietuvių kalba — natūraliai ir dalykiškai, kaip protingas kolega, ne kaip robotas.

KAIP ATSAKAI:
1. Faktus apie ŠĮ konkursą (terminus, reikalavimus, kainas, specifikacijas) imk TIK iš pateikto dokumentų teksto. Nieko neprasimanyk.
2. Kai randi atsakymą dokumente — NURODYK PUSLAPĮ. Dokumento tekste yra žymekliai [Psl. X]. Cituok taip: "Sąlygose nurodyta, kad reikia ISO 9001 (Psl. 14)." Jei puslapio žymeklio nėra, nurodyk dokumento dalį/sekciją.
3. Naudok faktinę kalbą: "Dokumente nurodyta...", "Sąlygose reikalaujama...". Venk "tikriausiai", "manau", "tikėtina" kalbant apie konkurso faktus.
4. PROAKTYVIAI žymėk rizikas: jei matai dviprasmybių ar sąlygų, galinčių pakenkti tiekėjui (neproporcingos baudos, neaiškus kvalifikacijos vertinimas, trumpi terminai, neaiškios formos reikalavimai) — atkreipk dėmesį, net jei vartotojas neklausė. Pradėk tokią pastabą su "⚠️".
5. Jei atsakymo NĖRA pateiktame tekste — neišgalvok. Bet būk naudingas: paaiškink, kad to nėra įkeltuose dokumentuose, pasakyk kuriame dokumente tai paprastai būna (pvz. "techninė specifikacija paprastai yra SAK dokumente"), ir pasiūlyk įkelti pilnus pirkimo dokumentus (visą ZIP iš CVP, ne tik skelbimą).
6. Atsakymai aiškūs ir šilti. Trumpiems klausimams — trumpas atsakymas. Sudėtingiems — gali naudoti sąrašus ar sekcijas, bet natūraliai, ne pagal griežtą šabloną.
7. Dėl sprendimų — primink, kad galutinį sprendimą priima vartotojas, patikrinęs originalą.

CVP DOKUMENTŲ NIUANSAS: Skelbimas (anonsas) turi tik bendrą info (vertė, terminai, CPV). Detalūs reikalavimai ir techninės specifikacijos būna atskiruose dokumentuose (SAK, techninė specifikacija). Jei matai tik skelbimą — mandagiai pasiūlyk įkelti pilnus dokumentus.

PRIMINIMAS: Bendros žinios (VPĮ) yra tik kontekstas suprasti situaciją. Konkretaus konkurso faktus imk TIK iš dokumentų ir nurodyk puslapius. Jei VPĮ žinios padeda pastebėti riziką — gali tai paminėti kaip pastabą, bet aiškiai atskirk kas iš konkurso dokumento, o kas iš bendros praktikos.

Atsakyk natūraliai, su puslapių nuorodomis ir, jei reikia, rizikų pastabomis.`;

// Helper: Async Supabase save (nelaukiam pabaigos, kad neuždelstume atsakymo)
function saveChatMessage(supabase, analysisId, userId, userMsg, assistantMsg) {
  if (!supabase || !analysisId) return;
  (async () => {
    try {
      // Pakraunam dabartines žinutes ir pridedam naujas
      const { data: row } = await supabase
        .from('analyses')
        .select('chat_messages')
        .eq('id', analysisId)
        .eq('user_id', userId)
        .single();
      if (!row) return;
      const existing = Array.isArray(row.chat_messages) ? row.chat_messages : [];
      const updated = [
        ...existing,
        { role: 'user', content: userMsg, ts: new Date().toISOString() },
        { role: 'assistant', content: assistantMsg, ts: new Date().toISOString() }
      ];
      // Apribojam max 100 žinučių (50 porų) — apsauga nuo per didelio JSONB
      const trimmed = updated.slice(-100);
      await supabase
        .from('analyses')
        .update({ chat_messages: trimmed })
        .eq('id', analysisId)
        .eq('user_id', userId);
    } catch (e) { console.warn('chat save klaida:', e.message); }
  })();
}

// Helper: Load doc_text iš DB jei nėra _fullText
async function loadDocTextFromDb(supabase, analysisId, userId) {
  if (!supabase || !analysisId) return '';
  try {
    const { data } = await supabase
      .from('analyses')
      .select('doc_text, result_json')
      .eq('id', analysisId)
      .eq('user_id', userId)
      .single();
    return data?.doc_text || '';
  } catch (e) { return ''; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });
  const BETA_MODE = true;
  if (!BETA_MODE && user.plan === 'free') {
    return res.status(403).json({ error: 'AI asistentas prieinamas Pro ir Komanda planuose' });
  }

  const { messages, context, mode, analysisId, stream } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Tuščia žinutė' });
  }

  const useStreaming = stream !== false && mode !== 'letter';

  try {
    let systemPromptArr;
    let apiMessages = messages.slice(-12).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 3000)
    }));

    // LAIŠKO GENERAVIMAS — paliekam paprastą (be streaming, be caching)
    if (mode === 'letter') {
      systemPromptArr = 'Tu esi viešųjų pirkimų ekspertas. Generuoji profesionalų klausimų raštą perkančiajai organizacijai lietuvių kalba. Rašyk dalykiškai, mandagiai, konkrečiai.';
    } else {
      // GROUNDED CHAT — caching režimas
      let kontekstas = contextToText(context).slice(0, 60000);

      // Jei kontekstas tuščias bet turim analysisId — pakraunam iš DB (senesnė analizė)
      if (kontekstas.trim().length < 20 && analysisId && process.env.SUPABASE_URL) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const docText = await loadDocTextFromDb(supabase, analysisId, user.id);
        if (docText) {
          kontekstas = '═══ PILNAS PIRKIMO DOKUMENTŲ TEKSTAS ═══\n' + docText.slice(0, 60000);
        }
      }

      if (!kontekstas || kontekstas.trim().length < 20) {
        return res.status(400).json({ error: 'Pirmiausia atlikite konkurso analizę — tada galėsite apie jį klausti.' });
      }

      // SYSTEM kaip MASYVAS su cache_control ant didžiosios statinės dalies
      const largeContext = `ŠIO KONKURSO DOKUMENTŲ INFORMACIJA:\n${kontekstas}\n\n${CVP_KNOWLEDGE}`;
      systemPromptArr = [
        { type: 'text', text: SYSTEM_INSTRUCTIONS },
        { type: 'text', text: largeContext, cache_control: { type: 'ephemeral' } }
      ];
    }

    // ═══ STREAMING REŽIMAS ═══
    if (useStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          temperature: 0.2,
          system: systemPromptArr,
          messages: apiMessages,
          stream: true
        })
      });

      if (!upstream.ok) {
        const err = await upstream.text();
        res.write(`data: ${JSON.stringify({ error: 'Claude API: ' + upstream.status + ' ' + err.slice(0, 120) })}\n\n`);
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (!payload || payload === '[DONE]') continue;
            try {
              const event = JSON.parse(payload);
              if (event.type === 'content_block_delta' && event.delta?.text) {
                fullReply += event.delta.text;
                res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
              } else if (event.type === 'message_stop') {
                res.write(`data: ${JSON.stringify({ done: true, fullText: fullReply })}\n\n`);
              }
            } catch (e) { /* skip malformed */ }
          }
        }
      } catch (e) {
        res.write(`data: ${JSON.stringify({ error: 'Streaming nutrūko: ' + e.message })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();

      // Saugom į DB ASYNCHRONOUSLY (nereikia laukti)
      if (analysisId && fullReply && process.env.SUPABASE_URL) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const lastUserMsg = messages[messages.length - 1]?.content || '';
        saveChatMessage(supabase, analysisId, user.id, lastUserMsg, fullReply);
      }
      return;
    }

    // ═══ NE-STREAMING (letter ar fallback) ═══
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
        system: systemPromptArr,
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

    // Saugom į DB (non-streaming chat režimui, ne laiškui)
    if (mode !== 'letter' && analysisId && process.env.SUPABASE_URL) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const lastUserMsg = messages[messages.length - 1]?.content || '';
      saveChatMessage(supabase, analysisId, user.id, lastUserMsg, reply);
    }

    return res.status(200).json({ reply, response: reply, content: reply, text: reply });

  } catch (e) {
    console.error('Chat klaida:', e);
    if (e.name === 'AbortError') return res.status(500).json({ error: 'Atsakymas užtruko per ilgai.' });
    return res.status(500).json({ error: 'Klaida: ' + e.message });
  }
};

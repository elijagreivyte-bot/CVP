// ═══════════════════════════════════════════════════════════
// BIDWISE AI — SLAPTAŽODŽIO ATSTATYMAS („Pamiršau slaptažodį")
// Du veiksmai viename endpointe:
//   { action: 'request', email }            → siunčia atstatymo nuorodą el. paštu
//   { action: 'reset', token, password }    → nustato naują slaptažodį
//
// Tokenas — trumpalaikis JWT (1 val.), pasirašytas getJwtSecret() (fail-closed).
// Jis pririštas prie esamo slaptažodžio maišos pabaigos (bind), tad pakeitus
// slaptažodį ta pati nuoroda nustoja galioti (vienkartiškumas) — be papildomų
// DB stulpelių. Saugumo sumetimais 'request' VISADA grąžina {ok:true},
// neatskleisdamas, ar el. paštas egzistuoja.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSecret, applyCors } = require('./security');

const SITE_URL = (process.env.SITE_URL || 'https://www.bidwiseai.lt').replace(/\/+$/, '');

async function sendViaResend(to, subject, html) {
  const from = process.env.EMAIL_FROM || 'Bidwise AI <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY
    },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  if (!r.ok) {
    const d = await r.text().catch(() => '');
    throw new Error('Resend klaida ' + r.status + ' ' + d.slice(0, 200));
  }
}

function bindOf(passwordHash) {
  return String(passwordHash || '').slice(-16);
}

function resetEmailHtml(name, link) {
  const safeName = (name || 'sveiki').toString().replace(/[<>]/g, '');
  return `<!DOCTYPE html><html lang="lt"><body style="margin:0;background:#0b1220;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;color:#e6edf6">
    <div style="font-size:22px;font-weight:800;margin-bottom:8px">Bidwise <span style="color:#3b82f6">AI</span></div>
    <h2 style="font-size:18px;margin:18px 0 8px">Slaptažodžio atstatymas</h2>
    <p style="font-size:14px;line-height:1.7;color:#9fb0c3">Sveiki, ${safeName}! Gavome prašymą atstatyti jūsų Bidwise AI paskyros slaptažodį. Paspauskite mygtuką žemiau — nuoroda galioja <strong>1 valandą</strong>.</p>
    <p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700">Nustatyti naują slaptažodį →</a></p>
    <p style="font-size:12px;line-height:1.7;color:#6b7c91">Jei mygtukas neveikia, nukopijuokite šią nuorodą į naršyklę:<br><span style="color:#9fb0c3;word-break:break-all">${link}</span></p>
    <p style="font-size:12px;line-height:1.7;color:#6b7c91;margin-top:20px">Jei šio prašymo nesiuntėte, tiesiog ignoruokite šį laišką — slaptažodis nepasikeis.</p>
  </div></body></html>`;
}

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Serverio konfigūracijos klaida' });
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { action } = req.body || {};

  // ── 1) PRAŠYMAS ATSTATYTI ─────────────────────────────────
  if (action === 'request') {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Neteisingas el. pašto adresas' });
    }
    try {
      const { data: user } = await supabase
        .from('users').select('id, name, email, password_hash').eq('email', email).single();

      // ── LAIKINA DIAGNOSTIKA (pašalinti, kai laiškai pradės veikti) ──
      const _diag = {
        userFound: !!user,
        resendKeyPresent: !!process.env.RESEND_API_KEY,
        resendKeyLength: (process.env.RESEND_API_KEY || '').length,
        fromEmail: process.env.EMAIL_FROM || '(numatytoji: onboarding@resend.dev)',
        siteUrl: SITE_URL,
        sendError: null
      };
      console.error('[DIAGNOSTIKA reset]', JSON.stringify(_diag));

      // Siunčiam tik jei vartotojas rastas IR sukonfigūruotas Resend.
      if (user && process.env.RESEND_API_KEY) {
        const token = jwt.sign(
          { uid: user.id, email: user.email, purpose: 'pwreset', bind: bindOf(user.password_hash) },
          getJwtSecret(),
          { expiresIn: '1h' }
        );
        const link = `${SITE_URL}/?reset=${encodeURIComponent(token)}`;
        try {
          await sendViaResend(user.email, 'Bidwise AI — slaptažodžio atstatymas', resetEmailHtml(user.name, link));
        } catch (e) {
          console.error('Reset el. laiško siuntimo klaida:', e.message);
          _diag.sendError = e.message;
          // Tyliai — neatskleidžiam vartotojo egzistavimo ar siuntimo būklės (išskyrus laikiną diagnostiką žemiau).
        }
      }
      // VISADA tas pats atsakymas — neatskleidžiam, ar paštas registruotas (IŠSKYRUS laikiną _diag lauką).
      console.error('[DIAGNOSTIKA reset GALUTINE]', JSON.stringify(_diag));
      return res.status(200).json({ ok: true, _diag });
    } catch (e) {
      console.error('Reset request klaida:', e.message);
      return res.status(200).json({ ok: true, _diagError: e.message });
    }
  }

  // ── 2) NAUJO SLAPTAŽODŽIO NUSTATYMAS ──────────────────────
  if (action === 'reset') {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Trūksta atstatymo žetono' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Slaptažodis turi būti bent 6 simbolių' });
    }

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch (e) {
      return res.status(400).json({ error: 'Nuoroda nebegalioja arba pasibaigė. Užsisakykite naują.' });
    }
    if (!payload || payload.purpose !== 'pwreset' || !payload.uid) {
      return res.status(400).json({ error: 'Netinkamas atstatymo žetonas' });
    }

    try {
      const { data: user } = await supabase
        .from('users')
        .select('id, name, email, plan, free_analyses_left, free_chat_left, subscription_end, company_profile, password_hash')
        .eq('id', payload.uid).single();

      if (!user) return res.status(400).json({ error: 'Vartotojas nerastas' });

      // Vienkartiškumo patikra: jei slaptažodis jau buvo pakeistas, bind nesutaps.
      if (bindOf(user.password_hash) !== payload.bind) {
        return res.status(400).json({ error: 'Ši nuoroda jau panaudota. Užsisakykite naują.' });
      }

      const password_hash = await bcrypt.hash(String(password), 10);
      const { error: upErr } = await supabase
        .from('users').update({ password_hash }).eq('id', user.id);
      if (upErr) return res.status(500).json({ error: 'Nepavyko atnaujinti slaptažodžio' });

      // Automatinis prisijungimas — grąžinam 30 d. žetoną kaip login.js.
      const authToken = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), { expiresIn: '30d' });
      return res.status(200).json({
        token: authToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          free_analyses_left: user.free_analyses_left,
          free_chat_left: (typeof user.free_chat_left === 'number') ? user.free_chat_left : 1,
          subscription_end: user.subscription_end,
          company_profile: user.company_profile
        }
      });
    } catch (e) {
      console.error('Reset klaida:', e.message);
      return res.status(500).json({ error: 'Atstatymo klaida' });
    }
  }

  return res.status(400).json({ error: 'Nežinomas veiksmas' });
};

module.exports.config = { maxDuration: 30 };

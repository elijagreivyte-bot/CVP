// ═══════════════════════════════════════════════════════════
// BIDWISE AI — Stripe webhook
// SVARBU: parašo tikrinimui (constructEvent) BŪTINAS neapdorotas (raw)
// užklausos kūnas. Vercel pagal nutylėjimą JSON kūną išparse'ina, todėl
// išjungiame bodyParser ir patys nuskaitome raw baitus. Be šito parašo
// tikrinimas VISADA lūžta ('No signatures found...').
//
// PASTABA DĖL DB: stripe_customer_id saugojimas yra „best-effort". Jei
// users lentelėje tokio stulpelio nėra, plano atnaujinimas vis tiek vyksta
// (saugomas atskiru, neblokuojančiu update'u). Rekomenduojama pridėti
// users.stripe_customer_id (text) — kad prenumeratos atšaukimo webhook
// patikimai rastų vartotoją.
// ═══════════════════════════════════════════════════════════
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function supa() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// Atskiras, neblokuojantis stripe_customer_id išsaugojimas
async function saveCustomerId(userId, customerId) {
  if (!userId || !customerId) return;
  try {
    await supa().from('users').update({ stripe_customer_id: customerId }).eq('id', userId);
  } catch (e) {
    console.error('stripe_customer_id išsaugoti nepavyko (ar yra stulpelis?):', e.message);
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe webhook: trūksta STRIPE_SECRET_KEY arba STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook nesukonfigūruotas' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('Webhook parašo klaida:', e.message);
    return res.status(400).json({ error: 'Webhook klaida: ' + e.message });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id || session.client_reference_id;
      if (userId) {
        // Periodo pabaigą imam iš realios prenumeratos (mėnesinė/metinė), ne fiksuotą +1 mėn.
        let subEnd = null;
        if (session.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            if (sub?.current_period_end) subEnd = new Date(sub.current_period_end * 1000).toISOString();
          } catch (e) { console.error('Nepavyko gauti prenumeratos periodo:', e.message); }
        }
        if (!subEnd) { const end = new Date(); end.setMonth(end.getMonth() + 1); subEnd = end.toISOString(); }

        // Pagrindinis (garantuotų stulpelių) atnaujinimas
        await supa().from('users').update({ plan: 'pro', subscription_end: subEnd }).eq('id', userId);
        // Best-effort kliento ID
        if (session.customer) await saveCustomerId(userId, session.customer);
      }
    }

    // Pratęsimas po kiekvieno sėkmingo mokėjimo
    if (event.type === 'invoice.payment_succeeded') {
      const inv = event.data.object;
      if (inv.customer && inv.lines?.data?.[0]?.period?.end) {
        const end = new Date(inv.lines.data[0].period.end * 1000).toISOString();
        try {
          await supa().from('users').update({ plan: 'pro', subscription_end: end }).eq('stripe_customer_id', inv.customer);
        } catch (e) { console.error('Pratęsimo update nepavyko:', e.message); }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await supa().from('users').update({ plan: 'free', subscription_end: null }).eq('id', userId);
      } else if (sub.customer) {
        try {
          await supa().from('users').update({ plan: 'free', subscription_end: null }).eq('stripe_customer_id', sub.customer);
        } catch (e) { console.error('Atšaukimo update nepavyko:', e.message); }
      }
    }
  } catch (e) {
    console.error('Webhook apdorojimo klaida:', e.message);
    // 200 vis tiek — kad Stripe nekartotų be galo dėl mūsų DB klaidos
  }

  return res.status(200).json({ received: true });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };

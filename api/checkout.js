// ═══════════════════════════════════════════════════════════
// BIDWISE AI — Stripe checkout sesijos kūrimas
// Frontend kviečia POST /api/checkout (žr. public/index.html).
// SVARBU: failas TURI vadintis checkout.js, kad sutaptų su frontend keliu.
// Anksčiau buvo create-checkout.js — dėl to /api/checkout grąžindavo
// index.html (catch-all), ir apmokėjimas tyliai lūždavo.
// ═══════════════════════════════════════════════════════════
const { asyncHandler, authError, validationError, serverError } = require('../middleware/errorHandler');
const { validate, checkoutSchema } = require('../validation/analyzeSchema');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../middleware/logger');
const { verifyToken, applyCors } = require('./security');

const SITE_URL = (process.env.SITE_URL || 'https://www.bidwiseai.lt').replace(/\/+$/, '');

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') throw validationError([{ field: 'method', message: 'POST required' }]);

  const user = verifyToken(req);
  if (!user) throw authError('Prisijunkite');

  const validation = validate(req.body || {}, checkoutSchema);
  if (validation.error) throw validationError(validation.details);
  const { plan } = validation.value;

  if (!process.env.STRIPE_SECRET_KEY) throw serverError('Mokėjimai laikinai nepasiekiami');
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const priceId = plan === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
  if (!priceId) throw serverError('Pasirinktas planas šiuo metu neprieinamas');

  // El. paštą paimam iš DB (patikima), o ne iš žetono — kad Stripe žinotų pirkėją
  let email = user.email;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data } = await supabase.from('users').select('email').eq('id', user.id).single();
      if (data?.email) email = data.email;
    } catch (e) { logger.warn('Checkout: nepavyko paimti el. pašto', { err: e.message }); }
  }

  const origin = SITE_URL;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // client_reference_id IR metadata — kad webhook patikimai rastų vartotoją
      client_reference_id: user.id,
      customer_email: email || undefined,
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/?canceled=true`,
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } }
    });

    logger.info('Checkout session created', { userId: user.id, plan });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    logger.error('Checkout error:', e.message);
    throw serverError('Nepavyko pradėti apmokėjimo. Bandykite vėliau.');
  }
});

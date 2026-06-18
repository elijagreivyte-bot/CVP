const { asyncHandler, authError, validationError, serverError } = require('../middleware/errorHandler');
const { validate, checkoutSchema } = require('../validation/analyzeSchema');
const Stripe = require('stripe');
const { logger } = require('../middleware/logger');
const { verifyToken, applyCors } = require('./security');

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) throw authError('Prisijunkite');

  const validation = validate(req.body || {}, checkoutSchema);
  if (validation.error) throw validationError(validation.details);
  const { plan } = validation.value;

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const priceId = plan === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.origin || 'https://bidwise.lt'}?success=true`,
      cancel_url: `${req.headers.origin || 'https://bidwise.lt'}?canceled=true`,
      metadata: { user_id: user.id }
    });
    
    logger.info('Checkout session created', { userId: user.id, plan });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    throw serverError(e.message);
  }
});

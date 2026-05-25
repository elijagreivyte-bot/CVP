const { asyncHandler, authError, validationError, serverError } = require('../middleware/errorHandler');
const { validate, checkoutSchema } = require('../validation/analyzeSchema');
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');
const { logger } = require('../middleware/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

module.exports = asyncHandler(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  let user;
  try { user = jwt.verify(auth, JWT_SECRET); } catch { throw authError('Prisijunkite'); }

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

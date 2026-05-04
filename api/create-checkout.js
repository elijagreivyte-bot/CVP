// create-checkout.js
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'bidwise-secret-2025';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  let user;
  try { user = jwt.verify(auth, JWT_SECRET); } catch { return res.status(401).json({ error: 'Prisijunkite' }); }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const { plan } = req.body || {};
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
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

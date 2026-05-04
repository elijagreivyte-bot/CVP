const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const raw = req.body;
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).json({ error: 'Webhook klaida: ' + e.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    if (userId) {
      const end = new Date();
      end.setMonth(end.getMonth() + 1);
      await supabase.from('users').update({ plan: 'pro', subscription_end: end.toISOString() }).eq('id', userId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data: users } = await supabase.from('users').select('id').eq('stripe_customer_id', sub.customer);
    if (users?.[0]) {
      await supabase.from('users').update({ plan: 'free', subscription_end: null }).eq('id', users[0].id);
    }
  }

  return res.status(200).json({ received: true });
};

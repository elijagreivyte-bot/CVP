// ═══════════════════════════════════════════════════════════
// BIDWISE AI — verslo metrikų skaičiavimas
// Sąmoningai NEDUBLIUOJA to, ką jau geriau daro PostHog (funnel'ai,
// retention, DAU/WAU/MAU, sesijos trukmė) — tam žr. PostHog dashboard.
// Čia skaičiuojame TIK tai, ko PostHog nežino: pajamas, planų
// pasiskirstymą ir analizių/chat naudojimą iš pačios DB.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');

// Kainos turi sutapti su public/index.html kainodaros sekcija.
// Jei kainos pasikeis, atnaujink ir čia — kitaip MRR bus neteisingas.
const PRICE_PRO = 49;
const PRICE_TEAM = 99;

function supa() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

async function computeMetrics() {
  const supabase = supa();
  const now = new Date();
  const d7 = new Date(now - 7 * 86400000).toISOString();
  const d14 = new Date(now - 14 * 86400000).toISOString();
  const d30 = new Date(now - 30 * 86400000).toISOString();

  const [
    { count: totalUsers },
    { count: freeUsers },
    { count: proUsers },
    { count: teamUsers },
    { count: newUsers7d },
    { count: newUsersPrev7d }, // 14–7 dienų atgal, palyginimui su šia savaite
    { count: totalAnalyses },
    { count: analyses7d },
    { count: analysesPrev7d },
    { count: freeChatUsed }, // free vartotojai, kurie IŠNAUDOJO savo 1 nemokamą klausimą (užsiėmę)
    { count: freeUsersTotal },
    { count: lockedAccounts }, // šiuo metu užrakintos paskyros (brute-force apsauga suveikė)
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'free'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'team'),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', d14).lt('created_at', d7),
    supabase.from('analyses').select('id', { count: 'exact', head: true }),
    supabase.from('analyses').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    supabase.from('analyses').select('id', { count: 'exact', head: true }).gte('created_at', d14).lt('created_at', d7),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'free').eq('free_chat_left', 0),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'free'),
    supabase.from('users').select('id', { count: 'exact', head: true }).not('locked_until', 'is', null).gt('locked_until', now.toISOString()),
  ]);

  const mrr = (proUsers || 0) * PRICE_PRO + (teamUsers || 0) * PRICE_TEAM;
  const payingUsers = (proUsers || 0) + (teamUsers || 0);
  const conversionRate = totalUsers ? +((payingUsers / totalUsers) * 100).toFixed(1) : 0;
  const avgAnalysesPerUser = totalUsers ? +((totalAnalyses || 0) / totalUsers).toFixed(2) : 0;
  const chatEngagementRate = freeUsersTotal ? +((freeChatUsed / freeUsersTotal) * 100).toFixed(1) : 0;

  const pctChange = (curr, prev) => {
    if (!prev) return curr > 0 ? 100 : 0;
    return +(((curr - prev) / prev) * 100).toFixed(1);
  };

  return {
    generated_at: now.toISOString(),
    users: { total: totalUsers || 0, free: freeUsers || 0, pro: proUsers || 0, team: teamUsers || 0 },
    new_users_7d: newUsers7d || 0,
    new_users_change_pct: pctChange(newUsers7d || 0, newUsersPrev7d || 0),
    revenue: { mrr, paying_users: payingUsers, conversion_rate_pct: conversionRate, price_pro: PRICE_PRO, price_team: PRICE_TEAM },
    analyses: {
      total: totalAnalyses || 0,
      last_7d: analyses7d || 0,
      change_pct: pctChange(analyses7d || 0, analysesPrev7d || 0),
      avg_per_user: avgAnalysesPerUser
    },
    chat_engagement_rate_pct: chatEngagementRate,
    security: { locked_accounts_now: lockedAccounts || 0 }
  };
}

// Skaičiuoja, kurie KPI krito daugiau nei `threshold`% — naudojama dienos ataskaitoje.
function flagRegressions(metrics, threshold = 10) {
  const flags = [];
  if (metrics.new_users_change_pct <= -threshold) {
    flags.push(`Naujų registracijų kritimas: ${metrics.new_users_change_pct}% (7d vs ankstesnė savaitė)`);
  }
  if (metrics.analyses.change_pct <= -threshold) {
    flags.push(`Analizių skaičiaus kritimas: ${metrics.analyses.change_pct}% (7d vs ankstesnė savaitė)`);
  }
  return flags;
}

module.exports = { computeMetrics, flagRegressions, PRICE_PRO, PRICE_TEAM };

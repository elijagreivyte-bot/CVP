// ═══════════════════════════════════════════════════════════
// BIDWISE AI — profile-save
// Išsaugo pilną įmonės profilį iš profilio vedlio (Profile Wizard).
// Skirtingai nei /api/onboarding (kuris naudoja AI generaciją),
// šis tiesiog išsaugo struktūrizuotus laukus į users.company_profile.
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./security');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: 'DB neprijungta' });

  const { company_profile } = req.body || {};
  if (!company_profile || typeof company_profile !== 'object') {
    return res.status(400).json({ error: 'company_profile būtinas' });
  }

  // Saugumo apsauga: apribojam dydį (Supabase JSONB ~1MB limit, mes laikomės iki 50KB profiliui)
  const profileSize = JSON.stringify(company_profile).length;
  if (profileSize > 50000) {
    return res.status(400).json({ error: 'Profilis per didelis (max 50KB)' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Pakraunam dabartinį profilį — kad nesusiklotų su senais laukais
    const { data: cur } = await supabase
      .from('users')
      .select('company_profile')
      .eq('id', user.id)
      .single();

    // Sujungiam: senas profilis (jei buvo) + naujas vedlio rezultatas
    // (Vedlys jau migravo senus laukus į naujus, todėl sujungimas saugus)
    const merged = { ...(cur?.company_profile || {}), ...company_profile };

    const { error } = await supabase
      .from('users')
      .update({ company_profile: merged })
      .eq('id', user.id);
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      profile_size: JSON.stringify(merged).length,
      field_count: Object.keys(merged).length
    });
  } catch (e) {
    console.error('profile-save klaida:', e);
    return res.status(500).json({ error: 'Klaida: ' + e.message });
  }
};

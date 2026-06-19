// ═══════════════════════════════════════════════════════════
// BIDWISE AI — SUMANUS ONBOARDING (patobulinta versija)
// Naudoja veiklos aprašymą + kritinius klausimus tiksliam scoring'ui
// ═══════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, applyCors } = require('./security');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

module.exports.config = { maxDuration: 30 };

async function callClaude(system, user, maxTokens = 2000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: 0.3, system, messages: [{ role: 'user', content: user }] }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error('Claude API klaida: ' + r.status);
    const data = await r.json();
    return data.content.map(c => c.text || '').join('\n');
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function parseJSON(text, fallback = {}) {
  try {
    let clean = text.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s >= 0 && e > s) clean = clean.slice(s, e + 1);
    return JSON.parse(clean);
  } catch { return fallback; }
}

// Kritiniai klausimai — universalūs, dengia svarbiausius scoring faktorius
function coreQuestions(sector) {
  return [
    { klausimas: 'Kuriuose regionuose dirbate?', tipas: 'multiselect', variantai: ['Visa Lietuva', 'Vilnius ir aplinkinės', 'Kaunas ir aplinkinės', 'Klaipėda ir aplinkinės', 'Šiauliai', 'Panevėžys', 'Kiti regionai'] },
    { klausimas: 'Kokia didžiausia projekto vertė kurią galite įgyvendinti?', tipas: 'select', variantai: ['iki 5 000 EUR', '5 000–50 000 EUR', '50 000–200 000 EUR', '200 000–500 000 EUR', '500 000 EUR+'] },
    { klausimas: 'Kokia jūsų metinė apyvarta?', tipas: 'select', variantai: ['iki 100 000 EUR', '100 000–500 000 EUR', '500 000–2 mln. EUR', 'virš 2 mln. EUR'] },
    { klausimas: 'Ar turite viešųjų pirkimų patirties?', tipas: 'select', variantai: ['Taip, reguliariai dalyvaujame', 'Taip, kelis kartus', 'Tik bandėme', 'Ne, dar neturime'] },
    { klausimas: 'Kiek metų dirbate ' + sector + ' srityje?', tipas: 'select', variantai: ['Mažiau nei 1 metai', '1–3 metai', '3–5 metai', '5–10 metų', 'Daugiau nei 10 metų'] },
    { klausimas: 'Kiek darbuotojų/brigadų turite šiam darbui?', tipas: 'select', variantai: ['1–5', '6–15', '16–50', '50+'] },
    { klausimas: 'Kokius sertifikatus ar licencijas turite?', tipas: 'text', variantai: [] },
    { klausimas: 'Ar turite ISO ar kitus kokybės vadybos sertifikatus?', tipas: 'select', variantai: ['Taip', 'Ne', 'Ruošiamės gauti'] },
    { klausimas: 'Ar esate dalyvavę su jungtinės veiklos partneriais ar subtiekėjais?', tipas: 'select', variantai: ['Taip, dažnai', 'Taip, kelis kartus', 'Ne, dirbame savarankiškai'] },
    { klausimas: 'Kokia jūsų finansinė padėtis (bankroto/restruktūrizavimo procesai)?', tipas: 'select', variantai: ['Stabili, jokių procesų', 'Yra mažų finansinių sunkumų', 'Vykdomas restruktūrizavimas'] },
    { klausimas: 'Kokia jūsų kainodaros strategija konkursuose?', tipas: 'select', variantai: ['Konkuruojame kaina', 'Konkuruojame kokybe/patirtimi', 'Subalansuota'] },
    { klausimas: 'Kokio tipo konkursų vengiate ar nepageidaujate?', tipas: 'text', variantai: [] },
    { klausimas: 'Kokie jūsų stipriausi konkurenciniai pranašumai?', tipas: 'text', variantai: [] },
    { klausimas: 'Ar turite patirties su avansiniais mokėjimais ir ilgais atsiskaitymo terminais?', tipas: 'select', variantai: ['Taip, priimtina', 'Tik su avansu', 'Stengiamės vengti'] }
  ];
}

// Normalizuoja naują grupinę klausimo struktūrą į plokščią formą, kurią naudoja frontend formos
function normalizeQuestion(k, group) {
  const typeMap = {
    pasirinkimas: 'select',
    keli_pasirinkimai: 'multiselect',
    taip_ne: 'select',
    skaicius: 'number',
    valiuta: 'number',
    procentai: 'number',
    data: 'date',
    failas: 'text',
    tekstas: 'text'
  };
  let variantai = k.pasirinkimai || [];
  if (k.atsakymo_tipas === 'taip_ne') variantai = ['Taip', 'Ne'];
  return {
    id: k.id || '',
    klausimas: k.klausimas || k.lauko_pavadinimas || '',
    paaiskinimas: k.paaiskinimas_vartotojui || '',
    tipas: typeMap[k.atsakymo_tipas] || 'text',
    variantai,
    privalomas: !!k.privalomas,
    grupe: group ? group.grupes_pavadinimas : ''
  };
}

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodas neleidžiamas' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Neprisijungta' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI nepasiekiamas' });

  const step = req.body?.step || req.body?.action || '';

  // ── PASIŪLYTI SRITĮ pagal veiklos aprašymą (AI klasifikacija) ──
  if (step === 'suggest-sector') {
    const { activity } = req.body;
    if (!activity || activity.length < 10) return res.status(400).json({ error: 'Aprašykite veiklą' });

    const SEKTORIAI = [
      'Statybos ir remontas', 'IT ir programinė įranga', 'Medicinos įranga ir farmacija',
      'Švietimas ir mokymai', 'Valymo paslaugos', 'Maisto tiekimas ir maitinimas',
      'Transportas ir logistika', 'Konsultacijos ir tyrimai', 'Inžinerinės paslaugos',
      'Aplinkosauga ir želdynas', 'Saugos ir apsaugos paslaugos'
    ];

    try {
      const system = `Tu esi viešųjų pirkimų klasifikatorius. Iš įmonės veiklos aprašymo nustatyk tinkamiausią sritį ir ištrauk visas veiklas. Atsakyk TIK JSON.`;
      const userMsg = `Įmonės veiklos aprašymas:
"${activity}"

Galimos sritys:
${SEKTORIAI.map((s, i) => (i + 1) + '. ' + s).join('\n')}
12. Kita

Nustatyk VISAS tinkamas sritis iš sąrašo (įmonė gali dirbti keliose). Jei veikla apima kelias sritis — nurodyk visas. Ištrauk atpažintas veiklas. Grąžink JSON:
{
  "sektoriai": ["tinkama sritis 1", "sritis 2"],
  "sektorius": "pagrindinė (svarbiausia) sritis",
  "veiklos": ["atpažinta veikla 1", "veikla 2", "veikla 3"],
  "aprasymas": "patobulintas struktūruotas veiklos aprašymas (2-3 sakiniai)",
  "paaiskinimas": "trumpas paaiškinimas kodėl šios sritys tinka (1 sakinys)"
}`;

      const aiRes = await callClaude(system, userMsg, 1200);
      const parsed = parseJSON(aiRes, {});
      if (!parsed.sektorius && !parsed.sektoriai) {
        return res.status(200).json({ sektorius: 'Kita', sektoriai: ['Kita'], veiklos: [], aprasymas: activity, paaiskinimas: 'Veikla apima kelias sritis.' });
      }
      // Užtikrinam kad būtų ir sektorius, ir sektoriai
      if (!parsed.sektoriai && parsed.sektorius) parsed.sektoriai = [parsed.sektorius];
      if (!parsed.sektorius && parsed.sektoriai && parsed.sektoriai.length) parsed.sektorius = parsed.sektoriai[0];
      return res.status(200).json(parsed);
    } catch (e) {
      console.error('Sektoriaus nustatymo klaida:', e);
      return res.status(200).json({ sektorius: 'Kita', veiklos: [], aprasymas: activity, paaiskinimas: 'Nepavyko automatiškai nustatyti.' });
    }
  }


  // ── GENERUOTI KLAUSIMUS ──
  if (step === 'questions' || step === 'generate-questions') {
    const { name, sector, activity } = req.body;
    if (!sector) return res.status(400).json({ error: 'Nurodykite veiklos sritį' });

    try {
      const system = `Tu esi viešųjų pirkimų, tiekėjų kvalifikacijos ir EBVPD/ESPD analizės ekspertas.

Tavo užduotis: pagal įmonės veiklos sritį / specialybę sugeneruoti išsamų įmonės profilio klausimyną, kurį tiekėjas užpildys po registracijos. Šis klausimynas vėliau bus naudojamas AI konkurso analizei, kad AI galėtų įvertinti:
1. ar įmonė atitinka konkretaus viešojo pirkimo reikalavimus;
2. kokių dokumentų įmonei gali trūkti;
3. ar įmonė turi tinkamą patirtį, darbuotojus, sertifikatus, apyvartą, pajėgumus;
4. ar įmonei verta dalyvauti konkurse;
5. kokia preliminari tikimybė laimėti;
6. kaip pildyti EBVPD/ESPD;
7. kokios yra įmonės stiprybės ir silpnybės konkrečiame konkurse.

Svarbu:
- Klausimynas turi būti pritaikytas konkrečiai veiklos sričiai.
- Nekurk vien bendrų klausimų.
- Klausimai turi surinkti realius duomenis, kuriuos vėliau galima lyginti su konkurso sąlygomis.
- Klausimai turi būti aiškūs verslo žmogui, ne tik teisininkui.
- Įtrauk klausimus apie EBVPD/ESPD, pašalinimo pagrindus, kvalifikaciją, patirtį, finansinį pajėgumą, techninį pajėgumą, dokumentus, sertifikatus, darbuotojus, subtiekėjus, regionus, kainodarą ir rizikos ribas.
- Kiekvienam klausimui nurodyk atsakymo tipą.
- Klausimai turi būti tinkami naudoti frontend formoje.
- Grąžink tik validų JSON. Jokio teksto prieš ar po JSON.

Klausimyno grupės privalo apimti bent:
1. Įmonės pagrindiniai duomenys
2. Veiklos sritis ir specializacija
3. Teikiamos paslaugos / prekės / darbai
4. Viešųjų pirkimų patirtis
5. Panašios sutartys ir jų vertės
6. Apyvarta ir finansinis pajėgumas
7. Darbuotojai, specialistai, brigados, komanda
8. Įranga, technologijos, įrankiai, transportas, jei aktualu
9. Sertifikatai, leidimai, licencijos
10. Kokybės, aplinkosaugos, saugos standartai
11. Regionai, kuriuose įmonė gali vykdyti sutartis
12. Maksimali projekto vertė, kurią įmonė gali saugiai vykdyti
13. Subtiekėjai ir partneriai
14. Jungtinė veikla
15. EBVPD/ESPD pašalinimo pagrindai
16. Kainodaros strategija
17. Rizikos, kurių įmonė nori vengti
18. Stiprybės ir konkurenciniai pranašumai
19. Silpnos vietos ir ribojimai
20. Dokumentai, kuriuos įmonė jau turi`;

      const userMsg = `ĮMONĖS VEIKLOS SRITIS / SPECIALYBĖ:
${sector}

PAPILDOMAS APRAŠYMAS, JEI YRA:
${activity || (name ? 'Įmonė: ' + name : 'Nepateiktas')}

Sugeneruok JSON pagal šią struktūrą:

{
  "specialybe": "",
  "klausimyno_pavadinimas": "",
  "klausimyno_tikslas": "",
  "profilio_laukai": {
    "rekomenduojami_capability_tags": [],
    "rekomenduojami_rizikos_tags": [],
    "rekomenduojami_dokumentu_tags": []
  },
  "klausimu_grupes": [
    {
      "grupes_id": "A",
      "grupes_pavadinimas": "",
      "aprasymas": "",
      "klausimai": [
        {
          "id": "A1",
          "lauko_pavadinimas": "",
          "klausimas": "",
          "paaiskinimas_vartotojui": "",
          "atsakymo_tipas": "tekstas | taip_ne | skaicius | data | failas | pasirinkimas | keli_pasirinkimai | valiuta | procentai",
          "pasirinkimai": [],
          "privalomas": true,
          "naudojama_konkurso_analizei": true,
          "naudojama_EBVPD_ESPD": false,
          "EBVPD_sritis": "",
          "kaip_AI_naudos_atsakyma": "",
          "rizika_jei_neuzpildyta": "zema | vidutine | auksta | kritine",
          "priklausomybes": {
            "rodyti_jei": "",
            "jei_taip_papildomi_klausimai": [],
            "jei_ne_papildomi_klausimai": []
          }
        }
      ]
    }
  ],
  "minimalus_profilis_analizei": ["kokie klausimai privalomi, kad AI galėtų bent preliminariai vertinti konkursą"],
  "stipraus_profilio_kriterijai": ["kokie atsakymai rodytų, kad įmonė šioje srityje stipri"],
  "silpno_profilio_signalai": ["kokie atsakymai rodytų, kad įmonė dažnai neatitiks konkursų"],
  "rekomenduojami_failai": [
    {"dokumento_pavadinimas": "", "kam_reikalingas": "", "kada_naudojamas": "registracijoje | konkurso analizeje | EBVPD | po laimejimo", "ar_privalomas": true}
  ]
}`;

      const aiRes = await callClaude(system, userMsg, 6000);
      const parsed = parseJSON(aiRes, {});
      const groups = parsed.klausimu_grupes;

      let questions = [];
      if (Array.isArray(groups) && groups.length) {
        groups.forEach(g => {
          (g.klausimai || []).forEach(k => {
            questions.push(normalizeQuestion(k, g));
          });
        });
      }
      if (!questions.length) questions = coreQuestions(sector);

      return res.status(200).json({
        questions,
        klausimynoMeta: {
          specialybe: parsed.specialybe || sector,
          klausimyno_pavadinimas: parsed.klausimyno_pavadinimas || '',
          profilio_laukai: parsed.profilio_laukai || {},
          minimalus_profilis_analizei: parsed.minimalus_profilis_analizei || [],
          stipraus_profilio_kriterijai: parsed.stipraus_profilio_kriterijai || [],
          silpno_profilio_signalai: parsed.silpno_profilio_signalai || [],
          rekomenduojami_failai: parsed.rekomenduojami_failai || []
        }
      });
    } catch (e) {
      console.error('Klausimų klaida:', e);
      return res.status(200).json({ questions: coreQuestions(sector) });
    }
  }

  // ── SUKURTI PROFILĮ ──
  if (step === 'profile' || step === 'create-profile') {
    const { name, sector, answers, activity, klausimynoMeta } = req.body;
    if (!sector) return res.status(400).json({ error: 'Trūksta duomenų' });

    try {
      let answersText = '';
      const klausimynas = {};
      if (answers && typeof answers === 'object') {
        for (const [k, v] of Object.entries(answers)) {
          if (v) { answersText += `${k}: ${v}\n`; klausimynas[k] = v; }
        }
      }

      const system = `Tu esi viešųjų pirkimų ekspertas. Sukurk išsamų struktūruotą įmonės profilį AI konkursų analizei. Iš veiklos aprašymo ištrauk visas paslaugas ir gebėjimus (capability tags). Atsakyk TIK JSON.`;
      const userMsg = `Įmonė: ${name || 'Nenurodyta'}
Pagrindinė sritis: ${sector}
${activity ? 'Veiklos aprašymas: ' + activity : ''}

Klausimyno atsakymai:
${answersText || 'Nepateikta'}

Sukurk išsamų profilį. Grąžink JSON:
{
  "specializacija": "konkreti specializacija",
  "veiklos": ["visos paslaugos/veiklos kurias teikia — ištrauk iš aprašymo"],
  "capabilityTags": ["gebėjimų žymos angliškai ir lietuviškai paieškai"],
  "regionai": ["kuriuose regionuose dirba"],
  "maxProjektoVerte": "didžiausia projekto vertė",
  "apyvarta": "metinė apyvarta",
  "darbuotojai": "darbuotojų/brigadų skaičius",
  "patirtis": "patirtis metais ir objektų tipai",
  "viesPirkPatirtis": "viešųjų pirkimų patirties lygis",
  "sertifikatai": ["sertifikatai/licencijos"],
  "stiprybes": ["3-4 stiprybės konkursams"],
  "silpnybes": ["1-2 ribojimai"],
  "vengia": ["ko įmonė vengia"],
  "kainuStrategija": "rekomenduojama kainodaros strategija",
  "profilioSantrauka": "3-4 sakinių santrauka apie įmonę, jos pajėgumus ir poziciją viešųjų pirkimų rinkoje"
}`;

      const aiRes = await callClaude(system, userMsg, 2500);
      const aiProfile = parseJSON(aiRes, {});

      const fullProfile = {
        name: name || '',
        sector,
        activity: activity || '',
        ...aiProfile,
        klausimynas,
        klausimynoMeta: klausimynoMeta || null,
        sukurta: new Date().toISOString()
      };

      if (process.env.SUPABASE_URL) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await supabase.from('users').update({ company_profile: fullProfile }).eq('id', user.id);
      }

      return res.status(200).json({ profile: fullProfile });
    } catch (e) {
      console.error('Profilio klaida:', e);
      const fallback = { name: name || '', sector, activity: activity || '', klausimynas: answers || {}, profilioSantrauka: `${name || 'Įmonė'} veikia ${sector} srityje. ${activity || ''}`.trim() };
      if (process.env.SUPABASE_URL) {
        try {
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
          await supabase.from('users').update({ company_profile: fallback }).eq('id', user.id);
        } catch {}
      }
      return res.status(200).json({ profile: fallback });
    }
  }

  return res.status(400).json({ error: 'Nežinomas žingsnis' });
};

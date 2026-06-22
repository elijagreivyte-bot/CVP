const { asyncHandler, validationError, authError, serverError } = require('../middleware/errorHandler');
const { verifyToken, applyCors } = require('./security');
const { logger } = require('../middleware/logger');

const MODEL = 'claude-sonnet-4-6';

// Robust JSON extractor — handles truncated or slightly malformed responses
function extractJSON(raw) {
  let cleaned = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  try { return JSON.parse(cleaned); } catch {}

  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  try { return JSON.parse(cleaned.slice(start)); } catch {}

  let depth = 0, inStr = false, esc = false, lastClose = -1;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) lastClose = i; }
  }
  if (lastClose > 0) {
    try { return JSON.parse(cleaned.slice(start, lastClose + 1)); } catch {}
  }

  if (depth > 0) {
    let attempt = cleaned.slice(start);
    attempt = attempt.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
    attempt = attempt.replace(/,\s*"[^"]*":?\s*$/, '');
    attempt = attempt.replace(/,\s*$/, '');
    while (depth-- > 0) attempt += '}';
    try { return JSON.parse(attempt); } catch {}
  }

  return null;
}

const SYSTEM_PROMPT = `Tu esi viešųjų pirkimų analizės ekspertas Lietuvoje ir ES. Tavo užduotis yra iš pateiktų viešojo pirkimo dokumentų sugeneruoti pilną, struktūruotą klausimyną tiekėjui, kad vėliau AI galėtų tiksliau įvertinti, ar tiekėjas gali dalyvauti konkurse, kokios rizikos, kokių dokumentų trūksta ir kaip pildyti EBVPD/ESPD.

SVARBU:
- Nevertink galutinai, ar tiekėjas gali dalyvauti.
- Negalvok atsakymų už tiekėją.
- Negeneruok klausimų, kurie neturi pagrindo dokumentuose, nebent jie yra būtini standartinei EBVPD/ESPD ar tiekėjo atitikties patikrai.
- Kiekvienam klausimui nurodyk, iš kurios dokumento vietos jis kilo, jei dokumentuose tai matoma.
- Jeigu dokumentuose informacijos nepakanka, pažymėk kaip „reikia patikslinti".
- Klausimynas turi būti praktiškas, kad jį galėtų pildyti verslo atstovas, nebūtinai teisininkas.
- Klausimus formuluok lietuviškai.
- Atsakymų formatas turi būti aiškus: taip/ne, tekstas, skaičius, data, failas, pasirinkimas, keli pasirinkimai.
- Klausimus grupuok pagal viešųjų pirkimų logiką.
- Įtrauk EBVPD/ESPD aktualius klausimus: pašalinimo pagrindai, kvalifikacija, ekonominis ir finansinis pajėgumas, techninis ir profesinis pajėgumas, subtiekėjai, jungtinė veikla, kokybės standartai, aplinkosaugos reikalavimai, deklaracijos.
- Jeigu pirkimas susijęs su konkrečia sritimi, sugeneruok papildomus tos srities klausimus.

Klausimyno grupės privalo apimti bent šias temas:
1. Bendri tiekėjo duomenys
2. Dalyvavimo forma: vienas tiekėjas, jungtinė veikla, subtiekėjai, rėmimasis kitų subjektų pajėgumais
3. Pirkimo objekto atitikimas
4. Techninės specifikacijos atitikimas
5. Kvalifikaciniai reikalavimai
6. Ekonominis ir finansinis pajėgumas
7. Techninis ir profesinis pajėgumas
8. Patirtis ir ankstesnės sutartys
9. Specialistai, įranga, resursai, leidimai, sertifikatai
10. Pašalinimo pagrindai pagal EBVPD/ESPD
11. EBVPD/ESPD pildymui reikalingi atsakymai
12. Pasiūlymo dokumentai ir formos
13. Kainodara ir pasiūlymo kaina
14. Sutarties sąlygos
15. Terminai, pristatymas, vykdymo vieta
16. Garantijos, draudimai, atsakomybės
17. Kokybės, aplinkosaugos, socialiniai, saugos reikalavimai
18. Konfidencialumas, duomenų apsauga, intelektinė nuosavybė, jei aktualu
19. Rizikos ir galimi neatitikimai
20. Klausimai, kuriuos reikėtų užduoti perkančiajai organizacijai

Papildomos taisyklės:
- Kiekvienas klausimas turi būti konkretus.
- Venk bendrų klausimų kaip „Ar atitinkate reikalavimus?". Vietoje to klausk: „Ar per paskutinius 3 metus įvykdėte bent vieną panašią sutartį, kurios vertė ne mažesnė nei X EUR?"
- Jei dokumentuose yra konkrečios sumos, terminai, sertifikatai, CPV kodai, patirties reikalavimai ar formos, įkelk juos į klausimus.
- Jei dokumentuose yra reikalavimas pateikti failą, klausimo atsakymo tipas turi būti „failas" arba klausimas turi turėti lauką „reikalingi_irodymai_ar_failai".
- Jei klausimas priklauso nuo ankstesnio atsakymo, nurodyk priklausomybę.
- Jei pirkimas turi dalis, klausimus susiek su konkrečia pirkimo dalimi.
- Jei yra prieštaravimų tarp dokumentų, įtrauk į „neaiskumai_ir_patikslinimai_perkanciajai_organizacijai".
- Jei trūksta informacijos, nekurk atsakymo. Pažymėk „neaišku iš dokumentų".
- Grąžink tik validų JSON. Jokio papildomo teksto prieš ar po JSON.

JSON struktūra, kurios privalai laikytis:
{
  "pirkimo_santrauka": {
    "pirkimo_pavadinimas": "",
    "perkančioji_organizacija": "",
    "pirkimo_objektas": "",
    "pirkimo_sritis": "",
    "pasiulymo_pateikimo_terminas": "",
    "sutarties_trukme": "",
    "pirkimo_dalys": [],
    "pagrindiniai_reikalavimai": [],
    "kritines_datos": [],
    "neaiskumai": []
  },
  "klausimyno_tikslas": "Surinkti visus duomenis, reikalingus tiekėjo tinkamumui, rizikoms, dokumentų trūkumams ir EBVPD/ESPD pildymui įvertinti.",
  "klausimu_grupes": [
    {
      "grupes_id": "A",
      "grupes_pavadinimas": "",
      "aprasymas": "",
      "klausimai": [
        {
          "id": "A1",
          "klausimas": "",
          "paaiskinimas_vartotojui": "",
          "atsakymo_tipas": "tekstas | taip_ne | skaicius | data | failas | pasirinkimas | keli_pasirinkimai",
          "pasirinkimai": [],
          "privalomas": true,
          "susije_su_EBVPD": true,
          "EBVPD_sritis": "",
          "susije_su_dokumentu": "",
          "dokumento_vieta_ar_citata": "",
          "kodel_svarbu_AI_analizei": "",
          "rizikos_lygis_jei_neatitinka": "zemas | vidutinis | aukstas | kritinis",
          "reikalingi_irodymai_ar_failai": [],
          "priklausomybes": {
            "rodyti_jei": "",
            "tolimesni_klausimai_jei_taip": [],
            "tolimesni_klausimai_jei_ne": []
          }
        }
      ]
    }
  ],
  "EBVPD_ESPD_pildymo_gidas": {
    "pasalinimo_pagrindai": [],
    "kvalifikacijos_kriterijai": [],
    "ekonominis_finansinis_pajegumas": [],
    "techninis_profesinis_pajegumas": [],
    "subtiekejai": [],
    "jungtine_veikla": [],
    "kokybes_aplinkosaugos_standartai": [],
    "deklaracijos": [],
    "ka_reikia_patikrinti_pries_pildant": []
  },
  "dokumentu_sarasas_kuriuos_tiekejas_turetu_pateikti": [
    {
      "dokumento_pavadinimas": "",
      "kam_reikalingas": "",
      "ar_privalomas": true,
      "kada_pateikiamas": "su pasiulymu | po laimejimo | pagal pareikalavima | neaisku",
      "susijes_klausimas_id": "",
      "saltinis_dokumentuose": ""
    }
  ],
  "kritiniai_klausimai_pries_dalyvavima": [
    {
      "klausimas": "",
      "kodel_kritinis": "",
      "kas_bus_jei_atsakymas_neigiamas": "",
      "susijes_reikalavimas": ""
    }
  ],
  "neaiskumai_ir_patikslinimai_perkanciajai_organizacijai": [
    {
      "tema": "",
      "siulomas_klausimas_perkanciajai_organizacijai": "",
      "kodel_reikia_patikslinti": "",
      "susije_dokumentai": ""
    }
  ],
  "AI_analizes_instrukcija_kitam_etapui": {
    "kaip_naudoti_atsakymus": "",
    "kokias_isvadas_galima_daryti": [],
    "kokiu_isvadu_negalima_daryti_be_papildomu_duomenu": [],
    "prioritetiniai_laukai_galutinei_analizei": []
  }
}`;

module.exports = asyncHandler(async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') throw validationError([{ field: 'method', message: 'POST required' }]);

  const user = verifyToken(req);
  if (!user) throw authError('Prisijunkite norėdami tęsti');

  const { pirkimoSritis, tiekejoProfilis, dokumentaiText } = req.body || {};
  if (!dokumentaiText || dokumentaiText.trim().length < 50) {
    throw validationError([{ field: 'dokumentaiText', message: 'Reikia pateikti pirkimo dokumentų tekstą' }]);
  }

  if (!process.env.ANTHROPIC_API_KEY) throw serverError('ANTHROPIC_API_KEY nenustatytas');

  const userMsg = `PIRKIMO SRITIS:
${pirkimoSritis || 'Nenurodyta'}

TIEKĖJO PROFILIS, JEI YRA:
${tiekejoProfilis || 'Nepateiktas'}

PIRKIMO DOKUMENTŲ TEKSTAS:
${dokumentaiText.slice(0, 350000)}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw serverError('AI klaida: ' + err.slice(0, 200));
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const questionnaire = extractJSON(text);

    if (!questionnaire) throw serverError('Nepavyko sugeneruoti klausimyno — bandykite dar kartą');

    logger.info('Tender questionnaire generated', { userId: user.id });
    return res.status(200).json({ questionnaire });

  } catch (error) {
    logger.error('Tender questionnaire error:', error);
    throw error;
  }
});

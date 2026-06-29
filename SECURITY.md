# Bidwise AI — Saugumo apžvalga

Ši apžvalga atspindi **realią** dabartinę architektūrą: statinis frontend
(`public/index.html`) + Vercel serverless funkcijos (`api/*.js`) + Supabase
(Postgres, ES regionas). Express, Helmet ir `express-rate-limit` **nenaudojami** —
tai serverless, ne ilgai veikiantis Node serveris.

## Autentifikacija
- Pasirinktinė JWT autentifikacija (ne Supabase Auth).
- Žetonai pasirašomi `JWT_SECRET` (fail-closed: jei kintamojo nėra, sistema
  atsisako generuoti/tikrinti žetonus — žr. `api/security.js`).
- Žetonas galioja 30 d.; slaptažodžio atstatymo žetonas — 1 val.
- Slaptažodžiai saugomi su `bcrypt` (10 raundų).
- Apsaugotiems endpoint'ams būtina: `Authorization: Bearer <token>`.

## Autorizacija ir kvotos
- Nuosavybės patikra: visi DB veiksmai filtruojami pagal `user_id`.
- Nemokamo plano kvota (`free_analyses_left`) tikrinama IR mažinama
  **serverio pusėje** (`api/analyze-agents.js`) — ne tik frontend'e. Išnaudojus
  kvotą grąžinamas `403` su `code: QUOTA_EXCEEDED`.
- `chat` režimas prieinamas tik `pro`/`team` planams.

## Įvesties validacija
- `Joi` schemos (`validation/analyzeSchema.js`) auth, profilio, projektų,
  istorijos, chat ir checkout endpoint'ams (`stripUnknown: true`).
- Dokumento tekstas serveryje valomas nuo HTML žymų prieš perduodant AI.
- Profilio ir dokumento dydžio ribos taikomos prieš DB įrašymą.

## Mokėjimai (Stripe)
- Checkout sesija kuriama serveryje (`api/checkout.js`); `client_reference_id`
  ir `metadata.user_id` užtikrina patikimą vartotojo atpažinimą.
- Webhook (`api/stripe-webhook.js`) tikrina parašą su **raw body**
  (`bodyParser` išjungtas), naudoja `STRIPE_WEBHOOK_SECRET`.

## Duomenų apsauga
- Originalūs failai NIEKADA nepasiekia serverio — tekstas ištraukiamas naršyklėje.
- Dokumento tekstas ir chat žinutės saugomi Supabase (ES) pokalbio tęstinumui.
- Paslaptys laikomos Vercel aplinkos kintamuosiuose, ne kode (žr. `.gitignore`).

## CORS
- Šiuo metu `Access-Control-Allow-Origin: *`. Tai priimtina, nes naudojami
  Bearer žetonai (ne slapukai), todėl CSRF rizika minimali. Norint sugriežtinti —
  apriboti iki `https://www.bidwiseai.lt` `api/security.js` faile.

## Aplinkos kintamieji (būtini produkcijai)
| Kintamasis | Paskirtis |
|---|---|
| `JWT_SECRET` | JWT pasirašymas (BŪTINA, fail-closed) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | DB prieiga |
| `ANTHROPIC_API_KEY` | AI analizė ir chat |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transakciniai el. laiškai |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Mokėjimai |
| `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Planų kainos |
| `SITE_URL` | Kanoninis domenas (numatyta `https://www.bidwiseai.lt`) |
| `CRON_SECRET` | Priminimų cron apsauga (BŪTINA produkcijai) |

## Rekomendacijos tolesniam sugriežtinimui
- Užklausų dažnio ribojimas (rate limiting) per Vercel Edge Middleware arba
  Upstash — serverless funkcijos pačios būsenos neturi.
- El. pašto verifikacija registruojantis.
- Atominis kvotos mažinimas per Postgres RPC (dabar — read-then-write).

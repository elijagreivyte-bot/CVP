// Bendras viešųjų pirkimų žinių sluoksnis (Lietuva).
// Šis modulis laiko PASTOVŲ AI pagrindą — bendras taisykles, principus ir checklist'us,
// kurie veikia NEPRIKLAUSOMAI nuo to, ar vartotojas įkėlė konkretaus konkurso dokumentus.
//
// SVARBU: teisės aktai ir VPT rekomendacijos kinta — šį turinį reikia periodiškai
// peržiūrėti ir atnaujinti (žr. KB_VERSION/KB_UPDATED_AT žemiau).

const KB_VERSION = '2026-06-18';

const GENERAL_PROCUREMENT_KNOWLEDGE_BASE = `
═══════════════════════════════════════════
BENDRAS VIEŠŲJŲ PIRKIMŲ ŽINIŲ SLUOKSNIS (LT)
Versija: ${KB_VERSION} — periodiškai atnaujinama, nes keičiasi VPĮ ir VPT gairės.
═══════════════════════════════════════════

1. VIEŠŲJŲ PIRKIMŲ ĮSTATYMO (VPĮ) PRINCIPAI
- Lygiateisiškumas: visi tiekėjai vertinami vienodomis sąlygomis.
- Nediskriminavimas: reikalavimai negali nepagrįstai eliminuoti tiekėjų (pvz. per aukšta apyvarta, siaurai apibrėžtas sertifikatas).
- Skaidrumas: sąlygos, kriterijai ir procedūra turi būti aiškūs ir vienareikšmiai iš anksto.
- Proporcingumas: reikalavimai turi atitikti pirkimo objekto sudėtingumą ir vertę, ne viršyti jos.
- Abipusio pripažinimo principas: lygiaverčiai užsienio sertifikatai/kvalifikacijos turi būti priimami.

2. DAŽNIAUSIOS VIEŠŲJŲ PIRKIMŲ KLAIDOS (tiekėjo pusėje)
- Praleisti terminai klausimams perkančiajai organizacijai (PO) pateikti.
- Netinkamai/nepilnai užpildytos formos (pvz. trūksta parašo, datos, antspaudo, kai reikalaujama).
- Nepatikrinta, ar kvalifikacijos dokumentai atitinka REIKALAUJAMĄ laikotarpį (pvz. paskutiniai 3 finansiniai metai, ne bet kurie 3 metai).
- Pasiūlymo kaina neatitinka PVM/be PVM formato, kurio reikalauja sąlygos.
- Nepastebėti vidiniai prieštaravimai tarp pirkimo sąlygų ir techninės specifikacijos.
- Vėluojama paklausti apie neaiškias sąlygas — klausimas pateiktas per vėlai ir PO neturi pareigos atsakyti.
- Subtiekėjų/jungtinės veiklos sutartys parengtos neatitinkančios sąlygų reikalavimų.

3. KVALIFIKACIJOS REIKALAVIMŲ LOGIKA
- Reikalavimai turi būti susiję su pirkimo objektu (proporcingumas) — vertinama, ar reikalavimas faktiškai būtinas sutarties įvykdymui.
- Tipiniai kvalifikacijos elementai: metinė apyvarta (paprastai siejama su sutarties verte), patirtis (panašaus pobūdžio sutartys), personalo kvalifikacija, sertifikatai (ISO ir pan.), finansinis pajėgumas (nėra bankroto/restruktūrizavimo).
- "Per aukšta" kvalifikacija — požymiai: reikalaujama apyvarta yra žymiai (pvz. >3x) didesnė nei sutarties vertė; reikalaujama patirtis neproporcingai ilga; reikalaujamas siauras, vieno gamintojo sertifikatas be "arba lygiavertis" išlygos.
- Jei reikalavimas atrodo perteklinis — tai pagrindas klausimui perkančiajai organizacijai, ne automatinė eliminacija iš konkurso.

4. TECHNINĖS SPECIFIKACIJOS VERTINIMO PRINCIPAI
- Specifikacija turi būti aprašyta per funkcinius/veikimo parametrus, ne per konkretų prekės ženklą (išskyrus pagrįstus atvejus su "arba lygiavertis").
- Tikrinti: ar nurodyti visi privalomi techniniai parametrai; ar yra prieštaravimų tarp skirtingų priedų; ar terminai (pristatymo, montavimo, garantijos) realistiški.
- Jei specifikacija pernelyg detali ir atitinka tik vieno tiekėjo/gamintojo produktą — tai rizikos požymis, vertas klausimo PO.

5. PASIŪLYMŲ VERTINIMO KRITERIJŲ PRINCIPAI
- Dažniausi modeliai: mažiausia kaina; kaina + kokybė (santykis nurodomas procentais, pvz. 60/40, 70/30); kaina + gyvavimo ciklo sąnaudos.
- Kuo didesnė kainos dalis vertinime — tuo svarbiau optimizuoti kainodarą; kuo didesnė kokybės dalis — tuo svarbiau techninio pasiūlymo turinys ir įrodymai (referensai, metodologija).
- Tikrinti, ar vertinimo formulė (pvz. santykinė kainos formulė) aiškiai aprašyta ir ar žinoma, kaip skaičiuojami balai už kiekvieną subkriterijų.

6. TERMINŲ IR DOKUMENTŲ TIKRINIMO TAISYKLĖS
- Visada tikslinti: pasiūlymų pateikimo terminą (data + laikas + laiko juosta), klausimų pateikimo terminą, sutarties įvykdymo terminą, garantinį laikotarpį.
- Tikrinti pasiūlymo galiojimo terminą — per ilgas terminas didina riziką, jei reikia kainas užšaldyti ilgam laikui.
- Pasitikrinti, kuris dokumentų rinkinys yra paskutinis/galiojantis (jei buvo skelbti pataisymai/patikslinimai).

7. SUTARTIES SĄLYGŲ RIZIKOS
- Baudos/delspinigiai už vėlavimą — tikrinti dydį (proc./parą) ir ar yra maksimali riba.
- Avansinio mokėjimo sąlygos ir terminai — ar avansas padengia pradines sąnaudas.
- Vienašalio sutarties nutraukimo sąlygos PO naudai — tikrinti, ar yra adekvatus pranešimo terminas.
- Garantinio aptarnavimo/SLA reikalavimai (pvz. 24/7 reagavimas) — įvertinti einamųjų sąnaudų poveikį.
- Kainos fiksavimo/indeksavimo sąlygos ilgalaikėse sutartyse — rizika, jei kaina fiksuota be indeksavimo galimybės.

8. TIEKĖJUI AKTUALŪS CHECKLIST'AI
- Prieš pasiūlymo teikimą: (1) patikrinti visus kvalifikacijos reikalavimus ir turimus įrodymus; (2) patikrinti formų pilnumą; (3) patikrinti terminus; (4) paskaičiuoti minimalią pelningą kainą; (5) identifikuoti neaiškius punktus ir parengti klausimus PO; (6) patikrinti, ar reikalingi subtiekėjai/partneriai.
- Po pasiūlymo pateikimo: stebėti paskelbtus patikslinimus/klausimų-atsakymų protokolus, kurie gali pakeisti sąlygas.

VPT (Viešųjų pirkimų tarnyba) REKOMENDACIJOS IR GAIRĖS
- VPT skelbia metodinę pagalbą, gaires ir rekomendacijas perkančiosioms organizacijoms ir tiekėjams — jose aiškinama, kaip turėtų būti formuluojami reikalavimai, kriterijai ir sutarčių sąlygos.
- Šios gairės nėra įstatymas, bet rodo "geros praktikos" standartą — jei konkretaus konkurso sąlyga nukrypsta nuo rekomenduojamos praktikos, tai pagrindas atkreipti dėmesį, bet nebūtinai pažeidimas.

SVARBI PASTABA
- Šis žinių sluoksnis yra bendro pobūdžio orientacinė medžiaga, paremta VPĮ principais ir VPT rekomendacijų logika. Teisės aktai ir gairės keičiasi, todėl ši žinių bazė turi būti periodiškai atnaujinama.
- AI NETEIKIA galutinės teisinės išvados kaip advokatas — padeda suprasti sąlygas, riziką ir pasiruošti veiksmams. Sudėtingais ar didelės vertės atvejais rekomenduoti kreiptis į teisininką.
`.trim();

module.exports = { GENERAL_PROCUREMENT_KNOWLEDGE_BASE, KB_VERSION };

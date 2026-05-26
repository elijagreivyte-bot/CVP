// ═══════════════════════════════════════════════════════════
// BIDWISE AI — LIETUVOS VIEŠŲJŲ PIRKIMŲ ŽINIŲ BAZĖ
// Bendros taisyklės taikomos visiems CVP konkursams.
// Naudojama analizėje ir chat'e kaip AI pagrindas.
// SVARBU: konkretaus konkurso dokumentai VISADA turi pirmenybę
// prieš šią bendrą bazę.
// ═══════════════════════════════════════════════════════════

const CVP_KNOWLEDGE = `BENDROS LIETUVOS VIEŠŲJŲ PIRKIMŲ ŽINIOS (naudok kaip kontekstą, bet konkretaus konkurso dokumentai visada svarbesni):

TEISINIS PAGRINDAS:
- Pagrindinis įstatymas: Lietuvos Respublikos viešųjų pirkimų įstatymas (VPĮ).
- Komunalinio sektoriaus pirkimus reglamentuoja atskiras įstatymas (Pirkimų, atliekamų vandentvarkos, energetikos, transporto ar pašto paslaugų srities perkančiųjų subjektų, įstatymas).
- Pirkimus prižiūri Viešųjų pirkimų tarnyba (VPT).
- Konkursai skelbiami per Centrinę viešųjų pirkimų informacinę sistemą (CVP IS) adresu eviesiejipirkimai.lt.
- Ginčus dėl pirkimų pirmiausia nagrinėja perkančioji organizacija (pretenzija), vėliau — teismas.

PIRKIMŲ TIPAI:
- Atviras konkursas — gali dalyvauti visi tiekėjai, pateikę pasiūlymus.
- Ribotas konkursas — pirma vertinama kvalifikacija, tada kviečiama teikti pasiūlymus.
- Skelbiamos/neskelbiamos derybos, konkurencinis dialogas, inovacijų partnerystė — specifiniais atvejais.
- Mažos vertės pirkimai — supaprastinta tvarka mažesnėms sumoms.
- Mažos vertės ribos ir tarptautinio pirkimo vertės ribos periodiškai atnaujinamos — tikslias sumas reikia tikrinti konkretaus pirkimo dokumentuose ir VPT svetainėje.

KVALIFIKACIJOS REIKALAVIMAI (tipiniai):
- Teisė verstis veikla (registracija, licencijos jei reikia).
- Finansinis ir ekonominis pajėgumas (dažnai — minimali metinė apyvarta, kartais kelis kartus didesnė už pirkimo vertę).
- Techninis ir profesinis pajėgumas (panašių sutarčių patirtis per pastaruosius 3 metus paslaugoms/prekėms arba 5 metus darbams; specialistų kvalifikacija; technine bazė).
- Kokybės vadybos sistemos (pvz. ISO 9001), aplinkos vadybos (ISO 14001) — jei nurodyta.
- Tiekėjas neturi atitikti pašalinimo pagrindų (mokesčių/SODROS skolos, teistumas, bankrotas ir pan.).

ESPD (Europos bendrasis viešųjų pirkimų dokumentas):
- Tai tiekėjo deklaracija, kad atitinka kvalifikaciją ir neturi pašalinimo pagrindų.
- Teikiama elektroniniu būdu kartu su pasiūlymu.
- Faktinius dokumentus (pažymas) paprastai pateikia tik laimėtojas prieš sutarties sudarymą.

PASIŪLYMŲ VERTINIMAS:
- Pagal kainą (mažiausia kaina).
- Pagal kainos ir kokybės santykį (ekonomiškai naudingiausias pasiūlymas) — vertinami ir kokybiniai kriterijai.
- Pagal sąnaudas (gyvavimo ciklo kaštus).
- Vertinimo kriterijai ir jų lyginamieji svoriai (proc.) visada nurodomi pirkimo sąlygose.

TERMINAI IR PROCEDŪROS:
- Pasiūlymų pateikimo terminas nurodomas skelbime; tiekėjai gali užduoti klausimus iki nustatytos datos.
- Perkančioji organizacija privalo atsakyti į klausimus per nustatytą terminą.
- Yra "atidėjimo terminas" (standstill) tarp laimėtojo paskelbimo ir sutarties pasirašymo, per kurį galima teikti pretenzijas.
- Pretenzija perkančiajai organizacijai teikiama per VPĮ nustatytus terminus; nesutikus su atsakymu — kreipiamasi į teismą.

TIPINĖS SUTARČIŲ SĄLYGOS:
- Pasiūlymo galiojimo užtikrinimas (kartais) ir sutarties įvykdymo užtikrinimas (garantija/laidavimas).
- Netesybos (delspinigiai, baudos) už vėlavimą ar netinkamą vykdymą.
- Mokėjimo terminai (dažnai 30 dienų nuo sąskaitos).
- Garantinis laikotarpis darbams/prekėms.
- Sutarties keitimo sąlygos ribojamos VPĮ.

DAŽNOS TIEKĖJŲ KLAIDOS:
- Praleisti formalūs reikalavimai (trūksta dokumento, parašo, netinkamas formatas).
- Neatitikimas kvalifikacijai (per maža apyvarta, nepakanka patirties).
- Praleistas pasiūlymų pateikimo terminas.
- Neužtikrintas pasiūlymo/sutarties įvykdymo užtikrinimas.
- Aritmetinės klaidos pasiūlyme.`;

module.exports = { CVP_KNOWLEDGE };

# Tlač etikiet

Slovenská aplikácia na návrh a tlač etikiet na **Bluetooth tlačiarni SK58** (Sinmark)
a podobných tlačiarňach s príkazmi ESC/POS. Funguje ako webová aplikácia (PWA) priamo
v mobile – netreba nič inštalovať z obchodu, stačí ju otvoriť v prehliadači **Chrome
v Androide** a voliteľne si ju pridať na plochu.

## Čo vie

- **Domov** – stav tlačiarne, rýchle akcie **Vytvoriť**, **PDF**, **Obrázok**, **Skenovať**
  a zoznam **Posledné** (náhľad, názov, rozmer, ponuka ⋯: Tlačiť, Upraviť, Duplikovať,
  Premenovať, Zmazať).
- **Šablóny** – hotové etikety: čiarový kód EAN-13 (35×20), názov + kód, cenovka,
  skladová etiketa (Code 128), inventárne číslo s číslovaním, QR kód s textom,
  dátum výroby a spotreby, adresa odosielateľa, rámček s nápisom, biely text na čiernom…
- **Editor** – prvky **Text**, **Čiarový kód**, **QR kód**, **Obrázok**, **Dátum**,
  **Číslovanie**, **Čiara**, **Rámček/elipsa**. Prvky sa presúvajú ťahaním, veľkosť sa mení
  úchytmi, dajú sa otáčať o 90°, kopírovať, posúvať dopredu/dozadu. Vodiace čiary pri
  zarovnaní na stred a k okrajom, krok späť / znova.
  - Text: písmo, veľkosť, tučné, kurzíva, podčiarknuté, biely na čiernom, zarovnanie,
    zalamovanie, automatické zmenšenie, aby sa zmestil.
  - Premenné v texte aj v kódoch: `{datum}`, `{datum+7}` (o 7 dní), `{cas}`, `{rok}`,
    `{cislo}` (poradové číslo – pri tlači viacerých kópií sa zvyšuje a pamätá si ďalšie).
  - Čiarové kódy: EAN-13, EAN-8, UPC-A, Code 128, Code 39 (kontrolná číslica sa doplní
    sama). Kód sa dá **naskenovať fotoaparátom**.
  - Obrázky a PDF sa prevedú na čiernobiele (rastrovanie pre fotky, prah pre logá).
- **Tlač** – náhľad presne toho, čo dostane tlačiareň, upozornenia (neplatný kód, prvok
  mimo tlačiteľnej plochy), počet kópií, číslovanie, priebeh odosielania.
- **Bluetooth tlačiareň** – vyhľadanie a pripojenie, stav Pripojená/Offline, testovacia
  etiketa, rady keď sa tlačiareň nenájde.
- **Nastavenia** – nepotlačiteľný pás hore, posun vodorovne/zvislo, sýtosť, posun na
  ďalšiu etiketu (medzera / súvislý papier), spôsob posielania, veľkosť balíkov, záloha
  etikiet do súboru (export/import).

Etikety sa ukladajú v prehliadači (IndexedDB). Aplikácia funguje aj offline.

## Ako sa pripojiť k tlačiarni

1. Úplne **zatvorte aplikáciu Sinmark** (tlačiareň zvládne naraz len jedno spojenie).
2. Zapnite tlačiareň (nie len nabíjanie), v mobile zapnite Bluetooth a Polohu.
3. V aplikácii ťuknite na ikonu tlačiarne → **Vyhľadať tlačiareň** → vyberte napr.
   `SK58_D63F` → **Spárovať**.
4. Ak sa nezobrazí, zapnite **Zobraziť všetky Bluetooth zariadenia**.

Na iPhone Safari Web Bluetooth nepodporuje – dá sa použiť prehliadač **Bluefy**.

## Technické poznámky (SK58)

- BLE služba `0x18F0`, zápis do charakteristiky `0x2AF1` (bez odpovede), balíky po 20 B
  s pauzou 10 ms (nastaviteľné). Ak tlačiareň používa inú službu, aplikácia nájde prvú
  zapisovateľnú charakteristiku sama.
- Rozlíšenie 203 dpi (8 bodov/mm), tlačová hlava 384 bodov = **48 mm**. Užšia etiketa
  sa centruje, pri 50 mm etikete sa netlačí ~1 mm na každom okraji (v editore šrafované).
- Obrázok etikety sa posiela ako `ESC @`, `GS v 0` (raster, 48 B na riadok), potom
  `GS FF` (posun na ďalšiu etiketu podľa medzery). Alternatívne `ESC *` po pásoch.
- **Nepotlačiteľný pás hore** (predvolene 4 mm): po posune na ďalšiu etiketu stojí hlava
  niekoľko mm pod horným okrajom etikety. Tento pás sa z návrhu vynechá, aby obsah
  nepresiahol na ďalšiu etiketu. Presnú hodnotu zistíte **testovacou etiketou**
  (Nastavenia → Vytlačiť testovaciu etiketu): čísla na pravítku sú mm od horného okraja.
  Ak tlačiareň tlačí od samého vrchu, nastavte 0.

## Spustenie

Čisto statické súbory (`index.html`, `styles.css`, `js/`, `vendor/`, `sw.js`, …),
netreba žiadny build.

```bash
python3 -m http.server 8000
# otvorte http://localhost:8000 (Bluetooth funguje aj na localhost)
```

V mobile musí stránka bežať cez **HTTPS**. Najjednoduchšie ako Cloudflare Worker
(všetky súbory sa zabalia priamo do kódu Workera):

```bash
python3 deploy/build_worker.py . worker.js
npx wrangler deploy worker.js --name tlac-etikiet --compatibility-date 2025-01-01
```

Rovnako dobre poslúži GitHub Pages, Cloudflare Pages alebo Netlify. Potom v mobile:
menu prehliadača → **Pridať na plochu**.

## Štruktúra

| Súbor | Obsah |
| --- | --- |
| `js/app.js` | obrazovky, navigácia, tlač, nastavenia |
| `js/editor.js` | editor etikety (plátno, úchyty, panel vlastností, história) |
| `js/render.js` | vykreslenie etikety (text, kódy, QR, obrázky, tvary), premenné |
| `js/barcode.js` | kódovanie EAN-13/8, UPC-A, Code 128, Code 39 |
| `js/printer.js` | Web Bluetooth, prevod na 1-bit raster, príkazy ESC/POS |
| `js/templates.js` | šablóny a nové prvky |
| `js/scan.js`, `js/importers.js` | skener kódov, import obrázka a PDF |
| `vendor/` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) |

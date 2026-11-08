# Tlač etikiet

**Otvoriť v mobile (Chrome):** https://tlac-etikiet.virivkyonlinecz.workers.dev

Slovenská aplikácia na návrh a tlač etikiet na **Bluetooth tlačiarni SK58** (Sinmark)
a podobných tlačiarňach s príkazmi ESC/POS. Funguje ako webová aplikácia (PWA) priamo
v mobile – netreba nič inštalovať z obchodu, stačí ju otvoriť v prehliadači **Chrome
v Androide** a voliteľne si ju pridať na plochu.

## Čo vie

Funkcie zodpovedajú aplikácii Sinmark / OpenLabel, ale všetko je po slovensky.

- **Domov** – stav tlačiarne, rýchle akcie **Vytvoriť**, **PDF**, **Obrázok**, **Skenovať**,
  zoznam **Posledné** (ponuka ⋯: Tlačiť, Upraviť, Uložiť/zdieľať ako obrázok, Duplikovať,
  Premenovať, Zmazať) a **História tlače** (ikona hodín).
- **Šablóny** – čiarový kód EAN-13, názov + kód, cenovka, skladová etiketa (Code 128),
  inventárne číslo s číslovaním, tabuľka parametrov, QR kód s textom, dátum spotreby,
  adresa, kontakt s ikonami, „Krehké“ so symbolmi, rámček, biely text na čiernom…
- **Editor** – prvky **Text**, **Čiarový kód**, **QR kód**, **Obrázok**, **Tabuľka**,
  **Ikona**, **Dátum a čas**, **Číslovanie**, **Excel**, **Čiara**, **Rámček/elipsa**.
  Presun ťahaním, zmena veľkosti úchytmi, otáčanie o 90°, kopírovanie, poradie vrstiev,
  **zamknutie** prvku, **zarovnanie** k okrajom a na stred, vodiace čiary, krok späť/znova.
  - Text: písmo, veľkosť, tučné, kurzíva, podčiarknuté, biely na čiernom, zarovnanie,
    riadkovanie, rozostup písmen, zalamovanie, automatické zmenšenie.
  - Premenné v texte aj v kódoch: `{datum}`, `{datum+7}`, `{cas}`, `{den}` (deň v týždni),
    `{mesiac}`, `{rok}`, `{cislo}` (poradové číslo) a stĺpce z Excelu `{Názov stĺpca}`.
  - Čiarové kódy: EAN-13, EAN-8, UPC-A, Code 128, Code 39 (kontrolná číslica sa doplní
    sama); kód sa dá **naskenovať fotoaparátom**.
  - **Tabuľka**: riadky, stĺpce, pomer šírok, hrúbka čiar, tučná hlavička/prvý stĺpec.
  - **Ikony**: ~50 symbolov (krehké, touto stranou hore, chrániť pred vlhkom, recyklácia,
    teplota, mrazené, telefón, e-mail, web, poloha, košík, euro, bio…).
  - Obrázky a PDF sa prevedú na čiernobiele (rastrovanie pre fotky, prah pre logá).
- **Excel / CSV – hromadná tlač** – načíta `.xlsx` (aj viac hárkov, dátumy a čísla
  s formátom) alebo `.csv` (UTF-8 aj Windows-1250, oddeľovač `;` alebo `,`). Stĺpce sa
  vkladajú do textu, kódov aj tabuliek; pri tlači sa zvolí rozsah záznamov a pre každý
  riadok sa vytlačí etiketa.
- **PDF** – jedna strana do editora, alebo **tlač všetkých strán** naraz (každá strana =
  jedna etiketa, napr. štítky od prepravcu).
- **Tlač** – náhľad presne toho, čo dostane tlačiareň, upozornenia, počet kópií,
  číslovanie, rozsah záznamov z Excelu, priebeh odosielania. **Smer tlače** 0/90/180/270°.
- **Bluetooth tlačiareň** – vyhľadanie a pripojenie, stav Pripojená/Offline, testovacia
  etiketa, rady keď sa tlačiareň nenájde.
- **Ja** – moje etikety, počet vytlačených, **Pomocník**, nastavenia tlače (nepotlačiteľný
  pás, posun, sýtosť, typ papiera), rozšírené nastavenia, záloha etikiet (export/import).

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
| `js/datasource.js` | načítanie Excelu (XLSX) a CSV bez knižníc, stĺpce a záznamy |
| `js/icons.js` | knižnica ikon (vektorové cesty) |
| `js/scan.js`, `js/importers.js` | skener kódov, import obrázka a PDF |
| `vendor/` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) |

# Video záznam

Jednoduchý video nahrávač pre mobil. Počas nahrávania je celá obrazovka **čierna**
a obraz z kamery vidíte len v **malom štvorčeku v pravom hornom rohu** (cca 2 × 2 cm),
spolu s časom nahrávania.

Je to webová aplikácia (PWA) – netreba nič inštalovať z obchodu, stačí ju otvoriť
v prehliadači a voliteľne si ju pridať na plochu.

## Ako to funguje

1. Otvorte stránku v mobile a povoľte prístup ku kamere a mikrofónu.
2. Ťuknite na **červené tlačidlo** – začne sa nahrávať. Obrazovka sčernie,
   ostane len náhľad v rohu (červený rámik + čas) a tlačidlo **stop**.
3. Ťuknite na **stop** – nahrávka sa uloží do zoznamu **Nahrávky**.
4. Ťuknutím na nahrávku ju prehráte, **zdieľate / uložíte do galérie**, stiahnete alebo zmažete.

### Nastavenia (ikona s posuvníkmi)

- **Veľkosť náhľadu** – 60 až 240 px (predvolene 120 px ≈ 2 cm na bežnom mobile).
- **Poloha náhľadu** – vpravo hore (predvolené), vpravo dole, vľavo hore, vľavo dole.
- **Kvalita videa** – 480p / 720p / 1080p.
- **Zvuk** – zapnúť / vypnúť mikrofón.
- **Celá obrazovka** počas nahrávania (na Androide skryje lištu prehliadača).
- Tlačidlo s fotoaparátom prepína **zadnú / prednú kameru**.

## Dôležité obmedzenia

- **Obrazovku nezamykajte a neprepínajte do inej aplikácie.** Prehliadač nedovolí
  webovej stránke nahrávať na pozadí. Aplikácia preto počas nahrávania drží obrazovku
  zapnutú (Wake Lock) a čierne pozadie šetrí batériu na OLED displejoch.
- Nahrávky sa ukladajú v pamäti prehliadača. Ak ich chcete mať natrvalo, uložte ich
  cez **Zdieľať / Uložiť** (na iPhone → „Uložiť video“ do Fotiek) alebo **Stiahnuť**.
  Vymazanie údajov prehliadača nahrávky zmaže.
- Kamera funguje len cez **HTTPS** (alebo `localhost`).
- Formát: MP4 tam, kde to prehliadač vie (Safari, novší Chrome), inak WebM.

## Spustenie

Ide o čisto statické súbory (`index.html`, `styles.css`, `app.js`, `sw.js`, …),
netreba žiadny build.

Lokálne (na počítači):

```bash
python3 -m http.server 8000
# otvorte http://localhost:8000
```

Na mobile treba stránku zverejniť cez HTTPS, napr.:

- **GitHub Pages** – Settings → Pages → Deploy from branch → vetva / root,
- **Cloudflare Pages** alebo **Netlify** – nahrať priečinok ako statickú stránku.

Potom v mobile: menu prehliadača → **Pridať na plochu** – aplikácia sa bude otvárať
ako samostatná appka a funguje aj bez internetu.

// Knižnica ikon pre etikety. Cesty sú v súradniciach 24 × 24 (ako SVG viewBox).
// d = obrys (ťah), f = vyplnená časť.

const C = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;

export const ICON_CATS = ['Balenie', 'Symboly', 'Šípky', 'Kontakt', 'Obchod', 'Potraviny'];

export const ICONS = [
  // Balenie a manipulácia
  { id: 'sklo', name: 'Krehké', cat: 'Balenie', d: 'M7 2.5h10l-.8 7.2a4.2 4.2 0 0 1-8.4 0z M12 14v6.5 M8 21h8 M10.5 4.5l1.5 2.5-1.5 2' },
  { id: 'hore', name: 'Touto stranou hore', cat: 'Balenie', d: 'M3 21h18 M8 17V4 M4.5 7.5L8 4l3.5 3.5 M16 17V4 M12.5 7.5L16 4l3.5 3.5' },
  { id: 'sucho', name: 'Chrániť pred vlhkom', cat: 'Balenie', d: 'M3 12a9 9 0 0 1 18 0z M12 3v-.5 M12 12v6.5a2 2 0 0 0 4 0 M5 17v1.5 M19 15v1.5' },
  { id: 'recykl', name: 'Recyklovať', cat: 'Balenie', d: 'M10.4 5.2l-6 10.4 M7.6 6.3l2.8-1.1.4 3 M13.6 5.2l6 10.4 M20 12.6l-.4 3-2.8-1.2 M17.5 19.5h-11 M8.6 17.5l-2.1 2 2.1 2' },
  { id: 'teplota', name: 'Teplota', cat: 'Balenie', d: 'M10 13.6V5a2 2 0 0 1 4 0v8.6a4 4 0 1 1-4 0z M12 9v8.5 M17 6h3 M17 10h3' },
  { id: 'mraz', name: 'Mrazené', cat: 'Balenie', d: 'M12 2v20 M3.3 7l17.4 10 M3.3 17l17.4-10 M9.5 3.8L12 6l2.5-2.2 M9.5 20.2L12 18l2.5 2.2 M4 10.2l3 .9.7-3 M20 13.8l-3-.9-.7 3 M4 13.8l3-.9.7 3 M20 10.2l-3 .9-.7-3' },
  { id: 'slnko', name: 'Chrániť pred teplom', cat: 'Balenie', d: `${C(12, 12, 4)} M12 2v2.5 M12 19.5V22 M2 12h2.5 M19.5 12H22 M4.9 4.9l1.8 1.8 M17.3 17.3l1.8 1.8 M4.9 19.1l1.8-1.8 M17.3 6.7l1.8-1.8` },
  { id: 'balik', name: 'Balík', cat: 'Balenie', d: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z M3 7.5L12 12l9-4.5 M12 12v9 M7.5 5.2l9 4.6' },
  { id: 'kamion', name: 'Doprava', cat: 'Balenie', d: `M2 5.5h11.5v10.5H2z M13.5 9H18l3.5 3.7V16h-8 ${C(6, 18.2, 1.9)} ${C(17.2, 18.2, 1.9)}` },
  { id: 'noznice', name: 'Strihať', cat: 'Balenie', d: `${C(6, 6, 2.6)} ${C(6, 18, 2.6)} M8.2 7.6L20.5 18 M8.2 16.4L20.5 6` },

  // Symboly
  { id: 'pozor', name: 'Pozor', cat: 'Symboly', d: 'M12 3L2 20.5h20z M12 9.5v5.2 M12 17.6v.4' },
  { id: 'zakaz', name: 'Zákaz', cat: 'Symboly', d: `${C(12, 12, 9)} M5.6 5.6l12.8 12.8` },
  { id: 'info', name: 'Informácia', cat: 'Symboly', d: `${C(12, 12, 9)} M12 11v6 M12 7.6v.4` },
  { id: 'ok', name: 'V poriadku', cat: 'Symboly', d: `${C(12, 12, 9)} M7.6 12.4l3 3 5.8-6.3` },
  { id: 'nie', name: 'Nie', cat: 'Symboly', d: `${C(12, 12, 9)} M8.5 8.5l7 7 M15.5 8.5l-7 7` },
  { id: 'fajka', name: 'Fajka', cat: 'Symboly', d: 'M4 12.5l5 5L20 6' },
  { id: 'policko', name: 'Políčko', cat: 'Symboly', d: 'M4 4h16v16H4z' },
  { id: 'srdce', name: 'Srdce', cat: 'Symboly', f: 'M12 20.6s-8.3-5-8.3-11.1A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.3 2.7c0 6.1-8.3 11.1-8.3 11.1z' },
  { id: 'hviezda', name: 'Hviezda', cat: 'Symboly', f: 'M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z' },
  { id: 'blesk', name: 'Elektrina', cat: 'Symboly', f: 'M13.5 2L4.5 13.5h6.5L10 22l9.5-12h-6.6z' },
  { id: 'smajlik', name: 'Úsmev', cat: 'Symboly', d: `${C(12, 12, 9)} M8 14.5c1 1.6 2.3 2.4 4 2.4s3-.8 4-2.4 M9 9.5v.5 M15 9.5v.5` },
  { id: 'zamok', name: 'Zámok', cat: 'Symboly', d: 'M5 11h14v10H5z M8 11V7.5a4 4 0 0 1 8 0V11 M12 15v2.5' },
  { id: 'wifi', name: 'Wi-Fi', cat: 'Symboly', d: 'M2 8.6a15 15 0 0 1 20 0 M5.2 12.2a10.4 10.4 0 0 1 13.6 0 M8.6 15.7a5.4 5.4 0 0 1 6.8 0 M12 19.5v.3' },
  { id: 'bodka', name: 'Bodka', cat: 'Symboly', f: C(12, 12, 6) },

  // Šípky
  { id: 'vpravo', name: 'Šípka vpravo', cat: 'Šípky', d: 'M3.5 12h16 M13.5 6l6 6-6 6' },
  { id: 'vlavo', name: 'Šípka vľavo', cat: 'Šípky', d: 'M20.5 12h-16 M10.5 6l-6 6 6 6' },
  { id: 'nahor', name: 'Šípka hore', cat: 'Šípky', d: 'M12 20.5v-16 M6 10.5l6-6 6 6' },
  { id: 'nadol', name: 'Šípka dole', cat: 'Šípky', d: 'M12 3.5v16 M6 13.5l6 6 6-6' },
  { id: 'trojuholnik', name: 'Trojuholník vpravo', cat: 'Šípky', f: 'M6 3.5L19.5 12 6 20.5z' },
  { id: 'otocit', name: 'Otočiť', cat: 'Šípky', d: 'M20 11.5a8 8 0 1 0-2.4 5.8 M20 4.5v7h-7' },

  // Kontakt
  { id: 'telefon', name: 'Telefón', cat: 'Kontakt', d: 'M5 3h3.4l1.8 4.6-2.3 1.4a11 11 0 0 0 7.1 7.1l1.4-2.3 4.6 1.8V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z' },
  { id: 'email', name: 'E-mail', cat: 'Kontakt', d: 'M3 5.5h18v13H3z M3 6.5l9 6.8 9-6.8' },
  { id: 'web', name: 'Web', cat: 'Kontakt', d: `${C(12, 12, 9)} M3 12h18 M12 3c2.6 2.5 3.9 5.5 3.9 9s-1.3 6.5-3.9 9c-2.6-2.5-3.9-5.5-3.9-9S9.4 5.5 12 3z` },
  { id: 'poloha', name: 'Poloha', cat: 'Kontakt', d: `M12 22s7-6.3 7-12.2a7 7 0 0 0-14 0C5 15.7 12 22 12 22z ${C(12, 9.8, 2.6)}` },
  { id: 'domov', name: 'Domov', cat: 'Kontakt', d: 'M3 11.5L12 4l9 7.5 M5.5 9.5V20h4.5v-6h4v6h4.5V9.5' },
  { id: 'osoba', name: 'Osoba', cat: 'Kontakt', d: `${C(12, 8, 4)} M4 21c1.4-4 4.4-6 8-6s6.6 2 8 6` },
  { id: 'hodiny', name: 'Čas', cat: 'Kontakt', d: `${C(12, 12, 9)} M12 7v5.2l3.6 2.1` },
  { id: 'kalendar', name: 'Kalendár', cat: 'Kontakt', d: 'M3.5 5h17v15.5h-17z M3.5 10h17 M8 3v4 M16 3v4' },

  // Obchod
  { id: 'kosik', name: 'Košík', cat: 'Obchod', d: `M2.5 4h2.6l2.3 11h10.9l2.2-8H6.2 ${C(9, 19.5, 1.4)} ${C(17, 19.5, 1.4)}` },
  { id: 'euro', name: 'Euro', cat: 'Obchod', d: 'M17.8 6.4a7 7 0 1 0 0 11.2 M4 10h9.5 M4 14h9.5' },
  { id: 'percento', name: 'Zľava %', cat: 'Obchod', d: `M19 5L5 19 ${C(7, 7, 2.5)} ${C(17, 17, 2.5)}` },
  { id: 'cenovka', name: 'Cenovka', cat: 'Obchod', d: `M3 3h8.5l9.5 9.5-8.5 8.5L3 11.5z ${C(7.5, 7.5, 1.5)}` },
  { id: 'darcek', name: 'Darček', cat: 'Obchod', d: 'M3.5 8h17v4h-17z M5 12v8.5h14V12 M12 8v12.5 M12 8C10.5 4.5 7 4 7 6s3 2 5 2 M12 8c1.5-3.5 5-4 5-2s-3 2-5 2' },
  { id: 'novinka', name: 'Novinka', cat: 'Obchod', d: 'M12 2.5l2.3 3 3.7-.6.6 3.7 3 2.3-2 3.2.9 3.6-3.6.9-1.2 3.6L12 20.5l-3.3 1.6-1.2-3.6-3.6-.9.9-3.6-2-3.2 3-2.3.6-3.7 3.7.6z' },

  // Potraviny
  { id: 'kava', name: 'Káva', cat: 'Potraviny', d: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17 M8 3.5v2.5 M12 3.5v2.5' },
  { id: 'list', name: 'Bio / príroda', cat: 'Potraviny', d: 'M5 19C5 11 10 5 20 4c0 10-6 15-15 15z M5 19l7.5-7.5' },
  { id: 'kvapka', name: 'Tekutina', cat: 'Potraviny', d: 'M12 3s6.2 6.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.6 12 3 12 3z' },
  { id: 'ohen', name: 'Pikantné', cat: 'Potraviny', d: 'M12 22c4 0 7-2.7 7-6.8 0-3.4-2.3-5.6-3.8-7.6-.6 2-1.6 3-2.7 3.4C13 7 11.6 4.2 9 2c.4 3.5-1.6 5.6-3 7.6S5 13 5 15.2C5 19.3 8 22 12 22z' },
  { id: 'jablko', name: 'Ovocie', cat: 'Potraviny', d: 'M12 7.5c-2-1.5-7-1.5-7.5 3.5-.4 4.3 2.5 10 5 10 1 0 1.5-.5 2.5-.5s1.5.5 2.5.5c2.5 0 5.4-5.7 5-10-.5-5-5.5-5-7.5-3.5z M12 7.5c0-2 1-4 3-5' },
  { id: 'vidlicka', name: 'Jedlo', cat: 'Potraviny', d: 'M6 2.5v7a2.5 2.5 0 0 0 5 0v-7 M8.5 2.5v19 M17 21.5V2.5c-2.5 1-3.5 4-3.5 7.5v3H17' },
];

const pathCache = new Map();
function p2d(d) {
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); pathCache.set(d, p); }
  return p;
}

export function findIcon(id) { return ICONS.find((i) => i.id === id) || ICONS[0]; }

/** Nakreslí ikonu do obdĺžnika W×H (stred v 0,0). weight = hrúbka čiary v jednotkách 24-mriežky. */
export function drawIconShape(ctx, id, W, H, weight = 2) {
  const ic = findIcon(id);
  const k = Math.min(W, H) / 24;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-12, -12);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = weight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (ic.f) ctx.fill(p2d(ic.f));
  if (ic.d) ctx.stroke(p2d(ic.d));
  ctx.restore();
}

/** SVG pre zobrazenie v ponuke. */
export function iconSvg(id, size = 32) {
  const ic = findIcon(id);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">`
    + (ic.f ? `<path d="${ic.f}" fill="currentColor"/>` : '')
    + (ic.d ? `<path d="${ic.d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : '')
    + '</svg>';
}

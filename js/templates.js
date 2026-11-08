// Vzorové šablóny etikiet a tvorba nových prvkov.

import { uid } from './ui.js';

export const SIZE_PRESETS = [
  [30, 15], [30, 20], [35, 20], [40, 15], [40, 20], [40, 30], [50, 20], [50, 25], [50, 30], [50, 40], [50, 50], [40, 60],
];

export function newLabel(w = 50, h = 30, name = 'Nová etiketa') {
  const now = Date.now();
  return { id: uid(), name, w, h, items: [], dir: 0, serial: { start: 1, step: 1, digits: 0, next: 1 }, created: now, updated: now };
}

/** Predvolené vlastnosti nových prvkov (rozmery v mm). */
export function newItem(type, label, extra = {}) {
  const base = { id: uid(), type, rot: 0 };
  const W = label.w, H = label.h;
  const top = Math.min(4.5, H * 0.25);
  switch (type) {
    case 'text':
      return { ...base, text: 'Text', size: 12, font: 'sans', bold: false, italic: false, underline: false, align: 'left', valign: 'middle', wrap: true, fit: false, invert: false, x: 2, y: top, w: Math.min(30, W - 4), h: 5.4, ...extra };
    case 'barcode': {
      const w = Math.min(W - 3, 40);
      const h = Math.min(H - top - 1, 14);
      return { ...base, format: 'EAN13', data: '8581234567894', showText: true, textSize: 8, x: (W - w) / 2, y: top, w, h, ...extra };
    }
    case 'qr': {
      const side = Math.min(H - top - 1, W - 4, 22);
      return { ...base, data: 'https://www.priklad.sk', ec: 'M', x: (W - side) / 2, y: top + (H - top - side) / 2, w: side, h: side, ...extra };
    }
    case 'image':
      return { ...base, src: '', mode: 'dither', threshold: 128, invert: false, fit: 'contain', x: 2, y: top, w: W - 4, h: H - top - 1, ...extra };
    case 'line':
      return { ...base, thick: 0.4, dash: false, x: 2, y: H / 2 - 0.75, w: W - 4, h: 1.5, ...extra };
    case 'shape':
      return { ...base, shape: 'rect', thick: 0.5, fill: false, radius: 1, x: 1, y: top, w: W - 2, h: H - top - 1, ...extra };
    case 'table': {
      const w = Math.min(W - 3, 46), h = Math.min(H - top - 1, 15);
      return {
        ...base, rows: 3, cols: 2, colW: [1, 1.4], size: 8, font: 'sans', border: 0.3, headBold: false, firstColBold: true, align: 'left',
        cells: [['Názov', 'Hodnota'], ['Rozmer', '200 × 200 cm'], ['Hmotnosť', '25 kg']],
        x: (W - w) / 2, y: top, w, h, ...extra,
      };
    }
    case 'icon': {
      const side = Math.min(10, H - top - 1, W - 2);
      return { ...base, icon: 'sklo', weight: 2, x: 2, y: top + (H - top - side) / 2, w: side, h: side, ...extra };
    }
    default:
      return { ...base, x: 2, y: 2, w: 10, h: 10, ...extra };
  }
}

const T = (type, props) => ({ id: uid(), type, rot: 0, ...props });
const txt = (text, x, y, w, h, size, more = {}) => T('text', { text, x, y, w, h, size, font: 'sans', bold: false, italic: false, underline: false, align: 'left', valign: 'middle', wrap: true, fit: false, invert: false, ...more });
const bar = (format, data, x, y, w, h, more = {}) => T('barcode', { format, data, x, y, w, h, showText: true, textSize: 8, ...more });
const ico = (icon, x, y, side, more = {}) => T('icon', { icon, x, y, w: side, h: side, weight: 2, ...more });

export const TEMPLATES = [
  {
    id: 'ean35', name: 'Čiarový kód EAN-13', cat: 'Obchod', w: 35, h: 20,
    items: () => [bar('EAN13', '8581234567894', 1.5, 4.5, 32, 14.5, { textSize: 7 })],
  },
  {
    id: 'ean50', name: 'Názov + čiarový kód', cat: 'Obchod', w: 50, h: 30,
    items: () => [
      txt('Názov produktu', 2, 4.3, 46, 5, 11, { bold: true, align: 'center', fit: true }),
      bar('EAN13', '8581234567894', 2, 10, 46, 18.5, { textSize: 9 }),
    ],
  },
  {
    id: 'cenovka', name: 'Cenovka', cat: 'Obchod', w: 50, h: 30,
    items: () => [
      txt('Názov produktu', 1.5, 4.3, 47, 5, 12, { bold: true, fit: true }),
      txt('500 g · Slovensko', 1.5, 9.3, 47, 3.4, 7),
      bar('EAN13', '8581234567894', 1.5, 14, 26, 14.5, { textSize: 7 }),
      txt('12,90 €', 28, 15, 20.5, 9, 20, { bold: true, align: 'right', fit: true }),
      txt('2,58 € / 100 g', 28, 24.2, 20.5, 3.4, 6.5, { align: 'right' }),
    ],
  },
  {
    id: 'sklad', name: 'Skladová etiketa (Code 128)', cat: 'Sklad', w: 40, h: 30,
    items: () => [
      txt('Názov tovaru', 1.5, 4.3, 37, 4.6, 10, { bold: true, align: 'center', fit: true }),
      bar('CODE128', 'ABC-12345', 1.5, 9.5, 37, 13.5, { textSize: 7 }),
      txt('Sklad A · Regál 3', 1.5, 24.5, 37, 3.6, 7, { align: 'center' }),
    ],
  },
  {
    id: 'inv', name: 'Inventárne číslo (číslovanie)', cat: 'Sklad', w: 40, h: 20,
    serial: { start: 1, step: 1, digits: 5, next: 1 },
    items: () => [
      txt('INV-{cislo}', 1.5, 4.2, 37, 4.4, 10, { bold: true, align: 'center' }),
      bar('CODE128', 'INV-{cislo}', 1.5, 9, 37, 10, { showText: false }),
    ],
  },
  {
    id: 'qr', name: 'QR kód s textom', cat: 'Obchod', w: 50, h: 30,
    items: () => [
      T('qr', { data: 'https://www.priklad.sk', ec: 'M', x: 1.5, y: 5.5, w: 23, h: 23 }),
      txt('Naskenujte', 26, 7, 22.5, 5, 11, { bold: true, fit: true }),
      txt('Viac informácií nájdete na našom webe.', 26, 12.5, 22.5, 12, 7.5, { valign: 'top' }),
    ],
  },
  {
    id: 'spotreba', name: 'Dátum výroby a spotreby', cat: 'Potraviny', w: 40, h: 30,
    items: () => [
      txt('Vyrobené: {datum}', 1.5, 4.3, 37, 4, 8, { align: 'center' }),
      T('line', { x: 3, y: 9, w: 34, h: 1, thick: 0.3, dash: false }),
      txt('Spotrebujte do:', 1.5, 10.5, 37, 3.8, 8, { align: 'center' }),
      txt('{datum+7}', 1.5, 14.8, 37, 8, 18, { bold: true, align: 'center', fit: true }),
      txt('Skladujte pri 2–6 °C', 1.5, 24.5, 37, 3.5, 6.5, { align: 'center' }),
    ],
  },
  {
    id: 'adresa', name: 'Adresa odosielateľa', cat: 'Adresy', w: 50, h: 30,
    items: () => [
      txt('Odosielateľ:', 2, 4.3, 46, 3.4, 7),
      txt('Meno Priezvisko\nHlavná 12\n811 01 Bratislava\nSlovensko', 2, 7.8, 46, 20, 9.5, { bold: false, valign: 'top' }),
    ],
  },
  {
    id: 'ramcek', name: 'Rámček s nápisom', cat: 'Ostatné', w: 50, h: 25,
    items: () => [
      T('shape', { shape: 'rect', x: 1.5, y: 4.3, w: 47, h: 19.7, thick: 0.6, fill: false, radius: 2 }),
      txt('NÁPIS', 3, 6.5, 44, 15.3, 22, { bold: true, align: 'center', fit: true }),
    ],
  },
  {
    id: 'krehke', name: 'Krehké – zásielka', cat: 'Doprava', w: 50, h: 30,
    items: () => [
      txt('KREHKÉ', 1.5, 4.3, 47, 8, 20, { bold: true, align: 'center', fit: true }),
      ico('sklo', 4, 13.5, 13), ico('hore', 18.5, 13.5, 13), ico('sucho', 33, 13.5, 13),
    ],
  },
  {
    id: 'parametre', name: 'Tabuľka parametrov', cat: 'Sklad', w: 50, h: 30,
    items: () => [
      txt('Vírivka Relax 200', 1.5, 4.3, 47, 5, 11, { bold: true, fit: true }),
      T('table', {
        rows: 3, cols: 2, colW: [1, 1.4], size: 8, font: 'sans', border: 0.3, headBold: false, firstColBold: true, align: 'left',
        cells: [['Rozmer', '200 × 200 cm'], ['Hmotnosť', '250 kg'], ['Kód', 'VR-200']],
        x: 1.5, y: 10, w: 47, h: 18.5,
      }),
    ],
  },
  {
    id: 'kontakt', name: 'Kontakt s ikonami', cat: 'Adresy', w: 50, h: 30,
    items: () => [
      txt('Firma s.r.o.', 2, 4.3, 46, 5.2, 11, { bold: true, fit: true }),
      ico('telefon', 2, 10.6, 4.4), txt('+421 900 123 456', 7.5, 10.6, 40.5, 4.4, 8.5),
      ico('email', 2, 16, 4.4), txt('info@firma.sk', 7.5, 16, 40.5, 4.4, 8.5),
      ico('web', 2, 21.4, 4.4), txt('www.firma.sk', 7.5, 21.4, 40.5, 4.4, 8.5),
    ],
  },
  {
    id: 'stitok', name: 'Štítok s veľkým textom', cat: 'Ostatné', w: 40, h: 15,
    items: () => [txt('Štítok', 1, 4.2, 38, 10, 22, { bold: true, align: 'center', fit: true })],
  },
  {
    id: 'inverz', name: 'Biely text na čiernom', cat: 'Ostatné', w: 50, h: 30,
    items: () => [
      txt('POZOR', 1.5, 4.5, 47, 10, 22, { bold: true, align: 'center', fit: true, invert: true }),
      txt('Krehké – manipulujte opatrne', 1.5, 16, 47, 11, 10, { align: 'center', fit: true }),
    ],
  },
];

export function labelFromTemplate(t) {
  const l = newLabel(t.w, t.h, t.name);
  l.items = t.items();
  if (t.serial) l.serial = { ...t.serial };
  return l;
}

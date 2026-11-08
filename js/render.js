// Vykreslenie etikety na canvas – rovnaký kód sa používa pre editor, náhľady aj tlač.
// Súradnice prvkov sú v milimetroch, `s` = počet pixelov na milimeter.
// Pri tlači je s = 8 (203 dpi), takže 1 px = 1 bod tlačovej hlavy.

import { encodeBarcode } from './barcode.js';
import { rowMap, dataColumns, colLetter } from './datasource.js';
import { drawIconShape } from './icons.js';

export const DPMM = 8; // bodov na milimeter (203 dpi)
export const PT_MM = 0.3528; // 1 typografický bod v mm

export const FONTS = [
  { id: 'sans', name: 'Bezpätkové', css: 'Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'cond', name: 'Úzke', css: '"Roboto Condensed", "Arial Narrow", sans-serif-condensed, sans-serif' },
  { id: 'serif', name: 'Pätkové', css: '"Noto Serif", Georgia, "Times New Roman", serif' },
  { id: 'mono', name: 'Strojové', css: '"Roboto Mono", "Droid Sans Mono", "Courier New", monospace' },
];
const fontCss = (id) => (FONTS.find((f) => f.id === id) || FONTS[0]).css;

if (window.qrcode && qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
}

// ---------------------------------------------------------------- premenné v texte
const pad2 = (n) => String(n).padStart(2, '0');
const stripDia = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function makeVars(label, serial, rowIndex) {
  const data = label?.data;
  return {
    date: new Date(),
    serial: serial ?? label?.serial?.next ?? label?.serial?.start ?? 1,
    digits: label?.serial?.digits || 0,
    row: data ? rowMap(data, rowIndex ?? data.preview ?? 0) : null,
  };
}

const DAYS = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];
const BUILTIN = /^(datum|cas|cislo|rok|den|mesiac|datumcas)\s*([+-]\s*\d+)?$/;
const fmtDate = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * Nahradí premenné: {datum}, {datum+7}, {cas}, {datumcas}, {den}, {mesiac}, {rok}, {cislo}
 * a stĺpce z Excelu {Názov stĺpca} (alebo {A}, {B}…).
 */
export function applyVars(str, vars) {
  str = str == null ? '' : String(str);
  if (str.indexOf('{') < 0) return str;
  const now = vars?.date || new Date();
  return str.replace(/\{([^{}\n]{1,60})\}/g, (m, inner) => {
    const key = inner.trim();
    if (vars?.row) {
      const v = vars.row.get(key.toLowerCase());
      if (v !== undefined) return v;
    }
    const b = BUILTIN.exec(stripDia(key.toLowerCase()));
    if (!b) return m;
    const k = b[1];
    const o = b[2] ? parseInt(b[2].replace(/\s/g, ''), 10) : 0;
    const d = new Date(now);
    switch (k) {
      case 'datum': d.setDate(d.getDate() + o); return fmtDate(d);
      case 'datumcas': d.setDate(d.getDate() + o); return `${fmtDate(d)} ${fmtTime(now)}`;
      case 'den': d.setDate(d.getDate() + o); return DAYS[d.getDay()];
      case 'cas': d.setMinutes(d.getMinutes() + o); return fmtTime(d);
      case 'mesiac': d.setDate(1); d.setMonth(d.getMonth() + o); return MONTHS[d.getMonth()];
      case 'rok': return String(now.getFullYear() + o);
      case 'cislo': return String((vars?.serial ?? 1) + o).padStart(vars?.digits || 0, '0');
      default: return m;
    }
  });
}

/** Všetky texty prvku, v ktorých môžu byť premenné. */
export function itemStrings(it) {
  const out = [it.text, it.data];
  if (it.type === 'table') (it.cells || []).forEach((r) => (r || []).forEach((c) => out.push(c)));
  return out.filter((x) => typeof x === 'string' && x);
}

export function usesSerial(label) {
  const re = /\{\s*(cislo|číslo)/i;
  return (label.items || []).some((it) => itemStrings(it).some((t) => re.test(t)));
}

/** Používa niektorý prvok stĺpce z Excelu? */
export function usesData(label) {
  if (!label.data) return false;
  const names = new Set(dataColumns(label.data).map((c) => c.toLowerCase()));
  dataColumns(label.data).forEach((_, i) => names.add(colLetter(i).toLowerCase()));
  return (label.items || []).some((it) => itemStrings(it).some((t) => {
    for (const m of t.matchAll(/\{([^{}\n]{1,60})\}/g)) if (names.has(m[1].trim().toLowerCase())) return true;
    return false;
  }));
}

// ---------------------------------------------------------------- obrázky
const imgCache = new Map(); // src -> {img, ready, promise}
let onImageReady = null;
export function setImageReadyCallback(fn) { onImageReady = fn; }

export function loadImage(src) {
  let e = imgCache.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ready: false };
    e.promise = new Promise((resolve) => {
      img.onload = () => { e.ready = true; resolve(img); onImageReady?.(); };
      img.onerror = () => { e.failed = true; resolve(null); };
    });
    img.src = src;
    imgCache.set(src, e);
  }
  return e.promise;
}

export async function preloadImages(label) {
  await Promise.all((label.items || []).filter((it) => it.type === 'image' && it.src).map((it) => loadImage(it.src)));
}

const bwCache = new Map();

/** Prevedie obrázok na čiernobiely (1-bit) v rozlíšení tlačiarne. Biela je priehľadná. */
function processImage(img, Wd, Hd, it) {
  const key = `${it.src.length}:${it.src.slice(-40)}|${Wd}x${Hd}|${it.mode}|${it.threshold}|${it.invert}|${it.fit}`;
  const hit = bwCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Wd; c.height = Hd;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff';
  x.fillRect(0, 0, Wd, Hd);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth || Wd, ih = img.naturalHeight || Hd;
  let dw = Wd, dh = Hd, dx = 0, dy = 0;
  if (it.fit !== 'stretch') {
    const r = Math.min(Wd / iw, Hd / ih);
    dw = iw * r; dh = ih * r; dx = (Wd - dw) / 2; dy = (Hd - dh) / 2;
  }
  x.drawImage(img, dx, dy, dw, dh);
  const id = x.getImageData(0, 0, Wd, Hd);
  const d = id.data;
  const n = Wd * Hd;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const thr = it.threshold ?? 128;
  const black = new Uint8Array(n);
  if (it.mode === 'threshold') {
    for (let i = 0; i < n; i++) black[i] = lum[i] < thr ? 1 : 0;
  } else {
    // Floyd–Steinberg; prah posúva celkový jas
    const shift = 128 - thr;
    for (let i = 0; i < n; i++) lum[i] += shift;
    for (let y = 0; y < Hd; y++) {
      for (let xx = 0; xx < Wd; xx++) {
        const i = y * Wd + xx;
        const old = lum[i];
        const b = old < 128 ? 1 : 0;
        black[i] = b;
        const err = old - (b ? 0 : 255);
        if (xx + 1 < Wd) lum[i + 1] += err * 7 / 16;
        if (y + 1 < Hd) {
          if (xx > 0) lum[i + Wd - 1] += err * 3 / 16;
          lum[i + Wd] += err * 5 / 16;
          if (xx + 1 < Wd) lum[i + Wd + 1] += err / 16;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const b = it.invert ? !black[i] : black[i];
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = b ? 0 : 255;
    d[i * 4 + 3] = b ? 255 : 0;
  }
  x.putImageData(id, 0, 0);
  if (bwCache.size > 40) bwCache.clear();
  bwCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- QR
const qrCache = new Map();
export function qrMatrix(text, ec = 'M') {
  if (!text || !window.qrcode) return null;
  const key = ec + '\u0000' + text;
  if (qrCache.has(key)) return qrCache.get(key);
  let r = null;
  try {
    const q = qrcode(0, ec);
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const m = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) m[y * n + x] = q.isDark(y, x) ? 1 : 0;
    r = { n, m };
  } catch { r = null; }
  if (qrCache.size > 200) qrCache.clear();
  qrCache.set(key, r);
  return r;
}

// ---------------------------------------------------------------- text
const LH = 1.15;
const lhOf = (it) => it.lh || LH;

/** Text prvku po dosadení premenných; zvislý text = každé písmeno na novom riadku. */
function textOf(it, vars) {
  const t = applyVars(it.text ?? '', vars);
  return it.vertical ? [...t.replace(/\n/g, ' ')].map((ch) => (ch === ' ' ? '' : ch)).join('\n') : t;
}

function setFont(ctx, it, px, s = DPMM) {
  ctx.font = `${it.italic ? 'italic ' : ''}${it.bold ? '700' : '400'} ${px}px ${fontCss(it.font)}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = it.ls ? `${it.ls * s}px` : '0px';
}

function wrapLines(ctx, text, maxW, wrap) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!wrap || ctx.measureText(para).width <= maxW) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      // slovo dlhšie ako riadok → rozdeliť po znakoch
      if (ctx.measureText(word).width > maxW) {
        let part = '';
        for (const ch of word) {
          if (part && ctx.measureText(part + ch).width > maxW) { out.push(part); part = ch; } else part += ch;
        }
        line = part;
      } else line = word;
    }
    out.push(line);
  }
  return out;
}

function layoutText(ctx, it, W, H, s, vars) {
  const str = textOf(it, vars);
  const wrap = it.wrap !== false && !it.vertical;
  let pt = it.size || 10;
  const fits = (p) => {
    const px = p * PT_MM * s;
    setFont(ctx, it, px, s);
    const ls = wrapLines(ctx, str, W, wrap);
    const maxW = Math.max(0, ...ls.map((l) => ctx.measureText(l).width));
    return ls.length * px * lhOf(it) <= H + 0.5 && maxW <= W + 0.5;
  };
  if (it.fit && !fits(pt)) {
    let lo = 2, hi = pt;
    for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    pt = lo;
  }
  const px = pt * PT_MM * s;
  setFont(ctx, it, px, s);
  const lines = wrapLines(ctx, str, W, wrap);
  return { lines, px, lineH: px * lhOf(it) };
}

function drawText(ctx, it, W, H, s, o) {
  const { lines, px, lineH } = layoutText(ctx, it, W, H, s, o.vars);
  const totalH = lines.length * lineH;
  let y0;
  if (it.valign === 'top') y0 = -H / 2;
  else if (it.valign === 'bottom') y0 = H / 2 - totalH;
  else y0 = -totalH / 2;
  if (it.invert) {
    ctx.fillStyle = '#000';
    ctx.fillRect(-W / 2, -H / 2, W, H);
  }
  const color = it.invert ? '#fff' : '#000';
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  const align = it.align || 'left';
  ctx.textAlign = align;
  const x = align === 'center' ? 0 : align === 'right' ? W / 2 : -W / 2;
  lines.forEach((ln, i) => {
    const y = y0 + lineH * (i + 0.5);
    ctx.fillText(ln, x, y);
    if (it.underline && ln) {
      const w = ctx.measureText(ln).width;
      const lx = align === 'center' ? -w / 2 : align === 'right' ? W / 2 - w : -W / 2;
      ctx.fillRect(lx, y + px * 0.42, w, Math.max(1, px * 0.07));
    }
  });
  ctx.textAlign = 'left';
}

/** Potrebná veľkosť rámčeka (mm) pre text bez zalamovania. */
export function measureText(it, vars) {
  const c = measureText.c || (measureText.c = document.createElement('canvas').getContext('2d'));
  const s = DPMM;
  const px = (it.size || 10) * PT_MM * s;
  setFont(c, it, px);
  const lines = textOf(it, vars).split('\n');
  const w = Math.max(...lines.map((l) => c.measureText(l).width), px * 0.6);
  return { w: w / s + 0.6, h: (lines.length * px * lhOf(it)) / s + 0.2 };
}

/** Výška textu (mm) pri danej šírke rámčeka so zalamovaním. */
export function measureTextHeight(it, widthMm, vars) {
  const c = measureText.c || (measureText.c = document.createElement('canvas').getContext('2d'));
  const s = DPMM;
  const px = (it.size || 10) * PT_MM * s;
  setFont(c, it, px);
  const lines = wrapLines(c, textOf(it, vars), widthMm * s, it.wrap !== false && !it.vertical);
  return (lines.length * px * lhOf(it)) / s + 0.2;
}

// ---------------------------------------------------------------- čiarové kódy
function drawInvalid(ctx, W, H, msg) {
  ctx.save();
  ctx.fillStyle = 'rgba(229,72,77,.08)';
  ctx.fillRect(-W / 2, -H / 2, W, H);
  ctx.strokeStyle = 'rgba(229,72,77,.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(-W / 2 + 0.5, -H / 2 + 0.5, W - 1, H - 1);
  ctx.fillStyle = '#c62828';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const px = Math.max(8, Math.min(H / 4, 14));
  ctx.font = `600 ${px}px Roboto, Arial, sans-serif`;
  ctx.fillText(msg, 0, 0, W - 4);
  ctx.restore();
}

/** Šírka modulu čiarového kódu v bodoch tlačiarne pre danú šírku rámčeka. */
export function barcodeModuleDots(it, enc, widthMm) {
  const showText = it.showText !== false;
  const extra = (showText && enc.outLeft ? 7 : 0) + (showText && enc.outRight ? 7 : 0);
  const modules = enc.bits.length + extra;
  return { m: Math.floor((widthMm * DPMM) / modules), modules };
}

function drawBarcode(ctx, it, W, H, s, o) {
  const enc = encodeBarcode(it.format, applyVars(it.data, o.vars));
  if (!enc.ok) { if (!o.print) drawInvalid(ctx, W, H, 'Neplatný kód'); return; }
  const showText = it.showText !== false;
  const fontPx = (it.textSize || 8) * PT_MM * s;
  const isEan = enc.layout === 'ean';
  const extraL = showText && enc.outLeft ? 7 : 0;
  const extraR = showText && enc.outRight ? 7 : 0;
  const modules = enc.bits.length + extraL + extraR;
  const m = Math.max(1, Math.floor(((W / s) * DPMM) / modules)); // modul v bodoch (celé číslo → ostré čiary)
  const mpx = (m * s) / DPMM;
  const total = modules * mpx;
  const R = o.print ? Math.round : (v) => v;
  const left = R(-total / 2);
  const x0 = left + extraL * mpx;
  const top = R(-H / 2);
  const textH = showText ? fontPx * 1.05 : 0;
  const barH = Math.max(1, R(H - textH));
  const guardH = isEan && showText ? Math.min(H, R(barH + textH * 0.5)) : barH;
  const bits = enc.bits;
  const isGuard = (i) => isEan && enc.guards.some(([a, b]) => i >= a && i < b);
  ctx.fillStyle = '#000';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] !== '1') { i++; continue; }
    const g = isGuard(i);
    let j = i;
    while (j < bits.length && bits[j] === '1' && isGuard(j) === g) j++;
    ctx.fillRect(x0 + i * mpx, top, (j - i) * mpx, g ? guardH : barH);
    i = j;
  }
  if (!showText) return;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `400 ${fontPx}px ${fontCss('sans')}`;
  const ty = top + barH + textH / 2 + fontPx * 0.04;
  if (isEan) {
    for (const g of enc.groups) {
      const slot = ((g.to - g.from) * mpx) / g.text.length;
      [...g.text].forEach((ch, k) => ctx.fillText(ch, x0 + g.from * mpx + slot * (k + 0.5), ty));
    }
    if (enc.outLeft) ctx.fillText(enc.outLeft, x0 - 3.5 * mpx - mpx, ty);
    if (enc.outRight) ctx.fillText(enc.outRight, x0 + bits.length * mpx + 4.5 * mpx, ty);
  } else {
    const bw = bits.length * mpx;
    let fp = fontPx;
    const tw = ctx.measureText(enc.text).width;
    if (tw > Math.max(bw, W)) { fp = (fontPx * Math.max(bw, W)) / tw; ctx.font = `400 ${fp}px ${fontCss('sans')}`; }
    ctx.fillText(enc.text, x0 + bw / 2, ty);
  }
  ctx.textAlign = 'left';
}

function drawQr(ctx, it, W, H, s, o) {
  const q = qrMatrix(applyVars(it.data, o.vars), it.ec || 'M');
  if (!q) { if (!o.print) drawInvalid(ctx, W, H, it.data ? 'Príliš dlhý text' : 'Prázdny QR'); return; }
  const side = Math.min(W, H);
  const m = Math.max(1, Math.floor(((side / s) * DPMM) / q.n));
  const mpx = (m * s) / DPMM;
  const size = q.n * mpx;
  const R = o.print ? Math.round : (v) => v;
  const x0 = R(-size / 2), y0 = R(-size / 2);
  const overlap = o.print ? 0 : 0.35;
  ctx.fillStyle = '#000';
  for (let y = 0; y < q.n; y++) {
    let x = 0;
    while (x < q.n) {
      if (!q.m[y * q.n + x]) { x++; continue; }
      let e = x;
      while (e < q.n && q.m[y * q.n + e]) e++;
      ctx.fillRect(x0 + x * mpx, y0 + y * mpx, (e - x) * mpx + overlap, mpx + overlap);
      x = e;
    }
  }
}

function drawImage(ctx, it, W, H, s, o) {
  if (!it.src) { if (!o.print) drawInvalid(ctx, W, H, 'Bez obrázka'); return; }
  const e = imgCache.get(it.src);
  if (!e || !e.ready) {
    loadImage(it.src);
    if (!o.print) { ctx.fillStyle = '#eee'; ctx.fillRect(-W / 2, -H / 2, W, H); }
    return;
  }
  const Wd = Math.max(1, Math.round((W / s) * DPMM));
  const Hd = Math.max(1, Math.round((H / s) * DPMM));
  const bw = processImage(e.img, Wd, Hd, it);
  ctx.imageSmoothingEnabled = false;
  const R = o.print ? Math.round : (v) => v;
  ctx.drawImage(bw, R(-W / 2), R(-H / 2), R(W), R(H));
  ctx.imageSmoothingEnabled = true;
}

function drawLine(ctx, it, W, H, s, o) {
  const R = o.print ? Math.round : (v) => v;
  const t = Math.max(o.print ? 1 : 0.8, R((it.thick ?? 0.4) * s));
  ctx.fillStyle = '#000';
  const y = R(-t / 2);
  if (it.dash) {
    const seg = Math.max(t * 2, 1.6 * s), gap = Math.max(t * 1.5, 1 * s);
    for (let x = -W / 2; x < W / 2; x += seg + gap) ctx.fillRect(R(x), y, R(Math.min(seg, W / 2 - x)), t);
  } else {
    ctx.fillRect(R(-W / 2), y, R(W), t);
  }
}

function drawShape(ctx, it, W, H, s) {
  const t = Math.max(1, (it.thick ?? 0.5) * s);
  ctx.beginPath();
  if (it.shape === 'ellipse') {
    const rx = Math.max(0.5, W / 2 - (it.fill ? 0 : t / 2)), ry = Math.max(0.5, H / 2 - (it.fill ? 0 : t / 2));
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  } else {
    const inset = it.fill ? 0 : t / 2;
    const r = Math.max(0, Math.min((it.radius || 0) * s, W / 2, H / 2));
    const x = -W / 2 + inset, y = -H / 2 + inset, w = W - inset * 2, h = H - inset * 2;
    if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  if (it.fill) { ctx.fillStyle = '#000'; ctx.fill(); }
  else { ctx.strokeStyle = '#000'; ctx.lineWidth = t; ctx.stroke(); }
}

// ---------------------------------------------------------------- tabuľka
export function colWidths(it, W) {
  const cols = Math.max(1, it.cols | 0);
  const wts = Array.from({ length: cols }, (_, i) => Math.max(0.05, Number(it.colW?.[i]) || 1));
  const sum = wts.reduce((a, b) => a + b, 0);
  return wts.map((w) => (w / sum) * W);
}

function drawTable(ctx, it, W, H, s, o) {
  const rows = Math.max(1, it.rows | 0), cols = Math.max(1, it.cols | 0);
  const cw = colWidths(it, W);
  const rh = H / rows;
  const pad = 0.6 * s;
  const R = o.print ? Math.round : (v) => v;
  let x = -W / 2;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const text = it.cells?.[r]?.[c] ?? '';
      if (!text) continue;
      ctx.save();
      ctx.translate(x + cw[c] / 2, -H / 2 + rh * (r + 0.5));
      drawText(ctx, {
        text, size: it.size || 8, font: it.font, bold: !!(it.headBold && r === 0) || !!(it.firstColBold && c === 0),
        align: it.align || 'left', valign: 'middle', wrap: true, fit: true,
      }, Math.max(1, cw[c] - pad * 2), Math.max(1, rh - pad), s, o);
      ctx.restore();
    }
    x += cw[c];
  }
  const t = (it.border ?? 0.3) * s;
  if (t <= 0) return;
  const tw = Math.max(1, R(t));
  ctx.fillStyle = '#000';
  const L = R(-W / 2), T = R(-H / 2), Rr = R(W / 2), B = R(H / 2);
  ctx.fillRect(L, T, Rr - L, tw);
  ctx.fillRect(L, B - tw, Rr - L, tw);
  ctx.fillRect(L, T, tw, B - T);
  ctx.fillRect(Rr - tw, T, tw, B - T);
  let cx = -W / 2;
  for (let c = 0; c < cols - 1; c++) { cx += cw[c]; ctx.fillRect(R(cx - tw / 2), T, tw, B - T); }
  for (let r = 1; r < rows; r++) ctx.fillRect(L, R(-H / 2 + rh * r - tw / 2), Rr - L, tw);
}

// ---------------------------------------------------------------- celá etiketa
/** Rozmery obsahu prvku v jeho vlastnej (neotočenej) súradnicovej sústave, v mm. */
export function localSize(it) {
  const swap = it.rot === 90 || it.rot === 270;
  return swap ? { w: it.h, h: it.w } : { w: it.w, h: it.h };
}

export function drawItem(ctx, it, s, o = {}) {
  const cx = (it.x + it.w / 2) * s;
  const cy = (it.y + it.h / 2) * s;
  ctx.save();
  if (o.print) ctx.translate(Math.round(cx), Math.round(cy));
  else ctx.translate(cx, cy);
  if (it.rot) ctx.rotate((it.rot * Math.PI) / 180);
  const ls = localSize(it);
  const W = ls.w * s, H = ls.h * s;
  switch (it.type) {
    case 'text': drawText(ctx, it, W, H, s, o); break;
    case 'barcode': drawBarcode(ctx, it, W, H, s, o); break;
    case 'qr': drawQr(ctx, it, W, H, s, o); break;
    case 'image': drawImage(ctx, it, W, H, s, o); break;
    case 'line': drawLine(ctx, it, W, H, s, o); break;
    case 'shape': drawShape(ctx, it, W, H, s, o); break;
    case 'table': drawTable(ctx, it, W, H, s, o); break;
    case 'icon': drawIconShape(ctx, it.icon, W, H, it.weight ?? 2); break;
    default: break;
  }
  ctx.restore();
}

/**
 * Vykreslí etiketu do kontextu (počiatok 0,0 = ľavý horný roh etikety).
 * @param {{print?:boolean, vars?:object, background?:boolean}} o
 */
export function drawLabel(ctx, label, s, o = {}) {
  ctx.save();
  if (o.background !== false) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, label.w * s, label.h * s);
  }
  const vars = o.vars || makeVars(label);
  for (const it of label.items || []) {
    if (it.hidden) continue;
    drawItem(ctx, it, s, { ...o, vars });
  }
  ctx.restore();
}

/** Náhľad etikety do nového canvasu (pre zoznamy). */
export function thumbnail(label, maxW = 300, maxH = 200) {
  const s = Math.min(maxW / label.w, maxH / label.h);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = Math.round(label.w * s * dpr);
  c.height = Math.round(label.h * s * dpr);
  c.style.width = `${Math.round(label.w * s)}px`;
  c.style.height = `${Math.round(label.h * s)}px`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawLabel(ctx, label, s);
  return c;
}

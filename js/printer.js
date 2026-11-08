// Tlačiareň: pripojenie cez Web Bluetooth (BLE) a príkazy ESC/POS pre SK58.
//
// SK58 (Sinmark) komunikuje cez BLE službu 0x18F0, zápis do charakteristiky 0x2AF1.
// Obrázok etikety sa posiela ako rastrový obrázok (GS v 0) so šírkou 384 bodov (48 mm, 203 dpi),
// potom príkaz GS FF (1D 0C), ktorý posunie papier k ďalšej etikete (detekcia medzery).

import { DPMM, drawLabel, makeVars, preloadImages } from './render.js';
import { getSettings } from './store.js';
import { sleep } from './ui.js';

export const HEAD_DOTS = 384; // šírka tlačovej hlavy v bodoch
export const HEAD_MM = HEAD_DOTS / DPMM; // 48 mm

// Známe kombinácie služba → charakteristika na zápis (prvá je SK58).
const KNOWN = [
  [0x18f0, 0x2af1],
  [0xff00, 0xff02],
  [0xffe0, 0xffe1],
  [0xae30, 0xae01],
  ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'],
  ['e7810a71-73ae-499d-8c15-faa9aef0c3f2', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'],
];
const OPTIONAL_SERVICES = [...new Set([...KNOWN.map((k) => k[0]), 0xfee7, 0xaf30, 0xff80, 0x18f1])];
const LS_DEVICE = 'tlac-etikiet:tlaciaren';

const state = {
  device: null,
  server: null,
  char: null,
  status: 'disconnected', // disconnected | connecting | connected
  error: '',
  info: '',
};
const listeners = new Set();

export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(getStatus()); } catch (e) { console.error(e); } }); }
function setStatus(status, error = '') { state.status = status; state.error = error; emit(); }

export function getStatus() {
  const saved = savedDevice();
  return {
    status: state.status,
    connected: state.status === 'connected',
    name: state.device?.name || saved?.name || '',
    saved,
    error: state.error,
    info: state.info,
  };
}

export function savedDevice() {
  try { return JSON.parse(localStorage.getItem(LS_DEVICE) || 'null'); } catch { return null; }
}

export function bluetoothSupport() {
  if (!window.isSecureContext) return { ok: false, reason: 'Bluetooth funguje len na zabezpečenej adrese (https).' };
  if (!navigator.bluetooth) {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return {
      ok: false,
      reason: ios
        ? 'Safari na iPhone nepodporuje Web Bluetooth. Otvorte aplikáciu v prehliadači Bluefy (App Store).'
        : 'Tento prehliadač nepodporuje Web Bluetooth. Otvorte aplikáciu v prehliadači Chrome.',
    };
  }
  return { ok: true };
}

function withTimeout(p, ms, msg) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

const uuidName = (u) => (typeof u === 'number' ? '0x' + u.toString(16).toUpperCase() : String(u));

function onDisconnected() {
  state.server = null;
  state.char = null;
  if (state.status !== 'disconnected') setStatus('disconnected');
}

async function setupGatt(device) {
  if (state.device && state.device !== device) {
    state.device.removeEventListener('gattserverdisconnected', onDisconnected);
  }
  state.device = device;
  device.removeEventListener('gattserverdisconnected', onDisconnected);
  device.addEventListener('gattserverdisconnected', onDisconnected);
  setStatus('connecting');
  try {
    const server = await withTimeout(device.gatt.connect(), 15000, 'Tlačiareň neodpovedá (časový limit pripojenia).');
    state.server = server;
    let ch = null;
    let info = '';
    for (const [svc, chr] of KNOWN) {
      try {
        const s = await server.getPrimaryService(svc);
        ch = await s.getCharacteristic(chr);
        info = `služba ${uuidName(svc)}, charakteristika ${uuidName(chr)}`;
        break;
      } catch { /* skúsiť ďalšiu */ }
    }
    if (!ch) {
      // Všeobecné hľadanie: prvá charakteristika, do ktorej sa dá zapisovať.
      const services = await server.getPrimaryServices();
      outer: for (const s of services) {
        let chars = [];
        try { chars = await s.getCharacteristics(); } catch { continue; }
        for (const c of chars) {
          if (c.properties.writeWithoutResponse || c.properties.write) {
            ch = c;
            info = `služba ${s.uuid}, charakteristika ${c.uuid}`;
            break outer;
          }
        }
      }
    }
    if (!ch) throw new Error('V tlačiarni sa nenašla charakteristika na zápis. Je to naozaj tlačiareň?');
    state.char = ch;
    state.info = info;
    localStorage.setItem(LS_DEVICE, JSON.stringify({ id: device.id, name: device.name || 'Tlačiareň' }));
    setStatus('connected');
    return true;
  } catch (e) {
    try { device.gatt.disconnect(); } catch { /* nič */ }
    state.server = null;
    state.char = null;
    setStatus('disconnected', e.message || String(e));
    throw e;
  }
}

/** Otvorí systémový výber Bluetooth zariadení a pripojí tlačiareň. Musí sa volať z ťuknutia. */
export async function choosePrinter({ all = false } = {}) {
  const sup = bluetoothSupport();
  if (!sup.ok) throw new Error(sup.reason);
  const opts = all
    ? { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES }
    : {
      filters: [
        { services: [0x18f0] },
        { namePrefix: 'SK' },
        { namePrefix: 'Sinmark' },
        { namePrefix: 'SINMARK' },
        { namePrefix: 'Printer' },
        { namePrefix: 'BlueTooth' },
      ],
      optionalServices: OPTIONAL_SERVICES,
    };
  let device;
  try {
    device = await navigator.bluetooth.requestDevice(opts);
  } catch (e) {
    if (e.name === 'NotFoundError') throw new Error('Výber bol zrušený alebo sa nenašla žiadna tlačiareň.');
    if (e.name === 'SecurityError') throw new Error('Prehliadač nepovolil Bluetooth. Skúste znova ťuknutím na tlačidlo.');
    throw e;
  }
  await setupGatt(device);
  return device;
}

/** Skúsi sa znova pripojiť k naposledy použitej tlačiarni bez výberu (ak to prehliadač dovolí). */
export async function reconnect({ quiet = false } = {}) {
  if (state.status === 'connected' && state.char) return true;
  if (state.status === 'connecting') return false;
  let device = state.device;
  if (!device && navigator.bluetooth?.getDevices) {
    try {
      const saved = savedDevice();
      const list = await navigator.bluetooth.getDevices();
      device = list.find((d) => saved && d.id === saved.id) || (list.length === 1 ? list[0] : null);
    } catch { device = null; }
  }
  if (!device) return false;
  try {
    await setupGatt(device);
    return true;
  } catch (e) {
    if (!quiet) throw e;
    return false;
  }
}

export function canReconnectSilently() {
  return !!state.device || !!navigator.bluetooth?.getDevices;
}

export function disconnect() {
  try { state.device?.gatt?.disconnect(); } catch { /* nič */ }
  onDisconnected();
}

export function forget() {
  disconnect();
  try { state.device?.forget?.(); } catch { /* nič */ }
  state.device = null;
  localStorage.removeItem(LS_DEVICE);
  emit();
}

async function writeChunk(ch, chunk) {
  for (let attempt = 0; ; attempt++) {
    try {
      if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(chunk);
      else if (ch.writeValueWithResponse) await ch.writeValueWithResponse(chunk);
      else await ch.writeValue(chunk);
      return;
    } catch (e) {
      // „GATT operation already in progress“ – chvíľu počkať a skúsiť znova
      if (attempt < 4 && /in progress|busy|NetworkError/i.test(String(e.message || e.name))) { await sleep(30 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

/**
 * Pošle bajty do tlačiarne po balíkoch.
 * @param {Uint8Array} bytes
 * @param {{onProgress?:(sent:number,total:number)=>void, signal?:{cancelled:boolean}}} o
 */
export async function sendBytes(bytes, o = {}) {
  if (!state.char) throw new Error('Tlačiareň nie je pripojená.');
  const cfg = getSettings();
  const size = Math.max(10, Math.min(512, cfg.chunk | 0 || 20));
  const delay = Math.max(0, cfg.delay | 0);
  for (let i = 0; i < bytes.length; i += size) {
    if (o.signal?.cancelled) throw new Error('Tlač bola zrušená.');
    if (!state.char) throw new Error('Spojenie s tlačiarňou sa prerušilo.');
    await writeChunk(state.char, bytes.subarray(i, Math.min(bytes.length, i + size)));
    o.onProgress?.(Math.min(bytes.length, i + size), bytes.length);
    if (delay) await sleep(delay);
  }
}

// ---------------------------------------------------------------- raster
/**
 * Prevedie etiketu na 1-bitový obrázok so šírkou tlačovej hlavy.
 * Vracia { width, height, bytesPerRow, data, canvas, warnings }.
 */
export async function rasterize(label, vars, cfg = getSettings()) {
  await preloadImages(label);
  const Wd = Math.max(1, Math.round(label.w * DPMM));
  const Hd = Math.max(1, Math.round(label.h * DPMM));
  const c = document.createElement('canvas');
  c.width = Wd; c.height = Hd;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  drawLabel(ctx, label, DPMM, { print: true, vars: vars || makeVars(label) });
  const px = ctx.getImageData(0, 0, Wd, Hd).data;

  const skipTop = Math.max(0, Math.round((cfg.topSkip || 0) * DPMM));
  const outH = Math.max(8, Hd - skipTop);
  const shiftY = Math.round((cfg.offsetY || 0) * DPMM); // + = nadol
  const ox = Math.round((HEAD_DOTS - Wd) / 2 + (cfg.offsetX || 0) * DPMM);
  const thr = cfg.threshold ?? 128;
  const flip = !!label.flip;
  const bpr = HEAD_DOTS / 8;
  const data = new Uint8Array(bpr * outH);

  const out = document.createElement('canvas');
  out.width = HEAD_DOTS; out.height = outH;
  const octx = out.getContext('2d');
  const oimg = octx.createImageData(HEAD_DOTS, outH);
  const od = oimg.data;

  for (let r = 0; r < outH; r++) {
    let ly = r + skipTop - shiftY;
    for (let X = 0; X < HEAD_DOTS; X++) {
      let lx = X - ox;
      let black = false;
      if (lx >= 0 && lx < Wd && ly >= 0 && ly < Hd) {
        const sx = flip ? Wd - 1 - lx : lx;
        const sy = flip ? Hd - 1 - ly : ly;
        const p = (sy * Wd + sx) * 4;
        const lum = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
        black = lum < thr;
      }
      const q = (r * HEAD_DOTS + X) * 4;
      if (black) {
        data[r * bpr + (X >> 3)] |= 0x80 >> (X & 7);
        od[q] = od[q + 1] = od[q + 2] = 0;
      } else {
        const inside = lx >= 0 && lx < Wd && ly >= 0 && ly < Hd;
        od[q] = od[q + 1] = od[q + 2] = inside ? 255 : 236;
      }
      od[q + 3] = 255;
    }
  }
  octx.putImageData(oimg, 0, 0);

  const warnings = [];
  if (Wd > HEAD_DOTS) warnings.push(`Etiketa je širšia ako tlačová hlava (${HEAD_MM} mm) – okraje sa nevytlačia.`);
  return { width: HEAD_DOTS, height: outH, bytesPerRow: bpr, data, canvas: out, warnings };
}

// ---------------------------------------------------------------- ESC/POS
const ESC = 0x1b, GS = 0x1d;

function rasterGSv0(r) {
  const head = [GS, 0x76, 0x30, 0x00, r.bytesPerRow & 0xff, r.bytesPerRow >> 8, r.height & 0xff, r.height >> 8];
  const out = new Uint8Array(head.length + r.data.length);
  out.set(head, 0);
  out.set(r.data, head.length);
  return out;
}

// ESC * 33 – po pásoch s výškou 24 bodov (pre tlačiarne s malou vyrovnávacou pamäťou)
function rasterBands(r) {
  const parts = [];
  const W = r.width;
  for (let y0 = 0; y0 < r.height; y0 += 24) {
    const band = new Uint8Array(5 + W * 3 + 3);
    band.set([ESC, 0x2a, 33, W & 0xff, W >> 8], 0);
    let k = 5;
    for (let x = 0; x < W; x++) {
      for (let b = 0; b < 3; b++) {
        let v = 0;
        for (let bit = 0; bit < 8; bit++) {
          const y = y0 + b * 8 + bit;
          if (y < r.height && (r.data[y * r.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7)))) v |= 0x80 >> bit;
        }
        band[k++] = v;
      }
    }
    band.set([ESC, 0x4a, Math.min(24, r.height - y0)], k);
    parts.push(band);
  }
  return concat(parts);
}

function concat(parts) {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function feedCommands(cfg) {
  switch (cfg.feed) {
    case 'ff': return [0x0c];
    case 'none': return [];
    case 'fixed': {
      const out = [];
      let dots = Math.max(0, Math.round((cfg.feedMm || 0) * DPMM));
      while (dots > 0) { const n = Math.min(255, dots); out.push(ESC, 0x4a, n); dots -= n; }
      return out;
    }
    case 'gsff':
    default: return [GS, 0x0c];
  }
}

/** Príkazy pre jednu etiketu (bez inicializácie). */
export function labelCommands(raster, cfg = getSettings()) {
  const parts = [];
  if (cfg.backfeed > 0) parts.push(new Uint8Array([ESC, 0x4b, Math.min(255, Math.round(cfg.backfeed * DPMM))]));
  parts.push(cfg.method === 'bands' ? rasterBands(raster) : rasterGSv0(raster));
  parts.push(new Uint8Array(feedCommands(cfg)));
  return concat(parts);
}

export const INIT = new Uint8Array([ESC, 0x40]);

/**
 * Vytlačí etiketu v zadanom počte kópií.
 * @param {object} label
 * @param {{copies?:number, serialStart?:number, onProgress?:Function, signal?:object}} o
 */
export async function printLabel(label, o = {}) {
  const cfg = getSettings();
  const copies = Math.max(1, o.copies || 1);
  if (state.status !== 'connected') {
    const ok = await reconnect({ quiet: true });
    if (!ok) throw new Error('Tlačiareň nie je pripojená.');
  }
  await sendBytes(INIT, { signal: o.signal });
  for (let i = 0; i < copies; i++) {
    const vars = makeVars(label, (o.serialStart ?? 1) + i * (label.serial?.step || 1));
    const r = await rasterize(label, vars, cfg);
    const bytes = labelCommands(r, cfg);
    await sendBytes(bytes, {
      signal: o.signal,
      onProgress: (sent, total) => o.onProgress?.(i, copies, sent / total),
    });
    if (i < copies - 1 && cfg.copyPause) await sleep(cfg.copyPause);
  }
}

/** Testovacia etiketa s rámčekom a mm pravítkom (na zistenie posunu a nepotlačiteľného okraja). */
export function testLabel(w = 50, h = 30) {
  const items = [];
  let n = 0;
  const id = () => 't' + n++;
  items.push({ id: id(), type: 'shape', shape: 'rect', x: 0, y: 0, w, h, thick: 0.3, rot: 0 });
  for (let y = 1; y < h; y++) {
    const long = y % 5 === 0;
    items.push({ id: id(), type: 'line', x: 0, y: y - 0.1, w: long ? 4 : 2, h: 0.2, thick: 0.2, rot: 0 });
    if (y % 2 === 0) {
      items.push({ id: id(), type: 'text', text: String(y), x: long ? 4.4 : 2.4, y: y - 1.1, w: 4, h: 2.2, size: 5, rot: 0, valign: 'middle' });
    }
  }
  items.push({ id: id(), type: 'text', text: `TEST ${w}×${h} mm`, x: 9, y: h / 2 - 3.2, w: w - 11, h: 3.4, size: 9, bold: true, align: 'center', rot: 0 });
  items.push({ id: id(), type: 'text', text: 'Čísla vľavo = mm od horného okraja', x: 9, y: h / 2 + 0.6, w: w - 11, h: 2.6, size: 5.5, align: 'center', rot: 0, wrap: true, fit: true });
  return { id: 'test', name: 'Test', w, h, items };
}

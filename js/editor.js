// Editor etikety: plátno s prvkami (presun, zmena veľkosti) a panel vlastností.

import {
  $, h, icon, svgIcon, toast, openSheet, confirmDialog, toggle, segmented, stepper, field, row, select,
  clamp, fmt, debounce, pickFile,
} from './ui.js';
import { drawLabel, localSize, measureText, measureTextHeight, FONTS, setImageReadyCallback, makeVars, applyVars, barcodeModuleDots } from './render.js';
import { FORMATS, encodeBarcode, guessFormat, gtinCheck } from './barcode.js';
import { newItem, SIZE_PRESETS } from './templates.js';
import { getSettings } from './store.js';
import { HEAD_MM } from './printer.js';
import { scanCode } from './scan.js';
import { imageFileToDataURL, pdfFileToDataURL } from './importers.js';

const TYPE_NAMES = { text: 'Text', barcode: 'Čiarový kód', qr: 'QR kód', image: 'Obrázok', line: 'Čiara', shape: 'Tvar' };
const TYPE_ICONS = { text: 'text', barcode: 'barcode', qr: 'qr', image: 'image', line: 'line', shape: 'shape' };
const MARGIN = 26; // px okolo etikety na plátne
const HANDLE = 9;

const E = {
  label: null,
  selId: null,
  zoom: 4,
  ox: 0,
  oy: 0,
  cw: 0,
  ch: 0,
  hist: [],
  hi: -1,
  drag: null,
  guides: [],
  save: null,
  print: null,
  posFields: null,
  ro: null,
};

const canvas = () => $('#ed-canvas');
const stage = () => $('#ed-stage');
const panel = () => $('#ed-panel');

export const editorLabel = () => E.label;

// snímka pre históriu (bez časových údajov, ktoré mení ukladanie)
const snapshot = () => JSON.stringify(E.label, (k, v) => (k === 'updated' || k === 'printed' ? undefined : v));

const persist = debounce(() => { if (E.label && E.save) { E.label.updated = Date.now(); E.save(E.label); } }, 350);

// ---------------------------------------------------------------- otvorenie / zatvorenie
export function openEditor(label, { save, print, openPrinter }) {
  E.label = label;
  E.selId = null;
  E.save = save;
  E.print = print;
  E.hist = [snapshot()];
  E.hi = 0;
  $('#ed-title').textContent = label.name;
  $('#ed-title').onclick = () => labelSettings();
  $('#ed-size').onclick = () => labelSettings();
  $('#ed-print').onclick = () => E.print?.(E.label);
  $('#ed-printer').onclick = () => openPrinter?.();
  $('#ed-undo').onclick = undo;
  $('#ed-redo').onclick = redo;
  if (!$('#ed-undo').firstChild) {
    $('#ed-undo').innerHTML = svgIcon('undo');
    $('#ed-redo').innerHTML = svgIcon('redo');
  }
  if (!E.ro) {
    E.ro = new ResizeObserver(() => { layout(); draw(); });
    E.ro.observe(stage());
    bindPointer();
    setImageReadyCallback(() => { if (E.label) draw(); });
    document.addEventListener('keydown', onKey);
  }
  updateHeader();
  renderPanel();
  requestAnimationFrame(() => { layout(); draw(); });
}

export function closeEditor() {
  if (E.label) persist.flush();
  E.label = null;
  E.selId = null;
}

export function editorIsOpen() { return !!E.label; }

/** Zavolá sa po zmene nastavení tlače (napr. nepotlačiteľný okraj) alebo stavu tlačiarne. */
export function refreshEditor() { if (E.label) { updateHeader(); draw(); } }

export function setPrinterChip(st) {
  const chip = $('#ed-printer');
  chip.innerHTML = '';
  chip.append(h('span', { class: 'dot ' + (st.connected ? 'ok' : st.status === 'connecting' ? 'wait' : 'off') }),
    st.connected ? 'Pripojená' : st.status === 'connecting' ? 'Pripájam…' : 'Tlačiareň');
}

function updateHeader() {
  const l = E.label;
  $('#ed-title').textContent = l.name || 'Etiketa';
  $('#ed-size').textContent = `${fmt(l.w)} × ${fmt(l.h)} mm`;
  const cfg = getSettings();
  $('#ed-hint').textContent = cfg.topSkip > 0 || l.w > HEAD_MM ? 'šrafované = netlačí sa' : '';
  $('#ed-undo').disabled = E.hi <= 0;
  $('#ed-redo').disabled = E.hi >= E.hist.length - 1;
}

// ---------------------------------------------------------------- história
function commit() {
  const snap = snapshot();
  if (snap === E.hist[E.hi]) return;
  E.hist = E.hist.slice(0, E.hi + 1);
  E.hist.push(snap);
  if (E.hist.length > 40) E.hist.shift();
  E.hi = E.hist.length - 1;
  persist();
  updateHeader();
}
const commitSoon = debounce(commit, 500);

function restore(i) {
  E.hi = i;
  const l = JSON.parse(E.hist[i]);
  Object.keys(E.label).forEach((k) => delete E.label[k]);
  Object.assign(E.label, l);
  if (!E.label.items.find((it) => it.id === E.selId)) E.selId = null;
  persist();
  updateHeader();
  renderPanel();
  layout();
  draw();
}
function undo() { commitSoon.flush(); if (E.hi > 0) restore(E.hi - 1); }
function redo() { if (E.hi < E.hist.length - 1) restore(E.hi + 1); }

// ---------------------------------------------------------------- kreslenie
function layout() {
  const st = stage();
  if (!st || !E.label) return;
  const r = st.getBoundingClientRect();
  E.cw = Math.max(50, r.width);
  E.ch = Math.max(50, r.height);
  E.zoom = clamp(Math.min((E.cw - MARGIN * 2) / E.label.w, (E.ch - MARGIN * 2) / E.label.h), 1.5, 60);
  E.ox = Math.round((E.cw - E.label.w * E.zoom) / 2);
  E.oy = Math.round((E.ch - E.label.h * E.zoom) / 2);
  const c = canvas();
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(E.cw * dpr);
  c.height = Math.round(E.ch * dpr);
  c.style.width = E.cw + 'px';
  c.style.height = E.ch + 'px';
}

function hatch(ctx, x, y, w, h, z, text) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x * z, y * z, w * z, h * z);
  ctx.clip();
  ctx.fillStyle = 'rgba(110,118,129,.13)';
  ctx.fillRect(x * z, y * z, w * z, h * z);
  ctx.strokeStyle = 'rgba(110,118,129,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 7;
  for (let d = -h * z; d < w * z + h * z; d += step) {
    ctx.moveTo(x * z + d, y * z);
    ctx.lineTo(x * z + d + h * z, y * z + h * z);
  }
  ctx.stroke();
  if (text && h * z > 11 && w * z > 60) {
    ctx.fillStyle = 'rgba(70,76,85,.85)';
    ctx.font = '600 10px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, (x + w / 2) * z, (y + h / 2) * z);
  }
  ctx.restore();
}

function selected() { return E.label?.items.find((it) => it.id === E.selId) || null; }

function handlesFor(it) {
  const z = E.zoom;
  const x = it.x * z, y = it.y * z, w = it.w * z, hh = it.h * z;
  const hs = [{ k: 'br', x: x + w, y: y + hh }];
  if (it.type !== 'qr') {
    hs.push({ k: 'r', x: x + w, y: y + hh / 2 });
    if (it.type !== 'line' || it.rot === 90 || it.rot === 270) hs.push({ k: 'b', x: x + w / 2, y: y + hh });
  }
  return hs;
}

function draw() {
  const c = canvas();
  if (!c || !E.label) return;
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const l = E.label;
  const z = E.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, E.cw, E.ch);
  ctx.save();
  ctx.translate(E.ox, E.oy);
  // etiketa s tieňom
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,.18)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#fff';
  const r = Math.min(10, 1.2 * z);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, l.w * z, l.h * z, r); else ctx.rect(0, 0, l.w * z, l.h * z);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, l.w * z, l.h * z, r); else ctx.rect(0, 0, l.w * z, l.h * z);
  ctx.clip();
  drawLabel(ctx, l, z, { background: false, vars: makeVars(l) });

  // nepotlačiteľné oblasti
  const cfg = getSettings();
  const offX = (HEAD_MM - l.w) / 2 + (cfg.offsetX || 0);
  const leftCut = -offX, rightEdge = HEAD_MM - offX;
  const topCut = (cfg.topSkip || 0) - (cfg.offsetY || 0);
  const bottomEdge = l.h - (cfg.offsetY || 0);
  hatch(ctx, 0, 0, l.w, topCut, z, 'netlačí sa');
  hatch(ctx, 0, bottomEdge, l.w, l.h - bottomEdge, z, '');
  hatch(ctx, 0, Math.max(0, topCut), leftCut, l.h, z, '');
  hatch(ctx, rightEdge, Math.max(0, topCut), l.w - rightEdge, l.h, z, '');
  ctx.restore();

  // obrysy prvkov
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(47,111,236,.35)';
  for (const it of l.items) {
    if (it.id === E.selId) continue;
    ctx.strokeRect(Math.round(it.x * z) + 0.5, Math.round(it.y * z) + 0.5, Math.round(it.w * z), Math.round(it.h * z));
  }
  ctx.restore();

  // vodiace čiary
  if (E.guides.length) {
    ctx.save();
    ctx.strokeStyle = '#e5398f';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const g of E.guides) {
      ctx.beginPath();
      if (g.v != null) { ctx.moveTo(g.v * z + 0.5, -12); ctx.lineTo(g.v * z + 0.5, l.h * z + 12); }
      else { ctx.moveTo(-12, g.hh * z + 0.5); ctx.lineTo(l.w * z + 12, g.hh * z + 0.5); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // výber
  const it = selected();
  if (it) {
    ctx.save();
    ctx.strokeStyle = '#2f6fec';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(it.x * z, it.y * z, it.w * z, it.h * z);
    for (const hd of handlesFor(it)) {
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, hd.k === 'br' ? HANDLE : HANDLE - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- dotyk / myš
function toMm(e) {
  const r = canvas().getBoundingClientRect();
  const px = e.clientX - r.left - E.ox, py = e.clientY - r.top - E.oy;
  return { x: px / E.zoom, y: py / E.zoom, px, py };
}

function hitItem(p) {
  const tol = Math.max(0.6, 8 / E.zoom);
  const items = E.label.items;
  // najprv presný zásah zhora, potom s toleranciou
  for (const pad of [0, tol]) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (p.x >= it.x - pad && p.x <= it.x + it.w + pad && p.y >= it.y - pad && p.y <= it.y + it.h + pad) return it;
    }
  }
  return null;
}

function hitHandle(p) {
  const it = selected();
  if (!it) return null;
  for (const hd of handlesFor(it)) {
    if (Math.hypot(p.px - hd.x, p.py - hd.y) <= 20) return hd.k;
  }
  return null;
}

const r1 = (v) => Math.round(v * 10) / 10;

function snapMove(it, nx, ny) {
  const l = E.label;
  const tol = 7 / E.zoom;
  E.guides = [];
  const cxs = [[nx + it.w / 2, l.w / 2, 'c'], [nx, 0, 'l'], [nx + it.w, l.w, 'r']];
  for (const [v, t, k] of cxs) {
    if (Math.abs(v - t) < tol) {
      nx = k === 'c' ? t - it.w / 2 : k === 'l' ? t : t - it.w;
      E.guides.push({ v: t });
      break;
    }
  }
  const cys = [[ny + it.h / 2, l.h / 2, 'c'], [ny, 0, 't'], [ny + it.h, l.h, 'b']];
  for (const [v, t, k] of cys) {
    if (Math.abs(v - t) < tol) {
      ny = k === 'c' ? t - it.h / 2 : k === 't' ? t : t - it.h;
      E.guides.push({ hh: t });
      break;
    }
  }
  return { x: r1(nx), y: r1(ny) };
}

function bindPointer() {
  const c = canvas();
  c.addEventListener('pointerdown', (e) => {
    if (!E.label) return;
    const p = toMm(e);
    const hk = hitHandle(p);
    const cur = selected();
    if (hk && cur) {
      E.drag = { mode: 'resize', k: hk, id: cur.id, start: { ...cur }, p0: p, moved: false };
    } else {
      const hit = hitItem(p);
      if (hit) {
        const wasSel = hit.id === E.selId;
        if (!wasSel) selectItem(hit.id);
        E.drag = { mode: 'move', id: hit.id, start: { ...hit }, p0: p, moved: false, wasSel };
      } else {
        if (E.selId) selectItem(null);
        E.drag = null;
      }
    }
    if (E.drag) c.setPointerCapture(e.pointerId);
    draw();
  });
  c.addEventListener('pointermove', (e) => {
    const d = E.drag;
    if (!d) return;
    const p = toMm(e);
    if (!d.moved && Math.hypot(p.px - d.p0.px, p.py - d.p0.py) < 4) return;
    d.moved = true;
    const it = E.label.items.find((x) => x.id === d.id);
    if (!it) return;
    const dx = p.x - d.p0.x, dy = p.y - d.p0.y;
    if (d.mode === 'move') {
      const s = snapMove(it, d.start.x + dx, d.start.y + dy);
      it.x = s.x; it.y = s.y;
    } else {
      const min = 1;
      if (it.type === 'qr') {
        const side = r1(Math.max(min, Math.max(d.start.w + dx, d.start.h + dy)));
        it.w = side; it.h = side;
      } else {
        if (d.k === 'br' || d.k === 'r') { it.w = r1(Math.max(min, d.start.w + dx)); if (it.type === 'text') it.autoW = false; }
        if (d.k === 'br' || d.k === 'b') it.h = r1(Math.max(it.type === 'line' ? 0.5 : min, d.start.h + dy));
      }
    }
    syncPosFields();
    draw();
  });
  const end = () => {
    const d = E.drag;
    E.drag = null;
    E.guides = [];
    if (d && d.moved) commit();
    else if (d && d.wasSel && d.mode === 'move') {
      const it = selected();
      if (it && it.type === 'text') { const ta = panel().querySelector('textarea'); ta?.focus(); }
    }
    draw();
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

function onKey(e) {
  if (!E.label || document.querySelector('.sheet-wrap')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const it = selected();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (!it) return;
  const step = e.shiftKey ? 2 : 0.5;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    e.preventDefault();
    it.x = r1(it.x + moves[e.key][0]);
    it.y = r1(it.y + moves[e.key][1]);
    syncPosFields(); draw(); commitSoon();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removeSelected();
  }
}

// ---------------------------------------------------------------- výber a úpravy
function selectItem(id) {
  commitSoon.flush();
  E.selId = id;
  renderPanel();
}

function update(it, patch, { soon = true } = {}) {
  Object.assign(it, patch);
  if (it.type === 'text' && ('text' in patch || 'size' in patch || 'font' in patch || 'bold' in patch || 'wrap' in patch)) autoGrow(it);
  draw();
  if (soon) commitSoon(); else commit();
}

function autoGrow(it) {
  if (it.fit) return;
  const l = E.label;
  const vert = it.rot === 90 || it.rot === 270;
  const vars = makeVars(l);
  // najprv rozšíriť rámček (až po okraj etikety), až potom zalamovať a zvyšovať
  const natural = r1(measureText(it, vars).w);
  const ls = localSize(it);
  const room = vert ? l.h - Math.max(0, it.y) - 0.5 : l.w - Math.max(0, it.x) - 0.5;
  if (it.autoW !== false && natural > ls.w + 0.05 && room > ls.w) {
    const nw = r1(Math.min(natural, room));
    if (vert) it.h = nw; else it.w = nw;
  }
  const lw = localSize(it).w;
  const need = Math.round(measureTextHeight(it, lw, vars) * 10) / 10;
  if (need > localSize(it).h + 0.05) {
    if (vert) it.w = need; else it.h = need;
  }
  syncPosFields();
}

/** Po otočení alebo zmene veľkosti etikety udrží prvok vo vnútri etikety. */
function keepInside(it) {
  const l = E.label;
  if (it.w > l.w) {
    if (it.type === 'qr') { it.w = it.h = r1(Math.min(l.w, l.h)); } else it.w = r1(l.w);
  }
  if (it.h > l.h) {
    if (it.type === 'qr') { it.w = it.h = r1(Math.min(l.w, l.h)); } else it.h = r1(l.h);
  }
  it.x = r1(clamp(it.x, 0, l.w - it.w));
  it.y = r1(clamp(it.y, 0, l.h - it.h));
}

function addItem(it) {
  E.label.items.push(it);
  E.selId = it.id;
  commit();
  renderPanel();
  draw();
}

function removeSelected() {
  const it = selected();
  if (!it) return;
  E.label.items = E.label.items.filter((x) => x !== it);
  E.selId = null;
  commit();
  renderPanel();
  draw();
}

function duplicateSelected() {
  const it = selected();
  if (!it) return;
  const copy = JSON.parse(JSON.stringify(it));
  copy.id = Math.random().toString(36).slice(2, 10);
  copy.x = r1(Math.min(E.label.w - 1, it.x + 2));
  copy.y = r1(Math.min(E.label.h - 1, it.y + 2));
  addItem(copy);
  toast('Prvok bol skopírovaný');
}

function moveLayer(dir) {
  const items = E.label.items;
  const i = items.findIndex((x) => x.id === E.selId);
  const j = clamp(i + dir, 0, items.length - 1);
  if (i < 0 || i === j) return;
  const [it] = items.splice(i, 1);
  items.splice(j, 0, it);
  commit();
  draw();
  toast(dir > 0 ? 'Presunuté dopredu' : 'Presunuté dozadu');
}

function setRotation(it, rot) {
  const swapOld = it.rot === 90 || it.rot === 270;
  const swapNew = rot === 90 || rot === 270;
  if (swapOld !== swapNew) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    [it.w, it.h] = [it.h, it.w];
    it.x = r1(cx - it.w / 2);
    it.y = r1(cy - it.h / 2);
    keepInside(it);
  }
  it.rot = rot;
  syncPosFields();
  draw();
  commit();
}

function syncPosFields() {
  const it = selected();
  const f = E.posFields;
  if (!it || !f) return;
  f.x.set(it.x); f.y.set(it.y); f.w.set(it.w); f.h.set(it.h);
}

// ---------------------------------------------------------------- pridávanie prvkov
async function addOfType(type) {
  const l = E.label;
  if (type === 'image') {
    const file = await pickFile('image/*,application/pdf');
    if (!file) return;
    let res;
    try {
      res = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name) ? await pdfFileToDataURL(file) : await imageFileToDataURL(file);
    } catch (e) { toast(e.message || 'Súbor sa nepodarilo načítať'); return; }
    if (!res) return;
    const it = newItem('image', l, { src: res.src });
    fitBox(it, res.w / res.h);
    addItem(it);
    return;
  }
  let it;
  if (type === 'date') it = newItem('text', l, { text: '{datum}', size: 10 });
  else if (type === 'serial') it = newItem('text', l, { text: 'č. {cislo}', size: 10 });
  else it = newItem(type, l);
  if (it.type === 'text') {
    const m = measureText(it, makeVars(l));
    it.w = r1(Math.min(l.w - it.x - 0.5, Math.max(8, m.w)));
    it.h = r1(m.h);
  }
  // ďalší prvok trochu nižšie, aby neprekrýval predchádzajúci
  const n = l.items.filter((x) => x.type === it.type).length;
  if (n && it.type !== 'shape') it.y = r1(Math.min(l.h - it.h, it.y + n * 3));
  addItem(it);
  if (it.type === 'text') setTimeout(() => { const ta = panel().querySelector('textarea'); ta?.focus(); ta?.select(); }, 60);
}

function fitBox(it, aspect) {
  const l = E.label;
  const top = Math.min(getSettings().topSkip || 0, l.h * 0.4);
  const aw = l.w - 2, ah = l.h - top - 1;
  let w = aw, hh = aw / aspect;
  if (hh > ah) { hh = ah; w = ah * aspect; }
  it.w = r1(w); it.h = r1(hh);
  it.x = r1((l.w - w) / 2);
  it.y = r1(top + (ah - hh) / 2 + 0.5);
}

// ---------------------------------------------------------------- panel
function renderPanel() {
  const p = panel();
  p.innerHTML = '';
  E.posFields = null;
  const it = selected();
  if (!it) {
    p.classList.remove('props');
    const add = (type, label, ic) => h('button', { class: 'tool', type: 'button', onclick: () => addOfType(type) }, icon(ic, 26), h('span', null, label));
    p.append(
      h('div', { class: 'tools' },
        add('text', 'Text', 'text'),
        add('barcode', 'Čiarový kód', 'barcode'),
        add('qr', 'QR kód', 'qr'),
        add('image', 'Obrázok', 'image'),
        add('date', 'Dátum', 'calendar'),
        add('serial', 'Číslovanie', 'hash'),
        add('line', 'Čiara', 'line'),
        add('shape', 'Rámček', 'shape'),
      ),
      h('div', { class: 'tools-hint muted' }, E.label.items.length
        ? 'Ťuknite na prvok na etikete a upravte ho. Ťahaním ho presuniete.'
        : 'Pridajte prvý prvok – napríklad text alebo čiarový kód.'),
    );
    return;
  }
  p.classList.add('props');
  const head = h('div', { class: 'props-head' },
    h('div', { class: 'props-title' }, icon(TYPE_ICONS[it.type], 20), h('span', null, TYPE_NAMES[it.type] || 'Prvok')),
    h('div', { class: 'props-actions' },
      h('button', { class: 'icon-btn', type: 'button', title: 'Kopírovať', 'aria-label': 'Kopírovať', onclick: duplicateSelected, html: svgIcon('copy', 20) }),
      h('button', { class: 'icon-btn', type: 'button', title: 'Dopredu', 'aria-label': 'Dopredu', onclick: () => moveLayer(1), html: svgIcon('front', 20) }),
      h('button', { class: 'icon-btn', type: 'button', title: 'Dozadu', 'aria-label': 'Dozadu', onclick: () => moveLayer(-1), html: svgIcon('backward', 20) }),
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Zmazať', 'aria-label': 'Zmazať', onclick: removeSelected, html: svgIcon('trash', 20) }),
      h('button', { class: 'icon-btn accent', type: 'button', title: 'Hotovo', 'aria-label': 'Hotovo', onclick: () => { selectItem(null); draw(); }, html: svgIcon('check', 22) }),
    ));
  const body = h('div', { class: 'props-body' });
  p.append(head, body);

  const builders = { text: textProps, barcode: barcodeProps, qr: qrProps, image: imageProps, line: lineProps, shape: shapeProps };
  builders[it.type]?.(it, body);
  body.append(positionProps(it));
}

function insertAtCursor(ta, str) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + str + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + str.length;
  ta.focus();
  ta.dispatchEvent(new Event('input'));
}

function textProps(it, body) {
  const ta = h('textarea', { class: 'input', rows: 2, value: it.text || '', placeholder: 'Napíšte text…' });
  ta.addEventListener('input', () => update(it, { text: ta.value }));
  const chip = (label, str) => h('button', { class: 'chip chip-sm', type: 'button', onclick: () => insertAtCursor(ta, str) }, label);
  body.append(
    field('Text', ta),
    h('div', { class: 'chips' }, chip('+ dnešný dátum', '{datum}'), chip('+ dátum o 7 dní', '{datum+7}'), chip('+ čas', '{cas}'), chip('+ poradové číslo', '{cislo}')),
    h('div', { class: 'grid2' },
      field('Písmo', select(FONTS.map((f) => ({ value: f.id, label: f.name })), it.font || 'sans', (v) => update(it, { font: v }))),
      field('Veľkosť (bodov)', stepper(it.size || 10, { step: 0.5, min: 3, max: 150 }, (v) => update(it, { size: v }))),
    ),
    field('Štýl', h('div', { class: 'seg seg-multi' },
      styleBtn(it, 'bold', h('b', null, 'B'), 'Tučné'),
      styleBtn(it, 'italic', h('i', null, 'I'), 'Kurzíva'),
      styleBtn(it, 'underline', h('u', null, 'U'), 'Podčiarknuté'),
      styleBtn(it, 'invert', h('span', { class: 'inv' }, 'A'), 'Biely na čiernom'),
    )),
    h('div', { class: 'grid2' },
      field('Zarovnanie', segmented([
        { value: 'left', icon: 'alignL', title: 'Vľavo' },
        { value: 'center', icon: 'alignC', title: 'Na stred' },
        { value: 'right', icon: 'alignR', title: 'Vpravo' },
      ], it.align || 'left', (v) => update(it, { align: v }))),
      field('Zvislo', segmented([
        { value: 'top', icon: 'vTop', title: 'Hore' },
        { value: 'middle', icon: 'vMid', title: 'Na stred' },
        { value: 'bottom', icon: 'vBot', title: 'Dole' },
      ], it.valign || 'middle', (v) => update(it, { valign: v }))),
    ),
    row('Zalamovať riadky', toggle(it.wrap !== false, (v) => update(it, { wrap: v }))),
    row('Zmenšiť písmo, aby sa text zmestil', toggle(!!it.fit, (v) => update(it, { fit: v }))),
    h('p', { class: 'field-hint' }, 'Premenné: {datum} = dnešný dátum, {datum+7} = o 7 dní, {cas} = čas, {cislo} = poradové číslo (pri tlači viacerých kópií sa zvyšuje).'),
  );
}

function styleBtn(it, key, content, title) {
  const b = h('button', { type: 'button', class: it[key] ? 'on' : '', title, 'aria-label': title }, content);
  b.addEventListener('click', () => { b.classList.toggle('on'); update(it, { [key]: b.classList.contains('on') }); });
  return b;
}

function barcodeProps(it, body) {
  const msg = h('div', { class: 'field-hint' });
  const inp = h('input', { class: 'input', type: 'text', value: it.data || '', inputmode: /EAN|UPC/.test(it.format) ? 'numeric' : 'text', autocomplete: 'off' });
  const validate = () => {
    const raw = applyVars(it.data, makeVars(E.label));
    const enc = encodeBarcode(it.format, raw);
    msg.className = 'field-hint' + (enc.ok ? '' : ' error');
    if (!enc.ok) { msg.textContent = enc.error; return; }
    const { m } = barcodeModuleDots(it, enc, localSize(it).w);
    let t = `Kódované: ${enc.text}`;
    if (/EAN|UPC/.test(it.format) && raw.replace(/\D/g, '').length < enc.text.length) t += ` (doplnená kontrolná číslica ${enc.text.slice(-1)})`;
    if (m < 1) t += ' · ⚠ Kód je príliš úzky – zväčšite šírku rámčeka.';
    else if (m < 2) t += ' · ⚠ Tenké čiary (1 bod) – pre spoľahlivé čítanie zväčšite šírku.';
    msg.textContent = t;
  };
  inp.addEventListener('input', () => { update(it, { data: inp.value.trim() }); validate(); });
  const scanBtn = h('button', { class: 'btn btn-icon', type: 'button', title: 'Skenovať', 'aria-label': 'Skenovať', html: svgIcon('camera', 22) });
  scanBtn.addEventListener('click', async () => {
    const r = await scanCode({ title: 'Načítať čiarový kód' });
    if (!r) return;
    const fmtId = r.format && r.format !== 'QR' ? r.format : guessFormat(r.text);
    inp.value = r.text;
    update(it, { data: r.text, format: fmtId }, { soon: false });
    renderPanel();
  });
  const fmtSel = select(FORMATS.map((f) => ({ value: f.id, label: f.name })), it.format, (v) => {
    update(it, { format: v }, { soon: false });
    inp.inputMode = /EAN|UPC/.test(v) ? 'numeric' : 'text';
    validate();
  });
  body.append(
    field('Typ kódu', fmtSel),
    field('Obsah kódu', h('div', { class: 'input-row' }, inp, scanBtn), msg),
    row('Zobraziť číslo pod kódom', toggle(it.showText !== false, (v) => { update(it, { showText: v }); validate(); })),
    field('Veľkosť čísla (bodov)', stepper(it.textSize || 8, { step: 0.5, min: 4, max: 30 }, (v) => update(it, { textSize: v }))),
  );
  validate();
}

function qrProps(it, body) {
  const ta = h('textarea', { class: 'input', rows: 2, value: it.data || '', placeholder: 'Text alebo webová adresa' });
  const msg = h('div', { class: 'field-hint' });
  const info = () => {
    const ok = !!(it.data && it.data.length);
    msg.className = 'field-hint' + (ok ? '' : ' error');
    msg.textContent = ok ? `${it.data.length} znakov` : 'Zadajte obsah QR kódu.';
  };
  ta.addEventListener('input', () => { update(it, { data: ta.value }); info(); });
  const scanBtn = h('button', { class: 'btn btn-icon', type: 'button', title: 'Skenovať', 'aria-label': 'Skenovať', html: svgIcon('camera', 22) });
  scanBtn.addEventListener('click', async () => {
    const r = await scanCode({ title: 'Načítať kód' });
    if (!r) return;
    ta.value = r.text;
    update(it, { data: r.text }, { soon: false });
    info();
  });
  body.append(
    field('Obsah', h('div', { class: 'input-row' }, ta, scanBtn), msg),
    field('Odolnosť voči poškodeniu', segmented([
      { value: 'L', label: 'L 7 %' }, { value: 'M', label: 'M 15 %' }, { value: 'Q', label: 'Q 25 %' }, { value: 'H', label: 'H 30 %' },
    ], it.ec || 'M', (v) => update(it, { ec: v }, { soon: false }))),
  );
  info();
}

function imageProps(it, body) {
  const change = h('button', { class: 'btn', type: 'button' }, icon('image', 20), h('span', null, 'Zmeniť obrázok'));
  change.addEventListener('click', async () => {
    const file = await pickFile('image/*,application/pdf');
    if (!file) return;
    try {
      const res = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name) ? await pdfFileToDataURL(file) : await imageFileToDataURL(file);
      if (res) update(it, { src: res.src }, { soon: false });
    } catch (e) { toast(e.message); }
  });
  const thr = h('input', { type: 'range', min: 20, max: 235, step: 1, value: it.threshold ?? 128, class: 'range' });
  thr.addEventListener('input', () => update(it, { threshold: Number(thr.value) }));
  body.append(
    h('div', { class: 'btn-row' }, change),
    field('Prevod na čiernobielo', segmented([
      { value: 'dither', label: 'Fotka (bodky)' },
      { value: 'threshold', label: 'Logo / text' },
    ], it.mode || 'dither', (v) => update(it, { mode: v }, { soon: false }))),
    field('Sýtosť', h('div', { class: 'range-row' }, h('span', { class: 'muted' }, 'svetlejšie'), thr, h('span', { class: 'muted' }, 'tmavšie'))),
    row('Invertovať farby', toggle(!!it.invert, (v) => update(it, { invert: v }, { soon: false }))),
    row('Roztiahnuť na celý rámček', toggle(it.fit === 'stretch', (v) => update(it, { fit: v ? 'stretch' : 'contain' }, { soon: false }))),
  );
}

function lineProps(it, body) {
  body.append(
    field('Hrúbka (mm)', stepper(it.thick ?? 0.4, { step: 0.1, min: 0.1, max: 5 }, (v) => update(it, { thick: v }))),
    row('Prerušovaná', toggle(!!it.dash, (v) => update(it, { dash: v }, { soon: false }))),
    field('Smer', segmented([{ value: 'h', label: 'Vodorovná' }, { value: 'v', label: 'Zvislá' }],
      it.rot === 90 || it.rot === 270 ? 'v' : 'h', (v) => setRotation(it, v === 'v' ? 90 : 0))),
  );
}

function shapeProps(it, body) {
  body.append(
    field('Tvar', segmented([{ value: 'rect', label: 'Obdĺžnik' }, { value: 'ellipse', label: 'Elipsa' }], it.shape || 'rect',
      (v) => { update(it, { shape: v }, { soon: false }); renderPanel(); })),
    row('Vyplnený', toggle(!!it.fill, (v) => update(it, { fill: v }, { soon: false }))),
    h('div', { class: 'grid2' },
      field('Hrúbka okraja (mm)', stepper(it.thick ?? 0.5, { step: 0.1, min: 0.1, max: 10 }, (v) => update(it, { thick: v }))),
      it.shape !== 'ellipse' ? field('Zaoblenie (mm)', stepper(it.radius ?? 0, { step: 0.5, min: 0, max: 20 }, (v) => update(it, { radius: v }))) : null,
    ),
  );
}

function positionProps(it) {
  const set = (k) => (v) => update(it, { [k]: v });
  E.posFields = {
    x: stepper(it.x, { step: 0.5, min: -200, max: 400, suffix: 'mm' }, set('x')),
    y: stepper(it.y, { step: 0.5, min: -200, max: 400, suffix: 'mm' }, set('y')),
    w: stepper(it.w, { step: 0.5, min: 0.5, max: 400, suffix: 'mm' }, (v) => update(it, it.type === 'qr' ? { w: v, h: v } : it.type === 'text' ? { w: v, autoW: false } : { w: v })),
    h: stepper(it.h, { step: 0.5, min: 0.5, max: 400, suffix: 'mm' }, (v) => update(it, it.type === 'qr' ? { w: v, h: v } : { h: v })),
  };
  const center = (axis) => {
    if (axis === 'x') it.x = r1((E.label.w - it.w) / 2);
    else it.y = r1((E.label.h - it.h) / 2);
    syncPosFields(); draw(); commit();
  };
  return h('div', { class: 'props-section' },
    h('div', { class: 'props-sub' }, 'Poloha a veľkosť'),
    h('div', { class: 'grid2' },
      field('Zľava (X)', E.posFields.x),
      field('Zhora (Y)', E.posFields.y),
      field('Šírka', E.posFields.w),
      field('Výška', E.posFields.h),
    ),
    it.type !== 'line' ? field('Otočenie', segmented([0, 90, 180, 270].map((r) => ({ value: r, label: r + '°' })), it.rot || 0, (v) => setRotation(it, Number(v)))) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => center('x') }, icon('centerH', 20), h('span', null, 'Na stred ↔')),
      h('button', { class: 'btn', type: 'button', onclick: () => center('y') }, icon('centerV', 20), h('span', null, 'Na stred ↕')),
    ),
  );
}

// ---------------------------------------------------------------- nastavenia etikety
function labelSettings() {
  const l = E.label;
  const name = h('input', { class: 'input', type: 'text', value: l.name || '' });
  name.addEventListener('input', () => { l.name = name.value; updateHeader(); commitSoon(); });
  const wS = stepper(l.w, { step: 1, min: 10, max: 120, suffix: 'mm' }, (v) => { l.w = v; changed(); });
  const hS = stepper(l.h, { step: 1, min: 8, max: 200, suffix: 'mm' }, (v) => { l.h = v; changed(); });
  const changed = () => { updateHeader(); layout(); draw(); commitSoon(); presets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === `${l.w}x${l.h}`)); };
  const presets = h('div', { class: 'chips' }, SIZE_PRESETS.map(([w, hh]) => h('button', {
    class: 'chip' + (l.w === w && l.h === hh ? ' on' : ''), type: 'button', 'data-k': `${w}x${hh}`,
    onclick: () => { l.w = w; l.h = hh; wS.set(w); hS.set(hh); changed(); },
  }, `${w}×${hh}`)));
  const serial = l.serial || (l.serial = { start: 1, step: 1, digits: 0, next: 1 });
  const body = h('div', null,
    field('Názov', name),
    h('div', { class: 'grid2' }, field('Šírka', wS), field('Výška', hS)),
    field('Bežné veľkosti', presets),
    row('Otočiť o 180° pri tlači', toggle(!!l.flip, (v) => { l.flip = v; commitSoon(); }), 'Ak vychádza etiketa z tlačiarne hore nohami.'),
    h('div', { class: 'props-sub' }, 'Poradové číslo {cislo}'),
    h('div', { class: 'grid2' },
      field('Ďalšie číslo', stepper(serial.next ?? serial.start ?? 1, { step: 1, min: 0, max: 99999999, dec: 0 }, (v) => { serial.next = v; commitSoon(); })),
      field('Krok', stepper(serial.step || 1, { step: 1, min: 1, max: 1000, dec: 0 }, (v) => { serial.step = v; commitSoon(); })),
    ),
    field('Počet číslic (doplniť nulami)', stepper(serial.digits || 0, { step: 1, min: 0, max: 12, dec: 0 }, (v) => { serial.digits = v; draw(); commitSoon(); }), 'Napr. 5 → 00001'),
  );
  openSheet({ title: 'Etiketa', body, onClose: () => { commitSoon.flush(); updateHeader(); layout(); draw(); } });
}

export async function confirmLeaveIfEmpty() {
  if (E.label && !E.label.items.length) {
    return confirmDialog('Etiketa je prázdna. Ponechať ju v zozname?', { ok: 'Ponechať', cancel: 'Zahodiť' });
  }
  return true;
}

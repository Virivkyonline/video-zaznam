// Tlač etikiet – hlavný modul: obrazovky, navigácia, tlač.

import {
  $, $$, h, icon, svgIcon, toast, hideToast, openSheet, dropAllSheets, actionSheet, confirmDialog, promptDialog,
  toggle, stepper, field, row, select, fmt, pickFile, downloadBlob, sleep,
} from './ui.js';
import { allLabels, getLabel, putLabel, deleteLabel, getSettings, setSettings, resetSettings } from './store.js';
import { thumbnail, preloadImages, usesSerial, makeVars, applyVars, qrMatrix, localSize } from './render.js';
import { encodeBarcode, guessFormat } from './barcode.js';
import { TEMPLATES, SIZE_PRESETS, labelFromTemplate, newLabel, newItem } from './templates.js';
import {
  onStatus, getStatus, bluetoothSupport, choosePrinter, reconnect, disconnect, forget, printLabel,
  rasterize, testLabel, canReconnectSilently, HEAD_MM,
} from './printer.js';
import { openEditor, closeEditor, editorLabel, refreshEditor, setPrinterChip } from './editor.js';
import { scanCode, scannerSupported } from './scan.js';
import { imageFileToDataURL, pdfFileToDataURL } from './importers.js';

const VERSION = '1.0.0';

// ---------------------------------------------------------------- navigácia
let current = '';
let navCount = 0;

export async function go(hash) {
  const n = dropAllSheets();
  if (n) {
    await new Promise((resolve) => {
      const f = () => { window.removeEventListener('popstate', f); resolve(); };
      window.addEventListener('popstate', f);
      history.go(-n);
    });
  }
  if (location.hash === hash) route();
  else location.hash = hash;
}

function back() {
  if (navCount > 1) history.back();
  else go('#/');
}

async function route() {
  navCount++;
  const hash = location.hash || '#/';
  const [, page, arg] = hash.match(/^#\/?([^/]*)\/?(.*)$/) || [];
  let view = 'home';
  if (page === 'sablony') view = 'templates';
  else if (page === 'ja') view = 'me';
  else if (page === 'tlaciaren') view = 'printer';
  else if (page === 'editor' && arg) view = 'editor';

  if (current === 'editor' && view !== 'editor') await leaveEditor();
  current = view;

  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
  $('#tabbar').hidden = !['home', 'templates', 'me'].includes(view);
  $$('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === view));
  document.body.dataset.view = view;

  if (view === 'home') renderHome();
  else if (view === 'templates') renderTemplates();
  else if (view === 'me') renderMe();
  else if (view === 'printer') renderPrinter();
  else if (view === 'editor') {
    const label = await getLabel(decodeURIComponent(arg));
    if (!label) { toast('Etiketa sa nenašla'); go('#/'); return; }
    openEditor(label, { save: (l) => putLabel(l), print: openPrint, openPrinter: () => go('#/tlaciaren') });
    setPrinterChip(getStatus());
  }
  window.scrollTo(0, 0);
}

async function leaveEditor() {
  const l = editorLabel();
  closeEditor();
  if (l && !l.items.length) {
    await deleteLabel(l.id);
    toast('Prázdna etiketa nebola uložená');
  } else if (l) {
    l.updated = Date.now();
    await putLabel(l);
  }
}

async function openNew(label) {
  await putLabel(label);
  setSettings({ lastW: label.w, lastH: label.h });
  go('#/editor/' + encodeURIComponent(label.id));
}

// ---------------------------------------------------------------- stav tlačiarne
function printerBadge(btn) {
  const st = getStatus();
  btn.innerHTML = svgIcon('printer', 30);
  btn.append(h('span', { class: 'badge ' + (st.connected ? 'ok' : 'off'), html: svgIcon(st.connected ? 'check' : 'close', 12) }));
  btn.title = st.connected ? `Pripojená: ${st.name}` : 'Tlačiareň nie je pripojená';
}

function updatePrinterUI() {
  const st = getStatus();
  printerBadge($('#home-printer'));
  const card = $('#home-printer-card');
  card.innerHTML = '';
  card.className = 'printer-card ' + (st.connected ? 'ok' : '');
  card.append(
    icon('bluetooth', 22),
    h('div', { class: 'pc-text' },
      h('div', { class: 'pc-title' }, st.connected ? st.name : st.status === 'connecting' ? 'Pripájam tlačiareň…' : 'Tlačiareň nie je pripojená'),
      h('div', { class: 'pc-sub' }, st.connected ? 'Pripojená · pripravená na tlač' : st.saved ? `Naposledy: ${st.saved.name} · ťuknite pre pripojenie` : 'Ťuknite a pripojte SK58 cez Bluetooth')),
    icon('chevron', 20),
  );
  setPrinterChip(st);
  if (current === 'printer') renderPrinter();
  if (current === 'me') renderMeStatus();
}

// ---------------------------------------------------------------- DOMOV
async function renderHome() {
  const list = $('#home-list');
  const labels = await allLabels();
  await Promise.all(labels.map((l) => preloadImages(l)));
  list.innerHTML = '';
  $('#home-empty').hidden = labels.length > 0;
  $('#home-count').textContent = labels.length ? `${labels.length}` : '';
  for (const l of labels) list.append(labelCard(l));
  updatePrinterUI();
}

function labelCard(l) {
  const more = h('button', { class: 'icon-btn card-more', type: 'button', 'aria-label': 'Možnosti', html: svgIcon('more') });
  const isNew = Date.now() - (l.created || 0) < 24 * 3600e3;
  const card = h('div', { class: 'card', role: 'button', tabindex: 0 },
    isNew ? h('span', { class: 'ribbon' }, 'NOVÉ') : null,
    h('div', { class: 'card-thumb' }, thumbnail(l, 260, 130)),
    h('div', { class: 'card-info' },
      h('div', { class: 'card-text' }, h('div', { class: 'card-name' }, l.name || 'Etiketa'), h('div', { class: 'card-size' }, `${fmt(l.w)}×${fmt(l.h)}mm`)),
      more),
  );
  card.addEventListener('click', (e) => {
    if (more.contains(e.target)) return;
    go('#/editor/' + encodeURIComponent(l.id));
  });
  more.addEventListener('click', (e) => { e.stopPropagation(); labelMenu(l); });
  return card;
}

function labelMenu(l) {
  actionSheet(l.name, [
    { label: 'Tlačiť', icon: 'printer', onClick: () => openPrint(l) },
    { label: 'Upraviť', icon: 'edit', onClick: () => go('#/editor/' + encodeURIComponent(l.id)) },
    {
      label: 'Duplikovať', icon: 'copy', onClick: async () => {
        const c = JSON.parse(JSON.stringify(l));
        c.id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        c.name = l.name + ' (kópia)';
        c.created = c.updated = Date.now();
        await putLabel(c);
        renderHome();
        toast('Etiketa bola skopírovaná');
      },
    },
    {
      label: 'Premenovať', icon: 'text', onClick: async () => {
        const n = await promptDialog('Premenovať etiketu', l.name);
        if (n != null && n.trim()) { l.name = n.trim(); l.updated = Date.now(); await putLabel(l); renderHome(); }
      },
    },
    {
      label: 'Zmazať', icon: 'trash', danger: true, onClick: async () => {
        if (await confirmDialog(`Naozaj zmazať etiketu „${l.name}“?`, { ok: 'Zmazať', danger: true })) {
          await deleteLabel(l.id);
          renderHome();
          toast('Etiketa bola zmazaná');
        }
      },
    },
  ]);
}

// výber veľkosti novej etikety
function chooseSize({ title = 'Nová etiketa', aspect = null, okText = 'Vytvoriť' } = {}) {
  return new Promise((resolve) => {
    const cfg = getSettings();
    let w = cfg.lastW || 50, hh = cfg.lastH || 30;
    let result = null;
    let s;
    const wS = stepper(w, { step: 1, min: 10, max: 120, suffix: 'mm', dec: 1 }, (v) => { w = v; mark(); });
    const hS = stepper(hh, { step: 1, min: 8, max: 200, suffix: 'mm', dec: 1 }, (v) => { hh = v; mark(); });
    const chips = h('div', { class: 'chips' });
    const mark = () => chips.querySelectorAll('button[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === `${w}x${hh}`));
    for (const [pw, ph] of SIZE_PRESETS) {
      chips.append(h('button', { class: 'chip', type: 'button', 'data-k': `${pw}x${ph}`, onclick: () => { w = pw; hh = ph; wS.set(w); hS.set(hh); mark(); } }, `${pw}×${ph}`));
    }
    if (aspect) {
      chips.prepend(h('button', {
        class: 'chip chip-accent', type: 'button',
        onclick: () => { hh = Math.max(8, Math.round(w / aspect)); hS.set(hh); mark(); },
      }, 'Výška podľa obrázka'));
    }
    mark();
    s = openSheet({
      title,
      body: h('div', null,
        field('Veľkosť etikety', chips),
        h('div', { class: 'grid2' }, field('Šírka', wS), field('Výška', hS)),
        h('p', { class: 'field-hint' }, `Tlačiareň SK58 tlačí na šírku najviac ${HEAD_MM} mm.`)),
      footer: [
        h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Zrušiť'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { result = { w, h: hh }; s.close(); } }, okText),
      ],
      onClose: () => resolve(result),
    });
  });
}

async function actionCreate() {
  const size = await chooseSize();
  if (!size) return;
  await sleep(220);
  openNew(newLabel(size.w, size.h, 'Etiketa ' + new Date().toLocaleDateString('sk-SK')));
}

async function actionImport(kind) {
  const file = await pickFile(kind === 'pdf' ? 'application/pdf,.pdf' : 'image/*');
  if (!file) return;
  toast(kind === 'pdf' ? 'Načítavam PDF…' : 'Načítavam obrázok…', 6000);
  let res;
  try {
    res = kind === 'pdf' ? await pdfFileToDataURL(file) : await imageFileToDataURL(file);
  } catch (e) {
    toast(e.message || 'Súbor sa nepodarilo načítať');
    return;
  }
  hideToast();
  if (!res) return;
  const aspect = res.w / res.h;
  const size = await chooseSize({ title: kind === 'pdf' ? 'Etiketa z PDF' : 'Etiketa z obrázka', aspect });
  if (!size) return;
  const label = newLabel(size.w, size.h, (file.name || 'Obrázok').replace(/\.[^.]+$/, ''));
  const it = newItem('image', label, { src: res.src, mode: kind === 'pdf' ? 'threshold' : 'dither' });
  const top = Math.min(getSettings().topSkip || 0, size.h * 0.4);
  const aw = size.w - 1, ah = size.h - top - 0.5;
  let w = aw, hh = aw / aspect;
  if (hh > ah) { hh = ah; w = ah * aspect; }
  Object.assign(it, { w: +w.toFixed(1), h: +hh.toFixed(1), x: +((size.w - w) / 2).toFixed(1), y: +(top + (ah - hh) / 2).toFixed(1) });
  label.items.push(it);
  await sleep(220);
  openNew(label);
}

async function actionScan() {
  const r = await scanCode({ title: 'Skenovať a vytvoriť etiketu' });
  if (!r) return;
  const cfg = getSettings();
  const w = cfg.lastW || 50, hh = cfg.lastH || 30;
  const label = newLabel(w, hh, r.text.slice(0, 30));
  const top = Math.min(cfg.topSkip || 0, hh * 0.4) + 0.3;
  if (r.format === 'QR') {
    const side = Math.min(w - 2, hh - top - 1);
    label.items.push(newItem('qr', label, { data: r.text, x: (w - side) / 2, y: top, w: side, h: side }));
  } else {
    const format = r.format || guessFormat(r.text);
    const enc = encodeBarcode(format, r.text);
    label.items.push(newItem('barcode', label, {
      format: enc.ok ? format : 'CODE128', data: r.text, x: 1, y: top, w: w - 2, h: Math.max(5, hh - top - 0.8),
    }));
  }
  await sleep(220);
  openNew(label);
}

// ---------------------------------------------------------------- ŠABLÓNY
let tplCat = 'Všetky';
function renderTemplates() {
  const cats = ['Všetky', ...new Set(TEMPLATES.map((t) => t.cat))];
  const f = $('#tpl-filter');
  f.innerHTML = '';
  for (const c of cats) {
    f.append(h('button', { class: 'chip' + (c === tplCat ? ' on' : ''), type: 'button', onclick: () => { tplCat = c; renderTemplates(); } }, c));
  }
  const list = $('#tpl-list');
  list.innerHTML = '';
  for (const t of TEMPLATES.filter((x) => tplCat === 'Všetky' || x.cat === tplCat)) {
    const preview = labelFromTemplate(t);
    const card = h('div', { class: 'card', role: 'button', tabindex: 0 },
      h('div', { class: 'card-thumb' }, thumbnail(preview, 260, 130)),
      h('div', { class: 'card-info' }, h('div', { class: 'card-text' }, h('div', { class: 'card-name' }, t.name), h('div', { class: 'card-size' }, `${t.w}×${t.h}mm`)),
        h('span', { class: 'card-plus', html: svgIcon('plus', 20) })),
    );
    card.addEventListener('click', () => openNew(labelFromTemplate(t)));
    list.append(card);
  }
}

// ---------------------------------------------------------------- TLAČ
function labelWarnings(label) {
  const out = [];
  const cfg = getSettings();
  const vars = makeVars(label);
  const skip = (cfg.topSkip || 0) - (cfg.offsetY || 0);
  // tlačiteľný rozsah vodorovne (hlava 48 mm je centrovaná na etikete)
  const offX = (HEAD_MM - label.w) / 2 + (cfg.offsetX || 0);
  const minX = Math.max(0, -offX), maxX = Math.min(label.w, HEAD_MM - offX);
  let sideCut = false;
  for (const it of label.items) {
    if (it.x < minX - 0.1 || it.x + it.w > maxX + 0.1) sideCut = true;
    if (it.type === 'barcode') {
      const enc = encodeBarcode(it.format, applyVars(it.data, vars));
      if (!enc.ok) out.push(`${enc.error} – kód sa nevytlačí.`);
    }
    if (it.type === 'qr' && !qrMatrix(applyVars(it.data, vars), it.ec || 'M')) out.push('QR kód je prázdny alebo príliš dlhý – nevytlačí sa.');
    if (it.type === 'image' && !it.src) out.push('Obrázok nie je vybraný.');
    if (it.x < -0.2 || it.y < -0.2 || it.x + it.w > label.w + 0.2 || it.y + it.h > label.h + 0.2) {
      out.push('Niektorý prvok presahuje okraj etikety.');
    } else if (skip > 0 && it.y < skip - 0.2 && it.type !== 'shape') {
      out.push(`Prvok zasahuje do horného pásu ${fmt(skip)} mm, ktorý sa netlačí (dá sa zmeniť v Nastaveniach).`);
    }
  }
  if (sideCut) out.push(`Tlačiareň tlačí na šírku len ${HEAD_MM} mm – časť prvku pri bočnom okraji sa nevytlačí (šrafované v editore).`);
  return [...new Set(out)];
}

async function openPrint(label) {
  if (editorLabel() === label) await putLabel(label);
  const serial = usesSerial(label);
  label.serial = label.serial || { start: 1, step: 1, digits: 0, next: 1 };
  let copies = 1;
  let start = label.serial.next ?? label.serial.start ?? 1;
  const signal = { cancelled: false };
  let busy = false;

  const previewBox = h('div', { class: 'print-preview' });
  const meta = h('div', { class: 'print-meta muted' });
  const renderPreview = async () => {
    const r = await rasterize(label, makeVars(label, start));
    r.canvas.className = 'raster';
    previewBox.innerHTML = '';
    previewBox.append(r.canvas);
    const cfg = getSettings();
    meta.textContent = `${fmt(label.w)} × ${fmt(label.h)} mm · tlačí sa ${fmt(r.height / 8)} mm na výšku` + (cfg.topSkip > 0 ? ` (horných ${fmt(cfg.topSkip)} mm sa netlačí)` : '');
  };
  const warns = labelWarnings(label);
  const status = h('div', { class: 'print-status' });
  const progress = h('div', { class: 'progress', hidden: true }, h('div', { class: 'progress-bar' }));
  const msg = h('div', { class: 'print-msg' });
  const printBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, icon('printer', 22), h('span', null, 'Tlačiť'));
  const cancelBtn = h('button', { class: 'btn btn-lg', type: 'button' }, 'Zavrieť');

  const renderStatus = () => {
    const st = getStatus();
    status.innerHTML = '';
    status.append(
      h('span', { class: 'dot ' + (st.connected ? 'ok' : st.status === 'connecting' ? 'wait' : 'off') }),
      h('span', null, st.connected ? `Tlačiareň: ${st.name}` : st.status === 'connecting' ? 'Pripájam tlačiareň…' : 'Tlačiareň nie je pripojená – pripojí sa po ťuknutí na Tlačiť'),
    );
  };
  const off = onStatus(renderStatus);
  renderStatus();

  const body = h('div', { class: 'print-sheet' },
    previewBox, meta,
    warns.length ? h('ul', { class: 'warn-list' }, warns.map((w) => h('li', null, icon('warn', 16), h('span', null, w)))) : null,
    h('div', { class: 'grid2' },
      field('Počet kópií', stepper(1, { step: 1, min: 1, max: 999, dec: 0 }, (v) => { copies = v; })),
      serial ? field('Začať číslom', stepper(start, { step: 1, min: 0, max: 99999999, dec: 0 }, (v) => { start = v; renderPreview(); })) : null,
    ),
    status, progress, msg,
  );
  const s = openSheet({
    title: 'Tlač – ' + (label.name || 'etiketa'),
    body,
    footer: [cancelBtn, printBtn],
    onClose: () => { signal.cancelled = true; off(); },
  });
  cancelBtn.addEventListener('click', () => {
    if (busy) { signal.cancelled = true; cancelBtn.textContent = 'Ruším…'; } else s.close();
  });
  renderPreview();

  printBtn.addEventListener('click', async () => {
    if (busy) return;
    msg.textContent = '';
    msg.className = 'print-msg';
    const sup = bluetoothSupport();
    if (!sup.ok) { msg.textContent = sup.reason; msg.className = 'print-msg error'; return; }
    busy = true;
    signal.cancelled = false;
    printBtn.disabled = true;
    cancelBtn.textContent = 'Zrušiť';
    try {
      await ensureConnected();
      progress.hidden = false;
      const bar = progress.firstChild;
      await printLabel(label, {
        copies,
        serialStart: start,
        signal,
        onProgress: (i, n, f) => {
          bar.style.width = `${Math.round(((i + f) / n) * 100)}%`;
          msg.textContent = n > 1 ? `Tlačím ${i + 1} z ${n}… ${Math.round(f * 100)} %` : `Posielam do tlačiarne… ${Math.round(f * 100)} %`;
        },
      });
      if (serial) {
        label.serial.next = start + copies * (label.serial.step || 1);
        start = label.serial.next;
      }
      label.printed = Date.now();
      label.updated = Date.now();
      await putLabel(label);
      msg.textContent = copies > 1 ? `Hotovo – odoslaných ${copies} etikiet.` : 'Hotovo – etiketa bola odoslaná do tlačiarne.';
      msg.className = 'print-msg ok';
      if (serial) renderPreview();
    } catch (e) {
      msg.textContent = e.message || String(e);
      msg.className = 'print-msg error';
    } finally {
      busy = false;
      printBtn.disabled = false;
      cancelBtn.textContent = 'Zavrieť';
      setTimeout(() => { progress.hidden = true; progress.firstChild.style.width = '0'; }, 800);
    }
  });
}

// ---------------------------------------------------------------- TLAČIAREŇ
let needChooser = false;

/** Pripojí tlačiareň: najprv sa skúsi pripojiť k známej, inak otvorí výber zariadení. */
async function ensureConnected() {
  if (getStatus().connected) return;
  if (!needChooser && getStatus().saved && canReconnectSilently()) {
    if (await reconnect({ quiet: true })) return;
  }
  try {
    await choosePrinter({ all: getSettings().showAll });
    needChooser = false;
  } catch (e) {
    // ak pokus o tiché pripojenie trval dlho, prehliadač už nepovolí otvoriť výber bez nového ťuknutia
    if (/nepovolil|gesture/i.test(e.message || '')) {
      needChooser = true;
      throw new Error('Ťuknite ešte raz – otvorí sa výber tlačiarne.');
    }
    throw e;
  }
}

async function connectFlow(btn) {
  const sup = bluetoothSupport();
  if (!sup.ok) { toast(sup.reason, 5000); return; }
  if (btn) btn.disabled = true;
  try {
    await ensureConnected();
    toast('Tlačiareň je pripojená');
  } catch (e) {
    toast(e.message || String(e), 5000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderPrinter() {
  const body = $('#printer-body');
  const st = getStatus();
  const sup = bluetoothSupport();
  body.innerHTML = '';
  if (!sup.ok) body.append(h('div', { class: 'notice error' }, icon('warn', 20), h('span', null, sup.reason)));

  body.append(h('h2', { class: 'sec-title' }, 'Moje zariadenia'));
  if (st.saved || st.connected) {
    const chipCls = st.connected ? 'ok' : st.status === 'connecting' ? 'wait' : 'off';
    const chipTxt = st.connected ? 'Pripojená' : st.status === 'connecting' ? 'Pripájam…' : 'Offline';
    const actions = h('div', { class: 'dev-actions' });
    if (st.connected) {
      actions.append(
        h('button', { class: 'btn', type: 'button', onclick: () => printTest() }, icon('printer', 20), h('span', null, 'Test')),
        h('button', { class: 'btn', type: 'button', onclick: () => { disconnect(); toast('Odpojené'); } }, 'Odpojiť'),
      );
    } else {
      const b = h('button', { class: 'btn btn-primary', type: 'button' }, 'Pripojiť');
      b.addEventListener('click', () => connectFlow(b));
      actions.append(b, h('button', {
        class: 'btn', type: 'button',
        onclick: async () => { if (await confirmDialog('Zabudnúť túto tlačiareň?', { ok: 'Zabudnúť', danger: true })) forget(); },
      }, 'Zabudnúť'));
    }
    body.append(h('div', { class: 'dev-card' },
      h('div', { class: 'dev-img', html: svgIcon('printer', 34) }),
      h('div', { class: 'dev-text' },
        h('div', { class: 'dev-name' }, st.name || 'Tlačiareň', h('span', { class: 'status-chip ' + chipCls }, chipTxt)),
        h('div', { class: 'dev-sub muted' }, st.connected && st.info ? 'Bluetooth LE · ' + st.info : 'Bluetooth LE')),
      actions));
  } else {
    body.append(h('p', { class: 'muted pad' }, 'Zatiaľ ste nepripojili žiadnu tlačiareň.'));
  }
  if (st.error) body.append(h('div', { class: 'notice error' }, icon('warn', 20), h('span', null, st.error)));

  const search = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, icon('bluetooth', 22), h('span', null, 'Vyhľadať tlačiareň'));
  search.addEventListener('click', async () => {
    search.disabled = true;
    try { await choosePrinter({ all: getSettings().showAll }); toast('Tlačiareň je pripojená'); } catch (e) { toast(e.message || String(e), 5000); } finally { search.disabled = false; }
  });
  body.append(
    h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, 'Dostupné zariadenia'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Hľadať znova', html: svgIcon('refresh'), onclick: () => search.click() })),
    search,
    h('div', { class: 'card-plain' }, row('Zobraziť všetky Bluetooth zariadenia', toggle(getSettings().showAll, (v) => setSettings({ showAll: v })), 'Ak sa tlačiareň v zozname neobjaví.')),
    h('p', { class: 'muted small pad' }, 'Zoznam nájdených zariadení zobrazí prehliadač v okne „Spárovať“. Vyberte tlačiareň (napr. SK58_D63F) a ťuknite na Spárovať.'),
    h('h3', { class: 'tips-title' }, 'Ak sa tlačiareň nenájde:'),
    h('ol', { class: 'tips' },
      h('li', null, 'Skúste vyhľadávanie znova.'),
      h('li', null, 'Tlačiareň musí byť blízko telefónu.'),
      h('li', null, 'Tlačiareň musí byť zapnutá (nie len v nabíjaní).'),
      h('li', null, 'Tlačiareň nesmie byť pripojená v inej aplikácii (napr. Sinmark) – tú úplne zatvorte.'),
      h('li', null, 'V telefóne zapnite Bluetooth aj Polohu (Android to vyžaduje pre vyhľadávanie).'),
      h('li', null, 'Zapnite „Zobraziť všetky Bluetooth zariadenia“.'),
      h('li', null, 'Reštartujte tlačiareň alebo aplikáciu a skúste znova.'),
    ),
  );
}

async function printTest() {
  const cfg = getSettings();
  const sizes = SIZE_PRESETS.map(([w, hh]) => ({ value: `${w}x${hh}`, label: `${w} × ${hh} mm` }));
  let val = `${cfg.lastW}x${cfg.lastH}`;
  if (!sizes.find((s) => s.value === val)) sizes.unshift({ value: val, label: `${cfg.lastW} × ${cfg.lastH} mm` });
  let s;
  const msg = h('div', { class: 'print-msg' });
  const go2 = h('button', { class: 'btn btn-primary', type: 'button' }, 'Vytlačiť test');
  go2.addEventListener('click', async () => {
    go2.disabled = true;
    const [w, hh] = val.split('x').map(Number);
    try {
      await ensureConnected();
      msg.textContent = 'Posielam…';
      await printLabel(testLabel(w, hh), { onProgress: (i, n, f) => { msg.textContent = `Posielam… ${Math.round(f * 100)} %`; } });
      msg.textContent = 'Odoslané. Skontrolujte, či je čiarka „10“ naozaj 10 mm od horného okraja etikety.';
      msg.className = 'print-msg ok';
    } catch (e) { msg.textContent = e.message; msg.className = 'print-msg error'; } finally { go2.disabled = false; }
  });
  s = openSheet({
    title: 'Testovacia etiketa',
    body: h('div', null,
      field('Veľkosť etikety vo vašej tlačiarni', select(sizes, val, (v) => { val = v; })),
      h('p', { class: 'field-hint' }, 'Vytlačí sa rámček a pravítko v milimetroch. Podľa neho nastavíte posun a nepotlačiteľný okraj v Nastaveniach.'),
      msg),
    footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Zavrieť'), go2],
  });
}

// ---------------------------------------------------------------- NASTAVENIA
let meStatusEl = null;
function renderMeStatus() {
  if (!meStatusEl) return;
  const st = getStatus();
  meStatusEl.innerHTML = '';
  meStatusEl.append(h('span', { class: 'dot ' + (st.connected ? 'ok' : 'off') }), st.connected ? st.name : (st.saved ? `${st.saved.name} (offline)` : 'Nepripojená'));
}

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (current === 'me') renderMe(); });

function renderMe() {
  const b = $('#me-body');
  const cfg = getSettings();
  const set = (k) => (v) => { setSettings({ [k]: v }); refreshEditor(); };
  b.innerHTML = '';
  meStatusEl = h('span', { class: 'me-status' });
  renderMeStatus();

  const feedFixed = field('Posun po etikete (mm)', stepper(cfg.feedMm, { step: 0.5, min: 0, max: 60, suffix: 'mm' }, set('feedMm')),
    'Pri súvislom papieri dĺžka medzery medzi etiketami.');
  feedFixed.hidden = cfg.feed !== 'fixed';

  const thr = h('input', { type: 'range', class: 'range', min: 60, max: 220, step: 4, value: cfg.threshold });
  thr.addEventListener('change', () => setSettings({ threshold: Number(thr.value) }));

  b.append(
    h('div', { class: 'card-plain' },
      h('button', { class: 'row row-link', type: 'button', onclick: () => go('#/tlaciaren') },
        h('div', { class: 'row-text' }, h('div', null, 'Tlačiareň'), h('div', { class: 'row-hint' }, meStatusEl)),
        icon('chevron', 20))),

    h('h2', { class: 'sec-title' }, 'Nastavenie tlače'),
    h('div', { class: 'card-plain' },
      field('Nepotlačiteľný pás hore', stepper(cfg.topSkip, { step: 0.5, min: 0, max: 15, suffix: 'mm' }, set('topSkip')),
        'SK58 po posune na ďalšiu etiketu začína tlačiť pár mm pod jej horným okrajom (zvyčajne ~4 mm). Tento pás sa nevytlačí, aby obsah neposkočil na ďalšiu etiketu. V editore je šrafovaný. Ak vaša tlačiareň tlačí od samého vrchu, nastavte 0.'),
      h('div', { class: 'grid2' },
        field('Posun doprava', stepper(cfg.offsetX, { step: 0.5, min: -20, max: 20, suffix: 'mm' }, set('offsetX'))),
        field('Posun nadol', stepper(cfg.offsetY, { step: 0.5, min: -10, max: 10, suffix: 'mm' }, set('offsetY'))),
      ),
      field('Sýtosť textu a čiar', h('div', { class: 'range-row' }, h('span', { class: 'muted' }, 'tenšie'), thr, h('span', { class: 'muted' }, 'hrubšie'))),
      field('Po vytlačení etikety', select([
        { value: 'gsff', label: 'Posunúť na ďalšiu etiketu (medzera)' },
        { value: 'ff', label: 'Posunúť na ďalšiu etiketu (FF)' },
        { value: 'fixed', label: 'Súvislý papier – posunúť o pevnú dĺžku' },
        { value: 'none', label: 'Neposúvať' },
      ], cfg.feed, (v) => { setSettings({ feed: v }); feedFixed.hidden = v !== 'fixed'; })),
      feedFixed,
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => printTest() }, icon('printer', 20), h('span', null, 'Vytlačiť testovaciu etiketu')),
    ),

    h('h2', { class: 'sec-title' }, 'Rozšírené'),
    h('div', { class: 'card-plain' },
      field('Spôsob posielania obrázka', select([
        { value: 'raster', label: 'Rastrový obrázok (GS v 0) – odporúčané' },
        { value: 'bands', label: 'Po pásoch (ESC *) – pre staršie tlačiarne' },
      ], cfg.method, set('method'))),
      h('div', { class: 'grid2' },
        field('Veľkosť balíka', select([20, 40, 60, 100, 180, 240].map((v) => ({ value: v, label: `${v} B` })), cfg.chunk, (v) => setSettings({ chunk: Number(v) }))),
        field('Pauza medzi balíkmi', stepper(cfg.delay, { step: 1, min: 0, max: 200, dec: 0, suffix: 'ms' }, set('delay'))),
      ),
      field('Spätný posun pred tlačou (experimentálne)', stepper(cfg.backfeed, { step: 0.5, min: 0, max: 10, suffix: 'mm' }, set('backfeed')),
        'Príkaz ESC K. Ak ho tlačiareň podporuje, vráti papier späť a vytlačí aj horný pás. Inak nechajte 0.'),
      h('button', {
        class: 'btn btn-block', type: 'button',
        onclick: async () => { if (await confirmDialog('Obnoviť predvolené nastavenia tlače?', { ok: 'Obnoviť' })) { resetSettings(); renderMe(); refreshEditor(); toast('Nastavenia boli obnovené'); } },
      }, 'Obnoviť predvolené'),
    ),

    h('h2', { class: 'sec-title' }, 'Záloha etikiet'),
    h('div', { class: 'card-plain' },
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: exportLabels }, icon('download', 20), h('span', null, 'Exportovať')),
        h('button', { class: 'btn', type: 'button', onclick: importLabels }, icon('upload', 20), h('span', null, 'Importovať'))),
      h('p', { class: 'field-hint' }, 'Etikety sa ukladajú len v tomto prehliadači. Zálohu si môžete uložiť do súboru a preniesť do iného zariadenia.'),
    ),

    h('h2', { class: 'sec-title' }, 'O aplikácii'),
    h('div', { class: 'card-plain about' },
      installEvt ? h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderMe(); },
      }, 'Nainštalovať na plochu') : null,
      h('p', null, h('b', null, 'Tlač etikiet'), ` · verzia ${VERSION}`),
      h('p', { class: 'muted' }, `Bluetooth: ${bluetoothSupport().ok ? 'podporovaný ✓' : 'nepodporovaný ✗'} · Skener kódov: ${scannerSupported() ? 'áno ✓' : 'nie ✗'}`),
      h('p', { class: 'muted small' }, 'Pre tlačiarne SK58 (Sinmark) a podobné Bluetooth tlačiarne s príkazmi ESC/POS, 203 dpi, šírka tlače 48 mm. Najlepšie funguje v Chrome na Androide.'),
    ),
  );
}

async function exportLabels() {
  const labels = await allLabels();
  const blob = new Blob([JSON.stringify({ app: 'tlac-etikiet', version: 1, exported: new Date().toISOString(), labels }, null, 1)], { type: 'application/json' });
  downloadBlob(blob, `etikety-${new Date().toISOString().slice(0, 10)}.json`);
}

async function importLabels() {
  const file = await pickFile('application/json,.json');
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const labels = Array.isArray(data) ? data : data.labels;
    if (!Array.isArray(labels)) throw new Error('Súbor neobsahuje etikety.');
    let n = 0;
    for (const l of labels) {
      if (!l || !l.id || !Array.isArray(l.items) || !(l.w > 0) || !(l.h > 0)) continue;
      await putLabel(l);
      n++;
    }
    toast(`Načítaných etikiet: ${n}`);
  } catch (e) {
    toast('Import zlyhal: ' + e.message, 4000);
  }
}

// ---------------------------------------------------------------- štart
function init() {
  $$('[data-back]').forEach((b) => { b.innerHTML = svgIcon('back'); b.addEventListener('click', back); });
  $$('#tabbar .ti').forEach((s) => { s.innerHTML = svgIcon(s.dataset.icon, 24); });
  $('#home-printer').addEventListener('click', () => go('#/tlaciaren'));
  $('#home-printer-card').addEventListener('click', () => (getStatus().connected ? go('#/tlaciaren') : connectFlow()));
  $('#q-create').addEventListener('click', actionCreate);
  $('#q-pdf').addEventListener('click', () => actionImport('pdf'));
  $('#q-image').addEventListener('click', () => actionImport('image'));
  $('#q-scan').addEventListener('click', actionScan);
  $('.qi-create').innerHTML = svgIcon('plus', 26);
  $('.qi-pdf').innerHTML = svgIcon('doc', 26);
  $('.qi-image').innerHTML = svgIcon('image', 26);
  $('.qi-scan').innerHTML = svgIcon('scan', 26);

  onStatus(updatePrinterUI);
  window.addEventListener('hashchange', route);
  route();

  // tichý pokus o opätovné pripojenie k naposledy použitej tlačiarni
  if (getStatus().saved && navigator.bluetooth?.getDevices) reconnect({ quiet: true }).catch(() => {});

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

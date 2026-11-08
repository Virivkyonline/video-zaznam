// Tlač etikiet – hlavný modul: obrazovky, navigácia, tlač.

import {
  $, $$, h, icon, svgIcon, toast, hideToast, openSheet, dropAllSheets, actionSheet, confirmDialog, promptDialog,
  toggle, stepper, field, row, select, fmt, pickFile, downloadBlob, sleep,
} from './ui.js';
import { allLabels, getLabel, putLabel, deleteLabel, getSettings, setSettings, resetSettings, getHistory, addHistory, clearHistory } from './store.js';
import { thumbnail, preloadImages, usesSerial, usesData, makeVars, applyVars, qrMatrix, drawLabel } from './render.js';
import { encodeBarcode, guessFormat } from './barcode.js';
import { TEMPLATES, SIZE_PRESETS, labelFromTemplate, newLabel, newItem } from './templates.js';
import {
  onStatus, getStatus, bluetoothSupport, choosePrinter, reconnect, disconnect, forget, printLabel, printJobs,
  rasterize, testLabel, canReconnectSilently, unprintableRects, bluetoothDiag, HEAD_MM,
  isNativeApp, setNativePicker, onNativeEvent, nativeStartScan, nativeStopScan,
} from './printer.js';
import { openEditor, closeEditor, editorLabel, refreshEditor, setPrinterChip } from './editor.js';
import { scanCode, scannerSupported } from './scan.js';
import { imageFileToDataURL, openPdf, renderPdfPage } from './importers.js';
import { dataRecords, dataColumns } from './datasource.js';

const VERSION = '1.3.0';

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

let navToken = 0;
async function route() {
  navCount++;
  const token = ++navToken;
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
    if (token !== navToken) return; // medzitým sa prešlo inam
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
let homeQuery = '';
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function renderHome() {
  const list = $('#home-list');
  const labels = await allLabels();
  await Promise.all(labels.map((l) => preloadImages(l)));
  const search = $('#home-search');
  search.hidden = labels.length < 6;
  if (search.hidden) homeQuery = '';
  const q = norm(homeQuery);
  const shown = q ? labels.filter((l) => norm(l.name).includes(q) || l.items.some((it) => norm(it.text || it.data).includes(q))) : labels;
  list.innerHTML = '';
  $('#home-empty').hidden = labels.length > 0;
  $('#home-count').textContent = labels.length ? `${labels.length}` : '';
  for (const l of shown) list.append(labelCard(l));
  if (q && !shown.length) list.append(h('p', { class: 'muted' }, 'Nič sa nenašlo.'));
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
    { label: 'Uložiť / zdieľať ako obrázok', icon: 'share', onClick: () => saveAsImage(l) },
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
  toast(kind === 'pdf' ? 'Načítavam PDF…' : 'Načítavam obrázok…', 8000);
  let res;
  try {
    if (kind === 'pdf') {
      const pdf = await openPdf(file);
      hideToast();
      let page = 1;
      if (pdf.numPages > 1) {
        const choice = await new Promise((resolve) => {
          let picked = null;
          const s = actionSheet(`PDF má ${pdf.numPages} strán`, [
            { label: `Vytlačiť všetky strany (${pdf.numPages})`, icon: 'printer', onClick: () => { picked = 'all'; } },
            { label: 'Upraviť jednu stranu ako etiketu', icon: 'edit', onClick: () => { picked = 'one'; } },
          ]);
          const prev = s.onClose;
          s.onClose = () => { prev?.(); setTimeout(() => resolve(picked), 150); };
        });
        if (!choice) return;
        if (choice === 'all') {
          const first = await renderPdfPage(pdf, 1);
          const size = await chooseSize({ title: 'Veľkosť etikety pre PDF', aspect: first.w / first.h, okText: 'Pokračovať' });
          if (!size) return;
          setSettings({ lastW: size.w, lastH: size.h });
          await sleep(220);
          openPrintPdf(pdf, file.name || 'PDF', size);
          return;
        }
        const ans = await promptDialog(`Ktorú stranu použiť (1–${pdf.numPages})?`, '1', { ok: 'Použiť', inputmode: 'numeric' });
        if (ans == null) return;
        page = Math.min(pdf.numPages, Math.max(1, parseInt(ans, 10) || 1));
      }
      res = await renderPdfPage(pdf, page);
    } else {
      res = await imageFileToDataURL(file);
    }
  } catch (e) {
    toast(e.message || 'Súbor sa nepodarilo načítať');
    return;
  }
  hideToast();
  if (!res) return;
  const size = await chooseSize({ title: kind === 'pdf' ? 'Etiketa z PDF' : 'Etiketa z obrázka', aspect: res.w / res.h });
  if (!size) return;
  const label = imageLabel(res, size, file.name, kind === 'pdf' ? 'threshold' : 'dither');
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
  const vars = makeVars(label);
  const cut = unprintableRects(label);
  const overlaps = (it, r) => it.x < r.x + r.w - 0.2 && it.x + it.w > r.x + 0.2 && it.y < r.y + r.h - 0.2 && it.y + it.h > r.y + 0.2;
  let cutHit = false;
  for (const it of label.items) {
    if (it.type === 'barcode') {
      const enc = encodeBarcode(it.format, applyVars(it.data, vars));
      if (!enc.ok) out.push(`${enc.error} – kód sa nevytlačí.`);
    }
    if (it.type === 'qr' && !qrMatrix(applyVars(it.data, vars), it.ec || 'M')) out.push('QR kód je prázdny alebo príliš dlhý – nevytlačí sa.');
    if (it.type === 'image' && !it.src) out.push('Obrázok nie je vybraný.');
    if (it.x < -0.2 || it.y < -0.2 || it.x + it.w > label.w + 0.2 || it.y + it.h > label.h + 0.2) {
      out.push('Niektorý prvok presahuje okraj etikety.');
    } else if (it.type !== 'shape' && cut.some((r) => overlaps(it, r))) cutHit = true;
  }
  if (cutHit) out.push('Časť prvku je v šrafovanej oblasti, ktorá sa nevytlačí (horný pás alebo okraj mimo 48 mm hlavy). Dá sa zmeniť v Nastaveniach.');
  if (label.data && !usesData(label)) out.push('Etiketa má pripojený Excel, ale žiadny prvok nepoužíva jeho stĺpce.');
  return [...new Set(out)];
}

/** Spoločné okno tlače: náhľad, ovládanie, stav tlačiarne, priebeh. */
function printDialog({ title, warns = [], controls = [], renderPreview, run }) {
  const signal = { cancelled: false };
  let busy = false;
  const previewBox = h('div', { class: 'print-preview' });
  const meta = h('div', { class: 'print-meta muted' });
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
  const refresh = () => renderPreview(previewBox, meta);
  const s = openSheet({
    title,
    body: h('div', { class: 'print-sheet' },
      previewBox, meta,
      warns.length ? h('ul', { class: 'warn-list' }, warns.map((w) => h('li', null, icon('warn', 16), h('span', null, w)))) : null,
      controls, status, progress, msg),
    footer: [cancelBtn, printBtn],
    onClose: () => { signal.cancelled = true; off(); },
  });
  cancelBtn.addEventListener('click', () => {
    if (busy) { signal.cancelled = true; cancelBtn.textContent = 'Ruším…'; } else s.close();
  });
  refresh();
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
      const done = await run({
        signal,
        onProgress: (i, n, f) => {
          bar.style.width = `${Math.round(((i + f) / n) * 100)}%`;
          msg.textContent = n > 1 ? `Tlačím ${i + 1} z ${n}… ${Math.round(f * 100)} %` : `Posielam do tlačiarne… ${Math.round(f * 100)} %`;
        },
      });
      msg.textContent = done;
      msg.className = 'print-msg ok';
      refresh();
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
  return { refresh };
}

const doneText = (n) => (n > 1 ? `Hotovo – odoslaných ${n} etikiet.` : 'Hotovo – etiketa bola odoslaná do tlačiarne.');

async function openPrint(label) {
  if (editorLabel() === label) await putLabel(label);
  const serial = usesSerial(label);
  const hasData = !!label.data && dataRecords(label.data).length > 0;
  const nRec = hasData ? dataRecords(label.data).length : 0;
  label.serial = label.serial || { start: 1, step: 1, digits: 0, next: 1 };
  let copies = 1;
  let start = label.serial.next ?? label.serial.start ?? 1;
  let from = 1, to = nRec;
  let copyCol = -1; // stĺpec s počtom kópií
  const recs = hasData ? dataRecords(label.data) : [];
  const rowCopies = (r) => {
    if (copyCol < 0) return copies;
    const v = Math.round(parseFloat(String(recs[r]?.[copyCol] ?? '').replace(',', '.')));
    return Number.isFinite(v) ? Math.max(0, Math.min(999, v)) : 1;
  };
  // zoznam riadkov na tlač (riadok sa opakuje podľa počtu kópií)
  const jobRows = () => {
    const list = [];
    for (let r = from - 1; r <= to - 1; r++) for (let c = rowCopies(r); c > 0; c--) list.push(r);
    return list;
  };
  const total = h('div', { class: 'print-total' });
  const updTotal = () => {
    const n = hasData ? jobRows().length : copies;
    total.textContent = `Spolu sa vytlačí: ${n} ${n === 1 ? 'etiketa' : n < 5 ? 'etikety' : 'etikiet'}`;
  };
  let dlg;
  const controls = [];
  if (hasData) {
    controls.push(h('div', { class: 'notice data' }, icon('sheet', 20), h('span', null, `Excel „${label.data.name}“ – ${nRec} záznamov. Pre každý záznam sa vytlačí jedna etiketa.`)));
    const fromS = stepper(1, { step: 1, min: 1, max: nRec, dec: 0 }, (v) => { from = v; if (to < from) { to = from; toS.set(to); } updTotal(); dlg?.refresh(); });
    const toS = stepper(nRec, { step: 1, min: 1, max: nRec, dec: 0 }, (v) => { to = v; if (from > to) { from = to; fromS.set(from); } updTotal(); });
    controls.push(h('div', { class: 'grid2' }, field('Od záznamu', fromS), field('Po záznam', toS)));
  }
  const copiesField = field(hasData ? 'Kópií z každého' : 'Počet kópií', stepper(1, { step: 1, min: 1, max: 999, dec: 0 }, (v) => { copies = v; updTotal(); }));
  controls.push(h('div', { class: 'grid2' },
    copiesField,
    serial ? field('Začať číslom', stepper(start, { step: 1, min: 0, max: 99999999, dec: 0 }, (v) => { start = v; dlg?.refresh(); })) : null,
  ));
  if (hasData) {
    controls.push(field('Počet kópií podľa stĺpca', select(
      [{ value: -1, label: '— rovnaký pre všetky —' }, ...dataColumns(label.data).map((c, i) => ({ value: i, label: c }))],
      -1, (v) => { copyCol = Number(v); copiesField.hidden = copyCol >= 0; updTotal(); },
    ), 'Napr. stĺpec „Počet“ – z každého riadku sa vytlačí toľko etikiet, koľko je v ňom uvedené.'));
  }
  controls.push(total);
  updTotal();
  dlg = printDialog({
    title: 'Tlač – ' + (label.name || 'etiketa'),
    warns: labelWarnings(label),
    controls,
    renderPreview: async (box, meta) => {
      const r = await rasterize(label, makeVars(label, start, hasData ? from - 1 : undefined));
      r.canvas.className = 'raster';
      box.innerHTML = '';
      box.append(r.canvas);
      const cfg = getSettings();
      meta.textContent = `${fmt(label.w)} × ${fmt(label.h)} mm · tlačí sa ${fmt(r.height / 8)} mm na výšku`
        + (cfg.topSkip > 0 ? ` (horných ${fmt(cfg.topSkip)} mm sa netlačí)` : '')
        + (hasData ? ` · náhľad záznamu ${from}` : '');
    },
    run: async ({ signal, onProgress }) => {
      let n;
      if (hasData) {
        const list = jobRows();
        n = list.length;
        if (!n) throw new Error('Podľa zvoleného stĺpca sa nemá vytlačiť žiadna etiketa.');
        const step = label.serial?.step || 1;
        await printJobs(n, (i) => ({ label, vars: makeVars(label, start + i * step, list[i]) }), { signal, onProgress });
      } else {
        n = copies;
        await printLabel(label, { copies, serialStart: start, signal, onProgress });
      }
      if (serial) {
        label.serial.next = start + n * (label.serial.step || 1);
        start = label.serial.next;
      }
      label.printed = Date.now();
      label.updated = Date.now();
      await putLabel(label);
      addHistory({ id: label.id, name: label.name, w: label.w, h: label.h, count: n });
      return doneText(n);
    },
  });
}

/** Tlač všetkých strán PDF – každá strana ako jedna etiketa. */
async function openPrintPdf(pdf, fileName, size) {
  const n = pdf.numPages;
  const cache = new Map();
  const pageLabel = async (p) => {
    if (cache.has(p)) return cache.get(p);
    const res = await renderPdfPage(pdf, p);
    const label = imageLabel(res, size, fileName, 'threshold');
    if (cache.size > 3) cache.delete(cache.keys().next().value);
    cache.set(p, label);
    return label;
  };
  let copies = 1;
  let pFrom = 1, pTo = n;
  const fromS = stepper(1, { step: 1, min: 1, max: n, dec: 0 }, (v) => { pFrom = v; if (pTo < pFrom) { pTo = pFrom; toS.set(pTo); } dlg.refresh(); });
  const toS = stepper(n, { step: 1, min: 1, max: n, dec: 0 }, (v) => { pTo = v; if (pFrom > pTo) { pFrom = pTo; fromS.set(pFrom); } });
  const dlg = printDialog({
    title: `Tlač PDF – ${fileName}`,
    controls: [
      h('div', { class: 'grid2' }, field('Od strany', fromS), field('Po stranu', toS)),
      field('Kópií z každej strany', stepper(1, { step: 1, min: 1, max: 99, dec: 0 }, (v) => { copies = v; })),
    ],
    renderPreview: async (box, meta) => {
      const label = await pageLabel(pFrom);
      const r = await rasterize(label);
      r.canvas.className = 'raster';
      box.innerHTML = '';
      box.append(r.canvas);
      meta.textContent = `${n} ${n < 5 ? 'strany' : 'strán'} · etiketa ${fmt(size.w)} × ${fmt(size.h)} mm · náhľad strany ${pFrom}`;
    },
    run: async ({ signal, onProgress }) => {
      const pages = pTo - pFrom + 1;
      await printJobs(pages * copies, async (i) => {
        const label = await pageLabel(pFrom + Math.floor(i / copies));
        return { label, vars: makeVars(label) };
      }, { signal, onProgress });
      addHistory({ name: `PDF: ${fileName}`, w: size.w, h: size.h, count: pages * copies });
      return doneText(pages * copies);
    },
  });
}

/** Etiketa s jedným obrázkom roztiahnutým na plochu (pre PDF / obrázok). */
function imageLabel(res, size, name, mode) {
  const label = newLabel(size.w, size.h, (name || 'Obrázok').replace(/\.[^.]+$/, ''));
  const it = newItem('image', label, { src: res.src, mode });
  const top = Math.min(getSettings().topSkip || 0, size.h * 0.4);
  const aspect = res.w / res.h;
  const aw = size.w - 1, ah = size.h - top - 0.5;
  let w = aw, hh = aw / aspect;
  if (hh > ah) { hh = ah; w = ah * aspect; }
  Object.assign(it, { w: +w.toFixed(1), h: +hh.toFixed(1), x: +((size.w - w) / 2).toFixed(1), y: +(top + (ah - hh) / 2).toFixed(1) });
  label.items.push(it);
  return label;
}

// ---------------------------------------------------------------- HISTÓRIA A POMOCNÍK
async function openHistory() {
  const list = getHistory();
  let s;
  const body = h('div');
  if (!list.length) body.append(h('p', { class: 'muted' }, 'Zatiaľ ste nič nevytlačili.'));
  for (const e of list) {
    const label = e.id ? await getLabel(e.id) : null;
    if (label) await preloadImages(label);
    const when = new Date(e.t);
    const item = h('button', { class: 'history-item row-link', type: 'button' },
      h('div', { class: 'history-thumb' }, label ? thumbnail(label, 58, 38) : icon('doc', 22)),
      h('div', { class: 'history-text' },
        h('div', { class: 'history-name' }, e.name || 'Etiketa'),
        h('div', { class: 'muted small' }, `${when.toLocaleDateString('sk-SK')} ${when.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })} · ${e.count || 1} ks · ${fmt(e.w)}×${fmt(e.h)} mm`)),
      label ? icon('chevron', 18) : null);
    if (label) {
      item.addEventListener('click', () => {
        s.close();
        setTimeout(() => actionSheet(label.name, [
          { label: 'Tlačiť znova', icon: 'printer', onClick: () => openPrint(label) },
          { label: 'Upraviť', icon: 'edit', onClick: () => go('#/editor/' + encodeURIComponent(label.id)) },
        ]), 250);
      });
    }
    body.append(item);
  }
  s = openSheet({
    title: 'História tlače',
    body,
    footer: list.length ? [h('button', {
      class: 'btn', type: 'button',
      onclick: async () => { if (await confirmDialog('Vymazať celú históriu tlače?', { ok: 'Vymazať', danger: true })) { clearHistory(); s.close(); toast('História bola vymazaná'); } },
    }, icon('trash', 20), h('span', null, 'Vymazať históriu'))] : null,
  });
}

function openHelp() {
  const sec = (title, ...content) => h('div', null, h('h4', null, title), ...content);
  openSheet({
    title: 'Pomocník',
    body: h('div', { class: 'help' },
      sec('Prvé pripojenie tlačiarne',
        h('ul', null,
          h('li', null, 'Zapnite tlačiareň SK58 a úplne zatvorte aplikáciu Sinmark/OpenLabel.'),
          h('li', null, 'Ťuknite na ikonu tlačiarne vpravo hore → Vyhľadať tlačiareň → vyberte SK58_… → Spárovať.'),
          h('li', null, 'Funguje v prehliadači Samsung Internet aj Chrome v Androide (na iPhone v aplikácii Bluefy).'),
          h('li', null, 'Samsung Internet: ak sa okno so zariadeniami neotvorí, povoľte prehliadaču „Zariadenia v blízkosti“ a Polohu (Nastavenia → Aplikácie → Samsung Internet → Povolenia).'))),
      sec('Nová etiketa',
        h('p', null, 'Domov → Vytvoriť, zvoľte veľkosť (napr. 50 × 30 mm) a pridávajte prvky: text, čiarový kód, QR kód, obrázok, tabuľku, ikonu, dátum, číslovanie, čiaru či rámček. Prvok presuniete ťahaním, veľkosť zmeníte modrými úchytmi.')),
      sec('Hromadná tlač z Excelu',
        h('ul', null,
          h('li', null, 'V editore ťuknite na Excel a vyberte súbor .xlsx alebo .csv.'),
          h('li', null, 'Ťuknutím na názov stĺpca ho pridáte na etiketu. Do kódu alebo tabuľky stĺpec vložíte v ich paneli.'),
          h('li', null, 'Pri tlači zvolíte rozsah záznamov – pre každý riadok sa vytlačí jedna etiketa.'))),
      sec('Premenné v texte',
        h('p', null, '{datum} dnešný dátum · {datum+7} o 7 dní · {cas} čas · {den} deň v týždni · {mesiac} · {rok} · {cislo} poradové číslo · {Názov stĺpca} hodnota z Excelu.')),
      sec('PDF a obrázky',
        h('p', null, 'PDF z e-shopu alebo prepravcu: Domov → PDF. Pri viacstranovom PDF môžete vytlačiť všetky strany naraz (každá strana = jedna etiketa) alebo jednu stranu upraviť.')),
      sec('Ak tlač nesedí na etiketu',
        h('ul', null,
          h('li', null, 'Ja → Sprievodca nastavením (test): vytlačí pravítko, zmeriate polohu čiarky 10 a aplikácia nastaví okraj sama.'),
          h('li', null, 'Upravte Nepotlačiteľný pás hore, Posun doprava a Posun nadol.'),
          h('li', null, 'Ak je tlač hore nohami alebo otočená, v editore ťuknite na rozmer etikety → Smer tlače.'))),
    ),
  });
}

async function saveAsImage(label) {
  await preloadImages(label);
  const s = 16; // 16 px/mm ≈ 406 dpi
  const c = document.createElement('canvas');
  c.width = Math.round(label.w * s);
  c.height = Math.round(label.h * s);
  drawLabel(c.getContext('2d'), label, s, { vars: makeVars(label) });
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const name = `${(label.name || 'etiketa').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'etiketa'}.png`;
  if (window.TlacNative) {
    const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    toast(window.TlacNative.saveFile(name, 'image/png', b64, true), 4000);
    return;
  }
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: label.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadBlob(blob, name);
}

// ---------------------------------------------------------------- TLAČIAREŇ
/** Zoznam nájdených Bluetooth zariadení v Android aplikácii. */
function nativePicker({ all }) {
  return new Promise((resolve) => {
    let result = null;
    let showAll = all;
    let s = null;
    const devices = new Map();
    const isPrinter = (d) => /sk\s?58|sinmark|print|label|^sk[_-]?\d|pt-?\d|mpt|kaysion/i.test(d.name || '');
    const list = h('div', { class: 'dev-list' });
    const spin = h('span', { class: 'spinner' });
    const stText = h('span', null, 'Hľadám zariadenia v okolí…');
    const hint = h('div', { class: 'notice info', hidden: true });
    const render = () => {
      list.innerHTML = '';
      const arr = [...devices.values()].filter((d) => showAll || isPrinter(d))
        .sort((a, b) => (isPrinter(b) - isPrinter(a)) || ((b.rssi || -999) - (a.rssi || -999)));
      if (!arr.length) {
        list.append(h('p', { class: 'muted small pad' }, showAll
          ? 'Zatiaľ sa nenašlo žiadne zariadenie.'
          : 'Zatiaľ sa nenašla tlačiareň. Ak sa neobjaví, zapnite nižšie „Zobraziť všetky zariadenia“.'));
      }
      for (const d of arr) {
        list.append(h('button', { class: 'dev-item', type: 'button', onclick: () => { result = d; s?.close(); } },
          h('span', { class: 'dev-ic', html: svgIcon(isPrinter(d) ? 'printer' : 'bluetooth', 22) }),
          h('span', { class: 'dev-item-text' }, h('b', null, d.name || 'Neznáme zariadenie'), h('span', { class: 'muted small' }, d.id + (d.bonded ? ' · spárované' : ''))),
          h('span', { class: 'chip chip-sm chip-accent' }, 'Pripojiť')));
      }
    };
    const off = onNativeEvent((ev) => {
      if (ev.type === 'device') { devices.set(ev.id, ev); render(); }
      else if (ev.type === 'scanStarted') { spin.hidden = false; stText.textContent = 'Hľadám zariadenia v okolí…'; }
      else if (ev.type === 'scanStopped') { spin.hidden = true; stText.textContent = 'Hľadanie skončilo.'; }
      else if (ev.type === 'scanError' || ev.type === 'error') { spin.hidden = true; stText.textContent = ev.message; }
      else if (ev.type === 'hint') { hint.hidden = false; hint.textContent = ev.message; }
    });
    const again = h('button', { class: 'btn', type: 'button', onclick: () => { devices.clear(); render(); nativeStartScan(); } }, icon('refresh', 20), h('span', null, 'Hľadať znova'));
    s = openSheet({
      title: 'Vyberte tlačiareň',
      body: h('div', null,
        h('div', { class: 'scan-state' }, spin, stText),
        hint, list,
        row('Zobraziť všetky zariadenia', toggle(showAll, (v) => { showAll = v; render(); }))),
      footer: [again],
      onClose: () => { off(); nativeStopScan(); setTimeout(() => resolve(result), 0); },
    });
    render();
    nativeStartScan();
  });
}

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

const isSamsung = /SamsungBrowser/i.test(navigator.userAgent) && !isNativeApp();
const isAndroid = /Android/i.test(navigator.userAgent);
let pickerStuck = false;

/** Odkaz, ktorý otvorí túto aplikáciu v Chrome (ak nie je nainštalovaný, otvorí Obchod Play). */
function chromeIntentUrl() {
  const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome');
  return `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

function chromeNotice(strong) {
  return h('div', { class: 'notice ' + (strong ? 'error' : 'info') },
    icon(strong ? 'warn' : 'info', 20),
    h('div', null,
      h('div', null, strong
        ? 'Samsung Internet neotvoril okno so zariadeniami – tento prehliadač vo vašom telefóne nepustí Bluetooth tlačiareň. Otvorte aplikáciu v prehliadači Chrome (je zadarmo, na Samsungu býva v priečinku Google):'
        : 'Samsung Internet často nedovolí pripojiť Bluetooth tlačiareň. Ak sa po ťuknutí na „Vyhľadať“ nič neotvorí, otvorte aplikáciu v Chrome:'),
      h('a', { class: 'btn btn-primary btn-block', href: chromeIntentUrl() }, 'Otvoriť v Chrome')));
}

function renderPrinter() {
  const body = $('#printer-body');
  const st = getStatus();
  const sup = bluetoothSupport();
  body.innerHTML = '';
  if (!sup.ok) body.append(h('div', { class: 'notice error' }, icon('warn', 20), h('span', null, sup.reason)));
  if (isSamsung && !st.connected) body.append(chromeNotice(pickerStuck));
  else if (!sup.ok && isAndroid && !isNativeApp()) body.append(chromeNotice(false));

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

  const run = async (btn, all) => {
    btn.disabled = true;
    // ak prehliadač po pár sekundách neukázal okno so zariadeniami, poradiť Chrome
    let opened = false;
    const onBlur = () => { opened = true; };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    const timer = setTimeout(() => {
      if (!opened && isSamsung && !getStatus().connected) { pickerStuck = true; renderPrinter(); window.scrollTo(0, 0); }
    }, 7000);
    try { await choosePrinter({ all }); pickerStuck = false; toast('Tlačiareň je pripojená'); } catch (e) { toast(e.message || String(e), 5000); } finally {
      clearTimeout(timer);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      btn.disabled = false;
    }
  };
  const search = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, icon('bluetooth', 22), h('span', null, 'Vyhľadať tlačiareň SK58'));
  search.addEventListener('click', () => run(search, false));
  const searchAll = h('button', { class: 'btn btn-lg btn-block', type: 'button' }, icon('refresh', 20), h('span', null, 'Zobraziť všetky Bluetooth zariadenia'));
  searchAll.addEventListener('click', () => run(searchAll, true));

  const diag = h('div', { class: 'card-plain diag' }, h('div', { class: 'muted small' }, 'Zisťujem stav Bluetooth…'));
  bluetoothDiag().then((d) => {
    const yes = (v) => (v === true ? '✓ áno' : v === false ? '✗ nie' : '? nedá sa zistiť');
    diag.innerHTML = '';
    diag.append(
      h('div', { class: 'props-sub' }, 'Diagnostika'),
      h('div', { class: 'diag-row' }, h('span', null, 'Prehliadač'), h('b', null, `${d.browser}${d.android ? ' · Android ' + d.android : ''}`)),
      h('div', { class: 'diag-row' }, h('span', null, 'Bluetooth v prehliadači'), h('b', { class: d.api ? 'ok' : 'bad' }, yes(d.api))),
      h('div', { class: 'diag-row' }, h('span', null, 'Bluetooth v telefóne zapnutý'), h('b', { class: d.available === false ? 'bad' : d.available ? 'ok' : '' }, yes(d.available))),
      d.perms !== undefined
        ? h('div', { class: 'diag-row' }, h('span', null, 'Povolenie Zariadenia v blízkosti'), h('b', { class: d.perms ? 'ok' : '' }, d.perms ? '✓ áno' : 'opýta sa pri hľadaní'))
        : h('div', { class: 'diag-row' }, h('span', null, 'Zabezpečená adresa (https)'), h('b', { class: d.secure ? 'ok' : 'bad' }, yes(d.secure))),
    );
  });

  body.append(
    h('h2', { class: 'sec-title' }, 'Pripojiť tlačiareň'),
    search,
    searchAll,
    h('p', { class: 'muted small pad' }, isNativeApp()
      ? 'Po ťuknutí sa zobrazí zoznam zariadení v okolí. Počkajte pár sekúnd, kým sa objaví SK58_… (napr. SK58_D63F), a ťuknite naň.'
      : 'Po ťuknutí sa otvorí okno prehliadača so zoznamom zariadení. Počkajte pár sekúnd, kým sa objaví SK58_… (napr. SK58_D63F), ťuknite naň a potom na „Spárovať“ / „Pair“.'),
    h('h3', { class: 'tips-title' }, 'Ak sa tlačiareň nedá pripojiť:'),
    h('ol', { class: 'tips' },
      h('li', null, h('b', null, 'Vypnite appku Sinmark úplne: '), 'podržte prst na jej ikone → Informácie o aplikácii → Vynútiť zastavenie. Kým je spustená, tlačiareň je „obsadená“.'),
      h('li', null, 'Tlačiareň zapnite tlačidlom (nie len nabíjanie) a dajte ju k telefónu.'),
      h('li', null, 'V telefóne zapnite Bluetooth aj Polohu (rýchle nastavenia – stiahnite lištu zhora).'),
      isNativeApp()
        ? h('li', null, 'Keď sa aplikácia opýta na „Zariadenia v blízkosti“ (alebo Polohu), ťuknite na Povoliť. Ak ste omylom zamietli: Nastavenia → Aplikácie → Tlač etikiet → Povolenia.')
        : h('li', null, 'Povoľte prehliadaču Bluetooth: Nastavenia → Aplikácie → Samsung Internet → Povolenia → Zariadenia v blízkosti → Povoliť, a Poloha → Povoliť.'),
      isNativeApp() ? null : h('li', null, 'Ak sa okno so zoznamom vôbec neotvorí, zatvorte a znova otvorte prehliadač a skúste to ešte raz.'),
      h('li', null, 'Ak sa tlačiareň nezobrazí ani pri „Zobraziť všetky“, vypnite a zapnite tlačiareň a počkajte 10 sekúnd.'),
      h('li', null, 'Ak je SK58 v Nastaveniach telefónu → Pripojenia → Bluetooth vedená ako pripojená, ťuknite na ňu a odpojte ju.'),
    ),
    diag,
  );
}

/** Sprievodca nastavením tlače: testovacie etikety s pravítkom a uloženie zistených hodnôt. */
async function printTest() {
  const cfg = getSettings();
  const sizes = SIZE_PRESETS.map(([w, hh]) => ({ value: `${w}x${hh}`, label: `${w} × ${hh} mm` }));
  let val = `${cfg.lastW}x${cfg.lastH}`;
  if (!sizes.find((x) => x.value === val)) sizes.unshift({ value: val, label: `${cfg.lastW} × ${cfg.lastH} mm` });
  let count = 2;
  let feed = cfg.feed;
  let usedSkip = null; // nepotlačiteľný pás použitý pri poslednom teste
  let measured = 10;
  let s;
  const msg = h('div', { class: 'print-msg' });
  const result = h('div', { class: 'calib-result', hidden: true });
  const go2 = h('button', { class: 'btn btn-primary', type: 'button' }, icon('printer', 20), h('span', null, 'Vytlačiť test'));
  go2.addEventListener('click', async () => {
    go2.disabled = true;
    const [w, hh] = val.split('x').map(Number);
    const testCfg = { ...getSettings(), feed };
    try {
      await ensureConnected();
      msg.className = 'print-msg';
      msg.textContent = 'Posielam…';
      const label = testLabel(w, hh);
      await printJobs(count, () => ({ label, vars: makeVars(label) }), {
        cfg: testCfg,
        onProgress: (i, n, f) => { msg.textContent = `Posielam ${i + 1}/${n}… ${Math.round(f * 100)} %`; },
      });
      usedSkip = testCfg.topSkip || 0;
      msg.textContent = 'Odoslané. Teraz skontrolujte vytlačené etikety podľa krokov nižšie.';
      msg.className = 'print-msg ok';
      result.hidden = false;
    } catch (e) { msg.textContent = e.message; msg.className = 'print-msg error'; } finally { go2.disabled = false; }
  });
  const save = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Uložiť zistené nastavenie');
  save.addEventListener('click', () => {
    const skip = Math.max(0, Math.min(15, Math.round((measured - 10 + (usedSkip ?? cfg.topSkip)) * 2) / 2));
    setSettings({ topSkip: skip, feed });
    refreshEditor();
    toast(`Uložené: nepotlačiteľný pás ${fmt(skip)} mm`);
    s.close();
    if (current === 'me') renderMe();
  });
  result.append(
    h('div', { class: 'props-sub' }, 'Vyhodnotenie'),
    h('ol', { class: 'tips' },
      h('li', null, 'Pravítkom zmerajte, ako ďaleko od horného okraja etikety je čiarka s číslom 10.'),
      h('li', null, 'Ak je obsah posunutý doľava alebo doprava, upravte v Nastaveniach „Posun doprava“.'),
      h('li', null, 'Ak druhá etiketa nezačína rovnako ako prvá alebo sa preskakujú etikety, skúste iný posun papiera a vytlačte test znova.')),
    field('Čiarka „10“ je od horného okraja etikety', stepper(10, { step: 0.5, min: 0, max: 40, suffix: 'mm' }, (v) => { measured = v; })),
    save,
  );
  s = openSheet({
    title: 'Nastavenie tlače – test',
    body: h('div', null,
      h('p', { class: 'field-hint' }, 'Vytlačí sa rámček a pravítko v milimetroch. Podľa výsledku aplikácia nastaví nepotlačiteľný pás a posun papiera.'),
      field('Veľkosť etikety vo vašej tlačiarni', select(sizes, val, (v) => { val = v; })),
      h('div', { class: 'grid2' },
        field('Počet testovacích etikiet', stepper(count, { step: 1, min: 1, max: 5, dec: 0 }, (v) => { count = v; })),
        field('Posun papiera', select([
          { value: 'gsff', label: 'Medzera (GS FF)' },
          { value: 'ff', label: 'Medzera (FF)' },
          { value: 'fixed', label: 'Pevná dĺžka' },
          { value: 'none', label: 'Žiadny' },
        ], feed, (v) => { feed = v; })),
      ),
      msg, result),
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

async function renderMe() {
  const b = $('#me-body');
  const nLabels = (await allLabels()).length;
  const nHist = getHistory().reduce((a, e) => a + (e.count || 1), 0);
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

  const tile = (ic, label, value, onclick) => h('button', { class: 'me-tile', type: 'button', onclick }, icon(ic, 26), value != null ? h('b', null, String(value)) : null, h('span', null, label));
  b.append(
    h('div', { class: 'me-grid' },
      tile('templates', 'Moje etikety', nLabels, () => go('#/')),
      tile('clock', 'Vytlačené', nHist, openHistory),
      tile('help', 'Pomocník', null, openHelp),
    ),
    h('h2', { class: 'sec-title' }, 'Tlačiareň'),
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
      field('Typ papiera / posun po etikete', select([
        { value: 'gsff', label: 'Etikety (medzera / čierna značka)' },
        { value: 'ff', label: 'Etikety s medzerou (príkaz FF)' },
        { value: 'fixed', label: 'Súvislý papier – posun o pevnú dĺžku' },
        { value: 'none', label: 'Neposúvať papier' },
      ], cfg.feed, (v) => { setSettings({ feed: v }); feedFixed.hidden = v !== 'fixed'; })),
      feedFixed,
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => printTest() }, icon('printer', 20), h('span', null, 'Sprievodca nastavením (test)')),
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
      h('p', { class: 'muted small' }, 'Pre tlačiarne SK58 (Sinmark) a podobné Bluetooth tlačiarne s príkazmi ESC/POS, 203 dpi, šírka tlače 48 mm. ' + (isNativeApp() ? 'Android aplikácia s vlastným Bluetooth pripojením.' : 'Funguje v Samsung Internete aj v Chrome na Androide.')),
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
  $('#home-history').innerHTML = svgIcon('clock', 24);
  $('#home-history').addEventListener('click', openHistory);
  $('#home-search').addEventListener('input', (e) => { homeQuery = e.target.value; renderHome(); });
  $('.qi-create').innerHTML = svgIcon('plus', 26);
  $('.qi-pdf').innerHTML = svgIcon('doc', 26);
  $('.qi-image').innerHTML = svgIcon('image', 26);
  $('.qi-scan').innerHTML = svgIcon('scan', 26);

  onStatus(updatePrinterUI);
  window.addEventListener('hashchange', route);
  route();

  // tichý pokus o opätovné pripojenie k naposledy použitej tlačiarni
  setNativePicker(nativePicker);
  if (getStatus().saved && (isNativeApp() || navigator.bluetooth?.getDevices)) reconnect({ quiet: true }).catch(() => {});

  if ('serviceWorker' in navigator && location.protocol === 'https:' && !isNativeApp()) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

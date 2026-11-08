// Pomocné funkcie pre používateľské rozhranie: tvorba prvkov, ikony, hlášky, spodné panely, dialógy.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'multiple', 'indeterminate']);

/** Vytvorí DOM prvok. h('button', { class: 'btn', onclick }, 'Text') */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------------------------------------------------------------- ikony
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  templates: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
  barcode: '<path d="M4 5v14M8 5v14M11 5v14M15 5v14M20 5v14"/><path d="M6 5v14M17.5 5v14" stroke-width="1"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20.5h1M20.5 14h.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  line: '<path d="M4 12h16"/>',
  shape: '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  front: '<rect x="9" y="9" width="11" height="11" rx="1" fill="currentColor" fill-opacity=".3"/><path d="M5 15V5h10"/>',
  backward: '<rect x="4" y="4" width="11" height="11" rx="1" fill="currentColor" fill-opacity=".3"/><path d="M19 9v10H9"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  bluetooth: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  hash: '<path d="M5 9h15M4 15h15M10 3L8 21M16 3l-2 18"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  centerH: '<path d="M12 3v18"/><rect x="6" y="7" width="12" height="4" rx="1"/><rect x="8" y="13" width="8" height="4" rx="1"/>',
  centerV: '<path d="M3 12h18"/><rect x="7" y="6" width="4" height="12" rx="1"/><rect x="13" y="8" width="4" height="8" rx="1"/>',
  alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  vTop: '<path d="M4 4h16"/><rect x="8" y="7" width="8" height="8" rx="1"/>',
  vMid: '<path d="M4 12h16"/><rect x="8" y="7" width="8" height="10" rx="1" fill="currentColor" fill-opacity=".2"/>',
  vBot: '<path d="M4 20h16"/><rect x="8" y="9" width="8" height="8" rx="1"/>',
  rotate: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  doc: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  scan: '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  refresh: '<path d="M20 12a8 8 0 11-2.3-5.7L20 8"/><path d="M20 3v5h-5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  flash: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
};

export function svgIcon(name, size = 24) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function icon(name, size = 24) {
  const s = document.createElement('span');
  s.className = 'icw';
  s.innerHTML = svgIcon(name, size);
  return s;
}

// ---------------------------------------------------------------- čísla
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** 12.5 → "12,5" (slovenská desatinná čiarka) */
export function fmt(n, dec = 1) {
  if (n == null || Number.isNaN(n)) return '';
  const f = 10 ** dec;
  return String(Math.round(n * f) / f).replace('.', ',');
}

/** "12,5" alebo "12.5" → 12.5 */
export function parseNum(s, fallback = 0) {
  const v = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(v) ? v : fallback;
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- hláška
let toastTimer;
export function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').classList.remove('show');
}

export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- spodné panely (sheets)
// Každý otvorený panel pridá záznam do histórie, takže tlačidlo/gesto „späť“ v Androide
// zatvorí panel namiesto opustenia obrazovky.
const stack = [];

function removeSheet(s) {
  if (s.removed) return;
  s.removed = true;
  const i = stack.indexOf(s);
  if (i >= 0) stack.splice(i, 1);
  s.el.classList.remove('open');
  setTimeout(() => s.el.remove(), 200);
  s.onClose?.();
}

window.addEventListener('popstate', (e) => {
  const depth = (e.state && e.state.sheetDepth) || 0;
  while (stack.length > depth) removeSheet(stack[stack.length - 1]);
});

/**
 * Otvorí spodný panel.
 * @param {{title?:string, body:Node|Node[], footer?:Node|Node[], onClose?:Function, full?:boolean, cls?:string}} o
 */
export function openSheet(o) {
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zavrieť', html: svgIcon('close') });
  const panel = h('div', { class: 'sheet' + (o.full ? ' sheet-full' : '') + (o.cls ? ' ' + o.cls : ''), role: 'dialog', 'aria-modal': 'true' },
    o.title != null ? h('div', { class: 'sheet-head' }, h('h3', null, o.title), closeBtn) : null,
    h('div', { class: 'sheet-body' }, o.body),
    o.footer ? h('div', { class: 'sheet-foot' }, o.footer) : null,
  );
  const el = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-backdrop' }), panel);
  const s = { el, panel, onClose: o.onClose, removed: false };
  s.close = () => {
    if (s.removed) return;
    if (stack[stack.length - 1] === s && history.state && history.state.sheetDepth === stack.length) history.back();
    else removeSheet(s);
  };
  closeBtn.addEventListener('click', s.close);
  el.firstChild.addEventListener('click', () => { if (!o.modal) s.close(); });
  $('#sheets').append(el);
  stack.push(s);
  history.pushState({ sheetDepth: stack.length }, '');
  requestAnimationFrame(() => el.classList.add('open'));
  return s;
}

/** Zatvorí všetky panely bez čakania (pred prechodom na inú obrazovku). Vráti počet záznamov v histórii. */
export function dropAllSheets() {
  const n = stack.length;
  [...stack].reverse().forEach((s) => removeSheet(s));
  return n;
}

export const sheetOpen = () => stack.length > 0;

/** Ponuka akcií (ako kontextové menu). items: [{label, icon, danger, onClick}] */
export function actionSheet(title, items) {
  let s;
  const list = h('div', { class: 'action-list' }, items.filter(Boolean).map((it) =>
    h('button', {
      class: 'action-item' + (it.danger ? ' danger' : ''), type: 'button',
      onclick: () => { s.close(); setTimeout(() => it.onClick(), 50); },
    }, it.icon ? icon(it.icon, 22) : null, h('span', null, it.label))));
  s = openSheet({ title, body: list });
  return s;
}

export function confirmDialog(message, { ok = 'OK', cancel = 'Zrušiť', danger = false, title = '' } = {}) {
  return new Promise((resolve) => {
    let result = false;
    let s;
    const footer = [
      h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, cancel),
      h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', onclick: () => { result = true; s.close(); } }, ok),
    ];
    s = openSheet({ title, body: h('p', { class: 'dialog-text' }, message), footer, onClose: () => resolve(result) });
  });
}

export function promptDialog(title, value = '', { placeholder = '', ok = 'Uložiť', inputmode = 'text' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    let s;
    const input = h('input', { class: 'input', type: 'text', value, placeholder, inputmode, enterkeyhint: 'done' });
    const done = () => { result = input.value; s.close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
    s = openSheet({
      title,
      body: input,
      footer: [
        h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Zrušiť'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: done }, ok),
      ],
      onClose: () => resolve(result),
    });
    setTimeout(() => { input.focus(); input.select(); }, 250);
  });
}

/** Vyberie súbor z mobilu. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------- formulárové prvky
/** Prepínač (switch) */
export function toggle(checked, onChange) {
  const inp = h('input', { type: 'checkbox', checked: !!checked });
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'switch' }, inp, h('span', { class: 'slider' }));
}

/** Segmentový prepínač: options [{value, label|icon, title}] */
export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg' });
  const render = (v) => {
    wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  };
  for (const o of options) {
    const b = h('button', { type: 'button', 'data-v': String(o.value), title: o.title || '', 'aria-label': o.title || o.label || '' },
      o.icon ? icon(o.icon, 20) : null, o.label ? h('span', null, o.label) : null);
    b.addEventListener('click', () => { render(o.value); onChange(o.value); });
    wrap.append(b);
  }
  render(value);
  wrap.set = render;
  return wrap;
}

/** Číselné pole s tlačidlami − a +. */
export function stepper(value, { step = 1, min = -9999, max = 9999, dec = 1, suffix = '' } = {}, onChange) {
  const inp = h('input', { class: 'input num', type: 'text', inputmode: 'decimal', value: fmt(value, dec) });
  const set = (v, fire = true) => {
    v = clamp(Math.round(v / step) * step, min, max);
    v = Math.round(v * 1000) / 1000;
    inp.value = fmt(v, dec);
    if (fire) onChange(v);
  };
  inp.addEventListener('change', () => set(parseNum(inp.value, value)));
  inp.addEventListener('focus', () => inp.select());
  const minus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Menej', html: svgIcon('minus', 18) });
  const plus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Viac', html: svgIcon('plus', 18) });
  minus.addEventListener('click', () => set(parseNum(inp.value, value) - step));
  plus.addEventListener('click', () => set(parseNum(inp.value, value) + step));
  const w = h('div', { class: 'stepper' }, minus, inp, suffix ? h('span', { class: 'suffix' }, suffix) : null, plus);
  w.set = (v) => set(v, false);
  return w;
}

export function field(label, control, hint) {
  return h('div', { class: 'field' },
    h('div', { class: 'field-label' }, label),
    control,
    hint ? h('div', { class: 'field-hint' }, hint) : null);
}

export function row(label, control, hint) {
  return h('div', { class: 'row' },
    h('div', { class: 'row-text' }, h('div', null, label), hint ? h('div', { class: 'row-hint' }, hint) : null),
    control);
}

export function select(options, value, onChange) {
  const s = h('select', { class: 'input' }, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

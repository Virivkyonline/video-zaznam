// Zdroj údajov pre hromadnú tlač: načítanie Excelu (XLSX) a CSV bez externých knižníc.
// Údaje sa uložia do etikety (label.data) a prvky na ne odkazujú cez {Názov stĺpca}.

const MAX_ROWS = 5000;

// ---------------------------------------------------------------- ZIP (XLSX je ZIP archív)
async function unzip(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Súbor nie je platný Excel (XLSX).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < count && p + 46 <= buf.byteLength; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    entries.set(name.toLowerCase(), { method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  return {
    has: (name) => entries.has(name.toLowerCase()),
    async text(name) {
      const e = entries.get(name.toLowerCase());
      if (!e) return null;
      const lnl = dv.getUint16(e.off + 26, true);
      const lxl = dv.getUint16(e.off + 28, true);
      const start = e.off + 30 + lnl + lxl;
      const data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return dec.decode(data);
      if (e.method !== 8) throw new Error('Nepodporovaná kompresia v súbore XLSX.');
      if (typeof DecompressionStream === 'undefined') throw new Error('Prehliadač nevie rozbaliť XLSX. Uložte tabuľku ako CSV.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    },
  };
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const tags = (node, name) => Array.from(node.getElementsByTagName(name));

function colIndex(ref) {
  const m = /^([A-Z]+)/i.exec(ref || '');
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function colLetter(i) {
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

const pad2 = (n) => String(n).padStart(2, '0');

function isDateFormat(id, code) {
  if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
  if (!code) return false;
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(c) && !/^general$/i.test(c);
}

function formatNumber(v, fmt) {
  if (fmt.date) {
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    const date = `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
    const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
    if (v < 1) return time;
    return fmt.time ? `${date} ${time}` : date;
  }
  if (fmt.percent) return String(Math.round(v * 10000) / 100).replace('.', ',') + ' %';
  if (fmt.decimals != null) return v.toFixed(fmt.decimals).replace('.', ',');
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1e10) / 1e10).replace('.', ',');
}

async function parseXlsx(buf, sheetIndex = 0) {
  const zip = await unzip(buf);
  const wb = await zip.text('xl/workbook.xml');
  if (!wb) throw new Error('V súbore chýba zošit (xl/workbook.xml).');
  const wbDoc = xml(wb);
  const sheets = tags(wbDoc, 'sheet').map((s) => ({
    name: s.getAttribute('name'),
    rid: s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'),
  }));
  if (!sheets.length) throw new Error('Zošit neobsahuje žiadny hárok.');
  const rels = xml((await zip.text('xl/_rels/workbook.xml.rels')) || '<Relationships/>');
  const relMap = new Map(tags(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sh = sheets[Math.min(sheetIndex, sheets.length - 1)];
  let target = relMap.get(sh.rid) || `worksheets/sheet${sheetIndex + 1}.xml`;
  target = target.replace(/^\//, '');
  const path = target.startsWith('xl/') ? target : 'xl/' + target;

  // zdieľané texty
  const shared = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) {
    for (const si of tags(xml(ss), 'si')) {
      shared.push(tags(si, 't').filter((t) => t.parentNode.nodeName !== 'rPh').map((t) => t.textContent).join(''));
    }
  }
  // formáty čísel (dátumy, desatinné miesta)
  const fmts = [];
  const st = await zip.text('xl/styles.xml');
  if (st) {
    const sd = xml(st);
    const custom = new Map(tags(sd, 'numFmt').map((n) => [Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode') || '']));
    const cellXfs = tags(sd, 'cellXfs')[0];
    if (cellXfs) {
      for (const xf of Array.from(cellXfs.children).filter((c) => c.nodeName === 'xf')) {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        const code = custom.get(id) || '';
        const f = { date: isDateFormat(id, code) };
        if (f.date) f.time = (id >= 18 && id <= 22) || /h/i.test(code.replace(/"[^"]*"/g, ''));
        if (id === 9 || id === 10 || /%/.test(code)) f.percent = true;
        const dm = /0\.(0+)/.exec(code);
        if (dm) f.decimals = dm[1].length;
        else if (id === 2 || id === 4) f.decimals = 2;
        fmts.push(f);
      }
    }
  }

  const sheetXml = await zip.text(path);
  if (!sheetXml) throw new Error('Hárok sa nepodarilo načítať.');
  const doc = xml(sheetXml);
  const rows = [];
  for (const r of tags(doc, 'row')) {
    const ri = Number(r.getAttribute('r') || rows.length + 1) - 1;
    if (ri >= MAX_ROWS + 1) break;
    const row = rows[ri] || (rows[ri] = []);
    let ci = 0;
    for (const c of Array.from(r.children).filter((n) => n.nodeName === 'c')) {
      const ref = c.getAttribute('r');
      if (ref) ci = colIndex(ref);
      const t = c.getAttribute('t');
      const vEl = tags(c, 'v')[0];
      const v = vEl ? vEl.textContent : '';
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
      else if (t === 'str' || t === 'e') val = v;
      else if (t === 'b') val = v === '1' ? 'ÁNO' : 'NIE';
      else if (v !== '') {
        const num = Number(v);
        const f = fmts[Number(c.getAttribute('s') || 0)] || {};
        val = Number.isFinite(num) ? formatNumber(num, f) : v;
      }
      row[ci] = val;
      ci++;
    }
  }
  return { rows: normalize(rows), sheets: sheets.map((s) => s.name), sheet: sh.name };
}

// ---------------------------------------------------------------- CSV
function decodeText(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('windows-1250').decode(buf); }
  return text.replace(/^﻿/, '');
}

function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  const cands = [';', ',', '\t', '|'];
  const delim = cands.reduce((a, b) => (count(b) > count(a) ? b : a), ';');
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
      if (rows.length > MAX_ROWS + 1) break;
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return normalize(rows);
}

function normalize(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) out.push((rows[i] || []).map((v) => (v == null ? '' : String(v).trim())));
  while (out.length && out[out.length - 1].every((v) => v === '')) out.pop();
  const width = Math.max(0, ...out.map((r) => {
    let n = r.length;
    while (n > 0 && r[n - 1] === '') n--;
    return n;
  }));
  return out.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

/** Načíta súbor .xlsx alebo .csv. Vráti { name, rows, sheets?, sheet? }. */
export async function readDataFile(file, sheetIndex = 0) {
  const buf = await file.arrayBuffer();
  const name = file.name || 'údaje';
  const u8 = new Uint8Array(buf.slice(0, 4));
  const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
  if (/\.xls$/i.test(name) && !isZip) throw new Error('Starý formát .xls nie je podporovaný. V Exceli ho uložte ako .xlsx alebo .csv.');
  const res = isZip ? await parseXlsx(buf, sheetIndex) : { rows: parseCsv(decodeText(buf)) };
  if (!res.rows.length) throw new Error('Súbor neobsahuje žiadne údaje.');
  return { name, ...res };
}

// ---------------------------------------------------------------- práca s údajmi etikety
/** Názvy stĺpcov (z hlavičky alebo písmená A, B, C…). */
export function dataColumns(data) {
  if (!data || !data.rows?.length) return [];
  const width = data.rows[0].length;
  const head = data.header ? data.rows[0] : [];
  const seen = new Set();
  return Array.from({ length: width }, (_, i) => {
    let n = (head[i] || '').replace(/[{}]/g, '').trim() || colLetter(i);
    while (seen.has(n.toLowerCase())) n += '_';
    seen.add(n.toLowerCase());
    return n;
  });
}

/** Riadky s údajmi (bez hlavičky). */
export function dataRecords(data) {
  if (!data || !data.rows?.length) return [];
  return data.header ? data.rows.slice(1) : data.rows;
}

/** Mapa {stĺpec → hodnota} pre daný riadok (index od 0). */
export function rowMap(data, index) {
  const recs = dataRecords(data);
  if (!recs.length) return null;
  const r = recs[Math.max(0, Math.min(recs.length - 1, index || 0))];
  const cols = dataColumns(data);
  const m = new Map();
  cols.forEach((c, i) => m.set(c.toLowerCase(), r[i] ?? ''));
  cols.forEach((c, i) => { const L = colLetter(i).toLowerCase(); if (!m.has(L)) m.set(L, r[i] ?? ''); });
  return m;
}

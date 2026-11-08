// Kódovanie 1D čiarových kódov do postupnosti modulov ("1" = čiara, "0" = medzera).
// Podporované: EAN-13, EAN-8, UPC-A, Code 128 (automaticky B/C), Code 39.

export const FORMATS = [
  { id: 'EAN13', name: 'EAN-13', hint: '12 alebo 13 číslic' },
  { id: 'EAN8', name: 'EAN-8', hint: '7 alebo 8 číslic' },
  { id: 'UPCA', name: 'UPC-A', hint: '11 alebo 12 číslic' },
  { id: 'CODE128', name: 'Code 128', hint: 'písmená, číslice a znaky bez diakritiky' },
  { id: 'CODE39', name: 'Code 39', hint: 'A–Z, 0–9 a - . $ / + % medzera' },
];

// ---------------------------------------------------------------- EAN / UPC
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Kontrolná číslica GTIN (EAN-8/13, UPC-A) pre číslice bez kontrolnej. */
export function gtinCheck(digits) {
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w;
  return String((10 - (sum % 10)) % 10);
}

function gtin(data, len, name) {
  const d = String(data).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(d)) return { error: `${name}: povolené sú len číslice` };
  if (d.length === len - 1) return { digits: d + gtinCheck(d) };
  if (d.length === len) {
    const c = gtinCheck(d.slice(0, -1));
    if (c !== d[len - 1]) return { error: `${name}: nesprávna kontrolná číslica (má byť ${c})` };
    return { digits: d };
  }
  return { error: `${name}: zadajte ${len - 1} alebo ${len} číslic (máte ${d.length})` };
}

function ean13(data) {
  const r = gtin(data, 13, 'EAN-13');
  if (r.error) return { ok: false, error: r.error };
  const d = r.digits;
  const par = EAN13_PARITY[+d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[+d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[+d[i]];
  bits += '101';
  return {
    ok: true, bits, text: d, layout: 'ean',
    guards: [[0, 3], [45, 50], [92, 95]],
    outLeft: d[0], outRight: '',
    groups: [{ text: d.slice(1, 7), from: 3, to: 45 }, { text: d.slice(7), from: 50, to: 92 }],
  };
}

function ean8(data) {
  const r = gtin(data, 8, 'EAN-8');
  if (r.error) return { ok: false, error: r.error };
  const d = r.digits;
  let bits = '101';
  for (let i = 0; i < 4; i++) bits += L[+d[i]];
  bits += '01010';
  for (let i = 4; i < 8; i++) bits += R[+d[i]];
  bits += '101';
  return {
    ok: true, bits, text: d, layout: 'ean',
    guards: [[0, 3], [31, 36], [64, 67]],
    outLeft: '', outRight: '',
    groups: [{ text: d.slice(0, 4), from: 3, to: 31 }, { text: d.slice(4), from: 36, to: 64 }],
  };
}

function upca(data) {
  const r = gtin(data, 12, 'UPC-A');
  if (r.error) return { ok: false, error: r.error };
  const d = r.digits;
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += L[+d[i]];
  bits += '01010';
  for (let i = 6; i < 12; i++) bits += R[+d[i]];
  bits += '101';
  return {
    ok: true, bits, text: d, layout: 'ean',
    // pri UPC-A sú predĺžené aj čiary prvej a poslednej číslice
    guards: [[0, 10], [45, 50], [85, 95]],
    outLeft: d[0], outRight: d[11],
    groups: [{ text: d.slice(1, 6), from: 10, to: 45 }, { text: d.slice(6, 11), from: 50, to: 85 }],
  };
}

// ---------------------------------------------------------------- Code 128
const C128 = [
  11011001100, 11001101100, 11001100110, 10010011000, 10010001100,
  10001001100, 10011001000, 10011000100, 10001100100, 11001001000,
  11001000100, 11000100100, 10110011100, 10011011100, 10011001110,
  10111001100, 10011101100, 10011100110, 11001110010, 11001011100,
  11001001110, 11011100100, 11001110100, 11101101110, 11101001100,
  11100101100, 11100100110, 11101100100, 11100110100, 11100110010,
  11011011000, 11011000110, 11000110110, 10100011000, 10001011000,
  10001000110, 10110001000, 10001101000, 10001100010, 11010001000,
  11000101000, 11000100010, 10110111000, 10110001110, 10001101110,
  10111011000, 10111000110, 10001110110, 11101110110, 11010001110,
  11000101110, 11011101000, 11011100010, 11011101110, 11101011000,
  11101000110, 11100010110, 11101101000, 11101100010, 11100011010,
  11101111010, 11001000010, 11110001010, 10100110000, 10100001100,
  10010110000, 10010000110, 10000101100, 10000100110, 10110010000,
  10110000100, 10011010000, 10011000010, 10000110100, 10000110010,
  11000010010, 11001010000, 11110111010, 11000010100, 10001111010,
  10100111100, 10010111100, 10010011110, 10111100100, 10011110100,
  10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
  11011110110, 11110110110, 10101111000, 10100011110, 10001011110,
  10111101000, 10111100010, 11110101000, 11110100010, 10111011110,
  10111101110, 11101011110, 11110101110, 11010000100, 11010010000,
  11010011100, 1100011101011,
];
const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

function digitRun(s, i) {
  let n = 0;
  while (i + n < s.length && s.charCodeAt(i + n) >= 48 && s.charCodeAt(i + n) <= 57) n++;
  return n;
}

function code128(data) {
  const s = String(data);
  if (!s.length) return { ok: false, error: 'Code 128: zadajte text' };
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return { ok: false, error: `Code 128: znak „${ch}“ sa nedá zakódovať (bez diakritiky)` };
  }
  const vals = [];
  let set;
  let i = 0;
  const first = digitRun(s, 0);
  if (first >= 4 || (first === s.length && first % 2 === 0)) {
    set = 'C';
    vals.push(START_C);
  } else {
    set = 'B';
    vals.push(START_B);
  }
  while (i < s.length) {
    if (set === 'C') {
      const run = digitRun(s, i);
      if (run >= 2) {
        vals.push(Number(s.substr(i, 2)));
        i += 2;
        continue;
      }
      vals.push(CODE_B);
      set = 'B';
      continue;
    }
    // sada B: prepnúť do C pri dlhšom úseku číslic (≥6, alebo ≥4 na konci textu)
    const run = digitRun(s, i);
    if (run >= 6 || (run >= 4 && i + run === s.length)) {
      if (run % 2 === 1) { vals.push(s.charCodeAt(i) - 32); i++; }
      vals.push(CODE_C);
      set = 'C';
      continue;
    }
    vals.push(s.charCodeAt(i) - 32);
    i++;
  }
  let sum = vals[0];
  for (let k = 1; k < vals.length; k++) sum += vals[k] * k;
  vals.push(sum % 103);
  vals.push(STOP);
  return { ok: true, bits: vals.map((v) => String(C128[v])).join(''), text: s, layout: 'plain' };
}

// ---------------------------------------------------------------- Code 39
const C39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
const C39 = [
  20957, 29783, 23639, 30485, 20951, 29813, 23669, 20855, 29789, 23645,
  29975, 23831, 30533, 22295, 30149, 24005, 21623, 29981, 23837, 22301,
  30023, 23879, 30545, 22343, 30161, 24017, 21959, 30065, 23921, 22385,
  29015, 18263, 29141, 17879, 29045, 18293, 17783, 29021, 18269, 17477,
  17489, 17681, 20753, 35770,
];

function code39(data) {
  const s = String(data).toUpperCase();
  if (!s.length) return { ok: false, error: 'Code 39: zadajte text' };
  for (const ch of s) {
    const k = C39_CHARS.indexOf(ch);
    if (k < 0 || ch === '*') return { ok: false, error: `Code 39: znak „${ch}“ nie je povolený` };
  }
  const full = '*' + s + '*';
  const bits = [...full].map((ch) => C39[C39_CHARS.indexOf(ch)].toString(2)).join('0');
  return { ok: true, bits, text: s, layout: 'plain' };
}

// ---------------------------------------------------------------- verejné API
const ENCODERS = { EAN13: ean13, EAN8: ean8, UPCA: upca, CODE128: code128, CODE39: code39 };
const cache = new Map();

/**
 * @returns {{ok:boolean, error?:string, bits?:string, text?:string, layout?:'ean'|'plain',
 *   guards?:number[][], groups?:{text:string,from:number,to:number}[], outLeft?:string, outRight?:string}}
 */
export function encodeBarcode(format, data) {
  const key = format + '\u0000' + data;
  let r = cache.get(key);
  if (!r) {
    const enc = ENCODERS[format] || code128;
    try { r = enc(data ?? ''); } catch (e) { r = { ok: false, error: String(e.message || e) }; }
    if (cache.size > 300) cache.clear();
    cache.set(key, r);
  }
  return r;
}

/** Odhad formátu z načítaného kódu (napr. zo skenera). */
export function guessFormat(text) {
  const d = String(text).trim();
  if (/^\d{13}$/.test(d) && gtinCheck(d.slice(0, 12)) === d[12]) return 'EAN13';
  if (/^\d{8}$/.test(d) && gtinCheck(d.slice(0, 7)) === d[7]) return 'EAN8';
  if (/^\d{12}$/.test(d) && gtinCheck(d.slice(0, 11)) === d[11]) return 'UPCA';
  return 'CODE128';
}

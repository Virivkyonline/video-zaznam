// Ukladanie etikiet (IndexedDB, pri chybe localStorage) a nastavení (localStorage).

const DB_NAME = 'tlac-etikiet';
const STORE = 'etikety';
const LS_LABELS = 'tlac-etikiet:etikety';
const LS_SETTINGS = 'tlac-etikiet:nastavenia';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB nie je k dispozícii')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Databáza je zablokovaná'));
    }).catch((e) => { console.warn('IndexedDB nedostupná, používam localStorage', e); return null; });
  }
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let result;
    const r = fn(st);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transakcia prerušená'));
  });
}

function lsAll() {
  try { return JSON.parse(localStorage.getItem(LS_LABELS) || '[]'); } catch { return []; }
}
function lsSave(list) {
  localStorage.setItem(LS_LABELS, JSON.stringify(list));
}

export async function allLabels() {
  const db = await openDb();
  const list = db ? await tx(db, 'readonly', (st) => st.getAll()) : lsAll();
  return (list || []).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function getLabel(id) {
  const db = await openDb();
  if (db) return (await tx(db, 'readonly', (st) => st.get(id))) || null;
  return lsAll().find((l) => l.id === id) || null;
}

export async function putLabel(label) {
  const copy = JSON.parse(JSON.stringify(label));
  const db = await openDb();
  if (db) { await tx(db, 'readwrite', (st) => st.put(copy)); return; }
  const list = lsAll().filter((l) => l.id !== copy.id);
  list.push(copy);
  lsSave(list);
}

export async function deleteLabel(id) {
  const db = await openDb();
  if (db) { await tx(db, 'readwrite', (st) => st.delete(id)); return; }
  lsSave(lsAll().filter((l) => l.id !== id));
}

// ---------------------------------------------------------------- nastavenia
export const DEFAULT_SETTINGS = {
  // Nepotlačiteľný pás na začiatku etikety (mm). Tlačová hlava SK58 po posune na ďalšiu
  // etiketu stojí niekoľko mm za jej horným okrajom – tento pás sa z návrhu vynechá.
  topSkip: 4,
  offsetX: 0, // posun doprava (mm)
  offsetY: 0, // posun nadol (mm)
  threshold: 128, // prah čiernej pre text a tvary (0–255)
  feed: 'gsff', // gsff | ff | fixed | none
  feedMm: 3, // pri „fixed“: o koľko mm posunúť po etikete (súvislý papier / medzera)
  backfeed: 0, // experimentálne: spätný posun pred tlačou (mm), ESC K n
  method: 'raster', // raster (GS v 0) | bands (ESC * 33)
  chunk: 20, // veľkosť balíka pre Bluetooth (bajty)
  delay: 10, // pauza medzi balíkmi (ms)
  copyPause: 300, // pauza medzi kópiami (ms)
  lastW: 50,
  lastH: 30,
  showAll: false, // pri hľadaní zobraziť všetky Bluetooth zariadenia
};

let cache = null;

export function getSettings() {
  if (!cache) {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}'); } catch { s = {}; }
    cache = { ...DEFAULT_SETTINGS, ...s };
  }
  return cache;
}

export function setSettings(patch) {
  cache = { ...getSettings(), ...patch };
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(cache)); } catch { /* plná pamäť */ }
  return cache;
}

export function resetSettings() {
  const keep = { lastW: getSettings().lastW, lastH: getSettings().lastH };
  cache = { ...DEFAULT_SETTINGS, ...keep };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(cache));
  return cache;
}

// ---------------------------------------------------------------- história tlače
const LS_HISTORY = 'tlac-etikiet:historia';

export function getHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch { return []; }
}

export function addHistory(entry) {
  const list = getHistory();
  list.unshift({ t: Date.now(), ...entry });
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(list.slice(0, 100))); } catch { /* plná pamäť */ }
}

export function clearHistory() { localStorage.removeItem(LS_HISTORY); }

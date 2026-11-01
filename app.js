'use strict';

/* ================= Nastavenia ================= */

const QUALITY = {
  480: { w: 854, h: 480, vbps: 1_200_000 },
  720: { w: 1280, h: 720, vbps: 2_500_000 },
  1080: { w: 1920, h: 1080, vbps: 5_000_000 },
};

// 120 CSS px zodpovedá na bežných mobiloch približne 2 × 2 cm.
const DEFAULTS = {
  size: 120,
  corner: 'tr',
  quality: '720',
  audio: true,
  fullscreen: true,
  facing: 'environment',
};

const STORE_KEY = 'video-zaznam:settings';

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* súkromné okno */ }
}

const settings = loadSettings();

/* ================= Prvky stránky ================= */

const $ = (sel) => document.querySelector(sel);
const els = {
  pip: $('#pip'),
  preview: $('#preview'),
  pipEnable: $('#pipEnable'),
  pipTime: $('#pipTime'),
  home: $('#home'),
  status: $('#status'),
  recBtn: $('#recBtn'),
  switchBtn: $('#switchBtn'),
  settingsBtn: $('#settingsBtn'),
  settings: $('#settings'),
  sizeInput: $('#sizeInput'),
  sizeOut: $('#sizeOut'),
  cornerInput: $('#cornerInput'),
  qualityInput: $('#qualityInput'),
  audioInput: $('#audioInput'),
  fullscreenInput: $('#fullscreenInput'),
  formatInfo: $('#formatInfo'),
  list: $('#list'),
  empty: $('#empty'),
  storageInfo: $('#storageInfo'),
  recScreen: $('#recScreen'),
  stopBtn: $('#stopBtn'),
  player: $('#player'),
  playerVideo: $('#playerVideo'),
  playerInfo: $('#playerInfo'),
  shareBtn: $('#shareBtn'),
  downloadLink: $('#downloadLink'),
  deleteBtn: $('#deleteBtn'),
  closeBtn: $('#closeBtn'),
  toast: $('#toast'),
};

/* ================= Pomocné funkcie ================= */

const pad = (n) => String(n).padStart(2, '0');

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

const numFmt = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 1 });
function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '–';
  const units = ['B', 'kB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${numFmt.format(v)} ${units[i]}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('sk-SK', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fileName(ts, mime) {
  const d = new Date(ts);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `video-${stamp}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('err', isError);
}

let toastTimer = 0;
function toast(text, ms = 2600) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
}

/* ================= Úložisko nahrávok (IndexedDB) ================= */

const db = (() => {
  let opening = null;
  const open = () => {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const req = indexedDB.open('video-zaznam', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('videos', { keyPath: 'id', autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((err) => { opening = null; throw err; });
    }
    return opening;
  };
  const run = async (mode, op) => {
    const conn = await open();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction('videos', mode);
      const req = op(tx.objectStore('videos'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error || req.error);
      tx.onabort = () => reject(tx.error || new Error('Transakcia zrušená'));
    });
  };
  return {
    add: (v) => run('readwrite', (s) => s.add(v)),
    all: () => run('readonly', (s) => s.getAll()),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();

/* ================= Vzhľad náhľadu ================= */

function applyLayout() {
  document.documentElement.style.setProperty('--pip', `${settings.size}px`);
  document.body.dataset.corner = settings.corner;
  els.sizeOut.textContent = `${settings.size} px`;
}

function fillSettingsForm() {
  els.sizeInput.value = settings.size;
  els.cornerInput.value = settings.corner;
  els.qualityInput.value = settings.quality;
  els.audioInput.checked = settings.audio;
  els.fullscreenInput.checked = settings.fullscreen;
}

/* ================= Kamera ================= */

let stream = null;
let cameraRequest = 0;

function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const candidates = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

const mime = pickMime();

function stopStream() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  els.preview.srcObject = null;
}

function cameraErrorText(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Prístup ku kamere bol zamietnutý. Povoľte kameru v nastaveniach prehliadača.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenašla sa žiadna vhodná kamera.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Kameru práve používa iná aplikácia.';
    default:
      return `Kameru sa nepodarilo spustiť (${(err && err.name) || 'neznáma chyba'}).`;
  }
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Kamera tu nie je dostupná. Stránku otvorte cez HTTPS.', true);
    els.pip.classList.add('off');
    return false;
  }

  const myRequest = ++cameraRequest;
  stopStream();
  setStatus('Spúšťam kameru…');

  const q = QUALITY[settings.quality] || QUALITY[720];
  const video = {
    facingMode: { ideal: settings.facing },
    width: { ideal: q.w },
    height: { ideal: q.h },
    frameRate: { ideal: 30 },
  };
  const audio = settings.audio ? { echoCancellation: true, noiseSuppression: true } : false;

  // Postupne skúšame menej náročné požiadavky (napr. ak chýba mikrofón).
  const attempts = [{ video, audio }];
  if (audio) attempts.push({ video, audio: false });
  attempts.push({ video: { facingMode: { ideal: settings.facing } }, audio: false });

  let got = null;
  let lastErr = null;
  for (const c of attempts) {
    try {
      got = await navigator.mediaDevices.getUserMedia(c);
      break;
    } catch (err) {
      lastErr = err;
      if (err.name === 'NotAllowedError' && !c.audio) break;
    }
  }

  if (myRequest !== cameraRequest) {
    // medzitým prišla novšia požiadavka (napr. rýchle prepnutie kamery)
    if (got) got.getTracks().forEach((t) => t.stop());
    return false;
  }

  if (!got) {
    setStatus(cameraErrorText(lastErr), true);
    els.pip.classList.add('off');
    return false;
  }

  stream = got;
  const track = stream.getVideoTracks()[0];
  const ts = track.getSettings ? track.getSettings() : {};
  const facing = ts.facingMode || settings.facing;
  els.preview.classList.toggle('mirror', facing === 'user');
  els.preview.srcObject = stream;
  els.preview.play().catch(() => {});
  els.pip.classList.remove('off');

  track.addEventListener('ended', onTrackEnded);

  if (settings.audio && !stream.getAudioTracks().length) {
    toast('Mikrofón nie je dostupný – video bude bez zvuku.');
  }

  const fmt = (mime || 'video/webm').split(';')[0].replace('video/', '').toUpperCase();
  const res = ts.width && ts.height ? ` · ${ts.width}×${ts.height}` : '';
  els.formatInfo.textContent = `${fmt}${res}`;
  setStatus(window.MediaRecorder ? 'Pripravené. Ťuknite na červené tlačidlo.' : 'Tento prehliadač nevie nahrávať video.', !window.MediaRecorder);
  return true;
}

function onTrackEnded() {
  if (isRecording()) {
    stopRecording();
    toast('Kamera sa vypla – nahrávka bola uložená.');
  }
  stopStream();
  els.pip.classList.add('off');
  setStatus('Kamera je vypnutá. Ťuknite na štvorček vpravo.');
}

/* ================= Nahrávanie ================= */

let recorder = null;
let chunks = [];
let startedAt = 0;
let timer = 0;
let wakeLock = null;

const isRecording = () => !!recorder && recorder.state !== 'inactive';

function enterFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn || document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    const p = fn.call(el, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(() => {});
  } catch { /* nepodporované (napr. iPhone) */ }
}

function exitFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch { /* nič */ }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* nepodporované */ }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function tick() {
  const t = fmtTime(performance.now() - startedAt);
  els.pipTime.textContent = t;
  document.title = `● ${t} · Video záznam`;
}

function showRecordingUI(on) {
  document.body.classList.toggle('recording', on);
  els.home.hidden = on;
  els.recScreen.hidden = !on;
  els.pip.setAttribute('aria-label', on ? 'Nahráva sa – náhľad kamery' : 'Náhľad kamery');
  if (!on) document.title = 'Video záznam';
}

async function startRecording() {
  if (isRecording()) return;
  if (!window.MediaRecorder) {
    toast('Tento prehliadač nevie nahrávať video.');
    return;
  }
  // celá obrazovka musí byť vyžiadaná hneď po ťuknutí, pred akýmkoľvek čakaním
  if (settings.fullscreen) enterFullscreen();

  if (!stream || !stream.active) {
    const ok = await startCamera();
    if (!ok) { exitFullscreen(); return; }
  }

  const q = QUALITY[settings.quality] || QUALITY[720];
  const opts = { videoBitsPerSecond: q.vbps };
  if (stream.getAudioTracks().length) opts.audioBitsPerSecond = 128_000;
  if (mime) opts.mimeType = mime;

  let rec;
  try {
    rec = new MediaRecorder(stream, opts);
  } catch {
    try { rec = new MediaRecorder(stream); } catch (err) {
      toast(`Nahrávanie sa nepodarilo spustiť (${err.name}).`);
      exitFullscreen();
      return;
    }
  }

  chunks = [];
  recorder = rec;
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onerror = (e) => { toast(`Chyba nahrávania${e.error ? `: ${e.error.name}` : ''}`); };
  rec.onstop = () => finalize(rec);

  try {
    rec.start(1000); // každú sekundu kúsok dát – pri chybe neprídeme o všetko
  } catch (err) {
    recorder = null;
    toast(`Nahrávanie sa nepodarilo spustiť (${err.name}).`);
    exitFullscreen();
    return;
  }

  startedAt = performance.now();
  showRecordingUI(true);
  tick();
  timer = setInterval(tick, 250);
  requestWakeLock();
  if (navigator.vibrate) navigator.vibrate(30);
}

function stopRecording() {
  if (!isRecording()) return;
  els.stopBtn.disabled = true;
  try { recorder.stop(); } catch { finalize(recorder); }
}

async function finalize(rec) {
  if (rec !== recorder) return; // už spracované
  recorder = null;
  clearInterval(timer);
  const duration = Math.round(performance.now() - startedAt);
  const created = Date.now() - duration;
  const fullType = rec.mimeType || mime || (chunks[0] && chunks[0].type) || 'video/webm';
  const type = fullType.split(';')[0];
  const blob = new Blob(chunks, { type });
  chunks = [];

  showRecordingUI(false);
  els.stopBtn.disabled = false;
  releaseWakeLock();
  exitFullscreen();
  if (navigator.vibrate) navigator.vibrate([20, 60, 20]);

  if (!blob.size) {
    toast('Nahrávka je prázdna.');
    return;
  }

  const item = { name: fileName(created, type), created, duration, mime: type, size: blob.size, blob };
  try {
    item.id = await db.add(item);
    toast(`Uložené · ${fmtTime(duration)}`);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (err) {
    console.error(err);
    toast('Nedá sa uložiť do pamäte prehliadača – sťahujem súbor.', 4000);
    downloadBlob(blob, item.name);
  }
  renderList();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ================= Zoznam nahrávok ================= */

async function renderList() {
  let items = [];
  try {
    items = await db.all();
  } catch (err) {
    console.error(err);
    els.empty.textContent = 'Pamäť prehliadača nie je dostupná (súkromné okno?). Nahrávky sa budú rovno sťahovať.';
  }
  items.sort((a, b) => b.created - a.created);
  els.list.replaceChildren(...items.map(itemElement));
  els.empty.hidden = items.length > 0;
  updateStorageInfo();
}

function itemElement(v) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'item';
  const play = document.createElement('span');
  play.className = 'play';
  const meta = document.createElement('span');
  meta.className = 'meta';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = fmtDate(v.created);
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = `${fmtTime(v.duration)} · ${fmtSize(v.size)}`;
  meta.append(title, sub);
  b.append(play, meta);
  b.addEventListener('click', () => openPlayer(v));
  li.append(b);
  return li;
}

async function updateStorageInfo() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return;
    const { usage, quota } = await navigator.storage.estimate();
    if (!quota) return;
    els.storageInfo.textContent = `${fmtSize(usage)} / voľné ${fmtSize(quota - usage)}`;
  } catch { /* nič */ }
}

/* ================= Prehrávač ================= */

let current = null;
let currentUrl = null;

function openPlayer(v) {
  current = v;
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(v.blob);
  const vid = els.playerVideo;
  vid.src = currentUrl;
  // WebM z Chrome nemá uloženú dĺžku – trik, aby šlo pretáčať
  vid.onloadedmetadata = () => {
    if (vid.duration === Infinity) {
      vid.currentTime = 1e101;
      vid.ontimeupdate = () => { vid.ontimeupdate = null; vid.currentTime = 0; };
    }
  };
  els.downloadLink.href = currentUrl;
  els.downloadLink.download = v.name;
  els.playerInfo.textContent = `${v.name} · ${fmtTime(v.duration)} · ${fmtSize(v.size)}`;
  els.player.showModal();
}

function closePlayer() {
  if (els.player.open) els.player.close();
}

els.player.addEventListener('close', () => {
  const vid = els.playerVideo;
  vid.pause();
  vid.onloadedmetadata = null;
  vid.ontimeupdate = null;
  vid.removeAttribute('src');
  vid.load();
  // odkaz necháme chvíľu žiť, ak práve prebieha sťahovanie
  const url = currentUrl;
  if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  currentUrl = null;
  current = null;
});

els.shareBtn.addEventListener('click', async () => {
  if (!current) return;
  const file = new File([current.blob], current.name, { type: current.mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: current.name });
    } catch (err) {
      if (err.name !== 'AbortError') toast('Zdieľanie zlyhalo – skúste Stiahnuť.');
    }
  } else {
    els.downloadLink.click();
  }
});

els.deleteBtn.addEventListener('click', async () => {
  if (!current || !confirm('Naozaj zmazať túto nahrávku?')) return;
  try {
    await db.remove(current.id);
    closePlayer();
    toast('Nahrávka zmazaná');
    renderList();
  } catch (err) {
    console.error(err);
    toast('Nahrávku sa nepodarilo zmazať.');
  }
});

els.closeBtn.addEventListener('click', closePlayer);

/* ================= Udalosti ================= */

els.recBtn.addEventListener('click', startRecording);
els.stopBtn.addEventListener('click', stopRecording);
els.pipEnable.addEventListener('click', startCamera);

els.switchBtn.addEventListener('click', () => {
  if (isRecording()) return;
  settings.facing = settings.facing === 'user' ? 'environment' : 'user';
  saveSettings();
  startCamera();
});

els.settingsBtn.addEventListener('click', () => {
  const open = els.settings.hidden;
  els.settings.hidden = !open;
  els.settingsBtn.setAttribute('aria-expanded', String(open));
});

els.sizeInput.addEventListener('input', () => {
  settings.size = Number(els.sizeInput.value);
  applyLayout();
  saveSettings();
});

els.cornerInput.addEventListener('change', () => {
  settings.corner = els.cornerInput.value;
  applyLayout();
  saveSettings();
});

els.qualityInput.addEventListener('change', () => {
  settings.quality = els.qualityInput.value;
  saveSettings();
  if (!isRecording()) startCamera();
});

els.audioInput.addEventListener('change', () => {
  settings.audio = els.audioInput.checked;
  saveSettings();
  if (!isRecording()) startCamera();
});

els.fullscreenInput.addEventListener('change', () => {
  settings.fullscreen = els.fullscreenInput.checked;
  saveSettings();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (isRecording()) requestWakeLock();
    else if (!stream && !els.pip.classList.contains('off')) startCamera();
  } else if (!isRecording()) {
    // aplikácia je na pozadí a nenahráva – vypneme kameru kvôli batérii
    cameraRequest++;
    stopStream();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (isRecording()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ================= Štart ================= */

applyLayout();
fillSettingsForm();
els.formatInfo.textContent = mime ? mime.split(';')[0].replace('video/', '').toUpperCase() : '–';
renderList();
startCamera();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

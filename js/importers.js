// Načítanie obrázka alebo PDF ako obrázka pre etiketu.

import { promptDialog } from './ui.js';

const MAX_DIM = 1600;

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Obrázok sa nepodarilo načítať.'));
    i.src = src;
  });
}

/** Zmenší obrázok (kvôli pamäti) a vráti dataURL + rozmery. */
export async function imageFileToDataURL(file) {
  const src = await readAsDataURL(file);
  const img = await loadImg(src);
  const w = img.naturalWidth || 800, h = img.naturalHeight || 800;
  const r = Math.min(1, MAX_DIM / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * r));
  c.height = Math.max(1, Math.round(h * r));
  const ctx = c.getContext('2d');
  const keepAlpha = /png|gif|svg|webp/i.test(file.type);
  if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const url = keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
  return { src: url, w: c.width, h: c.height };
}

/** Oreže biele okraje (napr. PDF na A4 s malou etiketou uprostred). */
function trimWhite(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      if (d[p + 3] > 20 && (d[p] < 235 || d[p + 1] < 235 || d[p + 2] < 235)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return canvas;
  const m = Math.round(Math.max(W, H) * 0.01);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  const c = document.createElement('canvas');
  c.width = x1 - x0 + 1;
  c.height = y1 - y0 + 1;
  c.getContext('2d').drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

let pdfLoading = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfLoading) {
    pdfLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = () => {
        const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
        if (!lib) { reject(new Error('Knižnica PDF sa nenačítala.')); return; }
        lib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        resolve(lib);
      };
      s.onerror = () => { pdfLoading = null; reject(new Error('Knižnicu PDF sa nepodarilo načítať (ste offline?).')); };
      document.head.append(s);
    });
  }
  return pdfLoading;
}

/** Otvorí PDF súbor (pdf.js sa načíta až teraz). */
export async function openPdf(file) {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  return lib.getDocument({ data: buf }).promise;
}

/** Vykreslí stranu PDF do obrázka (oreže biele okraje). */
export async function renderPdfPage(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 2000 / Math.max(vp1.width, vp1.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const t = trimWhite(c);
  const r = Math.min(1, MAX_DIM / Math.max(t.width, t.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(t.width * r));
  out.height = Math.max(1, Math.round(t.height * r));
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(t, 0, 0, out.width, out.height);
  page.cleanup?.();
  return { src: out.toDataURL('image/png'), w: out.width, h: out.height };
}

/** Vykreslí zvolenú stranu PDF (pri viacstranovom sa opýta, ktorú). */
export async function pdfFileToDataURL(file) {
  const pdf = await openPdf(file);
  let pageNo = 1;
  if (pdf.numPages > 1) {
    const ans = await promptDialog(`PDF má ${pdf.numPages} strán. Ktorú stranu použiť?`, '1', { ok: 'Použiť', inputmode: 'numeric' });
    if (ans == null) return null;
    pageNo = Math.min(pdf.numPages, Math.max(1, parseInt(ans, 10) || 1));
  }
  const res = await renderPdfPage(pdf, pageNo);
  pdf.destroy?.();
  return res;
}

// Skenovanie čiarových a QR kódov fotoaparátom (BarcodeDetector v prehliadačoch na Androide).

import { h, openSheet, svgIcon } from './ui.js';

const FORMAT_MAP = {
  ean_13: 'EAN13', ean_8: 'EAN8', upc_a: 'UPCA', code_128: 'CODE128', code_39: 'CODE39', qr_code: 'QR',
  itf: 'ITF', codabar: 'CODE128', code_93: 'CODE128', upc_e: 'CODE128', data_matrix: 'QR', aztec: 'QR', pdf417: 'QR',
};

export function scannerSupported() {
  return 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

/** Otvorí skener. Vráti {text, format} alebo null. */
export function scanCode({ title = 'Skenovať kód' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    let stream = null;
    let timer = null;
    let s;
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
    const status = h('div', { class: 'scan-status' }, 'Spúšťam fotoaparát…');
    const manual = h('input', { class: 'input', type: 'text', placeholder: 'Alebo zadajte kód ručne', inputmode: 'text', enterkeyhint: 'done' });
    const useManual = () => {
      const v = manual.value.trim();
      if (!v) return;
      result = { text: v, format: null };
      s.close();
    };
    manual.addEventListener('keydown', (e) => { if (e.key === 'Enter') useManual(); });
    const body = h('div', { class: 'scan' },
      h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-frame' }), h('div', { class: 'scan-line' })),
      status,
      h('div', { class: 'scan-manual' }, manual, h('button', { class: 'btn btn-primary', type: 'button', onclick: useManual, html: svgIcon('check', 20) })),
    );
    const stop = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    s = openSheet({ title, body, full: true, onClose: () => { stop(); resolve(result); } });

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'Fotoaparát nie je dostupný. Zadajte kód ručne.';
        body.querySelector('.scan-view').hidden = true;
        return;
      }
      if (!('BarcodeDetector' in window)) {
        status.textContent = 'Tento prehliadač nevie čítať kódy z fotoaparátu. Zadajte kód ručne.';
        body.querySelector('.scan-view').hidden = true;
        return;
      }
      let detector;
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const formats = Object.keys(FORMAT_MAP).filter((f) => supported.includes(f));
        detector = new BarcodeDetector(formats.length ? { formats } : undefined);
      } catch (e) {
        status.textContent = 'Čítačka kódov sa nedá spustiť: ' + e.message;
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        status.textContent = e.name === 'NotAllowedError'
          ? 'Prístup k fotoaparátu bol zamietnutý. Povoľte ho v nastaveniach prehliadača alebo zadajte kód ručne.'
          : 'Fotoaparát sa nepodarilo zapnúť: ' + e.message;
        body.querySelector('.scan-view').hidden = true;
        return;
      }
      if (s.removed) { stop(); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay */ }
      status.textContent = 'Namierte fotoaparát na čiarový alebo QR kód.';
      const tick = async () => {
        if (!stream) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (codes.length && codes[0].rawValue) {
              result = { text: codes[0].rawValue, format: FORMAT_MAP[codes[0].format] || null };
              navigator.vibrate?.(60);
              s.close();
              return;
            }
          }
        } catch { /* ďalší pokus */ }
        timer = setTimeout(tick, 160);
      };
      tick();
    })();
  });
}

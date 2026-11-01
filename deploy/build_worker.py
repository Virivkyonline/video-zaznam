# Zabalí aplikáciu do jedného Cloudflare Workera (súbory sú priamo v kóde).
# Použitie: python3 deploy/build_worker.py . worker.js
import base64, json, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
         '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png'}
files = {}
for f in ['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png']:
    p = src / f
    t = types[p.suffix]
    if p.suffix == '.png':
        files['/' + f] = {'type': t, 'b64': base64.b64encode(p.read_bytes()).decode()}
    else:
        files['/' + f] = {'type': t, 'text': p.read_text(encoding='utf-8')}
js = """const FILES = %s;
const bin = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    const f = FILES[path];
    if (!f || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return new Response('Nenájdené', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    const headers = {
      'content-type': f.type,
      'cache-control': f.b64 ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'permissions-policy': 'camera=(self), microphone=(self)',
    };
    return new Response(request.method === 'HEAD' ? null : (f.b64 ? bin(f.b64) : f.text), { headers });
  },
};
""" % json.dumps(files, ensure_ascii=False)
out.write_text(js, encoding='utf-8')
print(out, len(js.encode()), 'bytes')

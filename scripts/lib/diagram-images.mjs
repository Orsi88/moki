// One PNG per Mermaid or Excalidraw block, for the PDF. Headless Chrome draws the
// diagram and the PDF printer embeds the picture. No diagram, no browser: the
// block stays as code. A diagram that fails to draw stays as code too.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX = 30;
const MAX_SOURCE = 200_000;
const frameEntry = new URL('./diagram-frame.mjs', import.meta.url);

function decode(html) {
  return html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// The rendered blocks, in order. The source was escaped by markdownToHtml.
export function diagramSources(html) {
  const out = [];
  const re = /<pre class="diagram" data-diagram="(mermaid|excalidraw)"><code>([\s\S]*?)<\/code><\/pre>/g;
  let m;
  while ((m = re.exec(html)) && out.length < MAX) out.push({ lang: m[1], source: decode(m[2]).slice(0, MAX_SOURCE) });
  return out;
}

function pathOf(url) {
  let path = url.pathname;
  if (process.platform === 'win32' && path.startsWith('/')) path = path.slice(1);
  return decodeURI(path);
}

function entryPath() {
  return pathOf(frameEntry);
}

// The installer ships this file (built by scripts/build-desktop.mjs). A checkout
// without it bundles the same script with esbuild, which is a devDependency.
async function writeFrame(dest) {
  const shipped = pathOf(new URL('./diagram-frame.iife.js', import.meta.url));
  if (existsSync(shipped)) {
    copyFileSync(shipped, dest);
    return;
  }
  const cache = join(tmpdir(), 'moki-diagram-frame.js');
  const stampPath = join(tmpdir(), 'moki-diagram-frame.stamp');
  const stamp = [frameEntry, new URL('../../node_modules/mermaid/package.json', import.meta.url), new URL('../../node_modules/@excalidraw/excalidraw/package.json', import.meta.url)]
    .map((url) => { const file = pathOf(url); return `${file}:${statSync(file).mtimeMs}`; }).join('\n');
  if (!existsSync(cache) || !existsSync(stampPath) || readFileSync(stampPath, 'utf8') !== stamp) {
    const { build } = await import('esbuild');
    await build({ entryPoints: [entryPath()], bundle: true, format: 'iife', platform: 'browser', outfile: cache, legalComments: 'none', logLevel: 'silent' });
    writeFileSync(stampPath, stamp);
  }
  copyFileSync(cache, dest);
}

function send(ws, pending, method, params, ms) {
  const id = pending.next++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.map.delete(id); reject(new Error(method)); }, ms);
    pending.map.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message || method));
      else resolve(msg.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// Photographs every diagram. Returns data: URIs aligned with `items` (null when that one failed).
export async function photographDiagrams(items, browser) {
  if (!items.length || !browser) return items.map(() => null);
  const dir = mkdtempSync(join(tmpdir(), 'moki-diagram-'));
  const profile = join(dir, 'profile');
  let child;
  let ws;
  try {
    const js = join(dir, 'frame.js');
    await writeFrame(js);
    const specs = items.map((item, id) => ({ id, lang: item.lang, source: item.source }));
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}#out{display:flex;flex-direction:column;align-items:flex-start;gap:12px}.box{display:inline-block;background:#fff}</style><div id="out"></div><script id="specs" type="application/json">${JSON.stringify(specs).replace(/</g, '\\u003c')}</script><script src="frame.js"></script>`;
    writeFileSync(join(dir, 'page.html'), html);
    child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const port = await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('browser')), 20000);
      child.stderr.on('data', (chunk) => {
        buf += chunk;
        const found = buf.match(/127\.0\.0\.1:(\d+)\//);
        if (found) { clearTimeout(timer); resolve(found[1]); }
      });
      child.on('exit', () => { clearTimeout(timer); reject(new Error('browser')); });
    });
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = targets.find((t) => t.type === 'page');
    if (!page?.webSocketDebuggerUrl) throw new Error('browser');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const pending = { next: 1, map: new Map() };
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const done = msg.id && pending.map.get(msg.id);
      if (done) { pending.map.delete(msg.id); done(msg); }
    });
    const call = (method, params = {}, ms = 20000) => send(ws, pending, method, params, ms);
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.navigate', { url: pathToFileURL(join(dir, 'page.html')).href });
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      const result = await call('Runtime.evaluate', { expression: 'document.documentElement.dataset.ready || ""', returnByValue: true });
      ready = result.result?.value === '1';
      if (!ready) await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) return items.map(() => null);
    const uris = [];
    for (let i = 0; i < items.length; i++) {
      const result = await call('Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById('d${i}'); if (!el || el.dataset.failed) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`,
        returnByValue: true,
      });
      const box = result.result?.value;
      if (!box || box.width < 2 || box.height < 2) { uris.push(null); continue; }
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } });
      uris.push(shot.data ? `data:image/png;base64,${shot.data}` : null);
    }
    return uris;
  } catch (err) {
    if (process.env.MOKI_DIAGRAM_DEBUG) console.error(err);
    return items.map(() => null);
  } finally {
    try { ws?.close(); } catch { /* already gone */ }
    try { child?.kill(); } catch { /* already gone */ }
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch { /* the browser profile can stay locked briefly */ }
  }
}

export function applyDiagramImages(html, uris) {
  let n = 0;
  return html.replace(/<pre class="diagram" data-diagram="(?:mermaid|excalidraw)"><code>[\s\S]*?<\/code><\/pre>/g, (full) => {
    const uri = uris[n++];
    return uri ? `<img class="diagram" alt="Diagram" src="${uri}">` : full;
  });
}

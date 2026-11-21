// Cover Snap Studio — export checker (Node 22, standard library only).
//
// Verifies the editor really exports what it promises: it starts
// serve.ts on a scratch port, opens the editor in a headless Chromium,
// clicks "Export all 4 sizes", and checks the four PNGs that land in
// the download folder — right names, right pixel sizes, non-empty.
// A download that never lands or a PNG with the wrong size fails the run.
//
//   node dev/verify-export.mjs
//
// Chromium and the CDP plumbing are shared with dev/shots.mjs: the
// Playwright build first, CHROME_PATH to override, profile and
// downloads in the OS temp dir, never in the repository.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const servePort = Number(process.env.VERIFY_PORT || 8932);
const cdpPort = Number(process.env.VERIFY_CDP_PORT || 9224);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  join(process.env.HOME || '', '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  '/opt/meta-chromium/chrome',
  'chromium',
  'google-chrome',
].filter(Boolean);

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate.includes('/') && existsSync(candidate)) return candidate;
    if (!candidate.includes('/')) return candidate;
  }
  throw new Error('no Chromium found; set CHROME_PATH to a chrome binary');
}

// The four export sizes, in the order the editor writes them.
const EXPECTED = [
  { key: '1080x1080', w: 1080, h: 1080 },
  { key: '1080x1350', w: 1080, h: 1350 },
  { key: '1280x720', w: 1280, h: 720 },
  { key: '1920x1080', w: 1920, h: 1080 },
];

// PNG dimensions live in the IHDR chunk: width at byte 16, height at 20.
function pngSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(file + ' is not a PNG');
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

function slugifyTitle(title) {
  return (title || 'cover')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'cover';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (err) {
      lastErr = err;
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}: ${lastErr ? lastErr.message : 'no response'}`);
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP: ${msg.error.message}`));
        else resolve(msg.result || {});
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  send(method, params, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    try { this.ws.close(); } catch { /* already closed */ }
  }
}

async function main() {
  const downloadDir = join(tmpdir(), 'cover-snap-verify-downloads');
  rmSync(downloadDir, { recursive: true, force: true });
  mkdirSync(downloadDir, { recursive: true });

  const server = spawn(process.execPath, ['serve.ts', '--port', String(servePort)], {
    cwd: here,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitFor(`http://127.0.0.1:${servePort}/index.html`, 15000, 'serve.ts');
  } catch (err) {
    server.kill();
    throw err;
  }

  const chrome = findChrome();
  const profileDir = join(tmpdir(), 'cover-snap-verify-profile');
  mkdirSync(profileDir, { recursive: true });
  const browser = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    const version = await waitFor(`http://127.0.0.1:${cdpPort}/json/version`, 20000, 'Chromium DevTools');
    const info = await version.json();
    const cdp = new Cdp(info.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    // Downloads go to the scratch folder, no prompt.
    try {
      await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
      });
    } catch {
      await cdp.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
      });
    }
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const session = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = session.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 860, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    await cdp.send('Page.navigate', {
      url: `http://127.0.0.1:${servePort}/index.html`,
    }, sessionId);

    // Wait until the editor says it is ready (samples loaded).
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      const res = await cdp.send('Runtime.evaluate', {
        expression: `(document.getElementById('status') || {}).textContent || ''`,
        returnByValue: true,
      }, sessionId);
      if (res.result && typeof res.result.value === 'string' && res.result.value.startsWith('Ready')) {
        ready = true;
        break;
      }
      await sleep(300);
    }
    if (!ready) throw new Error('editor never became ready');

    // Read the title so the expected filenames match the slug.
    const titleRes = await cdp.send('Runtime.evaluate', {
      expression: `(document.getElementById('titleInput') || {}).value || ''`,
      returnByValue: true,
    }, sessionId);
    const slug = slugifyTitle(titleRes.result?.value || 'cover');

    // Click "Export all 4 sizes" and wait for four PNGs to land.
    await cdp.send('Runtime.evaluate', {
      expression: `document.getElementById('exportAll').click(); 'clicked'`,
      returnByValue: true,
    }, sessionId);
    const waitDeadline = Date.now() + 60000;
    let files = [];
    while (Date.now() < waitDeadline) {
      files = readdirSync(downloadDir).filter((f) => f.endsWith('.png')).sort();
      if (files.length >= 4) break;
      await sleep(500);
    }
    if (files.length < 4) {
      throw new Error(`only ${files.length} PNGs downloaded, expected 4 (got: ${files.join(', ') || 'none'})`);
    }

    let failures = 0;
    for (const expected of EXPECTED) {
      const name = `cover-${slug}-${expected.key}.png`;
      const file = join(downloadDir, name);
      if (!existsSync(file)) {
        console.log(`${name}: MISSING`);
        failures += 1;
        continue;
      }
      const size = pngSize(file);
      const ok = size.w === expected.w && size.h === expected.h && size.bytes > 10000;
      console.log(`${name}: ${size.w}x${size.h}, ${size.bytes} bytes — ${ok ? 'OK' : 'WRONG SIZE'}`);
      if (!ok) failures += 1;
    }
    const extra = files.filter((f) => !EXPECTED.some((e) => f === `cover-${slug}-${e.key}.png`));
    if (extra.length > 0) {
      console.log('unexpected extra downloads: ' + extra.join(', '));
    }

    // Console errors during the export run fail the check too.
    const bad = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    if (bad.length > 0) {
      console.log('console exceptions: ' + bad.map((e) => e.params.exceptionDetails?.text || 'exception').join(' | '));
      failures += 1;
    }
    await cdp.send('Target.closeTarget', { targetId: target.targetId });
    cdp.close();
    if (failures > 0) throw new Error(`${failures} export check(s) failed`);
    console.log('All 4 exports verified.');
  } finally {
    browser.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('[verify-export] ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});

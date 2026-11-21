// Cover Snap Studio — screenshot driver (Node 22, standard library only).
//
// Retakes screenshots/ from shots.json: it starts serve.ts on a scratch
// port, drives a headless Chromium over the DevTools protocol with the
// built-in WebSocket client, opens each shot URL, waits for the page to
// raise window.__shotReady, and captures a JPEG inside the gate limits
// (long side at most 1280, short side at least 480, at most 256 KiB).
//
//   node dev/shots.mjs
//
// Chromium: the Playwright build on this machine first
// (~/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome), because
// /opt/meta-chromium/chrome refuses to start here (Hatch WebGL domain
// policy). Override with CHROME_PATH. The browser profile lives in the
// OS temp dir, never in the repository.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const shotsPath = join(here, 'shots.json');
const shotsDir = join(here, 'screenshots');
const servePort = Number(process.env.SHOTS_PORT || 8931);
const cdpPort = Number(process.env.SHOTS_CDP_PORT || 9223);

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
    if (!candidate.includes('/')) return candidate; // a PATH name: let spawn try it
  }
  throw new Error('no Chromium found; set CHROME_PATH to a chrome binary');
}

// Read a JPEG's pixel size from its SOF marker, no decoder needed.
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF marker in JPEG');
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

// A minimal CDP client over the built-in WebSocket.
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
        if (msg.error) reject(new Error(`CDP ${msg.method || ''}: ${msg.error.message}`));
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

async function captureShot(cdp, sessionId, shot, quality) {
  const { w, h } = shot;
  const scale = Math.min(1, 1280 / Math.max(w, h));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
  await cdp.send('Page.navigate', {
    url: `http://127.0.0.1:${servePort}/index.html${shot.query}`,
  }, sessionId);
  // Wait for the page to say its pixels are done.
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    const res = await cdp.send('Runtime.evaluate', {
      expression: 'window.__shotReady === true',
      returnByValue: true,
    }, sessionId);
    if (res.result && res.result.value === true) { ready = true; break; }
    await sleep(200);
  }
  if (!ready) throw new Error(`shot ${shot.name} never raised __shotReady`);
  const shotRes = await cdp.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality,
    clip: { x: 0, y: 0, width: w, height: h, scale },
  }, sessionId);
  return Buffer.from(shotRes.data, 'base64');
}

async function main() {
  const shots = JSON.parse(readFileSync(shotsPath, 'utf8'));
  if (!Array.isArray(shots) || shots.length < 3 || shots.length > 4) {
    throw new Error('shots.json must list 3 or 4 shots');
  }
  mkdirSync(shotsDir, { recursive: true });

  // Start the static server on the scratch port.
  const server = spawn(process.execPath, ['serve.ts', '--port', String(servePort)], {
    cwd: here,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  try {
    await waitFor(`http://127.0.0.1:${servePort}/index.html`, 15000, 'serve.ts');
  } catch (err) {
    server.kill();
    throw new Error('serve.ts did not come up: ' + serverLog);
  }

  // Launch Chromium for CDP.
  const chrome = findChrome();
  const profileDir = join(tmpdir(), 'cover-snap-shots-profile');
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
  let browserLog = '';
  browser.stdout.on('data', (d) => { browserLog += d; });
  browser.stderr.on('data', (d) => { browserLog += d; });

  const consoleErrors = [];
  try {
    const version = await waitFor(`http://127.0.0.1:${cdpPort}/json/version`, 20000, 'Chromium DevTools');
    const info = await version.json();
    const cdp = new Cdp(info.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const session = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = session.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);

    for (const shot of shots) {
      let quality = 82;
      let buf = await captureShot(cdp, sessionId, shot, quality);
      // If the JPEG is over the 256 KiB cap, step the quality down.
      while (buf.length > 262144 && quality > 40) {
        quality -= 12;
        buf = await captureShot(cdp, sessionId, shot, quality);
      }
      const out = join(shotsDir, shot.name);
      writeFileSync(out, buf);
      const size = jpegSize(buf);
      const bytes = statSync(out).size;
      const longSide = Math.max(size.w, size.h);
      const shortSide = Math.min(size.w, size.h);
      const ok = bytes <= 262144 && longSide <= 1280 && shortSide >= 480;
      console.log(
        `${shot.name}: ${size.w}x${size.h}, ${bytes} bytes, quality ${quality} — ${ok ? 'OK' : 'OUT OF LIMITS'}`,
      );
      if (!ok) throw new Error(`${shot.name} is outside the screenshot limits`);
    }

    // Any console error or failed request during the run fails the run:
    // a shot that threw is not a shot to submit.
    const bad = cdp.events.filter((e) => {
      if (e.method === 'Runtime.exceptionThrown') return true;
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') return true;
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') return true;
      return false;
    });
    for (const e of bad) {
      const detail = e.params.exceptionDetails?.text
        || e.params.args?.map((a) => a.value ?? a.description ?? '').join(' ')
        || e.params.entry?.text
        || e.method;
      consoleErrors.push(detail);
    }
    if (consoleErrors.length > 0) {
      throw new Error('console errors during shots:\n' + consoleErrors.join('\n'));
    }
    await cdp.send('Target.closeTarget', { targetId: target.targetId });
    cdp.close();
    console.log('All screenshots taken, no console errors.');
  } finally {
    browser.kill('SIGKILL');
    server.kill('SIGKILL');
    if (browserLog.includes('ERROR')) {
      console.error('[chrome log]\n' + browserLog.slice(-2000));
    }
  }
}

main().catch((err) => {
  console.error('[shots] ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});

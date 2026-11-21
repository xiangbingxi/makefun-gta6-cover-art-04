// Cover Snap Studio — a tiny static server for app/ (Node 22, standard
// library only), so the entry can be tried locally without a build step:
//
//   node serve.ts            serves app/ on http://localhost:8080
//   node serve.ts --port 9000
//
// It sends the MIME types an offline web app needs, refuses any path
// that climbs out of app/, and otherwise does nothing clever: this is a
// development convenience, not a web server for the internet. The
// screenshot driver (dev/shots.mjs) starts it on a scratch port.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./app', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const cleaned = normalize(join(sep, decoded)).replace(/^[/\\]+/, '');
  return join(root, cleaned);
}

const server = createServer((req, res) => {
  try {
    let file = safePath(req.url || '/');
    let stat;
    try {
      stat = statSync(file);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found\n');
      return;
    }
    if (stat.isDirectory()) {
      file = join(file, 'index.html');
      try {
        stat = statSync(file);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found\n');
        return;
      }
    }
    // Never serve anything outside app/, even if the path tried.
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('forbidden\n');
      return;
    }
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  } catch (err) {
    console.error('[serve] ' + (err && err.message ? err.message : err));
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end('server error\n');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Cover Snap Studio serving app/ at http://127.0.0.1:${port}`);
});

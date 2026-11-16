// Local server for `npm start`: serves dist/ and runs the same api/*.js
// handlers that Vercel deploys, so live searches work on 127.0.0.1:4173.
// Excluded from deployment by .vercelignore.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'};
const port = Number(process.env.PORT || 4173);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const api = url.pathname.match(/^\/api\/(archive|frame)$/);
  if (api) {
    try { const mod = await import(join(root, 'api', `${api[1]}.js`)); return await mod.default(req, res); }
    catch (e) { res.writeHead(500, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({error: e.message})); }
  }
  if (url.pathname === '/classify.html') { res.writeHead(308, {Location: '/'}); return res.end(); }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, 'dist', path));
    res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream'});
    res.end(body);
  } catch { res.writeHead(404, {'Content-Type': 'text/plain'}); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Asterlight on http://127.0.0.1:${port}/`));

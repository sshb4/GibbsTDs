import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { statsResponse } from '../stats-api.mjs';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 8080);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.xml':'application/xml', '.txt':'text/plain' };
const cache = new Map();
const statsCache = {
  async match(key) { const entry = cache.get(key.url); if (entry && entry.expires > Date.now()) return entry.response.clone(); cache.delete(key.url); },
  async put(key,response) { cache.set(key.url,{response,expires:Date.now()+60000}); }
};
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/nfl/')) {
      const response = await statsResponse(new Request(url,{method:req.method}), {cache:statsCache});
      res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(root, relative || 'index.html');
    const allowed = !relative.split('/').some(part => part.startsWith('.')) && (target === root || target.startsWith(root + path.sep));
    if (!allowed) { res.writeHead(404); res.end('Not found'); return; }
    const info = await stat(target);
    const file = info.isDirectory() ? path.join(target,'index.html') : target;
    const data = await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port,'127.0.0.1',()=>console.log(`Gibbs TD Chase: http://localhost:${port}`));

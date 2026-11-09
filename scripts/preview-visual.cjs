// Local visual review of the production build. Synthetic responses never reach a real API.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { response } = require('./visual-fixtures.cjs');
const base = path.resolve(__dirname, '../apps/franchise-portal/dist');
const index = path.join(base, 'index.html');
if (!fs.existsSync(index)) {
  console.error('Build apps/franchise-portal first: npm.cmd run build');
  process.exit(1);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "connect-src 'self'; object-src 'none'; base-uri 'self'");
  if (url.pathname.startsWith('/api/v1/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(response(req.url, req.method)));
    return;
  }
  let file;
  try { file = path.resolve(base, '.' + decodeURIComponent(url.pathname)); }
  catch { res.writeHead(400); res.end(); return; }
  if (!file.startsWith(base + path.sep) && file !== base) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = index;
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).on('error', () => { res.statusCode = 404; res.end('Not found'); }).pipe(res);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4176, '127.0.0.1', () => console.log('本地测试数据预览：http://127.0.0.1:4176/ （不连接真实业务接口）'));

// 로컬 미리보기용 정적 서버(개발 전용). 배포는 GitHub Pages 가 한다.  사용: node scripts/serve.mjs [포트]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
const root = resolve('public'), port = Number(process.argv[2] || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (path.endsWith('/')) path += 'index.html';
    const file = join(root, path); if (!file.startsWith(root)) throw new Error('bad path');
    await stat(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`미리보기: http://127.0.0.1:${port}/  (Ctrl+C 로 종료)`));

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

let building = false;
let again = false;
function rebuild() {
  if (building) {
    again = true;
    return;
  }
  building = true;
  const p = spawn(process.execPath, ['build.js'], {
    cwd: root,
    stdio: 'inherit'
  });
  p.on('close', () => {
    building = false;
    if (again) {
      again = false;
      rebuild();
    }
  });
}

let timer = null;
const onChange = () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
};
for (const dir of ['src', 'site'])
  watch(path.join(root, dir), { recursive: true }, onChange);
watch(path.join(root, 'build.js'), onChange);

rebuild();

createServer(async (req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(dist, rel));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () =>
  console.log('dev: http://localhost:' + port + ' (watching src/, site/)')
);

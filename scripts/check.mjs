import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const dir of ['scripts', 'public', 'public/lib', 'tests']) for (const file of readdirSync(dir)) {
  if (!/\.(mjs|js)$/.test(file) || file === 'supabase.js') continue;
  const r = spawnSync(process.execPath, ['--check', join(dir, file)], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
console.log('JavaScript syntax OK');

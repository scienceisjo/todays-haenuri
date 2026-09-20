// branding/logo.png → public/logo.png(복사) + public/icon-512.png, icon-192.png (PWA 설치 아이콘)
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { decode, encode, resize } from './png.mjs';
const src = 'branding/logo.png';
if (!existsSync(src)) { console.error('branding/logo.png 가 없습니다. scripts/logo.mjs 로 먼저 만들어주세요.'); process.exit(1); }
const { width, height, rgba } = decode(readFileSync(src));
if (width !== height) { console.error('정사각형 PNG 가 필요합니다. scripts/logo.mjs 로 다듬어주세요.'); process.exit(1); }
copyFileSync(src, 'public/logo.png');
for (const size of [512, 192]) writeFileSync(`public/icon-${size}.png`, encode(size, size, resize(rgba, width, size)));
console.log(`public/logo.png(${width}px), icon-512.png, icon-192.png 생성`);

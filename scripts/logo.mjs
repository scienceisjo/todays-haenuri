// 학교 로고 준비 도구: PNG를 읽어 바깥 흰 배경을 투명하게 만들고 정사각형으로 맞춰 branding/logo.png 로 저장한다.
// 사용: node scripts/logo.mjs "원본.png" [출력.png]   (외부 라이브러리 없음, 8비트 RGB/RGBA/회색 PNG, 비인터레이스)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decode, encode } from './png.mjs';
import { dirname, resolve } from 'node:path';

const [input, output = resolve('branding/logo.png')] = process.argv.slice(2);
if (!input) { console.error('사용법: node scripts/logo.mjs "원본.png" [출력.png]'); process.exit(1); }

// 1) 가장자리에서 이어진 밝은(거의 흰) 배경을 투명으로
const { width, height, rgba } = decode(readFileSync(input));
const idx = (x, y) => (y * width + x) * 4;
const light = (x, y) => { const i = idx(x, y); return Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) >= 236 && rgba[i + 3] > 0; };
const bg = new Uint8Array(width * height); const stack = [];
for (let x = 0; x < width; x++) { stack.push([x, 0], [x, height - 1]); } for (let y = 0; y < height; y++) { stack.push([0, y], [width - 1, y]); }
while (stack.length) { const [x, y] = stack.pop(); if (x < 0 || y < 0 || x >= width || y >= height) continue; const k = y * width + x; if (bg[k] || !light(x, y)) continue; bg[k] = 1; stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
let removed = 0;
for (let k = 0; k < width * height; k++) if (bg[k]) { rgba[k * 4 + 3] = 0; removed++; }
// 2) 배경과 맞닿은 밝은 가장자리는 부드럽게(반투명)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const k = y * width + x; if (bg[k]) continue;
  let near = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < width && ny < height && bg[ny * width + nx]) { near = true; break; } }
  if (!near) continue; const i = idx(x, y), m = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
  if (m >= 190) rgba[i + 3] = Math.max(0, Math.min(255, Math.round((236 - m) / 46 * 255)));
}
// 3) 남은 그림의 경계 상자를 정사각형 가운데에 놓기
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[idx(x, y) + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
if (maxX < 0) throw new Error('그림을 찾지 못했습니다.');
const bw = maxX - minX + 1, bh = maxY - minY + 1, side = Math.max(bw, bh), ox = Math.floor((side - bw) / 2), oy = Math.floor((side - bh) / 2);
const out = Buffer.alloc(side * side * 4);
for (let y = 0; y < bh; y++) rgba.copy(out, ((y + oy) * side + ox) * 4, idx(minX, minY + y), idx(minX, minY + y) + bw * 4);
mkdirSync(dirname(output), { recursive: true });
const png = encode(side, side, out); writeFileSync(output, png);
console.log(`원본 ${width}×${height} → ${side}×${side} 정사각형, 배경 투명 처리 ${removed}px, ${(png.length / 1024).toFixed(0)}KB → ${output}`);

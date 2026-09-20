// 순수 Node PNG 디코더/인코더(8비트 RGB/RGBA/회색, 비인터레이스). 외부 라이브러리 없음.
import { inflateSync, deflateSync } from 'node:zlib';
export function decode(buf) {
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('PNG 파일이 아닙니다.');
  let p = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), name = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 4, 6].includes(type)) throw new Error(`지원하지 않는 PNG 형식입니다(비트 ${depth}, 색상 ${type}, 인터레이스 ${interlace}). 8비트·비인터레이스 RGB/RGBA로 저장해주세요.`);
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], stride = width * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(width * height * bpp); let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) row[i] = (row[i] + a) & 255; else if (filter === 2) row[i] = (row[i] + b) & 255;
      else if (filter === 3) row[i] = (row[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    row.copy(px, y * stride); prev = row;
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp, d = i * 4;
    if (type === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = 255; }
    else if (type === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = px[s + 1]; }
    else { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = type === 6 ? px[s + 3] : 255; }
  }
  return { width, height, rgba };
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(name, data) { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(name, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; }
export function encode(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}


// 박스 필터 축소(정사각형 RGBA)
export function resize(rgba, size, target) {
  const out = Buffer.alloc(target * target * 4), f = size / target;
  for (let y = 0; y < target; y++) for (let x = 0; x < target; x++) {
    const x0 = Math.floor(x * f), x1 = Math.max(x0 + 1, Math.floor((x + 1) * f)), y0 = Math.floor(y * f), y1 = Math.max(y0 + 1, Math.floor((y + 1) * f));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * size + xx) * 4, al = rgba[i + 3]; r += rgba[i] * al; g += rgba[i + 1] * al; b += rgba[i + 2] * al; a += al; n++; }
    const o = (y * target + x) * 4; if (a) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); } out[o + 3] = Math.round(a / n);
  }
  return out;
}

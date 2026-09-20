// CSV/엑셀 일괄 등록(브라우저·Node 공용 순수 로직): 파일 읽기 → 표 → 열 매핑 → 행 검증(미리 보기)
// 저장은 Supabase 함수(import_duties / import_schedule)가 다시 검증해 원자적으로 처리한다.
import { fail, dateOnly, clock, text, nowISO, timestamp, owns, validateRecord, addDays, schoolDate } from './core.js';

const utf8 = new TextDecoder('utf-8');
/* ---------- 1. 파일 → 표 ---------- */
export function decodeText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return utf8.decode(b.subarray(3));
  if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { /* 한국어 엑셀의 기본 CSV(CP949) */ }
  try { return new TextDecoder('euc-kr').decode(b); } catch { fail('파일의 문자 인코딩을 읽을 수 없습니다. 엑셀에서 "CSV UTF-8"로 저장해 다시 올려주세요.'); }
}
export function parseDelimited(source, delimiter) {
  const s = source.replace(/\r\n?/g, '\n');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(v => v.trim())).filter(r => r.some(v => v !== ''));
}
export function parseCSV(source) {
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const counts = [',', '\t', ';'].map(d => [d, firstLine.split(d).length - 1]).sort((a, b) => b[1] - a[1]);
  return parseDelimited(source, counts[0][1] > 0 ? counts[0][0] : ',');
}
const unescapeXml = s => s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, e) =>
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : e[1] === 'x' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(parseInt(e.slice(1), 10)));

// ZIP(중앙 디렉터리) 직접 읽기. inflateRaw: (Uint8Array) => Promise<Uint8Array>
function readZip(b) {
  const bad = () => fail('엑셀 파일 형식을 읽을 수 없습니다. 엑셀에서 "CSV UTF-8"로 저장해 올려주세요.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) bad();
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) bad();
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    entries.set(utf8.decode(b.subarray(p + 46, p + 46 + nlen)), { method, csize, local });
    p += 46 + nlen + xlen + clen;
  }
  return async (name, inflateRaw) => {
    const e = entries.get(name); if (!e) return null;
    if (e.csize === 0xFFFFFFFF || dv.getUint32(e.local, true) !== 0x04034b50) bad();
    const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
    const data = b.subarray(start, start + e.csize);
    if (e.method === 0) return utf8.decode(data);
    if (e.method === 8) return utf8.decode(await inflateRaw(data));
    bad();
  };
}
function columnIndex(ref) { let n = 0; for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
export async function parseXlsx(bytes, inflateRaw) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const file = readZip(b);
  const strings = [...(await file('xl/sharedStrings.xml', inflateRaw) || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => unescapeXml(t[1])).join(''));
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = await file('xl/workbook.xml', inflateRaw), rels = await file('xl/_rels/workbook.xml.rels', inflateRaw);
  const firstSheet = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (firstSheet && rels) {
    const target = rels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${firstSheet}"[^>]*\\bTarget="([^"]+)"`))?.[1] || rels.match(new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${firstSheet}"`))?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  }
  const sheet = await file(sheetPath, inflateRaw); if (!sheet) fail('엑셀 파일에서 시트를 찾을 수 없습니다.');
  const rows = [];
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = [];
    for (const cell of (row[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1], inner = cell[2] || '';
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1]; if (!ref) continue;
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => unescapeXml(t[1])).join('');
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) { const raw = unescapeXml(v); value = type !== 'str' && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw; }
      cells[columnIndex(ref)] = typeof value === 'string' ? value.trim() : value;
    }
    rows.push(Array.from(cells, c => c ?? ''));
  }
  return rows.filter(r => r.some(v => v !== ''));
}
export async function parseTable(bytes, filename = '', inflateRaw) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!b.length) fail('파일이 비어 있습니다.');
  const isZip = b[0] === 0x50 && b[1] === 0x4B;
  if (/\.xlsx$/i.test(filename) || isZip) {
    if (!isZip) fail('엑셀 파일 형식을 읽을 수 없습니다. .xlsx 파일인지 확인해주세요.');
    if (!inflateRaw) fail('이 환경에서는 엑셀 파일을 읽을 수 없습니다. CSV로 저장해 올려주세요.');
    return parseXlsx(b, inflateRaw);
  }
  if (/\.xls$/i.test(filename)) fail('.xls(옛 엑셀) 형식은 지원하지 않습니다. 엑셀에서 .xlsx 또는 "CSV UTF-8"로 저장해 올려주세요.');
  return parseCSV(decodeText(b));
}

/* ---------- 2. 열 매핑과 값 해석 ---------- */
const normalizeHeader = h => String(h ?? '').replace(/[\s()（）*·_\-\/]/g, '').toLowerCase();
const HEADERS = {
  duties: {
    date: ['날짜', '일자', '지도일', '급식일', 'date'],
    entrance: ['식당입구', '입구', '입구담당', '입구담당자', '식당입구담당자', 'entrance'],
    inside: ['식당내부', '내부', '내부담당', '내부담당자', '식당내부담당자', 'inside'],
    note: ['비고', '메모', '사유', '대체', '변경사항', 'note'],
    publish_at: ['공개시각', '공개일시', '게시시각', '예약시각', '예약', 'publishat'],
  },
  schedule: {
    date: ['날짜', '시작날짜', '시작일', '일자', '시작', 'date'],
    end_date: ['종료날짜', '종료일', '끝', '마지막날', 'enddate'],
    kind: ['유형', '구분', '종류', '분류', 'kind'],
    title: ['제목', '일정', '일정명', '행사명', '학사일정', '내용요약', 'title'],
    content: ['내용', '상세', '설명', '세부내용', 'content', '비고'],
    location: ['장소', '위치', 'location'],
    start_time: ['시작시간', '시각', '시간', 'starttime'],
    end_time: ['종료시간', '끝시간', 'endtime'],
    importance: ['중요도', 'importance'],
  },
};
const REQUIRED = { duties: ['date'], schedule: ['date', 'title'] };
export const KIND_WORDS = { 학사일정: 'academic', 학사: 'academic', academic: 'academic', 행사회의: 'event', 행사: 'event', 회의: 'event', event: 'event', 방송안내: 'broadcast', 방송: 'broadcast', broadcast: 'broadcast', 제출기한: 'deadline', 제출: 'deadline', 마감: 'deadline', deadline: 'deadline', 창체시간표: 'special', 창체: 'special', 창체의날: 'special', special: 'special', 공지사항: 'notice', 공지: 'notice', notice: 'notice', 휴업일: 'holiday', 휴일: 'holiday', 공휴일: 'holiday', 방학: 'holiday', 재량휴업일: 'holiday', holiday: 'holiday' };
export function mapHeaders(type, headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const key = normalizeHeader(h); if (!key) return;
    for (const [field, aliases] of Object.entries(HEADERS[type])) if (!(field in map) && aliases.some(a => normalizeHeader(a) === key)) { map[field] = i; return; }
  });
  const missing = REQUIRED[type].filter(f => !(f in map));
  if (missing.length) fail(`첫 줄(머리글)에서 ${missing.map(f => `'${HEADERS[type][f][0]}'`).join(', ')} 열을 찾지 못했습니다. 제공된 양식의 머리글을 사용해주세요. (읽은 머리글: ${headerRow.filter(Boolean).join(', ') || '없음'})`);
  return map;
}
const pad = n => String(n).padStart(2, '0');
// 반환: null=비어 있음, undefined=형식 오류, 'YYYY-MM-DD'=정상
export function parseDateCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
    return undefined;
  }
  const s = String(value).trim(); let m;
  const build = (y, mo, d) => { try { return dateOnly(`${y}-${pad(Number(mo))}-${pad(Number(d))}`, true); } catch { return undefined; } };
  if ((m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/))) return build(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return build(m[1], m[2], m[3]);
  return undefined;
}
export function parseTimeCell(value) {
  if (value === null || value === undefined || value === '') return null;
  const build = (h, mi) => { try { return clock(`${pad(Number(h))}:${pad(Number(mi))}`); } catch { return undefined; } };
  if (typeof value === 'number') { if (value >= 0 && value < 1) { const mins = Math.round(value * 1440); return build(Math.floor(mins / 60) % 24, mins % 60); } return undefined; }
  const s = String(value).trim(); let m;
  if ((m = s.match(/^(오전|오후)\s*(\d{1,2})(?::(\d{2})|시\s*(\d{1,2})?분?)?/))) { let h = Number(m[2]); if (m[1] === '오후' && h < 12) h += 12; if (m[1] === '오전' && h === 12) h = 0; return build(h, m[3] ?? m[4] ?? 0); }
  if ((m = s.match(/^(\d{1,2}):(\d{2})/))) return build(m[1], m[2]);
  if ((m = s.match(/^(\d{1,2})\s*시\s*(\d{1,2})?\s*분?$/))) return build(m[1], m[2] ?? 0);
  return undefined;
}
export function parseDateTimeCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') { const day = parseDateCell(Math.floor(value)); if (!day) return undefined; return timestamp(`${day}T${parseTimeCell(value - Math.floor(value)) || '00:00'}:00+09:00`); }
  const s = String(value).trim(); const day = parseDateCell(s); if (!day) return undefined;
  const t = s.replace(/^(\d{4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}\s*[일.]?|\d{8})\s*/, '');
  const time = t ? parseTimeCell(t) : '00:00'; if (time === undefined) return undefined;
  try { return timestamp(`${day}T${time}:00+09:00`); } catch { return undefined; }
}
const compact = s => String(s ?? '').replace(/\s+/g, '');
// staff: [{id,name,email,department_name}] 재직자 목록. 반환: null=비어 있음, {id,name,department_name}=해석됨, {error}=실패
export function resolveStaff(staff, cell) {
  const raw = String(cell ?? '').trim(); if (!raw) return null;
  const pick = u => ({ id: u.id, name: u.name, department_name: u.department_name || '' });
  if (raw.includes('@')) { const u = staff.find(x => (x.email || '').toLowerCase() === raw.toLowerCase()); return u ? pick(u) : { error: `'${raw}' 이메일의 재직 교직원이 없습니다.` }; }
  const m = raw.match(/^(.+?)\s*[(（·/]\s*(.+?)\s*[)）]?$/);
  const name = m ? m[1].trim() : raw, dept = m ? m[2].trim() : null;
  let candidates = staff.filter(u => compact(u.name) === compact(name));
  if (!candidates.length) { const byId = staff.find(u => u.id === raw); return byId ? pick(byId) : { error: `'${raw}' 교직원을 찾을 수 없습니다. 재직 중인 이름을 정확히 적어주세요.` }; }
  if (dept) {
    const filtered = candidates.filter(u => u.department_name && (compact(u.department_name) === compact(dept) || compact(u.department_name).includes(compact(dept))));
    if (!filtered.length) return { error: `'${name}' 중 '${dept}' 소속이 없습니다. (${candidates.map(u => u.department_name || '부서 없음').join(', ')})` };
    candidates = filtered;
  }
  if (candidates.length === 1) return pick(candidates[0]);
  return { error: `'${name}' 동명이인이 ${candidates.length}명 있습니다. 부서를 함께 적어주세요. 예: ${candidates.map(u => `${u.name}(${u.department_name || '부서 없음'})`).join(' / ')}` };
}

/* ---------- 3. 미리 보기(검증) ---------- */
const EXAMPLE = /^예시[:：]/;
function splitRows(table) { if (table.length < 2) fail('머리글 외에 등록할 행이 없습니다.'); return { header: table[0], body: table.slice(1) }; }
const cell = (row, map, key) => (key in map ? row[map[key]] ?? '' : '');
function summarize(rows) {
  return { total: rows.length, valid: rows.filter(r => !r.errors.length && !r.empty).length, invalid: rows.filter(r => r.errors.length).length, skipped: rows.filter(r => r.empty && !r.errors.length).length, duplicates: rows.filter(r => r.existing && !r.errors.length && !r.empty).length };
}
// ctx: { user, staff, existingDuties: Map(date → {id,version,note,created_by,entrance_name,inside_name}), holidays: Map(date → name) }
export function previewDuties(ctx, table) {
  const { header, body } = splitRows(table); const map = mapHeaders('duties', header);
  const seen = new Map(); const rows = [];
  body.forEach((row, i) => {
    const n = i + 2, errors = [], warnings = [];
    const date = parseDateCell(cell(row, map, 'date'));
    if (date === null) errors.push('날짜가 비어 있습니다.'); else if (date === undefined) errors.push('날짜 형식을 확인해주세요. 예: 2026-09-21 (연도 포함)');
    const entrance = resolveStaff(ctx.staff, cell(row, map, 'entrance')), inside = resolveStaff(ctx.staff, cell(row, map, 'inside'));
    if (entrance?.error) errors.push('식당 입구: ' + entrance.error);
    if (inside?.error) errors.push('식당 내부: ' + inside.error);
    if (entrance?.id && inside?.id && entrance.id === inside.id) errors.push('식당 입구와 식당 내부에 같은 사람을 지정할 수 없습니다.');
    let note = ''; try { note = text(cell(row, map, 'note'), 1000); } catch (e) { errors.push('비고: ' + e.message); }
    const publish_at = parseDateTimeCell(cell(row, map, 'publish_at'));
    if (publish_at === undefined) errors.push('공개 시각 형식을 확인해주세요. 예: 2026-09-20 18:00');
    if (date && seen.has(date)) errors.push(`파일 안에 같은 날짜가 ${seen.get(date)}행에도 있습니다.`); else if (date) seen.set(date, n);
    const empty = !entrance?.id && !inside?.id && !note;
    if (empty && !errors.length) warnings.push('담당자와 비고가 모두 비어 있어 건너뜁니다. (빈 날짜도 \'담당자 미지정\'으로 등록하려면 아래 선택을 켜주세요)');
    let existing = null;
    const cur = date ? ctx.existingDuties?.get(date) : null;
    if (cur) existing = { id: cur.id, version: cur.version, entrance_name: cur.entrance_name || '담당자 미지정', inside_name: cur.inside_name || '담당자 미지정', note: cur.note, editable: owns(cur, ctx.user) };
    const holiday = date && ctx.holidays?.has(date) ? ctx.holidays.get(date) : undefined;
    if (holiday !== undefined) warnings.push(`휴업일(${holiday || '휴업일'})로 등록된 날짜입니다.`);
    rows.push({ n, date, entrance: entrance?.id ? entrance : null, inside: inside?.id ? inside : null, note, publish_at: publish_at || null, empty, existing, errors, warnings,
      raw: { date: String(cell(row, map, 'date') ?? ''), entrance: String(cell(row, map, 'entrance') ?? ''), inside: String(cell(row, map, 'inside') ?? '') } });
  });
  return { type: 'duties', columns: Object.keys(map), rows, summary: summarize(rows) };
}
// ctx: { user, departments, existingRecords: Map(`${kind}|${date}|${compactTitle}` → {id,version,title,event_date,end_date,start_time,location,created_by}), holidays: Map(date → name) }
export function previewSchedule(ctx, table) {
  const { header, body } = splitRows(table); const map = mapHeaders('schedule', header);
  const rows = []; const seen = new Map();
  body.forEach((row, i) => {
    const n = i + 2, errors = [], warnings = [];
    const titleRaw = String(cell(row, map, 'title') ?? '').trim();
    const example = EXAMPLE.test(titleRaw);
    const kindRaw = String(cell(row, map, 'kind') ?? '').trim(); const kind = kindRaw ? KIND_WORDS[normalizeHeader(kindRaw)] : 'academic';
    if (!kind) errors.push(`유형 '${kindRaw}'을(를) 알 수 없습니다. 학사 일정 / 행사·회의 / 방송 안내 / 제출 기한 / 창체 시간표 / 공지사항 / 휴업일 중에서 적어주세요.`);
    const date = parseDateCell(cell(row, map, 'date'));
    if (date === null) errors.push('날짜가 비어 있습니다.'); else if (date === undefined) errors.push('날짜 형식을 확인해주세요. 예: 2026-10-05 (연도 포함)');
    const end_date = parseDateCell(cell(row, map, 'end_date'));
    if (end_date === undefined) errors.push('종료 날짜 형식을 확인해주세요.'); else if (end_date && date && end_date < date) errors.push('종료 날짜가 시작 날짜보다 앞섭니다.');
    const start_time = parseTimeCell(cell(row, map, 'start_time')), end_time = parseTimeCell(cell(row, map, 'end_time'));
    if (start_time === undefined) errors.push('시작 시간 형식을 확인해주세요. 예: 14:30'); if (end_time === undefined) errors.push('종료 시간 형식을 확인해주세요. 예: 15:00');
    const impRaw = normalizeHeader(cell(row, map, 'importance')); const importance = !impRaw || ['일반', 'normal', '보통'].includes(impRaw) ? 'normal' : ['중요', 'important'].includes(impRaw) ? 'important' : ['긴급', 'urgent'].includes(impRaw) ? 'urgent' : undefined;
    if (importance === undefined) errors.push('중요도는 일반 / 중요 / 긴급 중 하나로 적어주세요.');
    if (!titleRaw && kind !== 'holiday') errors.push('제목이 비어 있습니다.');
    const key = kind && date ? `${kind}|${date}|${compact(titleRaw)}` : null;
    if (key && !example) { if (seen.has(key)) errors.push(`파일 안에 같은 일정이 ${seen.get(key)}행에도 있습니다.`); else seen.set(key, n); }
    let record = null, existing = null;
    if (kind === 'holiday') {
      if (ctx.user.role !== 'admin') errors.push('휴업일은 관리자만 등록할 수 있습니다.');
      if (date && ctx.holidays?.has(date)) existing = { holiday: true, name: ctx.holidays.get(date), editable: ctx.user.role === 'admin' };
      if (!errors.length) record = { holiday: true, date, name: titleRaw };
    } else if (!errors.length && kind) {
      const input = { kind, title: titleRaw, content: String(cell(row, map, 'content') ?? ''), channel: 'all', department_id: ctx.user.department_id || null, importance, state: 'published', publish_at: nowISO(), event_date: date, end_date: end_date || null, start_time: start_time || null, end_time: end_time || null, location: String(cell(row, map, 'location') ?? ''), link: '' };
      try { record = validateRecord(input, ctx.user, ctx); } catch (e) { errors.push(e.message); }
      if (record) {
        const cur = ctx.existingRecords?.get(`${kind}|${record.event_date}|${compact(record.title)}`);
        if (cur) existing = { id: cur.id, version: cur.version, title: cur.title, event_date: cur.event_date, end_date: cur.end_date, start_time: cur.start_time, location: cur.location, editable: owns(cur, ctx.user) };
      }
    }
    if (example) warnings.push('양식의 예시 행이라 건너뜁니다.');
    rows.push({ n, kind, date, end_date: end_date || null, title: titleRaw, content: String(cell(row, map, 'content') ?? ''), importance: importance || 'normal', start_time: start_time || null, end_time: end_time || null, location: record?.location ?? String(cell(row, map, 'location') ?? ''), record, empty: example, existing, errors, warnings });
  });
  return { type: 'schedule', columns: Object.keys(map), rows, summary: summarize(rows) };
}
export const recordKey = (kind, date, title) => `${kind}|${date}|${compact(title)}`;

/* ---------- 4. 양식 ---------- */
const csvLine = cells => cells.map(v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }).join(',');
export function dutyTemplate(month, holidayDates = []) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : schoolDate().slice(0, 7);
  const holidays = new Set(holidayDates);
  const daysIn = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  const lines = [csvLine(['날짜', '식당 입구', '식당 내부', '비고'])];
  for (let d = 0; d < daysIn; d++) {
    const date = addDays(`${m}-01`, d), dow = new Date(date + 'T00:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6 || holidays.has(date)) continue;
    lines.push(csvLine([date, '', '', '']));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
export function scheduleTemplate() {
  const base = addDays(schoolDate(), 14);
  const lines = [csvLine(['날짜', '종료 날짜', '유형', '제목', '내용', '장소', '시작 시간', '종료 시간']),
    csvLine([base, addDays(base, 2), '학사 일정', '예시: 중간고사', '시험 기간 학사 운영 안내', '', '', '']),
    csvLine([addDays(base, 7), '', '행사·회의', '예시: 교직원 회의', '', '2층 회의실', '15:30', '16:10']),
    csvLine([addDays(base, 9), '', '휴업일', '예시: 재량휴업일', '', '', '', ''])];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

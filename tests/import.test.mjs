import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { buildXlsx, excelSerial } from './helpers.mjs';
import { decodeText, parseCSV, parseXlsx, parseTable, parseDateCell, parseTimeCell, parseDateTimeCell, resolveStaff, previewDuties, previewSchedule, dutyTemplate, scheduleTemplate, mapHeaders } from '../public/lib/import.js';
import { schoolDate, addDays } from '../public/lib/core.js';

const inflate = async u8 => new Uint8Array(inflateRawSync(u8));
const day = n => addDays(schoolDate(), n);
const staff = [
  { id: 'u-admin', name: '관리자', email: 'admin@school.example', department_name: '교무업무지원팀' },
  { id: 'u-lee', name: '이하늘', email: 'lee@school.example', department_name: '과학정보부' },
  { id: 'u-park', name: '박다온', email: 'park@school.example', department_name: '학생생활부' },
  { id: 'u-kim', name: '김새봄', email: 'kim@school.example', department_name: '교무업무지원팀' },
  { id: 'u-kim2', name: '김새봄', email: 'kim2@school.example', department_name: '과학정보부' },
];
const me = { id: 'u-lee', role: 'staff', department_id: 'info' };
const admin = { id: 'u-admin', role: 'admin', department_id: 'academic' };
const departments = [{ id: 'academic' }, { id: 'info' }, { id: 'life' }];

test('텍스트 파일의 인코딩(UTF-8 BOM·UTF-8·CP949·UTF-16LE)을 자동으로 읽는다', () => {
  assert.equal(decodeText(Buffer.from('﻿날짜,이름', 'utf8')), '날짜,이름');
  assert.equal(decodeText(Buffer.from('날짜,이름', 'utf8')), '날짜,이름');
  assert.equal(decodeText(new Uint8Array([0xB0, 0xA1, 0x2C, 0xB3, 0xAA])), '가,나'); // EUC-KR '가','나'
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('a\tb', 'utf16le')])), 'a\tb');
});
test('CSV의 따옴표·줄바꿈·구분자를 올바르게 나눈다', () => {
  const rows = parseCSV('날짜,제목,내용\r\n2026-09-21,"회의, 준비","첫 줄\n둘째 줄"\r\n,,\r\n2026-09-22,"따옴표 ""안"" 문자",\r\n');
  assert.deepEqual(rows, [['날짜', '제목', '내용'], ['2026-09-21', '회의, 준비', '첫 줄\n둘째 줄'], ['2026-09-22', '따옴표 "안" 문자', '']]);
  assert.deepEqual(parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});
test('엑셀(.xlsx) 첫 시트를 공유 문자열·숫자·날짜 일련번호까지 읽는다(브라우저와 같은 DataView 경로)', async () => {
  const rows = await parseXlsx(new Uint8Array(buildXlsx([['날짜', '식당 입구', '메모'], [excelSerial('2026-10-05'), '이하늘', 'A & B <c>'], ['2026-10-06', '', 3]])), inflate);
  assert.equal(rows[0][1], '식당 입구');
  assert.equal(typeof rows[1][0], 'number'); assert.equal(parseDateCell(rows[1][0]), '2026-10-05');
  assert.equal(rows[1][2], 'A & B <c>'); assert.equal(rows[2][2], 3);
  const viaTable = await parseTable(new Uint8Array(buildXlsx([['날짜'], ['2026-01-02']])), '일정.xlsx', inflate);
  assert.deepEqual(viaTable, [['날짜'], ['2026-01-02']]);
  await assert.rejects(parseTable(new Uint8Array([1, 2, 3]), 'old.xls'), /\.xls/);
});
test('여러 날짜·시간 표기를 한국 날짜와 HH:mm으로 통일한다', () => {
  for (const v of ['2026-09-21', '2026.9.21', '2026/09/21', '2026년 9월 21일', '20260921', '2026. 9. 21.', '2026-09-21(월)', '2026-09-21T00:00:00']) assert.equal(parseDateCell(v), '2026-09-21', v);
  assert.equal(parseDateCell(excelSerial('2026-09-21')), '2026-09-21');
  assert.equal(parseDateCell('9/21'), undefined); assert.equal(parseDateCell('2026-02-30'), undefined); assert.equal(parseDateCell(''), null);
  for (const v of ['14:30', '14:30:00', '오후 2:30', '오후 2시 30분', '14시 30분']) assert.equal(parseTimeCell(v), '14:30', v);
  assert.equal(parseTimeCell('오전 12:05'), '00:05'); assert.equal(parseTimeCell(0.5), '12:00'); assert.equal(parseTimeCell('25:00'), undefined);
  assert.equal(parseDateTimeCell('2026-09-20 18:00'), new Date('2026-09-20T18:00:00+09:00').toISOString());
  assert.equal(parseDateTimeCell('2026-09-20'), new Date('2026-09-20T00:00:00+09:00').toISOString());
});
test('교직원 이름을 ID로 해석하고 동명이인은 부서로 구별한다', () => {
  assert.equal(resolveStaff(staff, '이하늘').id, 'u-lee');
  assert.equal(resolveStaff(staff, ' 이 하늘 ').id, 'u-lee');
  assert.equal(resolveStaff(staff, 'park@school.example').id, 'u-park');
  assert.match(resolveStaff(staff, '김새봄').error, /동명이인/);
  assert.equal(resolveStaff(staff, '김새봄(교무업무지원팀)').id, 'u-kim');
  assert.equal(resolveStaff(staff, '김새봄(과학정보부)').id, 'u-kim2');
  assert.equal(resolveStaff(staff, '김새봄·교무업무').id, 'u-kim');
  assert.match(resolveStaff(staff, '김새봄(행정실)').error, /소속이 없습니다/);
  assert.match(resolveStaff(staff, '없는사람').error, /찾을 수 없습니다/);
  assert.equal(resolveStaff(staff, ''), null);
});
test('머리글 별칭을 인식하고 필수 열이 없으면 읽은 머리글과 함께 알려준다', () => {
  assert.deepEqual(mapHeaders('duties', ['일자', '입구 담당자', '식당 내부', '메모']), { date: 0, entrance: 1, inside: 2, note: 3 });
  assert.throws(() => mapHeaders('schedule', ['날짜', '장소']), /'제목' 열을 찾지 못했습니다.*읽은 머리글: 날짜, 장소/);
});
test('급식지도 양식은 그 달의 수업일만 담은 UTF-8 BOM CSV다', () => {
  const csv = dutyTemplate('2026-10', ['2026-10-07']);
  assert.ok(csv.startsWith('﻿날짜,식당 입구,식당 내부,비고\r\n'));
  const dates = csv.split('\r\n').slice(1).filter(Boolean).map(l => l.split(',')[0]);
  assert.equal(dates.length, 21); assert.ok(!dates.includes('2026-10-07')); assert.ok(dates.every(d => ![0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())));
  assert.match(scheduleTemplate(), /예시: 중간고사/);
});
test('급식지도 미리 보기: 정상·형식 오류·동명이인·같은 사람·파일 내 중복·기존 자료·휴업일을 행마다 알려준다', () => {
  const existing = new Map([[day(1), { id: 'd1', version: 1, note: '', created_by: 'u-admin', entrance_name: '박다온', inside_name: '김새봄' }]]);
  const holidays = new Map([[day(33), '개교기념일']]);
  const csv = ['날짜,식당 입구,식당 내부,비고', `${day(30)},이하늘,박다온,`, `${day(31)},김새봄,이하늘,`, `9/21,이하늘,박다온,`, `${day(32)},이하늘,이하늘,`, `${day(30)},박다온,이하늘,중복 날짜`, `${day(1)},이하늘,김새봄(교무업무지원팀),기존 자료`, `${day(33)},,,`].join('\n');
  const r = previewDuties({ user: me, staff, existingDuties: existing, holidays }, parseCSV(csv));
  const rows = r.rows; assert.equal(rows.length, 7);
  assert.deepEqual(rows[0].errors, []); assert.equal(rows[0].entrance.id, 'u-lee'); assert.equal(rows[0].inside.name, '박다온');
  assert.match(rows[1].errors[0], /동명이인/);
  assert.match(rows[2].errors[0], /날짜 형식/);
  assert.match(rows[3].errors[0], /같은 사람/);
  assert.match(rows[4].errors[0], /같은 날짜가 2행/);
  assert.deepEqual(rows[5].errors, []); assert.equal(rows[5].existing.editable, false); assert.equal(rows[5].existing.entrance_name, '박다온');
  assert.equal(rows[6].empty, true); assert.match(rows[6].warnings.join(' '), /건너뜁니다/); assert.match(rows[6].warnings.join(' '), /휴업일\(개교기념일\)/);
  assert.deepEqual(r.summary, { total: 7, valid: 2, invalid: 4, skipped: 1, duplicates: 1 });
  assert.equal(previewDuties({ user: admin, staff, existingDuties: existing, holidays }, parseCSV(csv)).rows[5].existing.editable, true);
});
test('학사 일정 미리 보기: 유형·휴업일 권한·예시 행·파일 내 중복·기존 일정을 처리한다', () => {
  const csv = ['날짜,종료 날짜,유형,제목,내용,장소,시작 시간,종료 시간', `${day(20)},${day(22)},학사 일정,기말고사,시험 기간,,,`, `${day(25)},,행사·회의,교과협의회,,3층 회의실,오후 3:30,16:10`, `${day(26)},,휴업일,개교기념일,,,,`, `${day(27)},,학사 일정,예시: 지워야 할 행,,,,`, `${day(28)},,이상한유형,무엇,,,,`, `${day(20)},${day(22)},학사 일정,기말고사,두 번째,,,`, `${day(29)},,행사·회의,,,,,`].join('\n');
  const existing = new Map([[`event|${day(25)}|교과협의회`, { id: 'r1', version: 3, title: '교과협의회', event_date: day(25), end_date: day(25), start_time: '15:30', location: '3층 회의실', created_by: 'u-lee' }]]);
  const r = previewSchedule({ user: me, departments, existingRecords: existing, holidays: new Map() }, parseCSV(csv));
  const rows = r.rows;
  assert.deepEqual(rows[0].errors, []); assert.equal(rows[0].kind, 'academic'); assert.equal(rows[0].end_date, day(22)); assert.equal(rows[0].record.channel, 'all');
  assert.equal(rows[1].kind, 'event'); assert.equal(rows[1].start_time, '15:30'); assert.ok(rows[1].existing); assert.equal(rows[1].existing.editable, true);
  assert.match(rows[2].errors[0], /관리자만/);
  assert.equal(rows[3].empty, true);
  assert.match(rows[4].errors[0], /유형/);
  assert.match(rows[5].errors[0], /같은 일정이 2행/);
  assert.match(rows[6].errors[0], /제목이 비어/);
  const asAdmin = previewSchedule({ user: admin, departments, existingRecords: existing, holidays: new Map() }, parseCSV(csv));
  assert.deepEqual(asAdmin.rows[2].errors, []); assert.equal(asAdmin.rows[2].kind, 'holiday'); assert.equal(asAdmin.rows[2].record.name, '개교기념일');
  assert.equal(asAdmin.summary.valid, 3);
});

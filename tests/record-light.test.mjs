import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord } from '../public/lib/core.js';

// 가벼운 등록 폼: 비워 둔 선택 항목('')은 null·기본값이 되어 DB 제약(날짜·시간·부서 FK)에 걸리지 않아야 한다
const user = { id: 'u1', department_id: 'info', role: 'staff' };
const departments = [{ id: 'info' }, { id: 'academic' }];
const blank = { kind: 'notice', title: '  제목만  ', content: '', channel: 'all', department_id: '', target_department_id: '', importance: 'normal', location: '', event_date: '', end_date: '', start_time: '', end_time: '', link: '', expire_at: null, state: 'published', publish_at: '2026-09-21T01:00:00.000Z' };

test('제목만 적은 공지: 빈 칸은 null 이 되고 부서는 작성자 부서가 된다', () => {
  const r = validateRecord(blank, user, { departments });
  assert.equal(r.title, '제목만');
  assert.equal(r.department_id, 'info');
  for (const k of ['target_department_id', 'event_date', 'end_date', 'start_time', 'end_time', 'expire_at']) assert.equal(r[k], null, k);
  assert.equal(r.content, ''); assert.equal(r.location, ''); assert.equal(r.link, '');
  assert.equal(r.state, 'published'); assert.equal(r.publish_at, '2026-09-21T01:00:00.000Z');
  assert.ok(!('files' in r) && !('repeat' in r) && !('publish_mode' in r));
});

test('일정 유형은 날짜만 있으면 되고, 종료 날짜를 비우면 시작 날짜와 같아진다', () => {
  const r = validateRecord({ ...blank, kind: 'event', event_date: '2026-09-28' }, user, { departments });
  assert.equal(r.event_date, '2026-09-28'); assert.equal(r.end_date, '2026-09-28'); assert.equal(r.start_time, null);
  assert.throws(() => validateRecord({ ...blank, kind: 'event' }, user, { departments }), /날짜/);
  assert.throws(() => validateRecord({ ...blank, kind: 'deadline', event_date: '2026-09-28', target_department_id: 'nope' }, user, { departments }), /부서/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRepeat, occurrences, describeRepeat } from '../public/lib/series.js';

test('반복 규칙 검증: 주기·간격·종료 조건을 확인한다', () => {
  assert.equal(validateRepeat(null), null); assert.equal(validateRepeat({ freq: 'none' }), null);
  assert.throws(() => validateRepeat({ freq: 'daily', count: 3 }), /매주 또는 매월/);
  assert.throws(() => validateRepeat({ freq: 'weekly' }), /종료 날짜 또는 반복 횟수/);
  assert.throws(() => validateRepeat({ freq: 'weekly', count: 999 }), /1~200회/);
  const r = validateRepeat({ freq: 'weekly', interval: '2', weekdays: ['1', 3, 3, 9], until: '2026-12-31', skip_holidays: 'false' });
  assert.deepEqual(r, { freq: 'weekly', interval: 2, weekdays: [1, 3], until: '2026-12-31', count: null, skip_holidays: false });
  assert.equal(describeRepeat(r), '2주마다 월·수요일 · 2026-12-31까지');
});
test('매주 반복은 요일·격주·종료일·횟수·휴업일 제외를 지킨다', () => {
  const dates = occurrences('2026-09-21', validateRepeat({ freq: 'weekly', interval: 2, weekdays: [1, 3], count: 5 }));
  assert.deepEqual(dates, ['2026-09-21', '2026-09-23', '2026-10-05', '2026-10-07', '2026-10-19']);
  assert.deepEqual(occurrences('2026-09-23', validateRepeat({ freq: 'weekly', weekdays: [1], count: 2 })), ['2026-09-28', '2026-10-05']);
  const untilRule = validateRepeat({ freq: 'weekly', weekdays: [2], until: '2026-10-13' });
  assert.deepEqual(occurrences('2026-09-22', untilRule, ['2026-10-06']), ['2026-09-22', '2026-09-29', '2026-10-13']);
  assert.equal(occurrences('2026-09-22', { ...untilRule, skip_holidays: false }, ['2026-10-06']).length, 4);
  assert.throws(() => occurrences('2026-09-22', validateRepeat({ freq: 'weekly', until: '2026-09-01' })), /종료 날짜는 시작 날짜보다 뒤/);
});
test('매월 반복은 같은 날짜를 고르고 31일이 없는 달은 건너뛴다', () => {
  assert.deepEqual(occurrences('2026-01-31', validateRepeat({ freq: 'monthly', count: 3 })), ['2026-01-31', '2026-03-31', '2026-05-31']);
  assert.deepEqual(occurrences('2026-11-15', validateRepeat({ freq: 'monthly', interval: 2, until: '2027-04-30' })), ['2026-11-15', '2027-01-15', '2027-03-15']);
});

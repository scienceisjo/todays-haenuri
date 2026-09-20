import { fail, dateOnly, addDays } from './core.js';

export const MAX_OCCURRENCES = 200;
const WINDOW_DAYS = 731; // 반복은 최대 2년 범위

// 입력 예: { freq:'weekly'|'monthly', interval:1, weekdays:[1,3], until:'2026-12-31' | count:10, skip_holidays:true }
export function validateRepeat(input) {
  if (!input || typeof input !== 'object' || !input.freq || input.freq === 'none') return null;
  if (!['weekly', 'monthly'].includes(input.freq)) fail('반복 주기는 매주 또는 매월 중에서 선택해주세요.');
  const interval = Math.trunc(Number(input.interval) || 1);
  if (interval < 1 || interval > 12) fail('반복 간격은 1~12 사이로 입력해주세요.');
  let weekdays = null;
  if (input.freq === 'weekly') {
    weekdays = [...new Set((Array.isArray(input.weekdays) ? input.weekdays : []).map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  }
  const until = input.until ? dateOnly(input.until) : null;
  const count = input.count ? Math.trunc(Number(input.count)) : null;
  if (!until && !count) fail('반복 종료 날짜 또는 반복 횟수를 정해주세요.');
  if (count !== null && (count < 1 || count > MAX_OCCURRENCES)) fail(`반복 횟수는 1~${MAX_OCCURRENCES}회 사이로 입력해주세요.`);
  return { freq: input.freq, interval, weekdays, until, count, skip_holidays: input.skip_holidays !== false && input.skip_holidays !== 'false' };
}

// start 날짜부터 규칙에 맞는 날짜 목록(YYYY-MM-DD). 휴업일 집합에 든 날짜는 skip_holidays일 때 제외한다.
export function occurrences(start, repeat, holidays = []) {
  const hol = new Set(holidays);
  const limit = repeat.count || MAX_OCCURRENCES;
  const last = repeat.until && repeat.until < addDays(start, WINDOW_DAYS) ? repeat.until : addDays(start, WINDOW_DAYS);
  if (last < start) fail('반복 종료 날짜는 시작 날짜보다 뒤여야 합니다.');
  const out = [];
  const push = date => { if (date < start || date > last) return false; if (!(repeat.skip_holidays && hol.has(date))) out.push(date); return true; };
  if (repeat.freq === 'weekly') {
    const startDow = new Date(start + 'T00:00:00Z').getUTCDay();
    const days = repeat.weekdays && repeat.weekdays.length ? repeat.weekdays : [startDow];
    const anchor = addDays(start, -startDow); // 시작 주의 일요일
    for (let week = 0; out.length < limit; week++) {
      const base = addDays(anchor, week * 7 * repeat.interval);
      if (base > last) break;
      for (const dow of days) { const date = addDays(base, dow); if (date > last) break; push(date); if (out.length >= limit) break; }
    }
  } else {
    const dom = Number(start.slice(8, 10)), y0 = Number(start.slice(0, 4)), m0 = Number(start.slice(5, 7)) - 1;
    for (let k = 0; out.length < limit && k < 300; k++) {
      const monthIndex = m0 + k * repeat.interval, y = y0 + Math.floor(monthIndex / 12), m = monthIndex % 12;
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      if (dom > daysInMonth) continue; // 31일 반복은 30일까지인 달을 건너뛴다
      const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
      if (date > last) break;
      push(date);
    }
  }
  if (!out.length) fail('반복 조건에 맞는 날짜가 없습니다. 요일·종료 날짜·휴업일을 확인해주세요.');
  return out;
}

export function describeRepeat(repeat) {
  if (!repeat) return '';
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  const every = repeat.interval > 1 ? `${repeat.interval}${repeat.freq === 'weekly' ? '주' : '개월'}마다` : repeat.freq === 'weekly' ? '매주' : '매월';
  const days = repeat.freq === 'weekly' && repeat.weekdays?.length ? ' ' + repeat.weekdays.map(d => names[d]).join('·') + '요일' : '';
  const end = repeat.until ? ` · ${repeat.until}까지` : repeat.count ? ` · ${repeat.count}회` : '';
  return `${every}${days}${end}${repeat.skip_holidays ? ' · 휴업일 제외' : ''}`;
}

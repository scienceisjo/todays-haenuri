// 순수 도메인 규칙(브라우저·Node 공용): 한국 날짜, 입력 검증, 공개 여부·소유권
export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (message, status = 400) => { throw new AppError(status, message); };
export const nowISO = () => new Date().toISOString();
export const schoolDate = (instant = new Date()) => new Date(instant.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const text = (value, max = 5000) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) fail(`문자 입력은 ${max}자 이내로 작성해주세요.`);
  return value.trim();
};
export function dateOnly(value, required = false) {
  if (!value && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('날짜를 올바르게 입력해주세요.');
  return value;
}
export function timestamp(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== 'string' || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('게시 시각을 확인해주세요.');
  return new Date(value).toISOString();
}
export function clock(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('시간 형식을 확인해주세요.');
  return value;
}
export const KINDS = ['notice', 'event', 'broadcast', 'academic', 'deadline', 'special'];
// ctx.departments: [{id}] — 부서 존재 여부 검사에 쓴다
export function validateRecord(input, user, ctx = {}) {
  const title = text(input.title, 160);
  if (!title) fail('제목을 입력해주세요.');
  if (!KINDS.includes(input.kind)) fail('안내 유형을 선택해주세요.');
  const department_id = input.department_id || user?.department_id || null;
  const target_department_id = input.target_department_id || null;
  if (ctx.departments) for (const id of [department_id, target_department_id]) if (id && !ctx.departments.some(d => d.id === id)) fail('부서를 확인해주세요.');
  const importance = input.importance ?? 'normal';
  const state = input.state ?? 'published';
  if (!['normal', 'important', 'urgent'].includes(importance) || !['draft', 'published', 'hidden'].includes(state)) fail('게시 상태를 확인해주세요.');
  const publish_at = timestamp(input.publish_at, nowISO());
  const expire_at = timestamp(input.expire_at);
  if (expire_at && expire_at <= publish_at) fail('게시 종료는 시작 시각보다 뒤여야 합니다.');
  const event_date = dateOnly(input.event_date, input.kind !== 'notice');
  const end_date = dateOnly(input.end_date) || event_date;
  if (end_date && end_date < event_date) fail('종료 날짜를 확인해주세요.');
  const start_time = clock(input.start_time), end_time = clock(input.end_time);
  if (start_time && end_time && event_date === end_date && end_time <= start_time) fail('종료 시간은 시작 시간보다 뒤여야 합니다.');
  const link = text(input.link, 2000);
  if (link) { try { if (!['http:', 'https:'].includes(new URL(link).protocol)) fail('http 또는 https 링크를 입력해주세요.'); } catch { fail('올바른 링크를 입력해주세요.'); } }
  const channel = input.channel ?? 'department'; if (!['all', 'department'].includes(channel)) fail('공지 구분을 확인해주세요.');
  return { kind: input.kind, title, content: text(input.content, 20000), channel, department_id, target_department_id, importance, state, publish_at, expire_at, event_date, end_date, start_time, end_time, location: text(input.location, 200), link };
}
export const owns = (row, user) => user.role === 'admin' || row.created_by === user.id;
export function visibleRecord(row, user, now = nowISO()) {
  return !row.deleted_at && row.state === 'published' && row.publish_at <= now && (!row.expire_at || row.expire_at > now)
    && (!row.target_department_id || row.target_department_id === user.department_id || user.role === 'admin');
}

// Supabase 데이터 계층. 화면(app.js)은 이 모듈만 호출한다. 권한은 서버(RLS·함수)가 최종 검사한다.
import { schoolDate, nowISO } from './core.js';
import { previewDuties, previewSchedule, recordKey, dutyTemplate, scheduleTemplate, parseTable } from './import.js';

const REMEMBER_KEY = 'school-remember';
const FRIENDLY = [
  [/row-level security|permission denied|42501/i, '권한이 없습니다. 작성자 또는 관리자만 변경할 수 있습니다.'],
  [/meals_date_key|meal_duties_date_key|duplicate key value/i, '이 날짜에는 이미 등록된 자료가 있습니다. 기존 자료를 수정해주세요.'],
  [/Invalid login credentials/i, '이메일 또는 비밀번호를 확인해주세요.'],
  [/Email not confirmed/i, '이메일 확인이 필요한 계정입니다. 관리자에게 Supabase의 "Confirm email" 설정을 꺼 달라고 요청해주세요.'],
  [/Password should be at least|weak_password|Password is too/i, '비밀번호는 12자 이상으로 입력해주세요.'],
  [/User already registered|already been registered/i, '이미 가입된 이메일입니다. 로그인해주세요.'],
  [/Database error saving new user/i, '교직원 명단에 없는 이메일이거나 가입 규칙에 맞지 않습니다. 관리자에게 등록을 요청해주세요.'],
  [/JWT expired|invalid claim|refresh_token_not_found/i, '로그인이 만료되었습니다. 다시 로그인해주세요.'],
  [/Failed to fetch|NetworkError|Load failed|network/i, '서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.'],
  [/duties_two_different_people/i, '식당 입구와 식당 내부에는 서로 다른 담당자를 지정해주세요.'],
  [/records_expire_after_publish/i, '게시 종료는 시작 시각보다 뒤여야 합니다.'],
  [/records_date_required/i, '이 유형의 안내에는 날짜가 필요합니다.'],
];
function friendly(error) {
  const raw = error?.message || String(error || '오류');
  for (const [re, msg] of FRIENDLY) if (re.test(raw)) { const e = new Error(msg); e.raw = raw; e.status = /JWT|refresh_token/i.test(raw) ? 401 : /security|permission|42501/i.test(raw) ? 403 : 400; return e; }
  const e = new Error(raw.replace(/^P0001:\s*/, '')); e.raw = raw; e.status = error?.status || 400; return e;
}
const ok = ({ data, error }) => { if (error) throw friendly(error); return data; };
const conflict = () => { const e = new Error('다른 사람이 먼저 수정했습니다. 새로고침한 뒤 다시 확인해주세요.'); e.status = 409; return e; };
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const inflateRaw = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());

export function createData(config, supabaseLib) {
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) throw new Error('config.js 에 Supabase 주소와 anon 키가 필요합니다.');
  const remembered = () => { try { return localStorage.getItem(REMEMBER_KEY) === '1'; } catch { return false; } };
  const store = () => { try { return remembered() ? localStorage : sessionStorage; } catch { return null; } };
  const storage = {
    getItem: k => { try { return (store()?.getItem(k)) ?? (remembered() ? null : localStorage.getItem(k)); } catch { return null; } },
    setItem: (k, v) => { try { store()?.setItem(k, v); } catch { /* ignore */ } },
    removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const client = supabaseLib.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage } });
  const t = name => client.from(name);
  let me = null;

  async function loadMe() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) { me = null; return null; }
    const row = ok(await t('staff').select('id,name,email,department_id,role,active').eq('id', session.user.id).maybeSingle());
    if (!row) { me = null; const e = new Error('교직원 정보가 없습니다. 가입 규칙(명단)을 확인해주세요.'); e.status = 401; throw e; }
    if (!row.active) { me = null; const e = new Error('비활성화된 계정입니다. 관리자에게 문의해주세요.'); e.status = 401; throw e; }
    me = row; return me;
  }
  const requireMe = () => { if (!me) { const e = new Error('로그인이 필요합니다.'); e.status = 401; throw e; } return me; };

  const settingsMap = rows => Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  function branding(settings) {
    const logoPath = settings.logo_path || '';
    const logoUrl = logoPath ? `${client.storage.from('branding').getPublicUrl(logoPath).data.publicUrl}?v=${encodeURIComponent(settings.logo_version || '0')}` : null;
    return { school_name: settings.school_name || '우리중학교', app_name: settings.app_name || '오늘의 학교', logo: !!logoPath, logo_url: logoUrl, logo_type: settings.logo_type || null, logo_size: Number(settings.logo_width) || 0, logo_version: settings.logo_version || '0' };
  }

  const db = {
    client,
    get me() { return me; },
    auth: {
      async session() { return loadMe(); },
      async signIn(email, password, remember) {
        try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch { /* ignore */ }
        ok(await client.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password }));
        return loadMe();
      },
      async canRegister(email) { return ok(await client.rpc('can_register', { p_email: String(email).trim().toLowerCase() })); },
      async signUp(email, password, name) {
        const check = await db.auth.canRegister(email);
        if (!check?.ok) throw new Error(check?.reason || '가입할 수 없는 이메일입니다.');
        try { localStorage.setItem(REMEMBER_KEY, '1'); } catch { /* ignore */ }
        const data = ok(await client.auth.signUp({ email: String(email).trim().toLowerCase(), password, options: { data: { name: String(name || '').trim().slice(0, 60) } } }));
        if (!data.session) { const e = new Error('가입은 되었지만 이메일 확인이 필요합니다. 관리자에게 Supabase의 "Confirm email" 설정을 꺼 달라고 요청하거나, 메일의 확인 링크를 눌러주세요.'); e.status = 202; throw e; }
        return loadMe();
      },
      async signOut() { await client.auth.signOut(); me = null; },
      async resetPassword(email) { ok(await client.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), { redirectTo: location.origin + location.pathname })); },
      async updatePassword(password) { ok(await client.auth.updateUser({ password })); },
      async verifyPassword(password) { const m = requireMe(); ok(await client.auth.signInWithPassword({ email: m.email, password })); },
      onChange(cb) { return client.auth.onAuthStateChange((event, session) => cb(event, session)); },
    },
    async info() {
      const settings = settingsMap(ok(await t('settings').select('key,value')));
      return { ...branding(settings), has_users: true };
    },
    async bootstrap() {
      const m = me || await loadMe(); requireMe();
      const [settingsRows, serverTime, departments, staffRows, records, attachments, meals, duties, holidays] = await Promise.all([
        t('settings').select('key,value').then(ok),
        client.rpc('server_time').then(ok),
        t('departments').select('id,name,sort').order('sort').then(ok),
        t('staff').select('id,name,email,department_id,role,active').order('name').then(ok),
        t('records_view').select('*').order('created_at', { ascending: false }).limit(2000).then(ok),
        t('attachments').select('id,record_id,original_name,mime,byte_size,storage_path').then(ok),
        t('meals').select('*').order('date').then(ok),
        t('duties_view').select('*').order('date').then(ok),
        t('holidays').select('date,name').order('date').then(ok),
      ]);
      const byRecord = new Map(); for (const a of attachments) { if (!byRecord.has(a.record_id)) byRecord.set(a.record_id, []); byRecord.get(a.record_id).push(a); }
      const settings = settingsMap(settingsRows);
      const server_time = new Date(serverTime).toISOString();
      return {
        ...branding(settings), today: schoolDate(new Date(server_time)), server_time, demo: false, user: m,
        departments, staff: staffRows.filter(s => s.active), staffAll: staffRows,
        records: records.map(r => ({ ...r, read: !!r.read, attachments: byRecord.get(r.id) || [] })),
        meals, duties, holidays,
      };
    },
    records: {
      async create(values) { requireMe(); return ok(await t('records').insert({ ...values, created_by: me.id, updated_by: me.id }).select('id,version').single()); },
      async createSeries(base, dates, rule) { requireMe(); return ok(await client.rpc('create_series', { base, dates, rule })); },
      async update(id, version, patch, scope = 'single') { requireMe(); return ok(await client.rpc('update_record', { p_id: id, p_version: Number(version), patch, scope })); },
      async remove(id, version, scope = 'single') { requireMe(); return ok(await client.rpc('delete_record', { p_id: id, p_version: Number(version), scope })); },
      async restore(id, version) { requireMe(); const rows = ok(await t('records').update({ deleted_at: null }).eq('id', id).eq('version', Number(version)).select('id')); if (!rows.length) throw conflict(); return { ok: true }; },
      async markRead(id, version) { requireMe(); ok(await t('record_reads').upsert({ record_id: id, user_id: me.id, record_version: Number(version), read_at: nowISO() }, { onConflict: 'record_id,user_id' })); return { ok: true }; },
      async version(id) { return (ok(await t('records').select('version').eq('id', id).single())).version; },
    },
    attachments: {
      async upload(recordId, file) {
        requireMe();
        const name = String(file.name || '파일').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180);
        const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
        if (!['pdf', 'png', 'jpg', 'jpeg', 'webp', 'xlsx', 'xls', 'hwp', 'hwpx', 'doc', 'docx', 'txt', 'csv'].includes(ext)) throw new Error('PDF, 이미지, 한글, 엑셀, 워드, TXT, CSV 파일을 첨부할 수 있습니다.');
        if (file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error('파일은 0바이트 초과, 10MB 이하로 올려주세요.');
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        let mime = 'application/octet-stream';
        if (ext === 'pdf' && String.fromCharCode(...head.subarray(0, 5)) === '%PDF-') mime = 'application/pdf';
        if (ext === 'png' && [137, 80, 78, 71].every((b, i) => head[i] === b)) mime = 'image/png';
        if (['jpg', 'jpeg'].includes(ext) && head[0] === 255 && head[1] === 216 && head[2] === 255) mime = 'image/jpeg';
        if (ext === 'webp' && String.fromCharCode(...head.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...head.subarray(8, 12)) === 'WEBP') mime = 'image/webp';
        const id = uuid(), path = `${recordId}/${id}.${ext}`;
        ok(await client.storage.from('attachments').upload(path, file, { contentType: mime, upsert: false }));
        try { ok(await t('attachments').insert({ id, record_id: recordId, original_name: name, mime, byte_size: file.size, storage_path: path, created_by: me.id })); }
        catch (e) { await client.storage.from('attachments').remove([path]).catch(() => {}); throw e; }
        return { id, name, version: await db.records.version(recordId) };
      },
      async remove(att) {
        requireMe();
        ok(await t('attachments').delete().eq('id', att.id));
        await client.storage.from('attachments').remove([att.storage_path]).catch(() => {});
        return { ok: true };
      },
      async url(att, { download = false } = {}) {
        const opts = download ? { download: att.original_name } : {};
        return ok(await client.storage.from('attachments').createSignedUrl(att.storage_path, 300, opts)).signedUrl;
      },
    },
    meals: {
      async create(v) { requireMe(); return ok(await t('meals').insert({ ...v, created_by: me.id }).select('id').single()); },
      async update(id, version, v) { requireMe(); const rows = ok(await t('meals').update(v).eq('id', id).eq('version', Number(version)).select('id')); if (!rows.length) throw conflict(); return { id }; },
      async remove(id, version) { requireMe(); const rows = ok(await t('meals').delete().eq('id', id).eq('version', Number(version)).select('id')); if (!rows.length) throw conflict(); return { ok: true }; },
    },
    duties: {
      async create(v) { requireMe(); return ok(await t('meal_duties').insert({ ...v, created_by: me.id }).select('id').single()); },
      async update(id, version, v) { requireMe(); const rows = ok(await t('meal_duties').update(v).eq('id', id).eq('version', Number(version)).select('id')); if (!rows.length) throw conflict(); return { id }; },
      async remove(id, version) { requireMe(); const rows = ok(await t('meal_duties').delete().eq('id', id).eq('version', Number(version)).select('id')); if (!rows.length) throw conflict(); return { ok: true }; },
    },
    admin: {
      async staff() { return ok(await t('staff').select('id,name,email,department_id,role,active,created_at').order('name')); },
      async updateStaff(id, patch) { ok(await t('staff').update(patch).eq('id', id)); return { ok: true }; },
      async roster() { return ok(await t('staff_roster').select('email,name,department_id,role,added_at').order('name')); },
      async addRoster(rows) { requireMe(); ok(await t('staff_roster').upsert(rows.map(r => ({ email: String(r.email).trim().toLowerCase(), name: String(r.name).trim(), department_id: r.department_id || null, role: r.role === 'admin' ? 'admin' : 'staff', added_by: me.id })), { onConflict: 'email' })); return { count: rows.length }; },
      async removeRoster(email) { ok(await t('staff_roster').delete().eq('email', email)); return { ok: true }; },
      async settings(patch) { ok(await t('settings').upsert(Object.entries(patch).map(([key, value]) => ({ key, value: String(value ?? '') })), { onConflict: 'key' })); return { ok: true }; },
      async addDepartment(name) { const id = 'd-' + uuid().slice(0, 8); ok(await t('departments').insert({ id, name, sort: 99 })); return { id }; },
      async renameDepartment(id, name) { ok(await t('departments').update({ name }).eq('id', id)); return { ok: true }; },
      async removeDepartment(id) { ok(await t('departments').delete().eq('id', id)); return { ok: true }; },
      async addHoliday(date, name) { requireMe(); ok(await t('holidays').upsert({ date, name, created_by: me.id }, { onConflict: 'date' })); return { date, name }; },
      async removeHoliday(date) { ok(await t('holidays').delete().eq('date', date)); return { ok: true }; },
      async logs() { return ok(await t('activity_logs_view').select('*').order('id', { ascending: false }).limit(200)); },
      async exportAll() {
        const out = { exported_at: nowISO(), schema_version: 'supabase-1' };
        for (const name of ['departments', 'staff', 'staff_roster', 'records', 'record_series', 'attachments', 'meals', 'meal_duties', 'holidays', 'settings']) out[name] = ok(await t(name).select('*'));
        return out;
      },
      async uploadLogo(file) {
        const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
        if (!['png', 'svg'].includes(ext)) throw new Error('PNG 또는 SVG 파일만 로고로 쓸 수 있습니다.');
        if (file.size > 1024 * 1024) throw new Error('로고는 1MB 이하로 올려주세요.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let width = 0, height = 0, type = ext === 'png' ? 'image/png' : 'image/svg+xml';
        if (ext === 'png') { if (![137, 80, 78, 71].every((b, i) => bytes[i] === b)) throw new Error('올바른 PNG 파일이 아닙니다.'); const dv = new DataView(bytes.buffer); width = dv.getUint32(16); height = dv.getUint32(20); }
        else { const doc = new TextDecoder().decode(bytes); if (!/<svg\b/i.test(doc.slice(0, 2000))) throw new Error('올바른 SVG 파일이 아닙니다.'); if (/<script|\son\w+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i.test(doc)) throw new Error('스크립트가 포함된 SVG는 로고로 쓸 수 없습니다.'); }
        const path = `logo-${Date.now()}.${ext}`;
        ok(await client.storage.from('branding').upload(path, file, { contentType: type, upsert: true }));
        await db.admin.settings({ logo_path: path, logo_type: type, logo_width: String(width), logo_height: String(height), logo_version: String(Date.now()) });
        return { type, width, height, pwa_icon: false };
      },
      async removeLogo() { await db.admin.settings({ logo_path: '', logo_type: '', logo_width: '0', logo_height: '0', logo_version: String(Date.now()) }); return { ok: true }; },
    },
    imports: {
      inflateRaw,
      async parse(file) { return parseTable(new Uint8Array(await file.arrayBuffer()), file.name, inflateRaw); },
      dutyContext(data) {
        const deptName = id => data.departments.find(d => d.id === id)?.name || '';
        return { user: data.user, staff: data.staff.map(s => ({ ...s, department_name: deptName(s.department_id) })), existingDuties: new Map(data.duties.map(d => [d.date, d])), holidays: new Map(data.holidays.map(h => [h.date, h.name])) };
      },
      scheduleContext(data) {
        return { user: data.user, departments: data.departments, existingRecords: new Map(data.records.filter(r => !r.deleted_at).map(r => [recordKey(r.kind, r.event_date, r.title), r])), holidays: new Map(data.holidays.map(h => [h.date, h.name])) };
      },
      previewDuties(data, table) { return previewDuties(db.imports.dutyContext(data), table); },
      previewSchedule(data, table) { return previewSchedule(db.imports.scheduleContext(data), table); },
      async commitDuties(rows, options = {}) { return ok(await client.rpc('import_duties', { rows, duplicate: options.duplicate || 'skip', skip_invalid: !!options.skip_invalid, include_empty: !!options.include_empty })); },
      async commitSchedule(rows, options = {}) { return ok(await client.rpc('import_schedule', { rows, duplicate: options.duplicate || 'skip', skip_invalid: !!options.skip_invalid })); },
      dutyTemplate(month, data) { return dutyTemplate(month, (data?.holidays || []).map(h => h.date)); },
      scheduleTemplate,
    },
  };
  return db;
}

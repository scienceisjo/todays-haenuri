-- =====================================================================
-- 오늘의 해누리 · Supabase 설치 SQL  (v1.0)
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run 한 번.
-- 다시 실행해도 안전하도록(if not exists / or replace) 작성했습니다.
--
-- ★ 실행 전에 아래 한 줄의 이메일을 본인(관리자) 이메일로 바꿔 주세요. 비워 두면 "첫 번째로 가입하는 사람"이 관리자가 됩니다.
-- ★ 실행 뒤: Authentication → Providers → Email → "Confirm email" 을 끕니다(명단으로 가입을 제한하므로 이메일 확인 불필요).
-- =====================================================================
create extension if not exists pgcrypto;

create table if not exists public.settings (key text primary key, value text not null);
-- ★ 관리자 이메일: 아래 따옴표 안에 적으세요. 이 이메일로 가입하면 관리자가 됩니다(비우면 첫 가입자가 관리자).
insert into public.settings (key, value) values ('bootstrap_admin_email', lower(trim('')))
on conflict (key) do update set value = excluded.value;
insert into public.settings (key, value) values ('school_name','해누리중학교'), ('app_name','오늘의 해누리') on conflict (key) do nothing;

-- ---------- 1. 부서 / 교직원 명단 / 교직원 ----------
create table if not exists public.departments (
  id text primary key,
  name text not null unique,
  sort int not null default 0
);
insert into public.departments (id, name, sort) values
  ('academic','교무업무지원팀',1),('research','교육연구지원팀',2),('life','학생생활부',3),('sports','체육안전부',4),
  ('info','과학정보부',5),('character','창의인성부',6),('grade1','1학년부',7),('grade2','2학년부',8),('grade3','3학년부',9),
  ('career','진로진학부',10),('counsel','상담복지부',11),('learning','학력신장부',12),('office','행정실',13),('facility','시설관리과',14)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- 교직원 명단(가입 허용 목록). 다른 앱의 roster(학생 명단)와 겹치지 않도록 staff_roster 로 둔다.
create table if not exists public.staff_roster (
  email text primary key check (email = lower(email) and email ~ '^\S+@\S+\.\S+$'),
  name text not null check (length(name) between 1 and 60),
  department_id text references public.departments(id),
  role text not null default 'staff' check (role in ('staff','admin')),
  added_by uuid,
  added_at timestamptz not null default now()
);

-- 가입을 마친 교직원(auth.users 와 1:1)
create table if not exists public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null check (length(name) between 1 and 60),
  department_id text references public.departments(id),
  role text not null default 'staff' check (role in ('staff','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 2. 권한 도우미 (security definer: 정책 안에서 staff 를 읽어도 재귀 없음) ----------
create or replace function public.is_active_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and active);
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and active and role = 'admin');
$$;
create or replace function public.my_department() returns text
language sql stable security definer set search_path = public as $$
  select department_id from public.staff where id = auth.uid();
$$;

-- ---------- 3. 가입 규칙 ----------
-- bootstrap_admin_email 이 정해져 있으면 그 이메일은 언제나 관리자로 가입된다.
-- 비어 있으면 첫 가입자가 관리자. 그 밖에는 명단(roster)에 있는 이메일만 가입할 수 있다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.staff_roster%rowtype; first_user boolean; boot text; is_boot boolean; nm text; dep text; rl text;
begin
  select value into boot from public.settings where key = 'bootstrap_admin_email';
  boot := nullif(lower(trim(coalesce(boot, ''))), '');
  is_boot := boot is not null and lower(new.email) = boot;
  select not exists (select 1 from public.staff) into first_user;
  select * into r from public.staff_roster where email = lower(new.email);
  if not found and not is_boot and not (first_user and boot is null) then
    raise exception '교직원 명단에 없는 이메일입니다. 관리자에게 등록을 요청해주세요.';
  end if;
  nm := coalesce(r.name, nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1));
  dep := coalesce(r.department_id, nullif(new.raw_user_meta_data->>'department_id', ''));
  if dep is not null and not exists (select 1 from public.departments where id = dep) then dep := null; end if;
  rl := case when is_boot or (first_user and boot is null) then 'admin' else coalesce(r.role, 'staff') end;
  begin
    insert into public.staff (id, email, name, department_id, role) values (new.id, lower(new.email), left(nm, 60), dep, rl);
  exception when others then
    raise exception 'staff 생성 실패: % [%]', sqlerrm, sqlstate;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- 가입 화면에서 미리 확인(익명 호출 가능): 이 이메일로 가입할 수 있는가
create or replace function public.can_register(p_email text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.staff_roster%rowtype; first_user boolean; boot text; e text := lower(trim(coalesce(p_email,'')));
begin
  if exists (select 1 from public.staff where email = e) then return jsonb_build_object('ok', false, 'reason', '이미 가입된 이메일입니다. 로그인해주세요.'); end if;
  select value into boot from public.settings where key = 'bootstrap_admin_email';
  boot := nullif(lower(trim(coalesce(boot, ''))), '');
  select not exists (select 1 from public.staff) into first_user;
  if (boot is not null and e = boot) or (first_user and boot is null) then return jsonb_build_object('ok', true, 'admin', true); end if;
  select * into r from public.staff_roster where email = e;
  if not found then return jsonb_build_object('ok', false, 'reason', '교직원 명단에 없는 이메일입니다. 관리자에게 등록을 요청해주세요.'); end if;
  return jsonb_build_object('ok', true, 'name', r.name, 'department_id', r.department_id);
end $$;
grant execute on function public.can_register(text) to anon, authenticated;

-- ---------- 4. 업무 자료 표 ----------
create table if not exists public.record_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  rule jsonb not null,
  created_by uuid not null default auth.uid() references public.staff(id),
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('notice','event','broadcast','academic','deadline','special')),
  title text not null check (length(title) between 1 and 160),
  content text not null default '' check (length(content) <= 20000),
  channel text not null default 'department' check (channel in ('all','department')),
  department_id text references public.departments(id),
  target_department_id text references public.departments(id),
  importance text not null default 'normal' check (importance in ('normal','important','urgent')),
  state text not null default 'published' check (state in ('draft','published','hidden')),
  publish_at timestamptz not null default now(),
  expire_at timestamptz,
  event_date date,
  end_date date,
  start_time text check (start_time is null or start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  end_time text check (end_time is null or end_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  location text not null default '' check (length(location) <= 200),
  link text not null default '' check (link = '' or link ~* '^https?://'),
  series_id uuid references public.record_series(id) on delete set null,
  series_index int,
  created_by uuid not null default auth.uid() references public.staff(id),
  updated_by uuid not null default auth.uid() references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version int not null default 1,
  constraint records_expire_after_publish check (expire_at is null or expire_at > publish_at),
  constraint records_end_after_start check (end_date is null or event_date is null or end_date >= event_date),
  constraint records_date_required check (kind = 'notice' or event_date is not null)
);
create index if not exists records_display_idx on public.records (state, deleted_at, publish_at);
create index if not exists records_date_idx on public.records (event_date);
create index if not exists records_series_idx on public.records (series_id);

create table if not exists public.record_reads (
  record_id uuid not null references public.records(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.staff(id) on delete cascade,
  record_version int not null,
  read_at timestamptz not null default now(),
  primary key (record_id, user_id)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  original_name text not null check (length(original_name) between 1 and 180),
  mime text not null,
  byte_size int not null check (byte_size > 0 and byte_size <= 10485760),
  storage_path text not null unique,
  created_by uuid not null default auth.uid() references public.staff(id),
  created_at timestamptz not null default now()
);
create index if not exists attachments_record_idx on public.attachments (record_id);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  menu text not null check (length(menu) between 1 and 3000),
  allergens text not null default '' check (length(allergens) <= 1000),
  note text not null default '' check (length(note) <= 1000),
  created_by uuid not null default auth.uid() references public.staff(id),
  updated_at timestamptz not null default now(),
  version int not null default 1
);

-- 급식지도: 날짜마다 '식당 입구' 1명 + '식당 내부' 1명, 정확히 두 자리
create table if not exists public.meal_duties (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  entrance_staff_id uuid references public.staff(id),
  inside_staff_id uuid references public.staff(id),
  note text not null default '' check (length(note) <= 1000),
  publish_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.staff(id),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  constraint duties_two_different_people check (entrance_staff_id is null or inside_staff_id is null or entrance_staff_id <> inside_staff_id)
);

create table if not exists public.holidays (
  date date primary key,
  name text not null default '' check (length(name) <= 100),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigserial primary key,
  user_id uuid,
  action text not null,
  entity_id text,
  detail text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- 5. 트리거: 버전 올리기, 삭제/복구 규칙, 재직자 검사, 첨부 변경 시 안내 버전 올리기, 변경 기록 ----------
create or replace function public.bump_version() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then new.updated_by := coalesce(auth.uid(), old.updated_by); end if;
  return new;
end $$;
drop trigger if exists records_bump on public.records;
create trigger records_bump before update on public.records for each row execute function public.bump_version();
drop trigger if exists meals_bump on public.meals;
create trigger meals_bump before update on public.meals for each row execute function public.bump_version();
drop trigger if exists duties_bump on public.meal_duties;
create trigger duties_bump before update on public.meal_duties for each row execute function public.bump_version();

create or replace function public.records_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is not null and new.deleted_at is null and not public.is_admin() then
    raise exception '삭제된 안내는 관리자만 복구할 수 있습니다.';
  end if;
  if old.deleted_at is not null and new.deleted_at is not null and
     (new.title, new.content, new.state, new.event_date, new.end_date, new.start_time, new.end_time, new.location, new.link, new.kind, new.importance, new.channel)
     is distinct from (old.title, old.content, old.state, old.event_date, old.end_date, old.start_time, old.end_time, old.location, old.link, old.kind, old.importance, old.channel) then
    raise exception '먼저 보관함에서 복구해주세요.';
  end if;
  if new.created_by <> old.created_by then raise exception '작성자는 바꿀 수 없습니다.'; end if;
  return new;
end $$;
drop trigger if exists records_guard_tr on public.records;
create trigger records_guard_tr before update on public.records for each row execute function public.records_guard();

create or replace function public.duties_check_staff() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.entrance_staff_id is not null and not exists (select 1 from public.staff where id = new.entrance_staff_id and active) then
    raise exception '현재 재직 중인 교직원을 선택해주세요.';
  end if;
  if new.inside_staff_id is not null and not exists (select 1 from public.staff where id = new.inside_staff_id and active) then
    raise exception '현재 재직 중인 교직원을 선택해주세요.';
  end if;
  return new;
end $$;
drop trigger if exists duties_check_staff_tr on public.meal_duties;
create trigger duties_check_staff_tr before insert or update on public.meal_duties for each row execute function public.duties_check_staff();

create or replace function public.attachments_touch_record() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.records set updated_at = now() where id = coalesce(new.record_id, old.record_id);
  return coalesce(new, old);
end $$;
drop trigger if exists attachments_touch_tr on public.attachments;
create trigger attachments_touch_tr after insert or delete on public.attachments for each row execute function public.attachments_touch_record();

create or replace function public.log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare act text; ent text; det text; rec jsonb; prev jsonb;
begin
  begin
    rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    prev := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    act := tg_table_name || '_' || lower(tg_op);
    if tg_table_name = 'records' and tg_op = 'UPDATE' then
      if (prev->>'deleted_at') is null and (rec->>'deleted_at') is not null then act := 'records_delete';
      elsif (prev->>'deleted_at') is not null and (rec->>'deleted_at') is null then act := 'records_restore'; end if;
    end if;
    ent := case when tg_table_name = 'attachments' then rec->>'record_id' else coalesce(rec->>'id', rec->>'date', rec->>'key', rec->>'email') end;
    det := case tg_table_name
             when 'records' then rec->>'title'
             when 'meals' then rec->>'date'
             when 'meal_duties' then rec->>'date'
             when 'holidays' then rec->>'name'
             when 'settings' then case when (rec->>'key') like 'bootstrap%' then '' else rec->>'value' end
             when 'attachments' then rec->>'original_name'
             when 'staff' then rec->>'name'
             when 'staff_roster' then rec->>'name'
             when 'record_series' then rec->>'title'
             else '' end;
    insert into public.activity_logs (user_id, action, entity_id, detail) values (auth.uid(), act, ent, left(coalesce(det, ''), 200));
  exception when others then
    null; -- 기록 실패는 무시
  end;
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['records','meals','meal_duties','holidays','settings','attachments','staff','staff_roster','record_series'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()', t || '_log', t);
  end loop;
end $$;

-- ---------- 6. 조회용 뷰 (RLS 는 원본 표 기준으로 적용: security_invoker) ----------
create or replace view public.records_view with (security_invoker = on) as
select r.*,
       s.name as author_name,
       d.name as department_name,
       (select count(*) from public.records r2 where r2.series_id = r.series_id and r2.deleted_at is null) as series_total,
       exists (select 1 from public.record_reads rr where rr.record_id = r.id and rr.user_id = auth.uid() and rr.record_version = r.version) as read
from public.records r
join public.staff s on s.id = r.created_by
left join public.departments d on d.id = r.department_id;

create or replace view public.duties_view with (security_invoker = on) as
select m.*, a.name as entrance_name, b.name as inside_name
from public.meal_duties m
left join public.staff a on a.id = m.entrance_staff_id
left join public.staff b on b.id = m.inside_staff_id;

create or replace view public.activity_logs_view with (security_invoker = on) as
select l.*, s.name as user_name from public.activity_logs l left join public.staff s on s.id = l.user_id;

-- ---------- 7. 행 수준 보안(RLS) ----------
alter table public.departments enable row level security;
alter table public.staff_roster enable row level security;
alter table public.staff enable row level security;
alter table public.record_series enable row level security;
alter table public.records enable row level security;
alter table public.record_reads enable row level security;
alter table public.attachments enable row level security;
alter table public.meals enable row level security;
alter table public.meal_duties enable row level security;
alter table public.holidays enable row level security;
alter table public.settings enable row level security;
alter table public.activity_logs enable row level security;

-- 정책을 다시 만들 수 있게 먼저 지운다
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('departments','staff_roster','staff','record_series','records','record_reads','attachments','meals','meal_duties','holidays','settings','activity_logs') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 부서: 모두 읽기, 관리자만 변경
create policy departments_read on public.departments for select to anon, authenticated using (true);
create policy departments_admin on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 명단: 관리자만
create policy staff_roster_admin on public.staff_roster for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 교직원: 재직자는 모두 읽기(이름·부서 표시용), 관리자는 변경
create policy staff_read on public.staff for select to authenticated using (public.is_active_staff() or id = auth.uid());
create policy staff_admin_update on public.staff for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 안내: 공개 조건을 만족하거나, 내가 쓴 것, 관리자
create policy records_select on public.records for select to authenticated using (
  public.is_active_staff() and (
    created_by = auth.uid() or public.is_admin() or (
      deleted_at is null and state = 'published' and publish_at <= now() and (expire_at is null or expire_at > now())
      and (target_department_id is null or target_department_id = public.my_department())
    )
  )
);
create policy records_insert on public.records for insert to authenticated with check (public.is_active_staff() and created_by = auth.uid());
create policy records_update on public.records for update to authenticated
  using (public.is_active_staff() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_active_staff() and (created_by = auth.uid() or public.is_admin()));
-- 삭제는 soft delete(update) 만 허용. 물리 삭제 정책 없음.

create policy series_select on public.record_series for select to authenticated using (public.is_active_staff());
create policy series_insert on public.record_series for insert to authenticated with check (public.is_active_staff() and created_by = auth.uid());
create policy series_change on public.record_series for update to authenticated using (created_by = auth.uid() or public.is_admin());

-- 읽음: 본인 행만
create policy reads_own on public.record_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 첨부: 안내를 볼 수 있으면 목록 읽기, 안내 작성자·관리자만 추가/삭제
create or replace function public.can_view_record(p_record uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.records r where r.id = p_record and public.is_active_staff() and (
      r.created_by = auth.uid() or public.is_admin() or (
        r.deleted_at is null and r.state = 'published' and r.publish_at <= now() and (r.expire_at is null or r.expire_at > now())
        and (r.target_department_id is null or r.target_department_id = public.my_department())))
  );
$$;
create or replace function public.can_edit_record(p_record uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.records r where r.id = p_record and r.deleted_at is null and public.is_active_staff() and (r.created_by = auth.uid() or public.is_admin()));
$$;
create policy attachments_select on public.attachments for select to authenticated using (public.can_view_record(record_id));
create policy attachments_insert on public.attachments for insert to authenticated with check (public.can_edit_record(record_id) and created_by = auth.uid());
create policy attachments_delete on public.attachments for delete to authenticated using (public.can_edit_record(record_id));

-- 급식: 재직자 모두 읽기, 작성자·관리자 변경
create policy meals_select on public.meals for select to authenticated using (public.is_active_staff());
create policy meals_insert on public.meals for insert to authenticated with check (public.is_active_staff() and created_by = auth.uid());
create policy meals_update on public.meals for update to authenticated using (created_by = auth.uid() or public.is_admin());
create policy meals_delete on public.meals for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- 급식지도: 공개 시각이 지난 것 + 내 것 + 관리자
create policy duties_select on public.meal_duties for select to authenticated using (public.is_active_staff() and (publish_at <= now() or created_by = auth.uid() or public.is_admin()));
create policy duties_insert on public.meal_duties for insert to authenticated with check (public.is_active_staff() and created_by = auth.uid());
create policy duties_update on public.meal_duties for update to authenticated using (created_by = auth.uid() or public.is_admin());
create policy duties_delete on public.meal_duties for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- 휴업일: 모두 읽기, 관리자만 변경
create policy holidays_select on public.holidays for select to authenticated using (public.is_active_staff());
create policy holidays_admin on public.holidays for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 설정: 로그인 화면(학교명·앱 이름·로고)에도 필요하므로 누구나 읽기, 관리자만 변경.
-- 예외: 관리자 이메일은 관리자만, 공용 계정 이메일(shared_login_email)은 로그인한 교직원만 읽는다.
create policy settings_read on public.settings for select to anon, authenticated
  using (public.is_admin() or (key <> 'bootstrap_admin_email' and (key <> 'shared_login_email' or auth.uid() is not null)));
create policy settings_admin on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 변경 기록: 관리자만 읽기(쓰기는 트리거가 함)
create policy logs_admin_read on public.activity_logs for select to authenticated using (public.is_admin());

-- ---------- 8. 파일 저장소 ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments','attachments', false, 10485760), ('branding','branding', true, 1048576)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists attachments_storage_read on storage.objects;
drop policy if exists attachments_storage_insert on storage.objects;
drop policy if exists attachments_storage_delete on storage.objects;
drop policy if exists branding_storage_read on storage.objects;
drop policy if exists branding_storage_admin on storage.objects;
-- 첨부 파일 경로 = <안내 id>/<파일 id>.<확장자>
create policy attachments_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_view_record((split_part(name, '/', 1))::uuid));
create policy attachments_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_edit_record((split_part(name, '/', 1))::uuid)
              and lower(reverse(split_part(reverse(name), '.', 1))) in ('pdf','png','jpg','jpeg','webp','xlsx','xls','hwp','hwpx','doc','docx','txt','csv'));
create policy attachments_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.can_edit_record((split_part(name, '/', 1))::uuid));
create policy branding_storage_read on storage.objects for select to anon, authenticated using (bucket_id = 'branding');
create policy branding_storage_admin on storage.objects for all to authenticated using (bucket_id = 'branding' and public.is_admin()) with check (bucket_id = 'branding' and public.is_admin());

-- ---------- 9. 일괄 등록(원자적 저장) ----------
-- 미리 보기는 화면(JS)에서, 저장은 여기서 다시 검증한다. 오류가 있고 skip_invalid 가 아니면 아무것도 저장하지 않는다.
create or replace function public.import_duties(rows jsonb, duplicate text default 'skip', skip_invalid boolean default false, include_empty boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; n int; errs jsonb := '[]'::jsonb; plan jsonb := '[]'::jsonb; seen date[] := '{}';
  d date; e uuid; i uuid; nt text; pub timestamptz; msg text; ex public.meal_duties%rowtype;
  created int := 0; updated int := 0; skipped int := 0; me uuid := auth.uid();
begin
  if not public.is_active_staff() then raise exception '로그인이 필요합니다.'; end if;
  if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then raise exception '저장할 행이 없습니다.'; end if;
  if jsonb_array_length(rows) > 500 then raise exception '한 번에 500행까지 저장할 수 있습니다.'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    n := coalesce((r->>'n')::int, 0); msg := null;
    begin d := (r->>'date')::date; exception when others then d := null; end;
    if d is null then msg := '날짜를 올바르게 입력해주세요.'; end if;
    begin
      e := nullif(coalesce(r#>>'{entrance,id}', r->>'entrance_staff_id'), '')::uuid;
      i := nullif(coalesce(r#>>'{inside,id}', r->>'inside_staff_id'), '')::uuid;
    exception when others then e := null; i := null; msg := coalesce(msg, '교직원 정보를 확인해주세요.'); end;
    if msg is null and e is not null and not exists (select 1 from public.staff where id = e and active) then msg := '현재 재직 중인 교직원만 지정할 수 있습니다.'; end if;
    if msg is null and i is not null and not exists (select 1 from public.staff where id = i and active) then msg := '현재 재직 중인 교직원만 지정할 수 있습니다.'; end if;
    if msg is null and e is not null and e = i then msg := '식당 입구와 식당 내부에 같은 사람을 지정할 수 없습니다.'; end if;
    nt := left(coalesce(r->>'note',''), 1000);
    begin pub := coalesce((r->>'publish_at')::timestamptz, now()); exception when others then pub := null; end;
    if msg is null and pub is null then msg := '공개 시각을 확인해주세요.'; end if;
    if msg is null and d = any(seen) then msg := '파일 안에 같은 날짜가 두 번 있습니다.'; end if;
    if msg is not null then errs := errs || jsonb_build_object('n', n, 'message', msg); continue; end if;
    seen := seen || d;
    if e is null and i is null and nt = '' and not include_empty then skipped := skipped + 1; continue; end if;
    select * into ex from public.meal_duties where date = d;
    if found then
      if duplicate <> 'update' then skipped := skipped + 1; continue; end if;
      if ex.created_by <> me and not public.is_admin() then errs := errs || jsonb_build_object('n', n, 'message', d::text || ': 기존 자료는 작성자 또는 관리자만 수정할 수 있습니다.'); continue; end if;
      plan := plan || jsonb_build_object('update', ex.id, 'date', d, 'e', e, 'i', i, 'note', nt, 'pub', pub);
    else
      plan := plan || jsonb_build_object('date', d, 'e', e, 'i', i, 'note', nt, 'pub', pub);
    end if;
  end loop;
  if jsonb_array_length(errs) > 0 and not skip_invalid then
    return jsonb_build_object('rejected', true, 'created', 0, 'updated', 0, 'skipped', skipped, 'errors', errs);
  end if;
  for r in select * from jsonb_array_elements(plan) loop
    if r ? 'update' then
      update public.meal_duties set entrance_staff_id = nullif(r->>'e','')::uuid, inside_staff_id = nullif(r->>'i','')::uuid, note = r->>'note', publish_at = (r->>'pub')::timestamptz
       where id = (r->>'update')::uuid;
      updated := updated + 1;
    else
      insert into public.meal_duties (date, entrance_staff_id, inside_staff_id, note, publish_at, created_by)
      values ((r->>'date')::date, nullif(r->>'e','')::uuid, nullif(r->>'i','')::uuid, r->>'note', (r->>'pub')::timestamptz, me);
      created := created + 1;
    end if;
  end loop;
  insert into public.activity_logs (user_id, action, entity_id, detail) values (me, 'duties_import', '', format('등록 %s · 갱신 %s · 건너뜀 %s', created, updated, skipped));
  return jsonb_build_object('rejected', false, 'created', created, 'updated', updated, 'skipped', skipped, 'errors', errs);
end $$;
grant execute on function public.import_duties(jsonb, text, boolean, boolean) to authenticated;

create or replace function public.import_schedule(rows jsonb, duplicate text default 'skip', skip_invalid boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; n int; errs jsonb := '[]'::jsonb; plan jsonb := '[]'::jsonb; seen text[] := '{}'; key text;
  kind text; title text; d date; ed date; st text; et text; imp text; loc text; cont text; msg text;
  ex public.records%rowtype; created int := 0; updated int := 0; skipped int := 0; hol int := 0; me uuid := auth.uid(); mydep text;
begin
  if not public.is_active_staff() then raise exception '로그인이 필요합니다.'; end if;
  if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then raise exception '저장할 행이 없습니다.'; end if;
  if jsonb_array_length(rows) > 500 then raise exception '한 번에 500행까지 저장할 수 있습니다.'; end if;
  mydep := public.my_department();
  for r in select * from jsonb_array_elements(rows) loop
    n := coalesce((r->>'n')::int, 0); msg := null; ed := null;
    if coalesce((r->>'empty')::boolean, false) then skipped := skipped + 1; continue; end if;
    kind := r->>'kind'; title := left(trim(coalesce(r->>'title','')), 160);
    begin d := (r->>'date')::date; exception when others then d := null; end;
    if d is null then msg := '날짜를 올바르게 입력해주세요.'; end if;
    if kind = 'holiday' then
      if msg is null and not public.is_admin() then msg := '휴업일은 관리자만 등록할 수 있습니다.'; end if;
      key := 'holiday|' || coalesce(d::text,'');
      if msg is null and key = any(seen) then msg := d::text || ': 파일 안에 같은 휴업일이 두 번 있습니다.'; end if;
      if msg is not null then errs := errs || jsonb_build_object('n', n, 'message', msg); continue; end if;
      seen := seen || key;
      if exists (select 1 from public.holidays where date = d) and duplicate <> 'update' then skipped := skipped + 1; continue; end if;
      plan := plan || jsonb_build_object('holiday', true, 'date', d, 'name', left(title, 100));
      continue;
    end if;
    if msg is null and kind not in ('notice','event','broadcast','academic','deadline','special') then msg := '유형을 확인해주세요.'; end if;
    if msg is null and title = '' then msg := '제목을 입력해주세요.'; end if;
    begin ed := nullif(r->>'end_date','')::date; exception when others then ed := null; msg := coalesce(msg, '종료 날짜 형식을 확인해주세요.'); end;
    if msg is null and ed is not null and ed < d then msg := '종료 날짜를 확인해주세요.'; end if;
    st := nullif(r->>'start_time',''); et := nullif(r->>'end_time','');
    if msg is null and st is not null and st !~ '^([01]\d|2[0-3]):[0-5]\d$' then msg := '시작 시간 형식을 확인해주세요.'; end if;
    if msg is null and et is not null and et !~ '^([01]\d|2[0-3]):[0-5]\d$' then msg := '종료 시간 형식을 확인해주세요.'; end if;
    if msg is null and st is not null and et is not null and coalesce(ed, d) = d and et <= st then msg := '종료 시간은 시작 시간보다 뒤여야 합니다.'; end if;
    imp := coalesce(nullif(r->>'importance',''), 'normal');
    if msg is null and imp not in ('normal','important','urgent') then msg := '중요도를 확인해주세요.'; end if;
    loc := left(coalesce(r->>'location',''), 200); cont := left(coalesce(r->>'content',''), 20000);
    key := kind || '|' || coalesce(d::text,'') || '|' || regexp_replace(title, '\s+', '', 'g');
    if msg is null and key = any(seen) then msg := d::text || ' ' || title || ': 파일 안에 같은 일정이 두 번 있습니다.'; end if;
    if msg is not null then errs := errs || jsonb_build_object('n', n, 'message', msg); continue; end if;
    seen := seen || key;
    select * into ex from public.records where deleted_at is null and records.kind = import_schedule.kind and records.title = import_schedule.title and event_date = d limit 1;
    if found then
      if duplicate <> 'update' then skipped := skipped + 1; continue; end if;
      if ex.created_by <> me and not public.is_admin() then errs := errs || jsonb_build_object('n', n, 'message', d::text || ' ' || title || ': 기존 자료는 작성자 또는 관리자만 수정할 수 있습니다.'); continue; end if;
      plan := plan || jsonb_build_object('update', ex.id, 'title', title, 'content', cont, 'date', d, 'end_date', coalesce(ed, d), 'st', st, 'et', et, 'imp', imp, 'loc', loc, 'kind', kind);
    else
      plan := plan || jsonb_build_object('title', title, 'content', cont, 'date', d, 'end_date', coalesce(ed, d), 'st', st, 'et', et, 'imp', imp, 'loc', loc, 'kind', kind);
    end if;
  end loop;
  if jsonb_array_length(errs) > 0 and not skip_invalid then
    return jsonb_build_object('rejected', true, 'created', 0, 'updated', 0, 'skipped', skipped, 'holidays', 0, 'errors', errs);
  end if;
  for r in select * from jsonb_array_elements(plan) loop
    if r ? 'holiday' then
      insert into public.holidays (date, name, created_by) values ((r->>'date')::date, r->>'name', me)
      on conflict (date) do update set name = excluded.name;
      hol := hol + 1;
    elsif r ? 'update' then
      update public.records set title = r->>'title', content = r->>'content', event_date = (r->>'date')::date, end_date = (r->>'end_date')::date,
        start_time = r->>'st', end_time = r->>'et', importance = r->>'imp', location = r->>'loc', kind = r->>'kind'
       where id = (r->>'update')::uuid;
      updated := updated + 1;
    else
      insert into public.records (kind, title, content, channel, department_id, importance, state, publish_at, event_date, end_date, start_time, end_time, location, created_by, updated_by)
      values (r->>'kind', r->>'title', r->>'content', 'all', mydep, r->>'imp', 'published', now(), (r->>'date')::date, (r->>'end_date')::date, r->>'st', r->>'et', r->>'loc', me, me);
      created := created + 1;
    end if;
  end loop;
  insert into public.activity_logs (user_id, action, entity_id, detail) values (me, 'schedule_import', '', format('등록 %s · 갱신 %s · 휴업일 %s · 건너뜀 %s', created, updated, hol, skipped));
  return jsonb_build_object('rejected', false, 'created', created, 'updated', updated, 'skipped', skipped, 'holidays', hol, 'errors', errs);
end $$;
grant execute on function public.import_schedule(jsonb, text, boolean) to authenticated;

-- ---------- 10. 반복 일정 등록(원자적: 시리즈 + 회차 N개) ----------
create or replace function public.create_series(base jsonb, dates jsonb, rule jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sid uuid; me uuid := auth.uid(); idx int := 0; d text; span int; ids uuid[] := '{}'; nid uuid;
begin
  if not public.is_active_staff() then raise exception '로그인이 필요합니다.'; end if;
  if jsonb_typeof(dates) <> 'array' or jsonb_array_length(dates) = 0 then raise exception '반복 조건에 맞는 날짜가 없습니다.'; end if;
  if jsonb_array_length(dates) > 200 then raise exception '반복은 최대 200회까지 만들 수 있습니다.'; end if;
  if (base->>'kind') = 'notice' then raise exception '반복 일정에는 날짜가 필요합니다. 공지사항이 아닌 일정 유형을 선택해주세요.'; end if;
  insert into public.record_series (title, rule, created_by) values (base->>'title', rule, me) returning id into sid;
  span := coalesce(((base->>'end_date')::date - (base->>'event_date')::date), 0);
  for d in select value #>> '{}' from jsonb_array_elements(dates) loop
    insert into public.records (kind, title, content, channel, department_id, target_department_id, importance, state, publish_at, expire_at,
                                event_date, end_date, start_time, end_time, location, link, series_id, series_index, created_by, updated_by)
    values (base->>'kind', base->>'title', coalesce(base->>'content',''), coalesce(base->>'channel','department'), nullif(base->>'department_id',''), nullif(base->>'target_department_id',''),
            coalesce(base->>'importance','normal'), coalesce(base->>'state','published'), coalesce((base->>'publish_at')::timestamptz, now()), (base->>'expire_at')::timestamptz,
            d::date, d::date + span, nullif(base->>'start_time',''), nullif(base->>'end_time',''), coalesce(base->>'location',''), coalesce(base->>'link',''), sid, idx, me, me)
    returning id into nid;
    ids := ids || nid; idx := idx + 1;
  end loop;
  return jsonb_build_object('series_id', sid, 'count', idx, 'id', ids[1]);
end $$;
grant execute on function public.create_series(jsonb, jsonb, jsonb) to authenticated;

-- ---------- 11. 서버 시각(한국 날짜 판단용) ----------
create or replace function public.server_time() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_time() to anon, authenticated;

-- ---------- 12. 안내 수정·취소 (버전 충돌 검사 + 반복 일정 범위: single / following / all) ----------
create or replace function public.update_record(p_id uuid, p_version int, patch jsonb, scope text default 'single')
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur public.records%rowtype; me uuid := auth.uid(); cnt int := 1;
begin
  if not public.is_active_staff() then raise exception '로그인이 필요합니다.'; end if;
  select * into cur from public.records where id = p_id;
  if not found then raise exception '자료를 찾을 수 없습니다.'; end if;
  if cur.created_by <> me and not public.is_admin() then raise exception '작성자 또는 관리자만 변경할 수 있습니다.'; end if;
  if cur.version <> p_version then raise exception '다른 사람이 먼저 수정했습니다. 새로고침한 뒤 다시 확인해주세요.'; end if;
  if cur.deleted_at is not null then raise exception '먼저 보관함에서 복구해주세요.'; end if;
  update public.records set
    kind = coalesce(patch->>'kind', kind),
    title = coalesce(patch->>'title', title),
    content = coalesce(patch->>'content', content),
    channel = coalesce(patch->>'channel', channel),
    department_id = case when patch ? 'department_id' then nullif(patch->>'department_id','') else department_id end,
    target_department_id = case when patch ? 'target_department_id' then nullif(patch->>'target_department_id','') else target_department_id end,
    importance = coalesce(patch->>'importance', importance),
    state = coalesce(patch->>'state', state),
    publish_at = coalesce((patch->>'publish_at')::timestamptz, publish_at),
    expire_at = case when patch ? 'expire_at' then nullif(patch->>'expire_at','')::timestamptz else expire_at end,
    event_date = case when patch ? 'event_date' then nullif(patch->>'event_date','')::date else event_date end,
    end_date = case when patch ? 'end_date' then nullif(patch->>'end_date','')::date else end_date end,
    start_time = case when patch ? 'start_time' then nullif(patch->>'start_time','') else start_time end,
    end_time = case when patch ? 'end_time' then nullif(patch->>'end_time','') else end_time end,
    location = coalesce(patch->>'location', location),
    link = coalesce(patch->>'link', link)
  where id = p_id;
  if cur.series_id is not null and scope in ('following','all') then
    -- 다른 회차에는 날짜·게시 시각·게시 종료를 제외한 내용만 적용해 각 회차의 날짜를 보존한다
    update public.records set
      title = coalesce(patch->>'title', title), content = coalesce(patch->>'content', content), channel = coalesce(patch->>'channel', channel),
      department_id = case when patch ? 'department_id' then nullif(patch->>'department_id','') else department_id end,
      target_department_id = case when patch ? 'target_department_id' then nullif(patch->>'target_department_id','') else target_department_id end,
      importance = coalesce(patch->>'importance', importance), state = coalesce(patch->>'state', state),
      start_time = case when patch ? 'start_time' then nullif(patch->>'start_time','') else start_time end,
      end_time = case when patch ? 'end_time' then nullif(patch->>'end_time','') else end_time end,
      location = coalesce(patch->>'location', location), link = coalesce(patch->>'link', link)
    where series_id = cur.series_id and deleted_at is null and id <> p_id and (scope = 'all' or event_date >= cur.event_date);
    get diagnostics cnt = row_count; cnt := cnt + 1;
    insert into public.activity_logs (user_id, action, entity_id, detail) values (me, 'series_update', cur.series_id::text, format('%s · %s회차', coalesce(patch->>'title', cur.title), cnt));
  end if;
  return jsonb_build_object('ok', true, 'count', cnt);
end $$;
grant execute on function public.update_record(uuid, int, jsonb, text) to authenticated;

create or replace function public.delete_record(p_id uuid, p_version int, scope text default 'single')
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur public.records%rowtype; me uuid := auth.uid(); cnt int := 1;
begin
  if not public.is_active_staff() then raise exception '로그인이 필요합니다.'; end if;
  select * into cur from public.records where id = p_id;
  if not found then raise exception '자료를 찾을 수 없습니다.'; end if;
  if cur.created_by <> me and not public.is_admin() then raise exception '작성자 또는 관리자만 변경할 수 있습니다.'; end if;
  if cur.version <> p_version then raise exception '다른 사람이 먼저 수정했습니다. 새로고침한 뒤 다시 확인해주세요.'; end if;
  update public.records set deleted_at = now() where id = p_id and deleted_at is null;
  if cur.series_id is not null and scope in ('following','all') then
    update public.records set deleted_at = now()
     where series_id = cur.series_id and deleted_at is null and id <> p_id and (scope = 'all' or event_date >= cur.event_date);
    get diagnostics cnt = row_count; cnt := cnt + 1;
    insert into public.activity_logs (user_id, action, entity_id, detail) values (me, 'series_delete', cur.series_id::text, format('%s · %s회차', cur.title, cnt));
  end if;
  return jsonb_build_object('ok', true, 'count', cnt);
end $$;
grant execute on function public.delete_record(uuid, int, text) to authenticated;

-- 완료.

-- 다음: Authentication → Providers → Email 에서 "Confirm email" 끄기 → 앱에서 관리자 이메일로 가입 → 학교 설정에서 교직원 명단 등록.

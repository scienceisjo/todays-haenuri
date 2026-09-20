-- =====================================================================
-- 가입 오류 수정 SQL (v2) — schema.sql 을 이미 실행한 프로젝트용. 전체를 SQL Editor 에 붙여 넣고 Run.
-- 원인: 이 프로젝트에 다른 앱의 `roster`(학생 명단) 표가 이미 있어서, 교직원 명단 표가 만들어지지 않았음.
-- 조치: 교직원 명단 표를 `staff_roster` 로 새로 만들고, 기존 학생 `roster` 표에 붙었던 정책·트리거를 걷어냄.
-- =====================================================================

-- 0) 기존 학생 roster 표에 이 앱이 붙였던 것 제거 (표 자체와 자료는 건드리지 않음)
drop trigger if exists roster_log on public.roster;
drop policy if exists roster_admin on public.roster;

-- 1) 교직원 명단 표(새 이름)
create table if not exists public.staff_roster (
  email text primary key check (email = lower(email) and email ~ '^\S+@\S+\.\S+$'),
  name text not null check (length(name) between 1 and 60),
  department_id text references public.departments(id),
  role text not null default 'staff' check (role in ('staff','admin')),
  added_by uuid,
  added_at timestamptz not null default now()
);
alter table public.staff_roster enable row level security;
drop policy if exists staff_roster_admin on public.staff_roster;
create policy staff_roster_admin on public.staff_roster for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) 관리자 이메일(이 이메일로 가입하면 자동 관리자)
insert into public.settings (key, value) values ('bootstrap_admin_email', 'chuseonjae@outlook.kr')
on conflict (key) do update set value = excluded.value;

-- 3) 인증 서비스 역할 권한 명시
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- 4) 변경 기록 트리거: INSERT 때 OLD 를 쓰지 않고, 기록 실패가 본 작업을 막지 않게
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
drop trigger if exists staff_roster_log on public.staff_roster;
create trigger staff_roster_log after insert or update or delete on public.staff_roster for each row execute function public.log_change();

-- 5) 가입 규칙: 관리자 이메일 → 관리자, 그 밖에는 교직원 명단(staff_roster)에 있는 이메일만
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

-- 6) 진단: 가입을 흉내 내고 되돌린다(저장 안 함). 마지막 줄이 "진단 결과: staff 행 1개 생성됨" 이면 정상.
do $$
declare uid uuid := gen_random_uuid(); n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at, is_sso_user, is_anonymous)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chuseonjae@outlook.kr', 'x', '{"provider":"email","providers":["email"]}', '{"name":"진단"}', now(), now(), now(), false, false);
  select count(*) into n from public.staff where id = uid and role = 'admin';
  raise exception '진단 결과: staff 행 %개 생성됨, 관리자 권한 (정상 — 이 오류는 되돌리기용이며 아무것도 저장되지 않았습니다)', n;
end $$;

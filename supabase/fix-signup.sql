-- =====================================================================
-- 가입 오류("Database error saving new user") 진단·보강 SQL
-- schema.sql 을 실행한 뒤, 이 파일 전체를 SQL Editor 에 붙여 넣고 Run.
-- 맨 끝의 진단 블록은 가입을 흉내 낸 뒤 일부러 오류로 되돌립니다(아무것도 저장하지 않음).
-- 결과창에 나오는 마지막 오류 문장을 그대로 복사해 알려주세요.
-- =====================================================================

-- 1) 관리자 이메일(가입하면 자동 관리자)
insert into public.settings (key, value) values ('bootstrap_admin_email', 'chuseonjae@outlook.kr')
on conflict (key) do update set value = excluded.value;

-- 2) 인증 서비스 역할이 트리거 함수를 실행할 수 있도록 권한을 명시
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.log_change() to supabase_auth_admin;

-- 3) 변경 기록 트리거: INSERT 때 OLD 를 건드리지 않게 고치고, 기록 실패가 본 작업을 막지 않게 감싼다
create or replace function public.log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare act text; ent text; det text; rec jsonb;
begin
  begin
    rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    act := tg_table_name || '_' || lower(tg_op);
    if tg_table_name = 'records' and tg_op = 'UPDATE' then
      if (to_jsonb(old)->>'deleted_at') is null and (rec->>'deleted_at') is not null then act := 'records_delete';
      elsif (to_jsonb(old)->>'deleted_at') is not null and (rec->>'deleted_at') is null then act := 'records_restore'; end if;
    end if;
    ent := coalesce(rec->>'id', rec->>'date', rec->>'key', rec->>'email');
    det := case tg_table_name
             when 'records' then rec->>'title'
             when 'meals' then rec->>'date'
             when 'meal_duties' then rec->>'date'
             when 'holidays' then rec->>'name'
             when 'settings' then case when (rec->>'key') like 'bootstrap%' then '' else rec->>'value' end
             when 'attachments' then rec->>'original_name'
             when 'staff' then rec->>'name'
             when 'roster' then rec->>'name'
             when 'record_series' then rec->>'title'
             else '' end;
    if tg_table_name = 'attachments' then ent := rec->>'record_id'; end if;
    insert into public.activity_logs (user_id, action, entity_id, detail) values (auth.uid(), act, ent, left(coalesce(det, ''), 200));
  exception when others then
    null; -- 기록 실패는 무시한다(본 작업을 막지 않음)
  end;
  return coalesce(new, old);
end $$;

-- 4) 가입 트리거: 실패 원인이 보이도록 오류 문장에 상세를 붙인다
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.roster%rowtype; first_user boolean; boot text; is_boot boolean; nm text; dep text; rl text;
begin
  select value into boot from public.settings where key = 'bootstrap_admin_email';
  boot := nullif(lower(trim(coalesce(boot, ''))), '');
  is_boot := boot is not null and lower(new.email) = boot;
  select not exists (select 1 from public.staff) into first_user;
  select * into r from public.roster where email = lower(new.email);
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

-- 5) 진단: 가입을 흉내 내고 되돌린다. 결과창 마지막 줄을 복사해 주세요.
--    "진단 결과: staff 행 1개 생성됨" 이면 트리거는 정상이고 권한 문제였던 것(2번으로 해결됨).
do $$
declare uid uuid := gen_random_uuid(); n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at, is_sso_user, is_anonymous)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'diag@haenuri.test', 'x', '{"provider":"email","providers":["email"]}', '{"name":"진단"}', now(), now(), now(), false, false);
  select count(*) into n from public.staff where id = uid;
  raise exception '진단 결과: staff 행 %개 생성됨 (정상 — 이 오류는 되돌리기용이며 아무것도 저장되지 않았습니다)', n;
end $$;

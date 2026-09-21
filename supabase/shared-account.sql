-- =====================================================================
-- 전 교직원 공용 계정 준비 (hnralimi@haenuri.test)
-- 1) 이 파일 전체를 SQL Editor 에서 Run  →  2) 계정 만들기(아래 두 방법 중 하나)
-- 비밀번호는 이 파일에 적지 않습니다. 계정을 만들 때 직접 입력합니다.
-- =====================================================================

-- 1. 가입 허용 명단에 공용 계정 이메일 추가 (권한은 일반 교직원 · 부서 없음)
insert into public.staff_roster (email, name, department_id, role)
values ('hnralimi@haenuri.test', '해누리 교직원', null, 'staff')
on conflict (email) do update set name = excluded.name, role = 'staff', department_id = null;

-- 2. 앱에 "이 이메일은 공용 계정"이라고 알려 준다 → 이 계정으로 들어오면 비밀번호 변경 메뉴가 숨겨지고, 안내마다 부서를 고르게 한다
insert into public.settings (key, value) values ('shared_login_email', 'hnralimi@haenuri.test')
on conflict (key) do update set value = excluded.value;

-- 2-1. 공용 계정 이메일은 로그인한 교직원만 읽을 수 있게(로그인 전 화면에는 노출하지 않음)
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to anon, authenticated
  using (public.is_admin() or (key <> 'bootstrap_admin_email' and (key <> 'shared_login_email' or auth.uid() is not null)));

-- 3. 이미 만든 뒤라면(계정이 있으면) 이름·부서·권한을 명단과 같게 맞춘다
update public.staff set name = '해누리 교직원', department_id = null, role = 'staff', active = true
 where email = 'hnralimi@haenuri.test';

select email as 이메일, name as 이름, role as 권한,
       exists (select 1 from public.staff s where s.email = r.email) as 가입됨
  from public.staff_roster r where email = 'hnralimi@haenuri.test';

-- ---------------------------------------------------------------------
-- 계정 만들기 (둘 중 하나)
-- (가) 앱 로그인 화면 → "처음이세요? 가입하기" → 이메일 hnralimi@haenuri.test, 이름 아무거나(명단 이름이 우선), 비밀번호 입력
-- (나) Supabase 대시보드 → Authentication → Users → Add user → Create new user
--      Email: hnralimi@haenuri.test / Password: 정한 비밀번호 / ☑ Auto Confirm User → Create user
-- 둘 다 가입 트리거(handle_new_user)가 명단을 보고 staff 행을 만들어 줍니다.
-- 비밀번호를 바꾸거나 잊었을 때: 대시보드 Authentication → Users → 이 계정 → Reset password / Update password
-- ---------------------------------------------------------------------

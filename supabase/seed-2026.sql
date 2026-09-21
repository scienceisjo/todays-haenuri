-- =====================================================================
-- 2026학년도 창체의 날 · 학사일정 · 휴업일 초기 자료 (해누리중)
-- 출처: 「2026학년도 학사일정 상세_교사용(2.12.)」 + 「26 학사일정(연간)」
-- 실행: schema.sql 을 실행하고 관리자로 가입한 뒤, 전체를 SQL Editor 에 붙여 넣고 Run.
-- 다시 실행해도 같은 자료가 두 번 들어가지 않습니다(같은 id 는 내용만 갱신, 앱에서 삭제한 것은 건드리지 않음).
-- 필요 없는 부분은 해당 절(1~3)을 지우고 실행해도 됩니다.
-- =====================================================================

do $$
declare owner uuid; n int;
begin
  select id into owner from public.staff where role = 'admin' and active order by created_at limit 1;
  if owner is null then
    raise exception '먼저 앱에서 관리자로 가입한 뒤 실행해주세요. (작성자로 기록할 관리자 계정이 필요합니다)';
  end if;

  -- 초기 자료를 넣는 동안 변경 기록 트리거는 잠시 끈다(기록이 수십 줄 쌓이지 않게). 맨 아래에서 한 줄로 요약 기록.
  alter table public.records disable trigger records_log;
  alter table public.holidays disable trigger holidays_log;

  -- ---------- 1. 창체의 날 (유형: 창체 시간표) · 연 8회 ----------
  -- 담당 부서는 창의인성부(character)로 두었습니다. 다르면 앱의 ‘작성글 관리’에서 바꾸면 됩니다.
  insert into public.records as r (id, kind, title, content, channel, department_id, importance, event_date, created_by, updated_by) values
    ('20260000-0000-4000-8000-000000000101', 'special', '창체1 · 정·부회장 선거',
      E'1~3교시  범교과교육\n4교시  진로검사\n5교시  정·부회장 선거, 학급회의\n6~7교시  동아리 조직·편성', 'all', 'character', 'normal', '2026-03-13', owner, owner),
    ('20260000-0000-4000-8000-000000000102', 'special', '창체2',
      E'1~3교시  범교과교육\n4교시  봉사 사전교육, 학급회의\n5~7교시  동아리', 'all', 'character', 'normal', '2026-04-06', owner, owner),
    ('20260000-0000-4000-8000-000000000103', 'special', '창체3',
      E'1~2교시  범교과교육, 학급회의\n3~4교시  봉사 운영·평가\n5~7교시  동아리', 'all', 'character', 'normal', '2026-06-02', owner, owner),
    ('20260000-0000-4000-8000-000000000104', 'special', '창체4 · 2학기 학급임원 선거',
      E'1~3교시  범교과교육\n4교시  2학기 학급임원 선거, 학급회의\n5~7교시  동아리', 'all', 'character', 'normal', '2026-07-16', owner, owner),
    ('20260000-0000-4000-8000-000000000105', 'special', '창체5 · 개학',
      E'1~4교시  범교과교육, 학급회의\n5~7교시  동아리', 'all', 'character', 'normal', '2026-08-18', owner, owner),
    ('20260000-0000-4000-8000-000000000106', 'special', '창체6',
      E'1~4교시  범교과교육, 학급회의\n5~7교시  동아리', 'all', 'character', 'normal', '2026-09-28', owner, owner),
    ('20260000-0000-4000-8000-000000000107', 'special', '창체7',
      E'1~4교시  범교과교육, 학급회의\n5~7교시  동아리\n※ 성적이의신청기간(11.5.~11.9.)과 겹칩니다.', 'all', 'character', 'normal', '2026-11-06', owner, owner),
    ('20260000-0000-4000-8000-000000000108', 'special', '창체8 · 학생회장 선거',
      E'1~2교시  학생회장 선거, 학급회의\n3~4교시  범교과교육\n5~7교시  동아리', 'all', 'character', 'normal', '2026-11-23', owner, owner),
    -- 연간 요약 공지(전체 공지 칸에 한 번 보이도록)
    ('20260000-0000-4000-8000-000000000100', 'notice', '2026학년도 창체의 날 일정 (연 8회)',
      E'창체1  3.13.(금)  정·부회장 선거 · 진로검사 · 동아리 조직\n창체2  4.6.(월)  봉사 사전교육\n창체3  6.2.(화)  봉사 운영·평가\n창체4  7.16.(목)  2학기 학급임원 선거\n창체5  8.18.(화)  개학\n창체6  9.28.(월)\n창체7  11.6.(금)\n창체8  11.23.(월)  학생회장 선거\n\n기본 틀: 오전 범교과교육·학급회의, 5~7교시 동아리. 회차별 교시 운영은 그날 홈 화면의 ‘창체의 날 시간표’ 칸에서 볼 수 있습니다.\n출처: 2026학년도 학사일정 상세(교사용, 2.12.) — 학교 사정에 따라 바뀔 수 있습니다.', 'all', 'character', 'normal', null, owner, owner)
  on conflict (id) do update
    set title = excluded.title, content = excluded.content, event_date = excluded.event_date, department_id = excluded.department_id, updated_by = excluded.updated_by
    where r.deleted_at is null;

  -- ---------- 2. 학사 일정 (유형: 학사 일정) ----------
  insert into public.records as r (id, kind, title, content, channel, department_id, importance, event_date, end_date, created_by, updated_by) values
    ('20260000-0000-4000-8000-000000000201', 'academic', '시업식 · 입학식', '자율·자치 활동(1학년)', 'all', 'academic', 'normal', '2026-03-03', null, owner, owner),
    ('20260000-0000-4000-8000-000000000202', 'academic', '학부모총회', '', 'all', 'academic', 'normal', '2026-03-18', null, owner, owner),
    ('20260000-0000-4000-8000-000000000203', 'academic', '중간고사 (2·3학년)', '1학년은 교과수업 · 4.30.(목) 1학년 진로체험①', 'all', 'academic', 'normal', '2026-04-29', '2026-04-30', owner, owner),
    ('20260000-0000-4000-8000-000000000204', 'academic', '학년별 체험일', '', 'all', 'academic', 'normal', '2026-05-07', '2026-05-08', owner, owner),
    ('20260000-0000-4000-8000-000000000205', 'academic', '기말고사 (2·3학년)', '1학년은 교과수업 · 7.3.(금) 1학년 진로체험②', 'all', 'academic', 'normal', '2026-07-01', '2026-07-03', owner, owner),
    ('20260000-0000-4000-8000-000000000206', 'academic', '여름방학식', '자율·자치 활동(1학년)', 'all', 'academic', 'normal', '2026-07-21', null, owner, owner),
    ('20260000-0000-4000-8000-000000000207', 'academic', '개학식', '창체5 (1~4교시 범교과교육·학급회의, 5~7교시 동아리)', 'all', 'academic', 'normal', '2026-08-18', null, owner, owner),
    ('20260000-0000-4000-8000-000000000208', 'academic', '중간고사 (1·2학년)', '3학년은 교과수업', 'all', 'academic', 'normal', '2026-09-22', '2026-09-23', owner, owner),
    ('20260000-0000-4000-8000-000000000209', 'academic', '성적이의신청기간 (1·2학년 중간)', '', 'all', 'academic', 'normal', '2026-10-01', '2026-10-06', owner, owner),
    ('20260000-0000-4000-8000-000000000210', 'academic', '금요일 시간표로 수업 (수요일)', '요일 바꿔 수업', 'all', 'academic', 'normal', '2026-10-07', null, owner, owner),
    ('20260000-0000-4000-8000-000000000211', 'academic', '기말고사 (3학년)', '1·2학년은 교과수업', 'all', 'academic', 'normal', '2026-10-28', '2026-10-30', owner, owner),
    ('20260000-0000-4000-8000-000000000212', 'academic', '금요일 시간표로 수업 (화요일)', '요일 바꿔 수업', 'all', 'academic', 'normal', '2026-11-03', null, owner, owner),
    ('20260000-0000-4000-8000-000000000213', 'academic', '성적이의신청기간 (3학년 기말)', '', 'all', 'academic', 'normal', '2026-11-05', '2026-11-09', owner, owner),
    ('20260000-0000-4000-8000-000000000214', 'academic', '수능 예비소집 · 단축수업', '1~6교시 단축수업 · 다음 날(11.19.)은 수능 휴업', 'all', 'academic', 'normal', '2026-11-18', null, owner, owner),
    ('20260000-0000-4000-8000-000000000215', 'academic', '기말고사 (1·2학년) · 학년말 체험 (3학년)', '', 'all', 'academic', 'normal', '2026-12-15', '2026-12-17', owner, owner),
    ('20260000-0000-4000-8000-000000000216', 'academic', '학년별 체험일', '', 'all', 'academic', 'normal', '2026-12-24', null, owner, owner),
    ('20260000-0000-4000-8000-000000000217', 'academic', '성적이의신청기간 (1·2학년 기말)', '', 'all', 'academic', 'normal', '2026-12-28', '2026-12-30', owner, owner),
    ('20260000-0000-4000-8000-000000000218', 'academic', '해누리예술제', '', 'all', 'academic', 'normal', '2026-12-31', null, owner, owner),
    ('20260000-0000-4000-8000-000000000219', 'academic', '목요일 시간표로 수업 (화요일)', '요일 바꿔 수업', 'all', 'academic', 'normal', '2027-01-05', null, owner, owner),
    ('20260000-0000-4000-8000-000000000220', 'academic', '금요일 시간표로 수업 (수요일)', '요일 바꿔 수업', 'all', 'academic', 'normal', '2027-01-06', null, owner, owner),
    ('20260000-0000-4000-8000-000000000221', 'academic', '종업식 · 졸업식', '자율·자치 활동(3학년)', 'all', 'academic', 'normal', '2027-01-07', null, owner, owner)
  on conflict (id) do update
    set title = excluded.title, content = excluded.content, event_date = excluded.event_date, end_date = excluded.end_date, updated_by = excluded.updated_by
    where r.deleted_at is null;

  -- ---------- 3. 휴업일 (달력·월간표 표시, 반복 일정·급식지도 양식에서 자동 제외) ----------
  insert into public.holidays (date, name, created_by) values
    ('2026-03-02', '대체휴일 (삼일절)', owner),
    ('2026-05-01', '노동절', owner),
    ('2026-05-04', '재량휴업일', owner),
    ('2026-05-05', '어린이날', owner),
    ('2026-05-25', '대체휴일 (부처님오신날)', owner),
    ('2026-06-03', '전국동시지방선거', owner),
    ('2026-07-17', '제헌절', owner),
    ('2026-08-17', '대체휴일 (광복절)', owner),
    ('2026-09-24', '추석 연휴', owner),
    ('2026-09-25', '추석', owner),
    ('2026-10-05', '대체휴일 (개천절)', owner),
    ('2026-10-09', '한글날', owner),
    ('2026-11-19', '대학수학능력시험 (재량휴업일)', owner),
    ('2026-11-20', '재량휴업일', owner),
    ('2026-12-25', '성탄절', owner),
    ('2027-01-01', '신정', owner)
  on conflict (date) do update set name = excluded.name;

  alter table public.records enable trigger records_log;
  alter table public.holidays enable trigger holidays_log;

  select count(*) into n from public.records where id::text like '20260000-0000-4000-8000-%' and deleted_at is null;
  insert into public.activity_logs (user_id, action, entity_id, detail)
    values (owner, 'schedule_import', null, format('2026학년도 초기 자료: 창체 8회·요약 1건, 학사 일정 21건, 휴업일 16일 (현재 %s건)', n));
end $$;

-- 확인: 창체의 날 8회가 날짜순으로 보이면 성공
select event_date as 날짜, title as 제목, left(replace(content, E'\n', ' / '), 60) as 내용
  from public.records where kind = 'special' and deleted_at is null order by event_date;

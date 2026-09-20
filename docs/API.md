# 데이터 계층 (v1.0, Supabase)

v0.x 의 HTTP API(`/api/...`)는 없어졌습니다. 화면은 `public/lib/data.js` 의 `db` 객체만 호출하고, 그 안에서 supabase-js 로 표·함수·저장소에 접근합니다. 권한은 `supabase/schema.sql` 의 RLS 정책과 함수가 최종 검사합니다.

| db 메서드 | 하는 일 |
|---|---|
| auth.signIn / signUp / signOut / resetPassword / updatePassword / canRegister | Supabase Auth. 가입은 명단(roster)에 있는 이메일만 |
| info() | settings(학교명·앱 이름·로고) — 로그인 전 화면용 |
| bootstrap() | settings·서버 시각·부서·교직원·안내(records_view)·첨부·급식·급식지도(duties_view)·휴업일 |
| records.create / createSeries(rpc create_series) / update(rpc update_record: version·scope) / remove(rpc delete_record) / restore / markRead | 안내 |
| attachments.upload / remove / url(서명 URL, download 옵션) | 비공개 저장소 attachments, 경로 `<record>/<id>.<ext>` |
| meals.* / duties.* | version 조건으로 갱신·삭제(0행이면 충돌) |
| admin.staff / updateStaff / roster / addRoster / removeRoster / settings / addDepartment / removeDepartment / addHoliday / removeHoliday / logs / exportAll / uploadLogo / removeLogo | 관리자 |
| imports.parse(file) → previewDuties / previewSchedule(브라우저 검증) → commitDuties / commitSchedule(rpc import_duties / import_schedule) | 일괄 등록 |

오류는 Postgres/Auth 메시지를 한국어로 바꿔 `Error.message` 로 던집니다(`status` 401/403/409/400).

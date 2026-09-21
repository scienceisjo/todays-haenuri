# Supabase 설치 (한 번만)

1. Supabase 대시보드 → 이 프로젝트 → **SQL Editor → New query**
2. `schema.sql` 전체를 붙여 넣기 전에, 위쪽 `bootstrap_admin_email` 줄의 따옴표 안에 **관리자 이메일**을 적습니다.
   ```sql
   insert into public.settings (key, value) values ('bootstrap_admin_email', lower(trim('여기@이메일')))
   ```
   (비워 두면 "첫 번째로 가입하는 사람"이 관리자가 됩니다. 이미 실행한 뒤 바꾸려면 SQL Editor 에서 `update public.settings set value = '이메일' where key = 'bootstrap_admin_email';` 한 줄만 실행.)
3. **Run** — 표·권한(RLS)·파일 저장소·가입 규칙·일괄 등록 함수가 만들어집니다. 다시 실행해도 안전합니다.
4. **Authentication → Providers → Email → "Confirm email" 끄기** (명단으로 가입을 제한하므로 이메일 확인 절차가 필요 없습니다. 켜 두면 가입 후 메일 확인 전까지 로그인이 안 됩니다.)
5. 앱(GitHub Pages 주소)을 열고 관리자 이메일로 **가입** → 학교 설정 → **교직원 명단**에 선생님들 이메일·이름·부서를 등록(붙여넣기 가능) → 각자 그 이메일로 가입.
6. (선택) **`seed-2026.sql`** 을 SQL Editor 에서 실행 — 2026학년도 **창체의 날 8회**(교시별 운영)·학사 일정 21건·휴업일 16일이 들어갑니다. 관리자 가입 뒤에 실행해야 하며(작성자로 기록), 다시 실행해도 중복되지 않습니다. 이미 있는 가입 문제는 `fix-signup.sql`.

## 어디에 무엇이 저장되나
| 표 | 내용 |
|---|---|
| departments | 부서 14개(기본값) |
| staff_roster | 교직원 명단 = 가입 허용 목록(이메일·이름·부서·권한). 다른 앱의 학생 roster 표와 이름이 겹치지 않게 함 |
| staff | 가입한 교직원(auth.users 와 1:1). active=false 면 모든 자료 접근 차단 |
| records / record_series | 공지·일정, 반복 일정 규칙 |
| attachments + Storage `attachments`(비공개) | 첨부 파일 메타·바이트. 경로 `<안내 id>/<파일 id>.<확장자>` |
| meals / meal_duties | 급식, 급식지도(날짜마다 식당 입구 1명 + 식당 내부 1명) |
| holidays / settings / activity_logs | 휴업일, 학교명·앱 이름·로고, 변경 기록(트리거) |
| Storage `branding`(공개) | 관리자가 올린 로고 |

## 권한 요약
- 모든 읽기·쓰기는 **RLS**로 제한: 재직 교직원만 자료를 보고, 안내·급식·급식지도는 **작성자와 관리자만** 수정·삭제.
- 공개 조건(게시 상태·예약 시각·게시 종료·열람 부서)은 서버 시각(`now()`) 기준으로 정책에서 판단.
- 일괄 등록·반복 등록·회차 범위 수정/취소는 **함수(RPC)**가 다시 검증하고 한 트랜잭션으로 처리.
- anon 키는 공개용입니다. `service_role` 키는 앱에 넣지 마세요.

## 비밀번호를 잊은 교직원
로그인 화면 "비밀번호를 잊었어요" → 재설정 메일(Supabase 기본 메일은 시간당 발송 제한이 있음). 급하면 관리자가 대시보드 Authentication → Users 에서 비밀번호를 바꿔 줍니다.

## 백업
대시보드 Database → Backups(무료 플랜은 일일 백업 7일) + 앱의 학교 설정 → 자료 내보내기(JSON). 첨부 파일은 Storage 에서 별도 내려받기.

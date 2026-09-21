# 오늘의 해누리 — 교사용 학교 알림장 v1.0

선생님 각자의 PC를 켜면 자동으로 열려, 오늘의 일정·급식·급식지도·안내를 한 화면에서 확인하는 해누리중학교 교직원용 앱입니다.
**GitHub Pages(정적 화면) + Supabase(데이터·로그인·파일)** 로 동작하며, 학교에 서버 컴퓨터를 둘 필요가 없습니다.

## 구조

```
public/              ← GitHub Pages 로 배포되는 앱 전체 (빌드 없음)
  index.html, app.js, styles.css, sw.js, manifest.webmanifest
  config.js          ← Supabase 주소 + anon 키 (공개용 키)
  lib/core.js        ← 날짜·검증·공개 여부 규칙
  lib/series.js      ← 반복 일정 규칙·회차 생성
  lib/import.js      ← CSV/엑셀(.xlsx) 읽기·열 매핑·미리 보기 검증
  lib/data.js        ← Supabase 데이터 계층(로그인·조회·저장·파일·일괄 등록 RPC)
  vendor/supabase.js ← supabase-js 2 (로컬 파일, CDN 의존 없음)
  logo.png, icon-192/512.png ← 학교 엠블럼(branding/logo.png 에서 생성)
supabase/schema.sql  ← 설치 SQL(표·RLS 권한·저장소·가입 규칙·일괄 등록/반복/회차 함수)
supabase/seed-2026.sql ← 2026학년도 초기 자료(창체의 날 8회·학사 일정·휴업일), 관리자 가입 후 1회 실행
supabase/fix-signup.sql ← 이미 설치한 프로젝트의 가입 오류 수정(staff_roster·관리자 이메일)
supabase/README.md   ← 설치 순서
branding/            ← 원본 로고 (scripts/logo.mjs 로 배경 투명·정사각형 처리)
scripts/             ← check(문법)·serve(로컬 미리보기)·logo·build-icons
tests/               ← 순수 로직 테스트 + 화면 렌더링 스모크 (node --test)
scripts/deploy.mjs   ← npm run deploy: public/ 을 gh-pages 브랜치로 배포(GitHub Pages)
_legacy/             ← v0.x 의 Node+SQLite 서버(참고용, 배포·테스트 대상 아님)
```

## 처음 설치 (관리자, 한 번)

1. Supabase 프로젝트를 만들고 **`supabase/README.md`** 순서대로 `schema.sql` 실행, Email "Confirm email" 끄기.
2. `public/config.js` 에 프로젝트 URL 과 anon 키를 넣습니다.
3. `npm run deploy` → public/ 이 gh-pages 브랜치로 올라가고 GitHub Pages(Settings → Pages → Source: gh-pages)가 서빙합니다. 코드 수정 후에도 같은 명령으로 재배포.
4. 배포 주소를 열어 관리자 이메일로 **가입** → 학교 설정 → **교직원 명단**에 선생님들 이메일·이름·부서 등록(붙여넣기 가능).
5. 선생님들은 명단의 이메일로 **가입**하고, Edge 주소창의 앱 설치 아이콘(또는 사이드바 **바탕화면 앱으로 설치**)으로 설치 → `edge://apps` 에서 **장치 로그인 시 자동 시작** 켜기.

## 기능

- 로그인/가입(명단 기반)·비밀번호 재설정, 관리자/교직원 권한(서버 RLS 로 검사)
- 오늘·내일·이번 주·날짜 선택 대시보드, 전체 공지·부서 안내·행사·방송·제출 기한·학사 일정·창체 시간표
- 공지 작성·수정·삭제·복구, 임시저장, 즉시/예약 게시, 게시 종료, 숨김, 읽음 처리
- 첨부(PDF·이미지 미리 보기, 한글·엑셀·워드 내려받기) — 비공개 저장소, 안내를 볼 수 있는 사람만 열람. 첨부가 있는 새 안내는 파일이 모두 올라간 뒤 게시 확정
- 급식(중식) 등록, **급식지도: 식당 입구 1명 + 식당 내부 1명(고정 두 자리)**, 대체 담당자·예약 공개, **월간표**
- **CSV/엑셀 일괄 등록**(급식지도·학사 일정): 양식 내려받기 → 미리 보기(오류·동명이인=`이름(부서)`·기존 자료 비교) → 원자적 저장
- **반복 일정**(매주 요일 복수·매월·종료일/횟수·휴업일 제외), 회차별 수정·취소, 이후/전체 범위 수정·취소
- **휴업일** 관리, 학교명·앱 이름·로고 설정, 부서 관리, 변경 기록, JSON 내보내기
- PWA(설치·자동 시작), 30초 자동 갱신, 창 활성화 시 갱신

## 검증 명령

```bash
npm run check
npm test
npm run preview     # http://127.0.0.1:4173 (Supabase 에 연결됨)
```

순수 로직 테스트 12개 + 화면 렌더링 스모크 1개를 통과합니다. Supabase 연동(권한·함수)은 실제 프로젝트에 붙여 확인합니다(`docs/TEST_REPORT.md`).

## 유지 규칙

- 급식지도는 정확히 두 자리. Asia/Seoul 기준. 마감일과 게시 종료는 별개.
- 권한은 화면이 아니라 Supabase RLS·함수가 최종 검사한다. `service_role` 키를 앱에 넣지 않는다.
- 스키마 변경은 `supabase/schema.sql` 을 고쳐 다시 실행(멱등)하거나 새 SQL 파일로 추가한다.
- 진행 이력은 [CHANGELOG.md](CHANGELOG.md).

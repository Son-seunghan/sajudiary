-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  사주다이어리 — 일일 리포트용 계측 테이블 2종 (2026-09-14)
--  Supabase SQL Editor 에 붙여넣고 RUN 한 번이면 끝.
--  (security_rls_lockdown.sql 과 순서 무관 — 아무 때나 실행 가능)
--
--  두 테이블 모두 RLS ON + 정책 없음 = anon 키로는 읽기/쓰기 전부 불가,
--  Vercel 서버 함수(service key)만 접근. 개인 식별 정보는 저장하지 않음
--  (만세력은 이름 미저장, 회원은 카카오 id·시각만).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── 1. 무료 만세력 조회 로그 ───
CREATE TABLE IF NOT EXISTS manse_lookups (
  id           BIGSERIAL PRIMARY KEY,
  birth_year   INT,
  birth_month  INT,
  birth_day    INT,
  birth_hour   REAL DEFAULT -1,      -- -1 = 시간 모름
  gender       TEXT,
  pillars      JSONB,                -- {"y":"임오","m":"...","d":"...","h":"..."|null}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manse_lookups_created
  ON manse_lookups (created_at DESC);
ALTER TABLE manse_lookups ENABLE ROW LEVEL SECURITY;

-- ─── 2. 회원 원장 (가입·재방문 계측) ───
CREATE TABLE IF NOT EXISTS site_users (
  kakao_id    TEXT PRIMARY KEY,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 최초 로그인 = 가입
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- 마지막 로그인
);
ALTER TABLE site_users ENABLE ROW LEVEL SECURITY;

-- ─── 확인 ───
-- 기대 결과: 두 행 모두 rls_enabled = true, policy_count = 0
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count
FROM pg_class c
WHERE c.relname IN ('manse_lookups', 'site_users')
ORDER BY c.relname;

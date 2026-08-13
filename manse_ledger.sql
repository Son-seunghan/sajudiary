-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  사주다이어리 — 나만의 만세력 명부 (manse-ledger.html) 전용 스키마
--  Supabase SQL Editor 에 붙여넣고 RUN 한 번이면 끝.
--  성공 메시지: "Success. No rows returned"
--
--  ⚠ 프라이버시 설계
--   - 손님 이름(name_enc)·메모(memo_enc)는 클라이언트에서 AES-GCM 암호화된
--     문자열만 저장됩니다. 서버(공개 anon 키)로 조회돼도 신원이 드러나지 않아요.
--   - 복호화 키(암호)는 서버에 저장되지 않습니다. 마스터 브라우저에만 존재.
--   - 생년월일·간지는 평문(검색·정렬용)이지만, 이름과 분리돼 있어 식별성이 낮습니다.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── 1. 명부 기록 ───
CREATE TABLE IF NOT EXISTS manse_records (
  id            BIGSERIAL PRIMARY KEY,
  owner_kakao_id TEXT NOT NULL,          -- 마스터 카카오 id (여러 마스터 대비 소유자 구분)
  name_enc      TEXT,                    -- 🔒 암호화된 이름/별칭
  memo_enc      TEXT,                    -- 🔒 암호화된 메모
  gender        TEXT,                    -- 'male' | 'female' | ''
  birth_year    INT,
  birth_month   INT,
  birth_day     INT,
  birth_hour    REAL,                    -- -1 = 시간 모름 (그 외 시주 계산용 시각)
  calendar      TEXT DEFAULT 'solar',    -- 'solar'(양력) — 음력은 입력 전 변환
  pillars       JSONB,                   -- {"y":[si,bi],"m":[si,bi],"d":[si,bi],"h":[si,bi]|null}
  summary       JSONB,                   -- {dayKey, ilgan, sinsal, mbti, flow}
  tags          TEXT[],                  -- 평문 태그(분류용) — 민감정보 넣지 말 것
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manse_owner
  ON manse_records (owner_kakao_id, created_at DESC);

-- ─── 2. 명부 메타 (암호 검증용 — 새 기기에서도 암호 확인 가능) ───
CREATE TABLE IF NOT EXISTS manse_meta (
  owner_kakao_id TEXT PRIMARY KEY,
  verifier       TEXT NOT NULL,          -- enc("SAJUDIARY_MANSE_OK") — 암호 일치 검증용
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. RLS ───
ALTER TABLE manse_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE manse_meta    ENABLE ROW LEVEL SECURITY;

-- 프로젝트 기존 패턴과 동일: 클라이언트단 필터 + PII는 암호화로 보호
-- (본격 서버 인증이 필요해지면 Vercel 서버함수 + service_role 로 강화)
DROP POLICY IF EXISTS manse_records_all ON manse_records;
CREATE POLICY manse_records_all ON manse_records FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS manse_meta_all ON manse_meta;
CREATE POLICY manse_meta_all ON manse_meta FOR ALL USING (true) WITH CHECK (true);

-- ─── 4. updated_at 자동 갱신 트리거 ───
CREATE OR REPLACE FUNCTION touch_manse_updated() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manse_touch ON manse_records;
CREATE TRIGGER trg_manse_touch BEFORE UPDATE ON manse_records
  FOR EACH ROW EXECUTE FUNCTION touch_manse_updated();

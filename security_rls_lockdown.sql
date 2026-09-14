-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  사주다이어리 — RLS 잠금 (보안 강화 1단계, 2026-09-02)
--  Supabase SQL Editor 에 붙여넣고 RUN 한 번.
--
--  ⚠ 실행 순서 (반드시 지킬 것)
--   1) 코드 먼저 배포 (api/board.js + 클라이언트 변경분) → Vercel 배포 완료 확인
--   2) 그 다음 이 SQL 실행
--   순서가 바뀌면 "후기 작성/삭제·문의 삭제·답글·명부 저장"이 잠시 중단됨.
--
--  원칙
--   - anon(publishable) 키: 공개 데이터 SELECT + 익명 글쓰기(문의·댓글·좋아요)만
--   - UPDATE/DELETE, 비밀글 SELECT, 후기 쓰기, 명부 전체: /api/board (service_role) 경유
--   - service_role 은 RLS 를 우회하므로 정책이 없어도 서버 함수는 동작
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── 1. inquiries (QNA 문의) ───
-- 비밀글 SELECT 정책 폐기 → 비밀글은 /api/board inquiries.list / inquiries.mine 으로만 열람
DROP POLICY IF EXISTS inquiries_select_private_self ON inquiries;
-- anon UPDATE/DELETE 폐기 (삭제는 /api/board inquiries.delete)
DROP POLICY IF EXISTS inquiries_update_self ON inquiries;
DROP POLICY IF EXISTS inquiries_delete_self ON inquiries;
-- 유지: inquiries_select_public (NOT is_private), inquiries_insert_anyone (익명 글쓰기)
-- 혹시 없다면 재생성
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inquiries' AND policyname='inquiries_select_public') THEN
    CREATE POLICY inquiries_select_public ON inquiries FOR SELECT USING (NOT is_private);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inquiries' AND policyname='inquiries_insert_anyone') THEN
    CREATE POLICY inquiries_insert_anyone ON inquiries FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ─── 2. replies (운영자 답글) ───
-- 기존 FOR ALL 개방 폐기 → 공개 문의에 달린 답글만 SELECT. 작성/삭제는 /api/board (마스터)
DROP POLICY IF EXISTS replies_all ON replies;
DROP POLICY IF EXISTS replies_select_public ON replies;
CREATE POLICY replies_select_public ON replies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM inquiries i WHERE i.id = replies.inquiry_id AND NOT i.is_private)
  );

-- ─── 3. column_comments (칼럼 댓글) ───
-- SELECT + INSERT(익명 허용)만. 삭제는 /api/board comments.delete
DROP POLICY IF EXISTS comments_all ON column_comments;
DROP POLICY IF EXISTS comments_select_public ON column_comments;
DROP POLICY IF EXISTS comments_insert_anyone ON column_comments;
CREATE POLICY comments_select_public ON column_comments FOR SELECT USING (true);
CREATE POLICY comments_insert_anyone ON column_comments FOR INSERT WITH CHECK (true);

-- ─── 4. likes (좋아요) ───
-- 익명 좋아요 토글이 클라이언트 직접 호출이라 SELECT/INSERT/DELETE 유지, UPDATE 만 제거
DROP POLICY IF EXISTS likes_all ON likes;
DROP POLICY IF EXISTS likes_select ON likes;
DROP POLICY IF EXISTS likes_insert ON likes;
DROP POLICY IF EXISTS likes_delete ON likes;
CREATE POLICY likes_select ON likes FOR SELECT USING (true);
CREATE POLICY likes_insert ON likes FOR INSERT WITH CHECK (true);
CREATE POLICY likes_delete ON likes FOR DELETE USING (true);

-- 좋아요 카운트 트리거는 inquiries/column_comments 를 UPDATE 함 → anon 의 UPDATE 정책이
-- 사라지면 카운트가 안 오르므로, 트리거 함수를 정의자 권한(SECURITY DEFINER)으로 전환
ALTER FUNCTION update_likes_count() SECURITY DEFINER;
ALTER FUNCTION update_likes_count() SET search_path = public;

-- ─── 5. reviews (후기) ───
-- 현재 정책은 대시보드에서만 확인 가능(SQL 문서 미발견) → 이름 불문 전부 제거 후 SELECT 만 재생성
-- 작성(upsert)·삭제는 /api/board reviews.write / reviews.delete
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p RECORD; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='reviews' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON reviews', p.policyname);
  END LOOP;
END $$;
CREATE POLICY reviews_select_public ON reviews FOR SELECT USING (true);

-- ─── 6. manse_records / manse_meta (손님 명부) ───
-- anon 정책 전부 제거 → 클라이언트 직접 접근 불가. /api/board manse.* (마스터 세션) 전용
DROP POLICY IF EXISTS manse_records_all ON manse_records;
DROP POLICY IF EXISTS manse_meta_all ON manse_meta;
ALTER TABLE manse_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE manse_meta    ENABLE ROW LEVEL SECURITY;

-- ─── 7. 확인용 (실행 후 결과 보기) ───
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('inquiries','replies','column_comments','likes','reviews','manse_records','manse_meta')
ORDER BY tablename, policyname;
-- 기대 결과:
--   column_comments: comments_insert_anyone(INSERT), comments_select_public(SELECT)
--   inquiries      : inquiries_insert_anyone(INSERT), inquiries_select_public(SELECT)
--   likes          : likes_delete, likes_insert, likes_select
--   replies        : replies_select_public(SELECT)
--   reviews        : reviews_select_public(SELECT)
--   manse_*        : (없음)

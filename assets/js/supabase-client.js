/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 — Supabase 클라이언트 (supabase-client.js)
   - QNA 게시판, 칼럼 댓글, 좋아요 API 헬퍼
   - 셋업: config.js의 SUPABASE_URL / SUPABASE_ANON_KEY 채워야 동작
   - 의존: assets/js/config.js, assets/js/auth-guard.js
   - Supabase JS SDK는 CDN으로 로드 (HTML에서 직접 <script> 태그로)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SajuSupa = (function () {
  const cfg = window.SAJULOG_CONFIG;
  let _client = null;
  let _initFailed = false;

  // ─── 초기화 (lazy) ───
  function getClient() {
    if (_client) return _client;
    if (_initFailed) return null;
    if (!cfg || !cfg.SUPABASE_ENABLED) {
      _initFailed = true;
      return null;
    }
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.warn('[SajuSupa] Supabase JS SDK가 로드되지 않았습니다. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> 추가 필요');
      _initFailed = true;
      return null;
    }
    _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false }   // 우리는 카카오 OAuth 자체 처리
    });
    return _client;
  }

  function isEnabled() {
    return getClient() !== null;
  }

  // ─── 현재 사용자 정보 ───
  function _currentUser() {
    return (typeof AuthGuard !== 'undefined') ? AuthGuard.getUser() : null;
  }

  function _isMaster() {
    return (typeof AuthGuard !== 'undefined') ? AuthGuard.isMaster() : false;
  }

  // ─── 서버 대행 (/api/board — 세션 검증 + service_role) ───
  // 2026-09-02 보안 강화: 삭제·답글·후기 쓰기·비밀글 열람·명부는 anon 키로 직접 하지 않고
  // 서버 함수가 대행한다 (RLS 잠금: security_rls_lockdown.sql)
  function _session() {
    const u = _currentUser();
    return (u && u.session) || null;
  }
  async function board(action, extra) {
    const session = _session();
    if (!session) {
      return { ok: false, noSession: true, error: '계정 확인이 필요합니다. 로그아웃 후 카카오 로그인을 다시 해주세요.' };
    }
    try {
      const r = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ session: session, action: action }, extra || {}))
      });
      return await r.json();
    } catch (e) {
      console.warn('[SajuSupa] board 서버 연결 실패:', action, e);
      return { ok: false, error: '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' };
    }
  }
  // board 응답 → supabase-js 스타일 { data, error } 로 변환
  function _asResult(j) {
    if (j && j.ok) return { data: (j.data === undefined ? null : j.data), error: null };
    return { data: null, error: { message: (j && j.error) || '요청에 실패했습니다.', reauth: !!(j && (j.reauth || j.noSession)) } };
  }

  // ─── 익명 카운터 — 같은 디바이스에서 익명 작성 시 일관된 번호 ───
  function _getAnonHandle() {
    let h = localStorage.getItem('sajudiary_anon_handle');
    if (!h) {
      h = '독자' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('sajudiary_anon_handle', h);
    }
    return h;
  }

  // ─── 표시 닉네임 결정 ───
  // anonymous: true → 익명/익명커스텀, false → 카카오 닉네임 또는 입력값
  function _resolveDisplayNickname({ anonymous, customNickname }) {
    if (customNickname && customNickname.trim()) {
      return customNickname.trim().slice(0, 30);
    }
    if (anonymous) return _getAnonHandle();
    const user = _currentUser();
    return (user && user.nickname) || _getAnonHandle();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // QNA / 게시판
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 글 작성
  // params: { category, content, anonymous, customNickname, isPrivate, attachedSaju }
  async function createInquiry(params) {
    const sb = getClient();
    if (!sb) return { error: { message: 'Supabase 미설정' } };

    const user = _currentUser();
    const displayNickname = _resolveDisplayNickname({
      anonymous: params.anonymous,
      customNickname: params.customNickname
    });

    const row = {
      category: params.category,
      content: String(params.content || '').trim(),
      display_nickname: displayNickname,
      is_private: !!params.isPrivate,
      attached_saju: params.attachedSaju || null,
      user_kakao_id: user ? user.id : null,
      user_real_nickname: user ? user.nickname : null
    };

    if (!row.content || row.content.length < 5) {
      return { error: { message: '본문은 5자 이상 입력해주세요.' } };
    }
    if (row.content.length > 2000) {
      return { error: { message: '본문은 2,000자 이내로 작성해주세요.' } };
    }

    const { data, error } = await sb.from('inquiries').insert(row).select().single();
    return { data, error };
  }

  // 글 목록
  // params: { category?, limit?, offset? }
  // - 세션 보유(카카오 로그인) 시: /api/board 가 공개글 + 내 비밀글(마스터: 비밀글 전체) 반환
  // - 그 외: anon 키로 공개글만 (비밀글 SELECT 정책은 RLS 에서 폐기됨)
  async function listInquiries(params = {}) {
    const sb = getClient();
    if (!sb) return { data: [], error: { message: 'Supabase 미설정' } };

    if (_session()) {
      const j = await board('inquiries.list', {
        category: params.category || null,
        limit: typeof params.limit === 'number' ? params.limit : 50,
        offset: typeof params.offset === 'number' ? params.offset : 0
      });
      if (j && j.ok) return { data: j.data || [], error: null };
      // 서버 실패 시 공개글만 폴백
      console.warn('[SajuSupa] inquiries.list 서버 실패 → 공개글만 표시:', j && j.error);
    }

    let query = sb.from('inquiries')
      .select('*, replies(id, content, is_master, author_nickname, created_at)')
      .eq('is_private', false)
      .order('created_at', { ascending: false });

    if (params.category) {
      query = query.eq('category', params.category);
    }

    if (typeof params.limit === 'number') query = query.limit(params.limit);
    if (typeof params.offset === 'number') {
      query = query.range(params.offset, params.offset + (params.limit || 20) - 1);
    }

    return await query;
  }

  // 단일 글 조회
  async function getInquiry(id) {
    const sb = getClient();
    if (!sb) return { data: null, error: { message: 'Supabase 미설정' } };
    return await sb.from('inquiries')
      .select('*, replies(*)')
      .eq('id', id)
      .single();
  }

  // 글 삭제 (본인 또는 마스터) — /api/board 대행 (서버가 본인/마스터 판정)
  async function deleteInquiry(id) {
    const user = _currentUser();
    if (!user) return { error: { message: '로그인이 필요합니다.' } };
    return _asResult(await board('inquiries.delete', { id: id }));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 답글 (마스터 작성) — /api/board 대행
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function createReply(inquiryId, content) {
    const user = _currentUser();
    if (!user || !_isMaster()) {
      return { error: { message: '답글 작성은 마스터만 가능합니다.' } };
    }
    const text = String(content || '').trim();
    if (text.length < 2) return { error: { message: '답글이 너무 짧습니다.' } };
    if (text.length > 3000) return { error: { message: '답글은 3,000자 이내로 작성해주세요.' } };
    return _asResult(await board('replies.create', { inquiryId: inquiryId, content: text, nickname: user.nickname }));
  }

  async function deleteReply(replyId) {
    if (!_isMaster()) return { error: { message: '마스터만 가능' } };
    return _asResult(await board('replies.delete', { id: replyId }));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 칼럼 댓글
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function createComment(params) {
    const sb = getClient();
    if (!sb) return { error: { message: 'Supabase 미설정' } };

    const user = _currentUser();
    const isMaster = _isMaster();
    const displayNickname = _resolveDisplayNickname({
      anonymous: params.anonymous,
      customNickname: params.customNickname
    });

    const text = String(params.content || '').trim();
    if (text.length < 2) return { error: { message: '댓글이 너무 짧습니다.' } };
    if (text.length > 1000) return { error: { message: '댓글은 1,000자 이내로 작성해주세요.' } };

    const row = {
      column_slug: params.columnSlug,
      content: text,
      display_nickname: isMaster ? '운영자' : displayNickname,
      user_kakao_id: user ? user.id : null,
      user_real_nickname: user ? user.nickname : null,
      is_master: isMaster,
      parent_id: params.parentId || null
    };

    return await sb.from('column_comments').insert(row).select().single();
  }

  async function listComments(columnSlug) {
    const sb = getClient();
    if (!sb) return { data: [], error: { message: 'Supabase 미설정' } };
    return await sb.from('column_comments')
      .select('*')
      .eq('column_slug', columnSlug)
      .order('created_at', { ascending: true });
  }

  // 댓글 삭제 (본인 또는 마스터) — /api/board 대행
  async function deleteComment(id) {
    const user = _currentUser();
    if (!user) return { error: { message: '로그인 필요' } };
    return _asResult(await board('comments.delete', { id: id }));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 좋아요
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function toggleLike(targetType, targetId) {
    const sb = getClient();
    if (!sb) return { error: { message: 'Supabase 미설정' } };
    const user = _currentUser();
    if (!user) return { error: { message: '카카오 로그인 후 좋아요를 누를 수 있어요.' } };

    // 이미 좋아요 했는지 체크
    const { data: existing } = await sb.from('likes')
      .select('user_kakao_id')
      .eq('user_kakao_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .maybeSingle();

    if (existing) {
      // 취소
      const { error } = await sb.from('likes').delete()
        .eq('user_kakao_id', user.id)
        .eq('target_type', targetType)
        .eq('target_id', targetId);
      return { liked: false, error };
    } else {
      // 추가
      const { error } = await sb.from('likes').insert({
        user_kakao_id: user.id,
        target_type: targetType,
        target_id: targetId
      });
      return { liked: true, error };
    }
  }

  async function getUserLikes(targetType, targetIds) {
    const sb = getClient();
    if (!sb) return new Set();
    const user = _currentUser();
    if (!user || !targetIds || targetIds.length === 0) return new Set();

    const { data } = await sb.from('likes')
      .select('target_id')
      .eq('user_kakao_id', user.id)
      .eq('target_type', targetType)
      .in('target_id', targetIds);

    return new Set((data || []).map(r => r.target_id));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 내가 남긴 글 (마이페이지용)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function myInquiries() {
    const sb = getClient();
    if (!sb) return { data: [], error: null };
    const user = _currentUser();
    if (!user) return { data: [], error: null };
    // 세션 보유 시 서버 대행 (내 비밀글 포함) / 없으면 공개글만
    if (_session()) {
      const j = await board('inquiries.mine');
      if (j && j.ok) return { data: j.data || [], error: null };
    }
    return await sb.from('inquiries')
      .select('*, replies(id, content, is_master, created_at)')
      .eq('user_kakao_id', user.id)
      .eq('is_private', false)
      .order('created_at', { ascending: false });
  }

  async function myComments() {
    const sb = getClient();
    if (!sb) return { data: [], error: null };
    const user = _currentUser();
    if (!user) return { data: [], error: null };
    return await sb.from('column_comments')
      .select('*')
      .eq('user_kakao_id', user.id)
      .order('created_at', { ascending: false });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 유틸 — 시각 표시
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}시간 전`;
    if (diffMin < 60 * 24 * 7) return `${Math.floor(diffMin / (60 * 24))}일 전`;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // 카테고리 라벨/색
  const CATEGORIES = {
    question:      { label: '질문',      color: '#5a8a98', icon: '❓' },
    topic_request: { label: '주제 요청', color: '#b8923c', icon: '📝' },
    opinion:       { label: '의견',      color: '#b8607a', icon: '💬' }
  };

  return {
    isEnabled, getClient, board,
    createInquiry, listInquiries, getInquiry, deleteInquiry,
    createReply, deleteReply,
    createComment, listComments, deleteComment,
    toggleLike, getUserLikes,
    myInquiries, myComments,
    formatTime, escapeHtml,
    CATEGORIES
  };
})();

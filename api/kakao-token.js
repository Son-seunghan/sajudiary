/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   카카오 로그인 — 토큰 교환 + 프로필 조회 (Vercel 서버리스)
   클라이언트(auth.js handleCallback)가 인가 code를 보내면
   REST API 키로 토큰 교환 → 사용자 정보 반환.
   → 실제 카카오 ID·닉네임 확보 (폴백 모드 졸업)

   환경변수:
   - KAKAO_REST_API_KEY  (필수) — developers.kakao.com 앱 키
   - KAKAO_CLIENT_SECRET (선택) — 보안 설정에서 사용 중일 때만
   - SESSION_SECRET      (선택) — 설정 시 서버 원장(/api/ledger)용 세션 토큰 발급
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const REST_KEY = process.env.KAKAO_REST_API_KEY;
  if (!REST_KEY) {
    return res.status(500).json({ error: '카카오 로그인 서버 설정이 완료되지 않았습니다.' });
  }

  const { code, redirectUri } = req.body || {};
  if (!code || !redirectUri) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  // redirect_uri 화이트리스트 — 우리 도메인만 허용
  try {
    const u = new URL(redirectUri);
    // 2026-09-02: '*.vercel.app' 전체 허용 → 자기 프로젝트 도메인(sajudiary.vercel.app + 프리뷰)으로 축소
    const okHost = u.hostname === 'sajudiary.com'
      || u.hostname === 'www.sajudiary.com'
      || u.hostname === 'localhost'
      || u.hostname === 'sajudiary.vercel.app'
      || /^sajudiary-[a-z0-9-]+\.vercel\.app$/.test(u.hostname);
    if (!okHost) {
      return res.status(400).json({ error: '허용되지 않은 redirect_uri' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'redirect_uri 형식 오류' });
  }

  try {
    // ── 1) code → access_token ──
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: REST_KEY,
      redirect_uri: redirectUri,
      code: code
    });
    if (process.env.KAKAO_CLIENT_SECRET) {
      body.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
    }

    const tr = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: body
    });
    const token = await tr.json();
    if (!tr.ok || token.error) {
      console.error('[kakao-token] 토큰 교환 실패:', JSON.stringify(token));
      return res.status(401).json({ error: token.error_description || token.error || '토큰 교환 실패' });
    }

    // ── 2) access_token → 사용자 정보 ──
    const ur = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { 'Authorization': 'Bearer ' + token.access_token }
    });
    const me = await ur.json();
    if (!ur.ok || !me.id) {
      console.error('[kakao-token] 사용자 조회 실패:', JSON.stringify(me));
      return res.status(401).json({ error: '사용자 정보 조회 실패' });
    }

    const acc = me.kakao_account || {};

    // ── 2-1) 회원 원장 기록 (site_users upsert — 가입·재방문 계측용) ──
    // first_seen은 최초 insert 때만 default로 박히고, 이후엔 last_seen만 갱신됨.
    // 계측 실패가 로그인을 막으면 안 되므로 전부 무시.
    try {
      const SK = process.env.SUPABASE_SERVICE_KEY;
      if (SK) {
        await fetch('https://hlxttdvvwftiquzqxgxs.supabase.co/rest/v1/site_users?on_conflict=kakao_id', {
          method: 'POST',
          headers: {
            'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({ kakao_id: 'kakao_' + me.id, last_seen: new Date().toISOString() })
        });
      }
    } catch (e) { /* 계측 실패 무시 */ }

    // ── 3) 서버 원장용 세션 토큰 발급 (SESSION_SECRET 설정 시) ──
    // base64url(payload).HMAC — /api/ledger가 이 서명으로 본인 확인
    let session = null;
    if (process.env.SESSION_SECRET) {
      const payload = Buffer.from(JSON.stringify({
        id: 'kakao_' + me.id,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 30   // 30일 (2026-09-02: 90일 → 30일, 토큰 유출 시 피해 기간 단축)
      })).toString('base64url');
      const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET)
        .update(payload).digest('base64url');
      session = payload + '.' + sig;
    }

    return res.status(200).json({
      ok: true,
      id: me.id,
      nickname: (acc.profile && acc.profile.nickname) || '회원',
      profileImage: (acc.profile && acc.profile.profile_image_url) || '',
      birthday: acc.birthday || '',   // MMDD (동의항목 승인 시)
      session: session
    });
  } catch (e) {
    console.error('[kakao-token] exception:', e);
    return res.status(500).json({ error: '카카오 서버 연결 실패' });
  }
};

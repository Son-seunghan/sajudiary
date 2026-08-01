/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   카카오 로그인 — 토큰 교환 + 프로필 조회 (Vercel 서버리스)
   클라이언트(auth.js handleCallback)가 인가 code를 보내면
   REST API 키로 토큰 교환 → 사용자 정보 반환.
   → 실제 카카오 ID·닉네임 확보 (폴백 모드 졸업)

   환경변수:
   - KAKAO_REST_API_KEY  (필수) — developers.kakao.com 앱 키
   - KAKAO_CLIENT_SECRET (선택) — 보안 설정에서 사용 중일 때만
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

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
    const okHost = u.hostname === 'sajudiary.com'
      || u.hostname === 'www.sajudiary.com'
      || u.hostname === 'localhost'
      || u.hostname.endsWith('.vercel.app');
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
    return res.status(200).json({
      ok: true,
      id: me.id,
      nickname: (acc.profile && acc.profile.nickname) || '회원',
      profileImage: (acc.profile && acc.profile.profile_image_url) || '',
      birthday: acc.birthday || ''   // MMDD (동의항목 승인 시)
    });
  } catch (e) {
    console.error('[kakao-token] exception:', e);
    return res.status(500).json({ error: '카카오 서버 연결 실패' });
  }
};

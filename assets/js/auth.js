/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 - 인증 모듈 (auth.js)
   카카오 SDK 초기화 + 로그인/로그아웃 + 사용자 상태 관리
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Auth = (function () {
  const STORAGE_KEY = 'sajudiary_user';
  const cfg = window.SAJULOG_CONFIG;

  // ─── SDK 초기화 ───
  function initKakao() {
    if (cfg.DEV_MODE) {
      console.warn('[Auth] DEV_MODE: 카카오 JS 키가 설정되지 않아 시뮬레이션 모드로 동작합니다.');
      return false;
    }
    if (typeof Kakao === 'undefined') {
      console.error('[Auth] Kakao SDK가 로드되지 않았습니다.');
      return false;
    }
    if (!Kakao.isInitialized()) {
      Kakao.init(cfg.KAKAO_JS_KEY);
    }
    return Kakao.isInitialized();
  }

  // ─── 로그인 ───
  // opts: 'product_id' (단품 결제) | '__cart__' (장바구니 결제)
  function login(opts) {
    const isCartMode = opts === '__cart__';
    const productId  = isCartMode ? null : opts;

    if (cfg.DEV_MODE) {
      const fakeUser = {
        id: 'dev_' + Date.now(),
        nickname: '테스터',
        profile_image: '',
        provider: 'dev'
      };
      saveUser(fakeUser);

      if (isCartMode) {
        window.location.href = 'payment.html?fromCart=1';
      } else {
        goToPayment(productId);
      }
      return;
    }

    if (!initKakao()) {
      alert('카카오 SDK 초기화에 실패했습니다.\n새로고침 후 다시 시도해주세요.');
      return;
    }

    Kakao.Auth.authorize({
      redirectUri: window.location.origin + window.location.pathname,
      state: isCartMode ? '__cart__' : (productId || ''),
      scope: 'profile_nickname,profile_image'
    });
  }

  // ─── URL 콜백 처리 (카카오에서 돌아왔을 때) ───
  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const product = params.get('state') || params.get('product');

    if (!code) return; // 콜백이 아니면 종료

    console.log('[Auth] 콜백 시작 — 받은 code:', code.substring(0, 20) + '...');
    console.log('[Auth] 상품:', product);

    if (!initKakao()) {
      alert('카카오 SDK 초기화 실패');
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    console.log('[Auth] redirect_uri:', redirectUri);

    let tokenResponse, tokenData;
    try {
      // ── 1) code → access_token 교환 ──
      tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: cfg.KAKAO_JS_KEY,
          redirect_uri: redirectUri,
          code: code
        })
      });

      console.log('[Auth] 토큰 응답 상태:', tokenResponse.status);
      tokenData = await tokenResponse.json();
      console.log('[Auth] 토큰 응답 데이터:', tokenData);

      if (tokenData.error) {
        throw new Error(`[${tokenData.error}] ${tokenData.error_description || ''}`);
      }

      // ── 2) access_token 으로 사용자 정보 조회 ──
      Kakao.Auth.setAccessToken(tokenData.access_token);
      const userResponse = await Kakao.API.request({ url: '/v2/user/me' });
      console.log('[Auth] 사용자 정보:', userResponse);

      const user = {
        id: 'kakao_' + userResponse.id,
        nickname: userResponse.kakao_account?.profile?.nickname || '회원',
        profile_image: userResponse.kakao_account?.profile?.profile_image_url || '',
        provider: 'kakao'
      };
      saveUser(user);
      console.log('[Auth] 로그인 성공! 결제 페이지로 이동');

      if (product === '__cart__') {
        window.location.href = 'payment.html?fromCart=1';
      } else {
        goToPayment(product);
      }

    } catch (err) {
      // ─── 토큰 교환 실패 — 우아한 폴백 ───
      // CORS / 백엔드 부재 등으로 토큰 교환이 안 될 때
      // ※ 실서비스에서는 백엔드(Vercel 함수)에서 처리해야 함
      console.warn('[Auth] ⚠️ 토큰 교환 실패 — 폴백 모드로 로그인 처리');
      console.warn('[Auth] 원본 에러:', err);

      // ── 폴백 ID 안정화 ──
      // 매번 새 인가 code로 새 ID 만들지 말고, 한 번 만들어진 ID는 localStorage에 캐시
      // (같은 브라우저에서 로그인 = 같은 사용자로 인식 → isMaster·구매내역 유지)
      const FALLBACK_ID_KEY = 'sajudiary_fallback_id';
      let fallbackId = localStorage.getItem(FALLBACK_ID_KEY);
      if (!fallbackId) {
        fallbackId = 'kakao_fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(FALLBACK_ID_KEY, fallbackId);
      }
      const fallbackUser = {
        id: fallbackId,
        nickname: '카카오 회원',
        profile_image: '',
        provider: 'kakao_fallback'
      };
      saveUser(fallbackUser);
      console.log('[Auth] ✅ 폴백 로그인 — 안정 ID:', fallbackId);

      console.log('[Auth] ✅ 폴백 로그인 성공, 결제 페이지로 이동');
      if (product === '__cart__') {
        window.location.href = 'payment.html?fromCart=1';
      } else {
        goToPayment(product);
      }
    }
  }

  // ─── 결제 페이지로 이동 ───
  function goToPayment(productId) {
    if (!productId || !cfg.PRODUCTS[productId]) {
      // 상품 정보 없으면 홈으로
      window.location.href = 'index.html';
      return;
    }
    window.location.href = `payment.html?product=${productId}`;
  }

  // ─── 사용자 정보 저장/조회/삭제 ───
  function saveUser(user) {
    // ── (1) 기존 사용자의 isMaster 권한 보존 ──
    // 매번 카카오 로그인할 때마다 새 user 객체로 덮어쓰면 isMaster가 풀리는 문제 방지
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        if (existing && existing.isMaster) {
          user.isMaster = true;
          console.log('[Auth] ✦ 기존 마스터 권한 유지:', user.id);
        }
      } catch (e) { /* ignore */ }
    }

    // ── (2) 마스터 화이트리스트 자동 적용 ──
    // config.js의 MASTER_KAKAO_IDS에 본인 ID가 있으면 자동으로 isMaster 활성화
    // (카카오 ID는 콘솔 로그에서 확인 → config.js의 MASTER_KAKAO_IDS에 추가)
    const masterList = (cfg && cfg.MASTER_KAKAO_IDS) || [];
    if (masterList.includes(user.id)) {
      user.isMaster = true;
      console.log('[Auth] ✦ 화이트리스트 마스터 자동 적용:', user.id);
    }

    // ── (3) 신규 사용자 체크 + 환영 쿠폰 ──
    const histKey = 'sajudiary_user_history';
    const history = JSON.parse(localStorage.getItem(histKey) || '[]');
    const isNewUser = !history.includes(user.id);

    if (isNewUser) {
      history.push(user.id);
      localStorage.setItem(histKey, JSON.stringify(history));

      // 신규 가입 환영 쿠폰 자동 발급
      if (typeof Cart !== 'undefined' && Cart.issueCoupon) {
        const issued = Cart.issueCoupon('WELCOME3000');
        if (issued) {
          sessionStorage.setItem('coupon_just_issued', 'WELCOME3000');
          console.log('[Auth] 🎉 신규 환영 쿠폰 발급:', issued);
        }
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    console.log('[Auth] 사용자 저장됨 — id:', user.id, '| 마스터:', !!user.isMaster);
  }
  function getUser() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    if (!cfg.DEV_MODE && typeof Kakao !== 'undefined' && Kakao.Auth?.getAccessToken()) {
      Kakao.Auth.logout();
    }
  }
  function isLoggedIn() {
    return getUser() !== null;
  }

  return {
    initKakao, login, logout, getUser, isLoggedIn, handleCallback
  };
})();

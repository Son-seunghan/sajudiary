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
      // birthday/gender/birthyear/age_range — 카카오 동의항목 심사 승인 후 재추가
      // 승인 받으면 scope에 'birthday,gender,birthyear' 추가
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
      // ── 서버리스에서 토큰 교환 + 프로필 조회 ──
      // REST API 키는 서버(환경변수)에만 존재 — 실제 카카오 ID·닉네임 확보
      tokenResponse = await fetch('/api/kakao-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, redirectUri: redirectUri })
      });

      console.log('[Auth] 토큰 교환 응답 상태:', tokenResponse.status);
      tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.ok) {
        throw new Error(tokenData.error || '토큰 교환 실패');
      }

      // 카카오 생일 (MMDD) — 사주 자동입력용 (동의항목 승인 시)
      const birthday = tokenData.birthday || '';
      const birthMM = birthday.length === 4 ? parseInt(birthday.substring(0, 2), 10) : null;
      const birthDD = birthday.length === 4 ? parseInt(birthday.substring(2, 4), 10) : null;

      const user = {
        id: 'kakao_' + tokenData.id,
        nickname: tokenData.nickname || '회원',
        profile_image: tokenData.profileImage || '',
        provider: 'kakao',
        birthMM: birthMM,
        birthDD: birthDD,
        session: tokenData.session || null   // 서버 원장(/api/ledger)용 서명 토큰
      };
      saveUser(user);
      console.log('[Auth] 로그인 성공! (실제 카카오 계정:', user.nickname + ') 결제 페이지로 이동');

      if (product === '__cart__') {
        window.location.href = 'payment.html?fromCart=1';
      } else {
        goToPayment(product);
      }

    } catch (err) {
      // ─── 토큰 교환 실패 ───
      // (2026-08-05) 폴백 가짜 계정 생성 제거 — 폴백 사용자는 실명·세션이 없어
      // 후기 마스킹이 깨지고 원장(구매·분석·쿠폰) 기록이 누락되는 문제가 있었음
      console.warn('[Auth] ⚠️ 토큰 교환 실패:', err);

      // 이미 정상 카카오 계정으로 로그인돼 있으면 그대로 유지하고 진행
      // (새로고침 등으로 인가 코드가 재사용돼 실패한 경우 — 기존 계정 덮어쓰기 방지)
      const existing = getUser();
      if (existing && existing.provider === 'kakao') {
        console.log('[Auth] 기존 정상 계정 유지:', existing.id);
        if (product === '__cart__') {
          window.location.href = 'payment.html?fromCart=1';
        } else {
          goToPayment(product);
        }
        return;
      }

      // 가짜 계정을 만들지 않고 재시도 안내 → 로그인 화면으로 복귀
      alert('카카오 로그인에 실패했어요.\n네트워크가 불안정하거나 로그인 창이 오래 열려 있었을 수 있어요.\n확인을 누르면 로그인 화면으로 돌아갑니다. 다시 시도해주세요.');
      window.location.href = window.location.pathname + (product ? '?product=' + encodeURIComponent(product) : '');
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

      // GA4: 신규 가입
      if (typeof gtag === 'function') gtag('event', 'sign_up', { method: 'kakao' });

      // 신규 가입 환영 쿠폰 자동 발급
      if (typeof Cart !== 'undefined' && Cart.issueCoupon) {
        const issued = Cart.issueCoupon('WELCOME3000');
        if (issued) {
          sessionStorage.setItem('coupon_just_issued', 'WELCOME3000');
          console.log('[Auth] 🎉 신규 환영 쿠폰 발급:', issued);
        }
      }
    }

    // GA4: 로그인 (신규·기존 공통)
    if (typeof gtag === 'function') gtag('event', 'login', { method: 'kakao' });

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

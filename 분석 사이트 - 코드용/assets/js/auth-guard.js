/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주로그 - 권한 가드 (auth-guard.js)
   - 로그인 여부 검사
   - 결제 완료 여부 검사
   - 미결제/미로그인 시 적절한 페이지로 리다이렉트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const AuthGuard = (function () {
  const USER_KEY      = 'sajulog_user';
  const PURCHASES_KEY = 'sajulog_purchases';

  // ─── 사용자 ───
  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  function isLoggedIn() {
    return getUser() !== null;
  }

  // ─── 구매 내역 ───
  // localStorage에 [{productId, orderId, paymentKey, amount, purchasedAt, ...}] 배열로 저장
  function getPurchases() {
    const raw = localStorage.getItem(PURCHASES_KEY);
    return raw ? JSON.parse(raw) : [];
  }
  function hasPurchased(productId) {
    return getPurchases().some(p => p.productId === productId);
  }
  function addPurchase(record) {
    const list = getPurchases();
    list.push({ ...record, purchasedAt: new Date().toISOString() });
    localStorage.setItem(PURCHASES_KEY, JSON.stringify(list));
  }

  // ─── 페이지 접근 가드 ───
  // 사용 예: AuthGuard.requirePurchase('couple_plus')
  function requirePurchase(productId, options = {}) {
    const user = getUser();

    // 1) 로그인 안 되어 있으면 로그인 페이지로
    if (!user) {
      const from = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `../login.html?product=${productId}&from=${from}`;
      return false;
    }

    // 1-1) 마스터 계정은 결제 검사 패스 (모든 상품 무료 열람)
    if (user.isMaster === true) {
      console.log('[AuthGuard] ✦ 마스터 계정 — 결제 검사 통과:', productId);
      return true;
    }

    // 2) 결제 안 했으면 결제 페이지로
    if (!hasPurchased(productId)) {
      const message = '이 페이지는 결제 후 이용 가능합니다.';
      if (options.silent !== true) {
        alert(message + '\n결제 페이지로 이동합니다.');
      }
      window.location.href = `../payment.html?product=${productId}`;
      return false;
    }

    // 3) OK
    return true;
  }

  // ─── 마스터 계정 토글 (콘솔 / URL용) ───
  function setMaster(value = true) {
    const user = getUser();
    if (!user) {
      console.warn('[AuthGuard] 마스터 권한을 부여하려면 먼저 로그인해주세요.');
      return false;
    }
    user.isMaster = !!value;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    console.log(`[AuthGuard] ✦ 마스터 권한 ${value ? '활성화' : '해제'}됨:`, user.nickname);
    return true;
  }
  function isMaster() {
    const user = getUser();
    return !!(user && user.isMaster);
  }

  // ─── 로그인만 필요한 경우 (구매 무관) ───
  function requireLogin() {
    if (!isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  return {
    getUser, isLoggedIn,
    getPurchases, hasPurchased, addPurchase,
    requirePurchase, requireLogin,
    setMaster, isMaster
  };
})();

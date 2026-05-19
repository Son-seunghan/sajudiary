/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 - 권한 가드 (auth-guard.js)
   - 로그인 여부 검사
   - 결제 완료 여부 검사
   - 미결제/미로그인 시 적절한 페이지로 리다이렉트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const AuthGuard = (function () {
  const USER_KEY      = 'sajudiary_user';
  const PURCHASES_KEY = 'sajudiary_purchases';
  const ANALYSES_KEY  = 'sajudiary_analyses';
  const COUPONS_KEY   = 'sajudiary_redeemed_coupons';

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

  // ─── 분석 입력 잠금 (다중 슬롯 지원) ───
  // localStorage에 { productId: [{ id, inputs, lockedAt }, ...] } 배열로 저장
  // N 결제 = N 입력 가능. 결제 횟수만큼 슬롯 생성. 마스터는 제한 없음.
  function _getAllAnalyses() {
    const raw = localStorage.getItem(ANALYSES_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    // 마이그레이션: 옛 단일 객체 형태를 배열로 변환
    const migrated = {};
    Object.keys(data).forEach(pid => {
      const v = data[pid];
      if (Array.isArray(v)) {
        migrated[pid] = v;
      } else if (v && typeof v === 'object' && v.inputs) {
        // 옛 단일 객체 → 배열로
        migrated[pid] = [{
          id: 'an_legacy_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          inputs: v.inputs,
          lockedAt: v.lockedAt || new Date().toISOString()
        }];
      }
    });
    return migrated;
  }
  // 모든 분석 슬롯 배열 가져오기 (없으면 빈 배열)
  function getAnalyses(productId) {
    return _getAllAnalyses()[productId] || [];
  }
  // 슬롯 인덱스로 특정 분석 가져오기 (기본: 가장 최근)
  function getAnalysis(productId, slotIdx) {
    const list = getAnalyses(productId);
    if (list.length === 0) return null;
    if (typeof slotIdx === 'number' && slotIdx >= 0 && slotIdx < list.length) {
      return list[slotIdx];
    }
    return list[list.length - 1]; // 기본: 최신
  }
  function hasAnalysis(productId) {
    return getAnalyses(productId).length > 0;
  }
  // 결제 횟수 기반 — 추가 분석 가능 횟수
  function getRemainingSlots(productId) {
    const isMaster = !!(getUser() && getUser().isMaster);
    if (isMaster) return 999; // 마스터는 무제한
    const purchaseCount = getPurchases().filter(p => p.productId === productId).length;
    const usedCount = getAnalyses(productId).length;
    return Math.max(0, purchaseCount - usedCount);
  }
  function canAnalyze(productId) {
    return getRemainingSlots(productId) > 0;
  }
  // 새 분석 슬롯 저장 (잔여 슬롯 있을 때만, 마스터는 항상 가능)
  function saveAnalysis(productId, inputs) {
    const isMaster = !!(getUser() && getUser().isMaster);
    if (!isMaster && getRemainingSlots(productId) <= 0) {
      console.warn('[AuthGuard] 결제 잔여 슬롯이 없습니다:', productId);
      return null;
    }
    const all = _getAllAnalyses();
    if (!all[productId]) all[productId] = [];
    const newRecord = {
      id: 'an_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      inputs,
      lockedAt: new Date().toISOString()
    };
    all[productId].push(newRecord);
    localStorage.setItem(ANALYSES_KEY, JSON.stringify(all));
    console.log('[AuthGuard] 분석 슬롯 저장:', productId, 'slot', all[productId].length - 1);
    return newRecord;
  }
  // 마스터 전용 — 특정 슬롯 또는 전체 삭제
  function clearAnalysis(productId, slotIdx) {
    if (!(getUser() && getUser().isMaster)) {
      console.warn('[AuthGuard] 잠금 해제는 마스터만 가능합니다.');
      return false;
    }
    const all = _getAllAnalyses();
    if (typeof slotIdx === 'number' && all[productId]) {
      all[productId].splice(slotIdx, 1);
      if (all[productId].length === 0) delete all[productId];
    } else {
      delete all[productId];
    }
    localStorage.setItem(ANALYSES_KEY, JSON.stringify(all));
    return true;
  }

  // ─── 무료 액세스 쿠폰 ───
  // localStorage에 ['saju2026-light', ...] 형태로 사용한 코드 저장 (디바이스당 1회)
  function _getRedeemedCoupons() {
    const raw = localStorage.getItem(COUPONS_KEY);
    return raw ? JSON.parse(raw) : [];
  }
  function _markCouponRedeemed(normalizedCode) {
    const list = _getRedeemedCoupons();
    if (!list.includes(normalizedCode)) {
      list.push(normalizedCode);
      localStorage.setItem(COUPONS_KEY, JSON.stringify(list));
    }
  }
  // 코드 검증 + 무료 구매 슬롯 부여
  // return: { success: true, productId, label } | { success: false, error }
  function redeemCoupon(rawCode) {
    if (!rawCode) return { success: false, error: '쿠폰 코드를 입력해주세요.' };
    const cfg = window.SAJULOG_CONFIG;
    if (!cfg || !cfg.FREE_COUPONS) {
      return { success: false, error: '쿠폰 시스템이 비활성화 상태입니다.' };
    }
    const code = String(rawCode).trim().toLowerCase();
    const coupon = cfg.FREE_COUPONS[code];
    if (!coupon) return { success: false, error: '유효하지 않은 쿠폰 코드입니다.' };

    if (!getUser()) return { success: false, error: '쿠폰 사용 전 로그인이 필요합니다.' };

    if (_getRedeemedCoupons().includes(code)) {
      return { success: false, error: '이 쿠폰은 이미 사용되었습니다.' };
    }

    // 무료 구매 슬롯 1회 부여
    addPurchase({
      productId: coupon.productId,
      orderId: 'coupon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      paymentKey: null,
      amount: 0,
      method: 'coupon',
      couponCode: code
    });
    _markCouponRedeemed(code);
    console.log('[AuthGuard] 쿠폰 사용 완료:', code, '→', coupon.productId);
    return { success: true, productId: coupon.productId, label: coupon.label };
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

  // ─── 게스트 모드 (카드사 심사관용 우회 접근) ───
  // ?guest=on URL → 카카오 로그인 없이 사이트 흐름 확인 가능
  // 결제 페이지·결제창까지 진입 가능 (실제 결제는 테스트 키로만)
  function setGuest() {
    const guestUser = {
      id: 'guest_demo_' + Date.now(),
      nickname: '심사용 데모',
      profile_image: '',
      provider: 'guest',
      isMaster: false,
      birthMM: null,
      birthDD: null
    };
    localStorage.setItem(USER_KEY, JSON.stringify(guestUser));
    console.log('[AuthGuard] 게스트 데모 모드 활성화');
    return true;
  }
  function isGuest() {
    const user = getUser();
    return !!(user && user.provider === 'guest');
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
    getAnalyses, getAnalysis, hasAnalysis, saveAnalysis, clearAnalysis,
    getRemainingSlots, canAnalyze,
    redeemCoupon,
    requirePurchase, requireLogin,
    setMaster, isMaster,
    setGuest, isGuest
  };
})();

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

  // ─── 서버 원장 (/api/ledger — Supabase 경유) ───
  // 로그인 시 발급된 세션 토큰이 있으면 구매·분석 기록을 서버에 보관 →
  // 어느 기기에서 로그인해도 내역 유지. 서버 불가 시 로컬 저장으로 폴백.
  function _session() {
    const u = getUser();
    return (u && u.session) || null;
  }
  async function _ledger(action, extra) {
    const session = _session();
    if (!session) return null;
    try {
      const r = await fetch('/api/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ session: session, action: action }, extra || {}))
      });
      return await r.json();
    } catch (e) {
      console.warn('[AuthGuard] 원장 서버 연결 실패:', action, e);
      return null;
    }
  }

  // 서버 원장 → 로컬 미러링. 페이지 렌더 전에 await 권장.
  // 1) 서버가 모르는 로컬 기록을 먼저 서버로 병합(migrate)
  // 2) 서버 상태를 로컬로 내려받음 (서버 = 단일 진실)
  let _synced = false;
  async function syncFromServer(force) {
    if (_synced && !force) return true;
    if (!_session()) return false;

    const localPurchases = getPurchases();
    const localAnalyses = _getAllAnalyses();
    const hasLocal = localPurchases.length > 0 || Object.keys(localAnalyses).length > 0;
    if (hasLocal) {
      const m = await _ledger('migrate', { purchases: localPurchases, analyses: localAnalyses });
      // 병합 실패 시 로컬을 덮어쓰지 않음 — 기록 유실 방지
      if (!m || !m.ok) return false;
    }

    const r = await _ledger('list');
    if (!r || !r.ok) return false;

    const purchases = (r.purchases || []).map(row => row.raw).filter(Boolean);
    const analyses = {};
    (r.analyses || []).forEach(row => {
      if (!row.raw) return;
      if (!analyses[row.product_id]) analyses[row.product_id] = [];
      analyses[row.product_id].push(row.raw);
    });
    localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases));
    localStorage.setItem(ANALYSES_KEY, JSON.stringify(analyses));
    _synced = true;
    console.log('[AuthGuard] 서버 원장 동기화 — 구매', purchases.length, '건 / 분석',
      Object.keys(analyses).reduce((s, k) => s + analyses[k].length, 0), '건');
    return true;
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
    const rec = { ...record, purchasedAt: new Date().toISOString() };
    const list = getPurchases();
    list.push(rec);
    localStorage.setItem(PURCHASES_KEY, JSON.stringify(list));
    // 서버 원장에도 기록 (실패해도 로컬은 유지 — 다음 동기화 때 병합됨)
    _ledger('purchase', { productId: rec.productId, raw: rec });
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
    // 서버 원장에도 기록 (실패해도 로컬은 유지 — 다음 동기화 때 병합됨)
    _ledger('analysis', { productId: productId, raw: newRecord });
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

  // ─── 서명형 선물/홍보 쿠폰 (gift-… / promo-…) ───
  // gift  : gift-<light|deep|couple|adult|any>-<nonce>-<sig8> — 1인용 1회
  // promo : promo-<key>-<tag>-<limit>-<sig8> — 홍보자 전용, 선착순 limit명·1인 1회
  // 서명 검증은 서버(/api/coupon-verify, COUPON_SECRET)에서 수행 — 클라이언트 위조 불가
  // 'any'(만능 이용권)는 현재 결제하려는 상품(contextProductId)에 적용
  const GIFT_PRODUCT_MAP = { light: 'light', deep: 'deep', couple: 'couple', adult: 'couple_plus' };
  async function redeemGiftCoupon(rawCode, contextProductId) {
    const code = String(rawCode || '').trim().toLowerCase();
    const isPromo = code.startsWith('promo-');
    if (!code.startsWith('gift-') && !isPromo) {
      return { success: false, error: '유효하지 않은 쿠폰 코드입니다.' };
    }
    if (!getUser()) return { success: false, error: '쿠폰 사용 전 로그인이 필요합니다.' };
    if (_getRedeemedCoupons().includes(code)) {
      return { success: false, error: '이 쿠폰은 이미 사용되었습니다.' };
    }

    let r;
    try {
      const resp = await fetch('/api/coupon-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // promo는 1인 1회 판별을 위해 세션 토큰 동봉 (서버에서 본인 확인)
        body: JSON.stringify({ code, session: _session() })
      });
      r = await resp.json();
      if (!resp.ok || !r.ok) {
        return { success: false, error: r.error || '쿠폰 확인에 실패했습니다.' };
      }
    } catch (e) {
      return { success: false, error: '쿠폰 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' };
    }

    const cfg = window.SAJULOG_CONFIG;
    const productId = r.productKey === 'any' ? contextProductId : GIFT_PRODUCT_MAP[r.productKey];
    if (!productId || !cfg.PRODUCTS[productId]) {
      return { success: false, error: '적용할 상품을 확인할 수 없습니다.' };
    }

    // gift: 서버 전역 1회용 체크 — 다른 기기에서 이미 쓴 코드도 차단 (세션 보유 시)
    // promo: coupon-verify에서 이미 횟수 기록·차단 완료 → 생략
    if (!isPromo) {
      const redeemR = await _ledger('redeem', { code });
      if (redeemR && redeemR.already) {
        return { success: false, error: '이미 사용된 쿠폰입니다.' };
      }
    }

    addPurchase({
      productId,
      orderId: (isPromo ? 'promo_' : 'gift_') + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      paymentKey: null,
      amount: 0,
      method: isPromo ? 'promo-coupon' : 'gift-coupon',
      couponCode: code,
      promoTag: r.tag || null
    });
    _markCouponRedeemed(code);
    console.log('[AuthGuard] 쿠폰 사용 완료:', code, '→', productId, isPromo ? '(홍보 ' + r.used + '/' + r.limit + ')' : '');
    const label = cfg.PRODUCTS[productId].name + ' 이용권';
    return { success: true, productId, label };
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

  // ─── 마스터 여부 조회 ───
  // ※ 보안 강화 (2026-07-02): setMaster() 공개 함수 제거.
  //    마스터 부여는 config.js MASTER_KAKAO_IDS 화이트리스트로만 (auth.js saveUser 참조)
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
    getUser, isLoggedIn, syncFromServer,
    getPurchases, hasPurchased, addPurchase,
    getAnalyses, getAnalysis, hasAnalysis, saveAnalysis, clearAnalysis,
    getRemainingSlots, canAnalyze,
    redeemCoupon, redeemGiftCoupon,
    requirePurchase, requireLogin,
    isMaster,
    setGuest, isGuest
  };
})();

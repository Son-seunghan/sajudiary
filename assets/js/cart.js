/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 - 장바구니 + 쿠폰 + 할인 (cart.js)
   localStorage 기반 (배포 시 백엔드로 이전 가능)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Cart = (function () {
  const CART_KEY    = 'sajudiary_cart';        // 장바구니 (productId 배열)
  const COUPONS_KEY = 'sajudiary_my_coupons';  // 보유 쿠폰
  const cfg = window.SAJULOG_CONFIG;

  // ─── 장바구니 ───
  function getItems() {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  }
  function setItems(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    notifyChange();
  }
  function addItem(productId) {
    if (!cfg.PRODUCTS[productId]) return false;
    const items = getItems();
    if (items.includes(productId)) return false;  // 중복 방지 (한 상품은 1개만)
    items.push(productId);
    setItems(items);
    return true;
  }
  function removeItem(productId) {
    setItems(getItems().filter(id => id !== productId));
  }
  function clear() {
    localStorage.removeItem(CART_KEY);
    notifyChange();
  }
  function count() {
    return getItems().length;
  }
  function has(productId) {
    return getItems().includes(productId);
  }

  // ─── 쿠폰 ───
  function getMyCoupons() {
    return JSON.parse(localStorage.getItem(COUPONS_KEY) || '[]');
  }
  function setMyCoupons(arr) {
    localStorage.setItem(COUPONS_KEY, JSON.stringify(arr));
  }
  function issueCoupon(couponId) {
    const def = cfg.COUPONS[couponId];
    if (!def) return null;
    const my = getMyCoupons();
    if (my.find(c => c.id === couponId && !c.used)) return null; // 이미 보유

    const issued = {
      id: def.id,
      name: def.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + (def.validDays || 30) * 24 * 60 * 60 * 1000,
      used: false,
      usedAt: null
    };
    my.push(issued);
    setMyCoupons(my);
    return issued;
  }
  function getAvailableCoupons() {
    const now = Date.now();
    return getMyCoupons().filter(c => !c.used && c.expiresAt > now);
  }
  function useCoupon(couponId) {
    const my = getMyCoupons();
    const c = my.find(c => c.id === couponId && !c.used);
    if (!c) return false;
    c.used = true;
    c.usedAt = Date.now();
    setMyCoupons(my);
    return true;
  }

  // ─── 할인 계산 ───
  // 입력: items (productId 배열), 쿠폰 ID (선택)
  // 출력: { subtotal, bundleDiscount, couponDiscount, total, ... }
  function calculate(items, couponId = null) {
    const products = items.map(id => cfg.PRODUCTS[id]).filter(Boolean);
    const subtotal = products.reduce((sum, p) => sum + p.price, 0);

    // 1) 묶음 할인
    const bundle = cfg.getBundleDiscount(products.length);
    const bundleDiscount = bundle ? Math.floor(subtotal * bundle.percent / 100) : 0;
    const afterBundle = subtotal - bundleDiscount;

    // 2) 쿠폰 할인
    let couponDiscount = 0;
    let couponInfo = null;
    if (couponId) {
      const def = cfg.COUPONS[couponId];
      const issued = getMyCoupons().find(c => c.id === couponId && !c.used);
      if (def && issued && afterBundle >= def.minOrderAmount) {
        if (def.discountType === 'fixed') {
          couponDiscount = def.discountValue;
        } else if (def.discountType === 'percent') {
          couponDiscount = Math.floor(afterBundle * def.discountValue / 100);
        }
        couponDiscount = Math.min(couponDiscount, afterBundle);
        couponInfo = def;
      }
    }

    const total = Math.max(0, afterBundle - couponDiscount);

    return {
      products,
      itemCount: products.length,
      subtotal,
      bundle, bundleDiscount,
      couponInfo, couponDiscount, couponId,
      total,
      totalSaved: subtotal - total
    };
  }

  // ─── 변경 이벤트 (헤더 카트 아이콘 업데이트용) ───
  function notifyChange() {
    document.dispatchEvent(new CustomEvent('sajudiary:cart-changed', { detail: { count: count() } }));
  }

  // ─── 헤더 카트 아이콘 자동 업데이트 ───
  function bindCartBadge(badgeElement) {
    if (!badgeElement) return;
    const update = () => {
      const c = count();
      badgeElement.textContent = c;
      badgeElement.classList.toggle('hidden', c === 0);
    };
    update();
    document.addEventListener('sajudiary:cart-changed', update);
  }

  return {
    // 장바구니
    getItems, addItem, removeItem, clear, count, has,
    // 쿠폰
    issueCoupon, getMyCoupons, getAvailableCoupons, useCoupon,
    // 계산
    calculate,
    // UI 헬퍼
    bindCartBadge
  };
})();

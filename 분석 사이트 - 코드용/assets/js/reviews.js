/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주로그 - 리뷰 시스템 (reviews.js)
   localStorage 기반 (배포 시 Supabase/Firebase로 이전 권장)
   ※ 현재는 같은 브라우저에서만 보존됨. 배포 후 백엔드 연동 필요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Reviews = (function () {
  const REVIEWS_KEY = 'sajulog_reviews';
  const cfg = window.SAJULOG_CONFIG;

  // ─── 모든 리뷰 조회 ───
  function getAll() {
    return JSON.parse(localStorage.getItem(REVIEWS_KEY) || '[]');
  }
  function saveAll(arr) {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(arr));
  }

  // ─── 상품별 리뷰 ───
  function getByProduct(productId) {
    return getAll().filter(r => r.productId === productId);
  }

  // ─── 사용자 리뷰 ───
  function getByUser(userId) {
    return getAll().filter(r => r.userId === userId);
  }
  function getUserReviewForProduct(userId, productId) {
    return getAll().find(r => r.userId === userId && r.productId === productId);
  }

  // ─── 리뷰 작성 (한 사용자가 한 상품에 1개만) ───
  function write({ userId, userNickname, productId, rating, content }) {
    if (!userId || !productId || !rating) return { success: false, error: '필수 정보 누락' };
    if (rating < 1 || rating > 5) return { success: false, error: '별점은 1~5점' };
    if (!content || content.trim().length < 5) return { success: false, error: '5자 이상 작성해주세요' };

    const all = getAll();
    const existing = all.find(r => r.userId === userId && r.productId === productId);
    if (existing) {
      // 수정
      existing.rating = rating;
      existing.content = content.trim();
      existing.updatedAt = Date.now();
    } else {
      // 신규
      all.push({
        id: 'rev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        userId,
        userNickname: maskNickname(userNickname || '회원'),
        productId,
        rating,
        content: content.trim(),
        createdAt: Date.now(),
        updatedAt: null
      });
    }
    saveAll(all);
    return { success: true };
  }

  // ─── 리뷰 삭제 ───
  function remove(reviewId, userId) {
    const all = getAll();
    const idx = all.findIndex(r => r.id === reviewId && r.userId === userId);
    if (idx === -1) return false;
    all.splice(idx, 1);
    saveAll(all);
    return true;
  }

  // ─── 닉네임 마스킹 (개인정보 보호) ───
  // 김민정 → 김O정 / 박수 → 박O / O수아 → O수아 (3자 이상만 마스킹)
  function maskNickname(nickname) {
    if (!nickname) return '회원';
    const trimmed = nickname.trim();
    if (trimmed.length <= 2) return trimmed;
    if (trimmed.length === 3) return trimmed[0] + 'O' + trimmed[2];
    return trimmed[0] + 'O'.repeat(trimmed.length - 2) + trimmed[trimmed.length - 1];
  }

  // ─── 평균 별점 ───
  function getAverageRating(productId = null) {
    const list = productId ? getByProduct(productId) : getAll();
    if (list.length === 0) return { average: 0, count: 0 };
    const sum = list.reduce((s, r) => s + r.rating, 0);
    return {
      average: Math.round(sum / list.length * 10) / 10,
      count: list.length
    };
  }

  // ─── 별점 HTML 렌더링 ───
  function renderStars(rating, size = 'text-base') {
    const full = Math.floor(rating);
    const html = [];
    for (let i = 0; i < 5; i++) {
      html.push(`<span class="${i < full ? 'star-on' : 'star-off'}">★</span>`);
    }
    return `<span class="stars ${size}">${html.join('')}</span>`;
  }

  // ─── 날짜 포맷 ───
  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  }

  // ─── 상품 태그 클래스 ───
  function getProductTagClass(productId) {
    const colorMap = { jade: 'tag-light', vermil: 'tag-deep', plum: 'tag-couple', wine: 'tag-wine' };
    const product = cfg.PRODUCTS[productId];
    return product ? (colorMap[product.color] || '') : '';
  }

  return {
    getAll, getByProduct, getByUser, getUserReviewForProduct,
    write, remove,
    maskNickname,
    getAverageRating,
    renderStars, formatDate, getProductTagClass
  };
})();

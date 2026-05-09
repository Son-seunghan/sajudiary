/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 - 통합 브랜드 헤더 (brand-bar.js)
   분석 페이지에 자동으로 상단 띠 + 하단 추천 카드 주입
   각 페이지 고유 디자인은 유지하면서 브랜드 일관성만 추가
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function () {
  const cfg = window.SAJULOG_CONFIG;
  if (!cfg) return;

  // 현재 페이지의 상품 ID 판별 (URL 기반)
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  let currentProductId = null;
  if (path.includes('saju_letter')) currentProductId = 'light';
  else if (path.includes('saju.html')) currentProductId = 'deep';
  else if (path.includes('gunghap_letter')) {
    currentProductId = params.get('mode') === 'adult' ? 'couple_plus' : 'couple';
  }

  function init() {
    injectBrandBar();
    injectNextProductCard();
    addPageFadeIn();
  }

  // ─── 1) 상단 브랜드 띠 ───
  function injectBrandBar() {
    if (document.getElementById('sajudiary-brand-bar')) return;

    // 현재 상품명 가져오기
    const product = currentProductId ? cfg.PRODUCTS[currentProductId] : null;
    const productName = product?.name || '';
    const productColor = product?.color || 'vermil';
    const colorMap = {
      jade: '#406878', vermil: '#b13a2c',
      plum: '#944860', wine: '#6a2438'
    };
    const accentColor = colorMap[productColor] || '#b13a2c';

    const bar = document.createElement('div');
    bar.id = 'sajudiary-brand-bar';
    bar.innerHTML = `
      <style>
        /* ━━ 사주다이어리 브랜드 띠 ━━ */
        #sajudiary-brand-bar {
          position: sticky; top: 0; z-index: 1000;
          background: linear-gradient(180deg, rgba(247, 240, 223, 0.96), rgba(247, 240, 223, 0.92));
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(184, 146, 60, 0.25);
          font-family: 'Pretendard', -apple-system, system-ui, sans-serif;
          color: #2c2520;
          padding: 0;
          box-shadow: 0 1px 0 rgba(184, 146, 60, 0.1);
        }
        /* 오행 5색선 */
        #sajudiary-brand-bar::before {
          content: ""; display: block; height: 2px;
          background: linear-gradient(90deg,
            #5a8a98 0%, #5a8a98 20%,
            #b13a2c 20%, #b13a2c 40%,
            #b8923c 40%, #b8923c 60%,
            #b8607a 60%, #b8607a 80%,
            #2c2520 80%, #2c2520 100%);
        }
        .sjb-inner {
          max-width: 1200px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 20px;
          height: 48px;
        }
        .sjb-logo {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none;
        }
        .sjb-logo .hanja {
          font-family: 'Shilla Culture', 'Noto Serif KR', serif;
          font-weight: 700;
          font-size: 20px;
          color: #b13a2c;
          letter-spacing: 0.05em;
        }
        .sjb-logo .divider {
          width: 1px; height: 18px; background: rgba(184, 146, 60, 0.4);
        }
        .sjb-logo .korean {
          font-family: 'Shilla Culture', 'Noto Serif KR', serif;
          font-weight: 700;
          font-size: 16px;
          color: #2c2520;
          letter-spacing: -0.01em;
        }
        .sjb-nav {
          display: flex; align-items: center; gap: 4px;
          font-family: 'Shilla Gothic', 'Pretendard', sans-serif;
        }
        .sjb-nav a {
          padding: 7px 14px;
          font-size: 13px; font-weight: 500;
          color: #4a3f33;
          text-decoration: none;
          border-radius: 6px;
          transition: all .2s ease;
        }
        .sjb-nav a:hover { color: #b13a2c; background: rgba(177, 58, 44, 0.06); }
        .sjb-nav a.primary {
          background: #2c2520; color: #faf5e8;
        }
        .sjb-nav a.primary:hover { background: #b13a2c; color: #fff; }
        .sjb-master-badge {
          font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
          padding: 3px 8px;
          background: linear-gradient(135deg, #b8923c, #b13a2c);
          color: #fff;
          border-radius: 999px;
          margin-left: 6px;
        }
        @media (max-width: 640px) {
          .sjb-logo .korean { display: none; }
          .sjb-logo .divider { display: none; }
          .sjb-logo .product-sep { display: none; }
          .sjb-logo .product-title { font-size: 13px !important; }
          .sjb-nav a { padding: 6px 10px; font-size: 12px; }
        }
        @media (max-width: 380px) {
          .sjb-nav a:first-child { display: none; }
        }
      </style>
      <div class="sjb-inner">
        <a href="../index.html" class="sjb-logo">
          <span class="hanja">四柱日記</span>
          <span class="divider"></span>
          <span class="korean">사주다이어리</span>
          ${productName ? `
            <span class="product-sep" style="color:#8a7d6b;font-size:13px;margin:0 2px">✦</span>
            <span class="product-title" style="font-family:'Shilla Culture','Noto Serif KR',serif;font-weight:700;font-size:15px;color:${accentColor};letter-spacing:-0.01em">${productName}</span>
          ` : ''}
          <span id="sjb-master" class="sjb-master-badge" style="display:none;">MASTER</span>
        </a>
        <nav class="sjb-nav">
          <a href="../mypage.html">마이페이지</a>
          <a href="../index.html" class="primary">← 홈</a>
        </nav>
      </div>
    `;
    document.body.insertBefore(bar, document.body.firstChild);

    // 마스터 배지 표시
    const user = JSON.parse(localStorage.getItem('sajudiary_user') || 'null');
    if (user && user.isMaster) {
      document.getElementById('sjb-master').style.display = 'inline-block';
    }
  }

  // ─── 2) 페이지 하단 — 다음 분석 추천 카드 ───
  function injectNextProductCard() {
    if (document.getElementById('sajudiary-next-card')) return;

    // 본인이 아직 안 본 다른 상품 찾기 (구매 또는 마스터 기준)
    const purchases = JSON.parse(localStorage.getItem('sajudiary_purchases') || '[]');
    const purchasedIds = purchases.map(p => p.productId);
    const user = JSON.parse(localStorage.getItem('sajudiary_user') || 'null');
    const isMaster = !!(user && user.isMaster);

    // 추천 우선순위: couple → deep → couple_plus → light (현재 보고 있는 것 제외)
    const order = ['couple', 'deep', 'couple_plus', 'light'];
    let recommendId = null;
    for (const id of order) {
      if (id === currentProductId) continue;
      if (!isMaster && purchasedIds.includes(id)) continue;  // 이미 구매한 건 제외 (마스터는 모두 표시)
      recommendId = id;
      break;
    }
    if (!recommendId) return;  // 추천할 게 없으면 카드 안 보임

    const product = cfg.PRODUCTS[recommendId];
    if (!product) return;

    const colorMap = {
      jade:   { bg: '#5a8a98', text: '#406878' },
      vermil: { bg: '#b13a2c', text: '#8a2418' },
      plum:   { bg: '#b8607a', text: '#944860' },
      wine:   { bg: '#8a3a4d', text: '#6a2438' }
    };
    const c = colorMap[product.color] || colorMap.vermil;

    const card = document.createElement('div');
    card.id = 'sajudiary-next-card';
    card.innerHTML = `
      <style>
        #sajudiary-next-card {
          margin: 60px auto 80px;
          max-width: 600px;
          padding: 0 20px;
          font-family: 'Pretendard', system-ui, sans-serif;
          opacity: 0;
          animation: sjb-card-in .6s ease forwards;
          animation-delay: .4s;
        }
        @keyframes sjb-card-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sjb-next-inner {
          background: linear-gradient(180deg, #faf5e8, #f7f0df);
          border: 1px solid rgba(184, 146, 60, 0.4);
          border-radius: 18px;
          padding: 32px 28px 28px;
          text-align: center;
          box-shadow: 0 6px 30px rgba(60, 45, 30, 0.08);
        }
        .sjb-next-label {
          font-family: 'Shilla Gothic', sans-serif;
          font-size: 11px; letter-spacing: 0.3em;
          color: #6b5d4f;
          margin-bottom: 8px;
        }
        .sjb-next-title {
          font-family: 'Shilla Culture', 'Noto Serif KR', serif;
          font-weight: 700;
          font-size: 22px;
          color: #2c2520;
          margin-bottom: 14px;
        }
        .sjb-next-product {
          display: inline-flex; align-items: center; gap: 14px;
          padding: 14px 22px;
          background: rgba(255, 255, 255, 0.5);
          border: 1px dashed rgba(184, 146, 60, 0.5);
          border-radius: 12px;
          margin: 10px 0 18px;
        }
        .sjb-next-seal {
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Shilla Culture', serif;
          font-weight: 700;
          font-size: 24px;
          color: #fff;
          border-radius: 6px;
          transform: rotate(-3deg);
          box-shadow: inset 0 0 0 2px rgba(255,255,255,0.2);
        }
        .sjb-next-info { text-align: left; }
        .sjb-next-info .name {
          font-family: 'Shilla Culture', 'Noto Serif KR', serif;
          font-weight: 700; font-size: 15px;
          color: #2c2520;
        }
        .sjb-next-info .desc {
          font-size: 12px; color: #6b5d4f;
          margin-top: 2px;
        }
        .sjb-next-btn {
          display: inline-block;
          padding: 13px 32px;
          background: linear-gradient(180deg, #2c2520, #1a1410);
          color: #faf5e8;
          font-family: 'Shilla Gothic', sans-serif;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.02em;
          border-radius: 8px;
          text-decoration: none;
          transition: all .25s ease;
        }
        .sjb-next-btn:hover {
          background: linear-gradient(180deg, #b13a2c, #8a2418);
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(177, 58, 44, 0.3);
        }
        .sjb-next-price {
          font-size: 13px; color: #6b5d4f;
          margin-top: 10px;
        }
        .sjb-next-price strong {
          font-family: 'Shilla Culture', serif;
          color: ${c.text};
          font-size: 16px;
          font-weight: 700;
        }
      </style>
      <div class="sjb-next-inner">
        <p class="sjb-next-label">NEXT ANALYSIS</p>
        <h3 class="sjb-next-title">다른 분석도 받아보시겠어요?</h3>
        <div class="sjb-next-product">
          <div class="sjb-next-seal" style="background:${c.bg}">${product.hanja}</div>
          <div class="sjb-next-info">
            <div class="name">${product.name}</div>
            <div class="desc">${product.description}</div>
          </div>
        </div>
        <div>
          <a href="../index.html#products" class="sjb-next-btn">상품 둘러보기 →</a>
        </div>
        <p class="sjb-next-price">
          ${product.name} <strong>${product.price.toLocaleString()}원</strong>
        </p>
      </div>
    `;
    document.body.appendChild(card);
  }

  // ─── 3) 페이지 페이드인 ───
  function addPageFadeIn() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(() => {
      document.body.style.opacity = '1';
    });
  }

  // ─── 시작 ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

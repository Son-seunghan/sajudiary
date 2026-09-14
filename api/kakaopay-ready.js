/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   카카오페이 단건결제 — 1단계: 결제 준비 (Vercel 서버리스)
   클라이언트(payment.html)가 호출 → 카카오 ready API → redirect URL 반환

   2026-09-02 보안 강화: 결제 금액은 클라이언트가 보낸 값을 쓰지 않고
   서버의 상품→가격 맵으로 계산한다. 클라이언트는 items(상품 ID 배열)만 보내며,
   amount 를 같이 보내면 서버 계산값과 대조해 다르면 거절.
   상품명·item_code 도 서버가 생성 → approve 단계에서 금액·상품 재검증에 사용.

   환경변수 (Vercel 대시보드 → Settings → Environment Variables):
   - KAKAOPAY_SECRET_KEY : 카카오페이 개발자센터 Secret Key (필수)
   - KAKAOPAY_CID        : 가맹점 코드 (미설정 시 공용 테스트 CID)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// ★ assets/js/config.js PRODUCTS 와 반드시 동일하게 유지 (가격 변경 시 양쪽 수정)
const PRODUCTS = {
  light:       { name: '입문용 (Light)',      price: 9900 },
  deep:        { name: '전문가용 (Deep)',      price: 29900 },
  couple:      { name: '궁합 분석',            price: 14900 },
  couple_plus: { name: '궁합 분석 (성인용)',   price: 17900 }
};
// ★ config.js BUNDLE_DISCOUNTS 와 동일하게 유지 (현재 비활성 — 토스 심사 정책)
const BUNDLE_DISCOUNTS = [
  // { minItems: 4, percent: 30 }, { minItems: 3, percent: 20 }, { minItems: 2, percent: 10 }
];

// 상품 ID 배열 → { items, total, itemName, itemCode } (유효하지 않으면 null)
function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 4) return null;
  const items = [];
  for (const id of rawItems) {
    if (typeof id !== 'string' || !PRODUCTS[id] || items.includes(id)) return null;
    items.push(id);
  }
  const subtotal = items.reduce((s, id) => s + PRODUCTS[id].price, 0);
  const bundle = BUNDLE_DISCOUNTS.find(b => items.length >= b.minItems) || null;
  const bundleDiscount = bundle ? Math.floor(subtotal * bundle.percent / 100) : 0;
  const total = Math.max(100, subtotal - bundleDiscount);   // 최소 결제 100원 (payment.html과 동일)
  const first = PRODUCTS[items[0]].name;
  const itemName = items.length === 1
    ? '[사주다이어리] ' + first
    : '[사주다이어리] ' + first + ' 외 ' + (items.length - 1) + '건';
  return { items, total, itemName, itemCode: items.join('+') };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const SECRET = process.env.KAKAOPAY_SECRET_KEY;
  const CID = process.env.KAKAOPAY_CID || 'TC0ONETIME'; // 테스트 CID 폴백
  if (!SECRET) {
    return res.status(500).json({ error: '카카오페이 서버 설정이 완료되지 않았습니다.' });
  }

  const { orderId, userId, items, amount, returnQuery } = req.body || {};
  if (!orderId || !userId || !items) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }
  if (typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(orderId)
      || typeof userId !== 'string' || userId.length > 64) {
    return res.status(400).json({ error: '주문 정보 형식 오류' });
  }

  // ─── 서버 측 금액 계산 (클라이언트 amount 는 신뢰하지 않음) ───
  const priced = priceItems(items);
  if (!priced) {
    return res.status(400).json({ error: '상품 정보가 올바르지 않습니다.' });
  }
  if (amount !== undefined && amount !== priced.total) {
    // 클라이언트 계산값과 불일치 — 조작 시도이거나 config.js/서버 가격표가 어긋난 상태
    console.error('[kakaopay-ready] 금액 불일치 client=' + amount + ' server=' + priced.total + ' items=' + priced.itemCode);
    return res.status(400).json({ error: '결제 금액 검증에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.' });
  }
  // 계약 조건: 객단가 100만원 이하 단건결제
  if (priced.total > 1000000) {
    return res.status(400).json({ error: '결제 금액 범위 오류' });
  }

  // 취소 시 결제 페이지 상태 복원용 쿼리 (화이트리스트 문자만 허용)
  const safeReturn = typeof returnQuery === 'string' && /^[a-zA-Z0-9_=&-]{1,80}$/.test(returnQuery)
    ? returnQuery : '';

  const origin = 'https://' + req.headers.host;

  try {
    const r = await fetch('https://open-api.kakaopay.com/online/v1/payment/ready', {
      method: 'POST',
      headers: {
        'Authorization': 'SECRET_KEY ' + SECRET,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cid: CID,
        partner_order_id: orderId,
        partner_user_id: userId,
        item_name: priced.itemName.slice(0, 100),
        item_code: priced.itemCode,          // approve 응답에 그대로 돌아옴 → 상품·금액 재검증
        quantity: 1,
        total_amount: priced.total,
        tax_free_amount: 0,
        approval_url: origin + '/success.html?provider=kakao&orderId=' + encodeURIComponent(orderId),
        cancel_url: origin + '/payment.html?' + (safeReturn ? safeReturn + '&' : '') + 'kakao=cancel',
        fail_url: origin + '/fail.html?provider=kakao'
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('[kakaopay-ready] API error:', JSON.stringify(data));
      return res.status(r.status).json({
        error: (data.error_message || data.msg || '카카오페이 결제 준비 실패'),
        code: data.error_code || data.code || null
      });
    }

    return res.status(200).json({
      tid: data.tid,
      amount: priced.total,
      redirect_pc: data.next_redirect_pc_url,
      redirect_mobile: data.next_redirect_mobile_url
    });
  } catch (e) {
    console.error('[kakaopay-ready] exception:', e);
    return res.status(500).json({ error: '카카오페이 서버 연결 실패' });
  }
};

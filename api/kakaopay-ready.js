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

const crypto = require('crypto');

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

/* ━━━ % 할인 서명 쿠폰 (coupon-tool 발급) ━━━
   gift-<key>-<pct>p-<nonce>-<sig8> / promo-<key>-<pct>p-<tag>-<limit>-<sig8>
   sig8 = HMAC_SHA256(COUPON_SECRET, 코드에서 프리픽스·sig 제외 부분) 앞 8자리
   쿠폰 key → 상품 ID (any 는 주문 전체 소계에 적용) */
const COUPON_KEY_PRODUCT = { light: 'light', deep: 'deep', couple: 'couple', adult: 'couple_plus', any: null };

function hmac8(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex').slice(0, 8);
}
function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8'), bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
// 코드 파싱 + 서명 검증 (소진 여부는 별도 조회) → {pct, key, promo, tag, limit} | null
function parseDiscountCoupon(raw) {
  const SECRET = process.env.COUPON_SECRET;
  if (!SECRET || typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase();
  const dg = code.match(/^gift-([a-z]+)-([1-9][0-9]?)p-([a-z0-9]{4,10})-([a-f0-9]{8})$/);
  if (dg) {
    const [, key, pctStr, nonce, sig] = dg;
    if (!(key in COUPON_KEY_PRODUCT)) return null;
    if (!safeEqual(sig, hmac8(SECRET, key + '-' + pctStr + 'p-' + nonce))) return null;
    return { code, pct: parseInt(pctStr, 10), key, promo: false };
  }
  const dp = code.match(/^promo-([a-z]+)-([1-9][0-9]?)p-([a-z0-9]{2,16})-([0-9]{1,3})-([a-f0-9]{8})$/);
  if (dp) {
    const [, key, pctStr, tag, limitStr, sig] = dp;
    const limit = parseInt(limitStr, 10);
    if (!(key in COUPON_KEY_PRODUCT) || limit < 1 || limit > 999) return null;
    if (!safeEqual(sig, hmac8(SECRET, 'promo-' + key + '-' + pctStr + 'p-' + tag + '-' + limitStr))) return null;
    return { code, pct: parseInt(pctStr, 10), key, promo: true, tag, limit };
  }
  return null;
}
// 주문(items)에 쿠폰 적용한 할인액 계산 — 서버 가격표 기준
function couponDiscountFor(cp, items, subtotal) {
  if (cp.key === 'any') return Math.floor(subtotal * cp.pct / 100);
  const pid = COUPON_KEY_PRODUCT[cp.key];
  if (!pid || !items.includes(pid)) return -1;   // 대상 상품이 주문에 없음
  return Math.floor(PRODUCTS[pid].price * cp.pct / 100);
}
async function supaGet(path) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return null;
  try {
    const r = await fetch(SUPA_URL_C + '/rest/v1/' + path, {
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
const SUPA_URL_C = 'https://hlxttdvvwftiquzqxgxs.supabase.co';

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

  // ─── % 할인 쿠폰 적용 (선택) — 서명·대상·소진을 서버에서 재검증 ───
  const couponRaw = req.body.coupon;
  if (couponRaw) {
    const cp = parseDiscountCoupon(couponRaw);
    if (!cp) {
      return res.status(400).json({ error: '유효하지 않은 쿠폰입니다. 쿠폰을 해제한 뒤 다시 시도해주세요.' });
    }
    const disc = couponDiscountFor(cp, priced.items, priced.total);
    if (disc < 0) {
      return res.status(400).json({ error: '이 쿠폰은 주문한 상품에 적용할 수 없습니다.' });
    }
    // 소진 여부 조회 (조회 실패 시 안전하게 거절)
    if (cp.promo) {
      const rows = await supaGet('coupon_redemptions?select=code&code=like.' + encodeURIComponent(cp.code + '#') + '*');
      if (!rows) return res.status(500).json({ error: '쿠폰 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' });
      if (rows.some(r => r.code === cp.code + '#' + userId)) {
        return res.status(400).json({ error: '이 계정으로 이미 사용한 쿠폰입니다.' });
      }
      if (rows.length >= cp.limit) {
        return res.status(400).json({ error: '쿠폰이 모두 소진되었습니다.' });
      }
    } else {
      const rows = await supaGet('coupon_redemptions?select=code&code=eq.' + encodeURIComponent(cp.code) + '&limit=1');
      if (!rows) return res.status(500).json({ error: '쿠폰 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' });
      if (rows.length > 0) {
        return res.status(400).json({ error: '이미 사용된 쿠폰입니다.' });
      }
    }
    priced.total = Math.max(100, priced.total - disc);
    priced.itemCode = priced.itemCode + '~' + cp.code;   // approve 재검증·소진 기록용
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

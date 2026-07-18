/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   카카오페이 단건결제 — 1단계: 결제 준비 (Vercel 서버리스)
   클라이언트(payment.html)가 호출 → 카카오 ready API → redirect URL 반환

   환경변수 (Vercel 대시보드 → Settings → Environment Variables):
   - KAKAOPAY_SECRET_KEY : 카카오페이 개발자센터 Secret Key (필수)
   - KAKAOPAY_CID        : 가맹점 코드 (미설정 시 공용 테스트 CID)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const SECRET = process.env.KAKAOPAY_SECRET_KEY;
  const CID = process.env.KAKAOPAY_CID || 'TC0ONETIME'; // 테스트 CID 폴백
  if (!SECRET) {
    return res.status(500).json({ error: '카카오페이 서버 설정이 완료되지 않았습니다.' });
  }

  const { orderId, userId, itemName, amount, returnQuery } = req.body || {};
  if (!orderId || !userId || !itemName || !amount) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }
  // 계약 조건: 객단가 100만원 이하 단건결제 (+ 최소 100원)
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 100 || amount > 1000000) {
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
        item_name: itemName.slice(0, 100),
        quantity: 1,
        total_amount: amount,
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
      redirect_pc: data.next_redirect_pc_url,
      redirect_mobile: data.next_redirect_mobile_url
    });
  } catch (e) {
    console.error('[kakaopay-ready] exception:', e);
    return res.status(500).json({ error: '카카오페이 서버 연결 실패' });
  }
};

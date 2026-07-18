/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   카카오페이 단건결제 — 2단계: 결제 승인 (Vercel 서버리스)
   카카오 결제창 완료 후 success.html이 pg_token과 함께 호출
   → 카카오 approve API로 최종 승인 → 결과 반환

   환경변수: KAKAOPAY_SECRET_KEY (필수), KAKAOPAY_CID (미설정 시 테스트 CID)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const SECRET = process.env.KAKAOPAY_SECRET_KEY;
  const CID = process.env.KAKAOPAY_CID || 'TC0ONETIME';
  if (!SECRET) {
    return res.status(500).json({ error: '카카오페이 서버 설정이 완료되지 않았습니다.' });
  }

  const { tid, pgToken, orderId, userId } = req.body || {};
  if (!tid || !pgToken || !orderId || !userId) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  try {
    const r = await fetch('https://open-api.kakaopay.com/online/v1/payment/approve', {
      method: 'POST',
      headers: {
        'Authorization': 'SECRET_KEY ' + SECRET,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cid: CID,
        tid: tid,
        partner_order_id: orderId,
        partner_user_id: userId,
        pg_token: pgToken
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('[kakaopay-approve] API error:', JSON.stringify(data));
      return res.status(r.status).json({
        ok: false,
        error: (data.error_message || data.msg || '카카오페이 결제 승인 실패'),
        code: data.error_code || data.code || null
      });
    }

    // 승인 성공 — 핵심 정보만 반환
    return res.status(200).json({
      ok: true,
      aid: data.aid,                       // 승인 고유번호
      amount: data.amount ? data.amount.total : null,
      itemName: data.item_name || null,
      approvedAt: data.approved_at || null,
      paymentType: data.payment_method_type || null  // CARD | MONEY
    });
  } catch (e) {
    console.error('[kakaopay-approve] exception:', e);
    return res.status(500).json({ ok: false, error: '카카오페이 서버 연결 실패' });
  }
};

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

    // ─── 결제 완료 이메일 알림 (RESEND_API_KEY 설정 시에만 발송) ───
    const RESEND = process.env.RESEND_API_KEY;
    const NOTIFY_TO = process.env.PAYMENT_NOTIFY_EMAIL || 'cleanblue99@gmail.com';
    if (RESEND) {
      try {
        const amt = data.amount && data.amount.total ? data.amount.total.toLocaleString('ko-KR') : '-';
        const payType = data.payment_method_type === 'MONEY' ? '카카오페이 머니' : '카드(카카오페이)';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + RESEND,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: '사주다이어리 <onboarding@resend.dev>',
            to: [NOTIFY_TO],
            subject: '💰 결제 완료 — ' + (data.item_name || '상품') + ' ' + amt + '원',
            html:
              '<div style="font-family:sans-serif;max-width:480px">' +
              '<h2 style="color:#b13a2c">🎉 카카오페이 결제 완료</h2>' +
              '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
              '<tr><td style="padding:6px 0;color:#888">상품</td><td><b>' + (data.item_name || '-') + '</b></td></tr>' +
              '<tr><td style="padding:6px 0;color:#888">금액</td><td><b>' + amt + '원</b></td></tr>' +
              '<tr><td style="padding:6px 0;color:#888">결제수단</td><td>' + payType + '</td></tr>' +
              '<tr><td style="padding:6px 0;color:#888">구매자 ID</td><td>' + userId + '</td></tr>' +
              '<tr><td style="padding:6px 0;color:#888">주문번호</td><td style="font-size:12px">' + orderId + '</td></tr>' +
              '<tr><td style="padding:6px 0;color:#888">승인시각</td><td>' + (data.approved_at || '-') + '</td></tr>' +
              '</table>' +
              '<p style="margin-top:16px"><a href="https://pg.kakao.com" style="color:#b13a2c">→ 파트너어드민에서 상세 보기</a></p>' +
              '</div>'
          })
        });
      } catch (e) {
        // 알림 실패해도 결제 승인 자체는 성공 처리
        console.error('[kakaopay-approve] 이메일 알림 실패:', e);
      }
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

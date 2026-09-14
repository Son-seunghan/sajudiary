/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   카카오페이 단건결제 — 2단계: 결제 승인 (Vercel 서버리스)
   카카오 결제창 완료 후 success.html이 pg_token과 함께 호출
   → 카카오 approve API로 최종 승인 → 결과 반환

   2026-09-02 보안 강화:
   - ready 단계에서 서버가 넣은 item_code(상품ID '+' 연결)가 승인 응답에 돌아오므로
     승인 금액이 서버 가격표 합계와 일치하는지 재검증 (불일치 시 기록 안 함 + 경고 로그)
   - 승인 성공 시 서버가 직접 purchases 원장에 기록 (SUPABASE_SERVICE_KEY 설정 시)
     → 클라이언트 주장이 아닌 실결제 기반 기록. 응답 recorded:true 면 클라이언트는
       서버 기록을 생략 (success.html)

   환경변수: KAKAOPAY_SECRET_KEY (필수), KAKAOPAY_CID (미설정 시 테스트 CID),
             SUPABASE_SERVICE_KEY (선택 — 서버 원장 기록)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// ★ kakaopay-ready.js / assets/js/config.js PRODUCTS 와 동일하게 유지
const PRODUCTS = {
  light:       { name: '입문용 (Light)',      price: 9900 },
  deep:        { name: '전문가용 (Deep)',      price: 29900 },
  couple:      { name: '궁합 분석',            price: 14900 },
  couple_plus: { name: '궁합 분석 (성인용)',   price: 17900 }
};
const BUNDLE_DISCOUNTS = [];   // ready.js 와 동일하게 유지
const SUPA_URL = 'https://hlxttdvvwftiquzqxgxs.supabase.co';

// item_code('light+deep') → { items, total } (알 수 없는 코드면 null)
function parseItemCode(code) {
  if (typeof code !== 'string' || !code) return null;
  const items = code.split('+');
  if (items.length < 1 || items.length > 4) return null;
  if (items.some((id, i) => !PRODUCTS[id] || items.indexOf(id) !== i)) return null;
  const subtotal = items.reduce((s, id) => s + PRODUCTS[id].price, 0);
  const bundle = BUNDLE_DISCOUNTS.find(b => items.length >= b.minItems) || null;
  const total = Math.max(100, subtotal - (bundle ? Math.floor(subtotal * bundle.percent / 100) : 0));
  return { items, total };
}

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
  if (typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(orderId)
      || typeof userId !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(userId)) {
    return res.status(400).json({ error: '주문 정보 형식 오류' });
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

    // ─── 상품·금액 재검증 + 서버 원장 기록 ───
    // ready 에서 서버가 만든 item_code 로 기대 금액을 다시 계산 → 승인 금액과 대조
    const paidTotal = data.amount && Number(data.amount.total);
    const parsed = parseItemCode(data.item_code);
    const verified = !!(parsed && paidTotal === parsed.total);
    let recorded = false;
    if (!verified) {
      console.error('[kakaopay-approve] ⚠ 금액/상품 검증 실패 item_code=' + data.item_code
        + ' paid=' + paidTotal + ' expected=' + (parsed && parsed.total) + ' order=' + orderId);
    } else if (process.env.SUPABASE_SERVICE_KEY) {
      try {
        const SK = process.env.SUPABASE_SERVICE_KEY;
        // approved_at 은 KST 로컬 시각 문자열("2026-08-16T12:00:00") — 존 정보 없으면 +09:00 보정
        let approvedDate = data.approved_at ? new Date(/[Zz]|[+-]\d\d:\d\d$/.test(data.approved_at) ? data.approved_at : data.approved_at + '+09:00') : new Date();
        if (isNaN(approvedDate.getTime())) approvedDate = new Date();
        const approvedAt = approvedDate.toISOString();
        const rows = parsed.items.map(pid => ({
          user_kakao_id: userId,
          product_id: pid,
          created_at: approvedAt,
          raw: {
            productId: pid,
            orderId: orderId,
            paymentKey: 'kakao_' + (data.aid || tid),
            amount: PRODUCTS[pid].price,
            productName: PRODUCTS[pid].name,
            purchasedAt: approvedAt,
            method: 'kakaopay',
            recordedBy: 'server',
            aid: data.aid || null,
            tid: tid,
            paidTotal: paidTotal
          }
        }));
        const ins = await fetch(SUPA_URL + '/rest/v1/purchases', {
          method: 'POST',
          headers: { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(rows)
        });
        recorded = ins.ok;
        if (!ins.ok) console.error('[kakaopay-approve] 원장 기록 실패 HTTP', ins.status, (await ins.text()).slice(0, 200));
      } catch (e) {
        console.error('[kakaopay-approve] 원장 기록 예외:', e);
      }
    }

    // ─── 결제 완료 이메일 알림 (RESEND_API_KEY 설정 시에만 발송) ───
    const RESEND = process.env.RESEND_API_KEY;
    const NOTIFY_TO = process.env.PAYMENT_NOTIFY_EMAIL || 'cleanblue99@gmail.com';
    if (RESEND) {
      try {
        const amt = data.amount && data.amount.total ? data.amount.total.toLocaleString('ko-KR') : '-';
        const payType = data.payment_method_type === 'MONEY' ? '카카오페이 머니' : '카드(카카오페이)';
        // 일시 오류 대비: noreply 2회 시도 → 예비 발신자(onboarding) 폴백
        const _senders = ['사주다이어리 <noreply@sajudiary.com>', '사주다이어리 <noreply@sajudiary.com>', '사주다이어리 <onboarding@resend.dev>'];
        const _mailPayload = {
            from: _senders[0],
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
          };
        const _mailTrace = [];
        for (let _i = 0; _i < _senders.length; _i++) {
          _mailPayload.from = _senders[_i];
          try {
            const mailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
              body: JSON.stringify(_mailPayload)
            });
            const mailBody = await mailRes.text();
            if (mailRes.ok) {
              _mailTrace.push('시도' + (_i + 1) + ':성공 ' + mailBody.slice(0, 60));
              console.log('[mail] 결제 알림 발송 성공(시도 ' + (_i + 1) + ')');
              break;
            }
            _mailTrace.push('시도' + (_i + 1) + ':거절 HTTP' + mailRes.status + ' ' + mailBody.slice(0, 200));
            console.error('[mail] 거절(시도 ' + (_i + 1) + ') HTTP', mailRes.status, mailBody.slice(0, 300));
          } catch (_e) {
            _mailTrace.push('시도' + (_i + 1) + ':예외 ' + String(_e).slice(0, 150));
            console.error('[mail] 연결 실패(시도 ' + (_i + 1) + '):', _e);
          }
          await new Promise(function (rs) { setTimeout(rs, 400); });
        }
        // 발송 결과를 기존 coupon_redemptions 테이블에 영구 기록 (별도 테이블 불필요)
        // code: 'maillog#주문번호#타임스탬프' / user_kakao_id: 시도 내역 텍스트
        try {
          const _SK = process.env.SUPABASE_SERVICE_KEY;
          if (_SK) {
            const _lr = await fetch('https://hlxttdvvwftiquzqxgxs.supabase.co/rest/v1/coupon_redemptions', {
              method: 'POST',
              headers: { 'apikey': _SK, 'Authorization': 'Bearer ' + _SK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
              body: JSON.stringify({ code: 'maillog#' + (orderId || '?') + '#' + Date.now(), user_kakao_id: _mailTrace.join(' | ').slice(0, 900) })
            });
            if (!_lr.ok) console.error('[mail] 기록 실패 HTTP', _lr.status);
          }
        } catch (_e2) { console.error('[mail] 기록 예외:', _e2); }
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
      paymentType: data.payment_method_type || null,  // CARD | MONEY
      itemCode: data.item_code || null,               // 'light+deep' — 클라이언트 구매 항목 대조용
      verified: verified,                             // 서버 가격표와 승인 금액 일치 여부
      recorded: recorded                              // true 면 서버가 purchases 에 이미 기록함
    });
  } catch (e) {
    console.error('[kakaopay-approve] exception:', e);
    return res.status(500).json({ ok: false, error: '카카오페이 서버 연결 실패' });
  }
};

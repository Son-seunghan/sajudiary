/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   선물 쿠폰 서명 검증 (Vercel 서버리스)
   코드 형식: gift-<light|deep|couple|adult|any>-<nonce>-<sig8>
   sig8 = HMAC_SHA256(COUPON_SECRET, "<key>-<nonce>") 앞 8자리(hex)

   발급: tools/coupon-tool.html (오프라인, 시크릿은 운영자만 입력)
   환경변수: COUPON_SECRET — 발급기에 입력하는 시크릿과 동일해야 함
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const crypto = require('crypto');

const VALID_KEYS = ['light', 'deep', 'couple', 'adult', 'any'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const SECRET = process.env.COUPON_SECRET;
  if (!SECRET) {
    return res.status(500).json({ ok: false, error: '쿠폰 시스템이 아직 활성화되지 않았습니다.' });
  }

  const raw = (req.body && req.body.code ? String(req.body.code) : '').trim().toLowerCase();
  // gift-<key>-<nonce>-<sig8>
  const m = raw.match(/^gift-([a-z]+)-([a-z0-9]{4,10})-([a-f0-9]{8})$/);
  if (!m) {
    return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
  }
  const [, key, nonce, sig] = m;
  if (!VALID_KEYS.includes(key)) {
    return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
  }

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(key + '-' + nonce)
    .digest('hex')
    .slice(0, 8);

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
  }

  // ─── 쿠폰 사용 이메일 알림 (RESEND_API_KEY 설정 시에만) ───
  const RESEND = process.env.RESEND_API_KEY;
  const NOTIFY_TO = process.env.PAYMENT_NOTIFY_EMAIL || 'cleanblue99@gmail.com';
  if (RESEND) {
    const KEY_LABEL = { light: '입문용 (Light)', deep: '전문가용 (Deep)', couple: '궁합', adult: '궁합 성인용', any: '만능 이용권' };
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '사주다이어리 <onboarding@resend.dev>',
          to: [NOTIFY_TO],
          subject: '🎁 선물 쿠폰 사용됨 — ' + (KEY_LABEL[key] || key),
          html:
            '<div style="font-family:sans-serif;max-width:480px">' +
            '<h2 style="color:#b8923c">🎁 선물 쿠폰이 사용되었습니다</h2>' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
            '<tr><td style="padding:6px 0;color:#888">쿠폰 종류</td><td><b>' + (KEY_LABEL[key] || key) + '</b></td></tr>' +
            '<tr><td style="padding:6px 0;color:#888">코드</td><td style="font-family:monospace">' + raw + '</td></tr>' +
            '<tr><td style="padding:6px 0;color:#888">사용 시각</td><td>' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + '</td></tr>' +
            '</table>' +
            '<p style="margin-top:14px;font-size:13px;color:#666">발급기 이력의 메모와 대조해 누구인지 확인하세요.<br>2~3일 뒤가 후기 요청 골든타임입니다 🙏</p>' +
            '</div>'
        })
      });
    } catch (e) {
      console.error('[coupon-verify] 이메일 알림 실패:', e);
      // 알림 실패해도 쿠폰 검증은 성공 처리
    }
  }

  return res.status(200).json({ ok: true, productKey: key });
};

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

  return res.status(200).json({ ok: true, productKey: key });
};

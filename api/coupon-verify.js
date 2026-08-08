/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   쿠폰 서명 검증 (Vercel 서버리스)

   [개인 선물 쿠폰] gift-<light|deep|couple|adult|any>-<nonce>-<sig8>
     sig8 = HMAC_SHA256(COUPON_SECRET, "<key>-<nonce>") 앞 8자리(hex)
     → 전역 1회용 기록은 /api/ledger 'redeem'에서 처리

   [홍보용 다회 쿠폰] promo-<key>-<tag>-<limit>-<sig8>
     sig8 = HMAC_SHA256(COUPON_SECRET, "promo-<key>-<tag>-<limit>") 앞 8자리
     tag   = 홍보자 식별 태그 (영소문자/숫자 2~16자)
     limit = 사용 횟수 제한 (1~999)
     → 사용 기록·횟수 제한을 이 함수에서 직접 처리 (세션 필수, 1인 1회)
     → statusOnly:true 로 호출하면 소진 현황만 조회 (사용 처리 안 함)

   발급: tools/coupon-tool.html (오프라인, 시크릿은 운영자만 입력)
   환경변수: COUPON_SECRET, SESSION_SECRET, SUPABASE_SERVICE_KEY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const crypto = require('crypto');

const VALID_KEYS = ['light', 'deep', 'couple', 'adult', 'any'];
const KEY_LABEL = { light: '입문용 (Light)', deep: '전문가용 (Deep)', couple: '궁합', adult: '궁합 성인용', any: '만능 이용권' };
const SUPA_URL = 'https://hlxttdvvwftiquzqxgxs.supabase.co';

function hmac8(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex').slice(0, 8);
}
function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function verifySession(session, secret) {
  if (!session || !secret) return null;
  const parts = String(session).split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
  if (!safeEqual(parts[1], expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!data.id || !data.exp || Date.now() > data.exp) return null;
    return String(data.id);
  } catch (e) { return null; }
}
async function supa(method, path, body, headers) {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    method: method,
    headers: Object.assign({
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    }, headers || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
  return { ok: r.ok, status: r.status, json: json };
}
async function sendMail(subject, html) {
  const RESEND = process.env.RESEND_API_KEY;
  const NOTIFY_TO = process.env.PAYMENT_NOTIFY_EMAIL || 'cleanblue99@gmail.com';
  if (!RESEND) { console.error('[mail] RESEND_API_KEY 미설정'); return; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '사주다이어리 <onboarding@resend.dev>', to: [NOTIFY_TO], subject: subject, html: html })
    });
    // Resend가 거절해도 HTTP 응답은 정상 수신되므로 상태·본문을 반드시 로그에 남김
    const body = await r.text();
    if (!r.ok) {
      console.error('[mail] Resend 발송 거절 HTTP', r.status, body.slice(0, 300));
    } else {
      console.log('[mail] 발송 성공:', subject);
    }
  } catch (e) {
    console.error('[mail] Resend 연결 실패:', e);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  const SECRET = process.env.COUPON_SECRET;
  if (!SECRET) {
    return res.status(500).json({ ok: false, error: '쿠폰 시스템이 아직 활성화되지 않았습니다.' });
  }

  const raw = (req.body && req.body.code ? String(req.body.code) : '').trim().toLowerCase();

  /* ━━━━━━━━━ 홍보용 다회 쿠폰 (promo-…) ━━━━━━━━━ */
  const pm = raw.match(/^promo-([a-z]+)-([a-z0-9]{2,16})-([0-9]{1,3})-([a-f0-9]{8})$/);
  if (pm) {
    const [, key, tag, limitStr, sig] = pm;
    const limit = parseInt(limitStr, 10);
    if (!VALID_KEYS.includes(key) || limit < 1 || limit > 999) {
      return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
    }
    if (!safeEqual(sig, hmac8(SECRET, 'promo-' + key + '-' + tag + '-' + limitStr))) {
      return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: '홍보 쿠폰 시스템이 아직 준비되지 않았습니다.' });
    }

    // 사용 기록 조회 — coupon_redemptions에 "<code>#<kakaoId>" 형태로 저장됨
    const q = await supa('GET', 'coupon_redemptions?select=code&code=like.' + encodeURIComponent(raw + '#') + '*');
    if (!q.ok) {
      console.error('[coupon-verify] promo 조회 실패:', q.status);
      return res.status(500).json({ ok: false, error: '쿠폰 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
    const rows = q.json || [];

    // 현황 조회 모드 (발급기 "사용 현황" 버튼) — 사용 처리 없음
    if (req.body.statusOnly === true) {
      return res.status(200).json({ ok: true, promo: true, productKey: key, tag: tag, used: rows.length, limit: limit });
    }

    // 사용 처리 — 세션으로 본인 확인 (1인 1회 판별에 필요)
    const kakaoId = verifySession(req.body.session, process.env.SESSION_SECRET);
    if (!kakaoId) {
      return res.status(401).json({ ok: false, error: '본인 확인이 필요합니다. 로그아웃 후 다시 로그인한 뒤 쿠폰을 입력해주세요.' });
    }
    const rowKey = raw + '#' + kakaoId;
    if (rows.some(r => r.code === rowKey)) {
      return res.status(200).json({ ok: false, error: '이 계정으로 이미 사용한 쿠폰입니다.' });
    }
    if (rows.length >= limit) {
      return res.status(200).json({ ok: false, error: '쿠폰이 모두 소진되었습니다. (선착순 ' + limit + '명 마감)' });
    }
    const ins = await supa('POST', 'coupon_redemptions', { code: rowKey, user_kakao_id: kakaoId }, { 'Prefer': 'return=minimal' });
    if (ins.status === 409) {
      return res.status(200).json({ ok: false, error: '이 계정으로 이미 사용한 쿠폰입니다.' });
    }
    if (!ins.ok) {
      console.error('[coupon-verify] promo 기록 실패:', ins.status);
      return res.status(500).json({ ok: false, error: '쿠폰 처리에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
    const used = rows.length + 1;

    await sendMail(
      '📣 홍보 쿠폰 사용 [' + tag + '] ' + used + '/' + limit + ' — ' + (KEY_LABEL[key] || key),
      '<div style="font-family:sans-serif;max-width:480px">' +
      '<h2 style="color:#b8923c">📣 홍보 쿠폰이 사용되었습니다</h2>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
      '<tr><td style="padding:6px 0;color:#888">홍보자 태그</td><td><b>' + tag + '</b></td></tr>' +
      '<tr><td style="padding:6px 0;color:#888">진행 현황</td><td><b>' + used + ' / ' + limit + '</b>' + (used >= limit ? ' <span style="color:#b13a2c">(소진 완료)</span>' : '') + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#888">상품</td><td>' + (KEY_LABEL[key] || key) + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#888">코드</td><td style="font-family:monospace">' + raw + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#888">사용자</td><td style="font-family:monospace">' + kakaoId + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#888">사용 시각</td><td>' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + '</td></tr>' +
      '</table></div>'
    );

    return res.status(200).json({ ok: true, promo: true, productKey: key, tag: tag, used: used, limit: limit });
  }

  /* ━━━━━━━━━ 개인 선물 쿠폰 (gift-…) ━━━━━━━━━ */
  const m = raw.match(/^gift-([a-z]+)-([a-z0-9]{4,10})-([a-f0-9]{8})$/);
  if (!m) {
    return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
  }
  const [, key, nonce, sig] = m;
  if (!VALID_KEYS.includes(key)) {
    return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
  }
  if (!safeEqual(sig, hmac8(SECRET, key + '-' + nonce))) {
    return res.status(400).json({ ok: false, error: '유효하지 않은 쿠폰 코드입니다.' });
  }

  await sendMail(
    '🎁 선물 쿠폰 사용됨 — ' + (KEY_LABEL[key] || key),
    '<div style="font-family:sans-serif;max-width:480px">' +
    '<h2 style="color:#b8923c">🎁 선물 쿠폰이 사용되었습니다</h2>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
    '<tr><td style="padding:6px 0;color:#888">쿠폰 종류</td><td><b>' + (KEY_LABEL[key] || key) + '</b></td></tr>' +
    '<tr><td style="padding:6px 0;color:#888">코드</td><td style="font-family:monospace">' + raw + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#888">사용 시각</td><td>' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + '</td></tr>' +
    '</table>' +
    '<p style="margin-top:14px;font-size:13px;color:#666">발급기 이력의 메모와 대조해 누구인지 확인하세요.<br>2~3일 뒤가 후기 요청 골든타임입니다 🙏</p>' +
    '</div>'
  );

  return res.status(200).json({ ok: true, productKey: key });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   구매·분석 원장 (Vercel 서버리스 → Supabase)
   카카오 로그인 세션 토큰으로 본인 확인 후, 본인 데이터만 읽고/씀.
   클라이언트(anon key)로는 원장 테이블 접근 불가 — RLS로 전면 차단,
   이 함수만 service_role 키로 우회 접근.

   actions:
   - list     : 내 구매·분석 전체 조회
   - purchase : 구매 1건 기록
   - analysis : 분석 1건 기록
   - migrate  : 로컬(localStorage) 기록을 서버로 병합 (중복은 orderId/id로 스킵)
   - redeem   : 선물 쿠폰 코드 전역 1회용 체크+기록 (이미 쓰였으면 already:true)

   환경변수:
   - SESSION_SECRET        — kakao-token.js와 동일해야 함
   - SUPABASE_SERVICE_KEY  — Supabase service_role 키 (Project Settings > API Keys)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const crypto = require('crypto');

const SUPA_URL = 'https://hlxttdvvwftiquzqxgxs.supabase.co';

function verifySession(session, secret) {
  if (!session || !secret) return null;
  const parts = String(session).split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  if (!process.env.SESSION_SECRET || !process.env.SUPABASE_SERVICE_KEY) {
    // 환경변수 미설정 — 클라이언트는 로컬 저장 모드로 폴백
    return res.status(503).json({ ok: false, error: 'ledger_disabled' });
  }

  const body = req.body || {};
  const kakaoId = verifySession(body.session, process.env.SESSION_SECRET);
  if (!kakaoId) {
    return res.status(401).json({ ok: false, error: '세션이 만료되었습니다. 다시 로그인해주세요.', reauth: true });
  }
  const enc = encodeURIComponent(kakaoId);

  try {
    // ─── 조회 ───
    if (body.action === 'list') {
      const [p, a] = await Promise.all([
        supa('GET', 'purchases?user_kakao_id=eq.' + enc + '&select=product_id,raw,created_at&order=created_at.asc'),
        supa('GET', 'analyses?user_kakao_id=eq.' + enc + '&select=product_id,raw,created_at&order=created_at.asc')
      ]);
      if (!p.ok || !a.ok) throw new Error('list query failed: ' + p.status + '/' + a.status);
      return res.status(200).json({ ok: true, purchases: p.json || [], analyses: a.json || [] });
    }

    // ─── 구매 1건 ───
    if (body.action === 'purchase') {
      if (!body.productId || !body.raw) return res.status(400).json({ ok: false, error: 'bad request' });
      const r = await supa('POST', 'purchases', {
        user_kakao_id: kakaoId,
        product_id: String(body.productId),
        raw: body.raw,
        created_at: body.raw.purchasedAt || new Date().toISOString()
      }, { 'Prefer': 'return=minimal' });
      if (!r.ok) throw new Error('purchase insert failed: ' + r.status);
      return res.status(200).json({ ok: true });
    }

    // ─── 분석 1건 ───
    if (body.action === 'analysis') {
      if (!body.productId || !body.raw || !body.raw.inputs) return res.status(400).json({ ok: false, error: 'bad request' });
      const r = await supa('POST', 'analyses', {
        user_kakao_id: kakaoId,
        product_id: String(body.productId),
        raw: body.raw,
        created_at: body.raw.lockedAt || new Date().toISOString()
      }, { 'Prefer': 'return=minimal' });
      if (!r.ok) throw new Error('analysis insert failed: ' + r.status);
      return res.status(200).json({ ok: true });
    }

    // ─── 로컬 → 서버 병합 이관 ───
    if (body.action === 'migrate') {
      const [exP, exA] = await Promise.all([
        supa('GET', 'purchases?user_kakao_id=eq.' + enc + '&select=raw'),
        supa('GET', 'analyses?user_kakao_id=eq.' + enc + '&select=raw')
      ]);
      if (!exP.ok || !exA.ok) throw new Error('migrate query failed');
      const haveOrder = new Set((exP.json || []).map(r => r.raw && r.raw.orderId).filter(Boolean));
      const haveAn = new Set((exA.json || []).map(r => r.raw && r.raw.id).filter(Boolean));

      const pRows = (Array.isArray(body.purchases) ? body.purchases : []).slice(0, 100)
        .filter(p => p && p.productId && p.orderId && !haveOrder.has(p.orderId))
        .map(p => ({
          user_kakao_id: kakaoId,
          product_id: String(p.productId),
          raw: p,
          created_at: p.purchasedAt || new Date().toISOString()
        }));

      const aRows = [];
      const anObj = (body.analyses && typeof body.analyses === 'object') ? body.analyses : {};
      Object.keys(anObj).slice(0, 20).forEach(pid => {
        (Array.isArray(anObj[pid]) ? anObj[pid] : []).slice(0, 100).forEach(a => {
          if (a && a.id && a.inputs && !haveAn.has(a.id)) {
            aRows.push({
              user_kakao_id: kakaoId,
              product_id: String(pid),
              raw: a,
              created_at: a.lockedAt || new Date().toISOString()
            });
          }
        });
      });

      if (pRows.length > 0) {
        const r1 = await supa('POST', 'purchases', pRows, { 'Prefer': 'return=minimal' });
        if (!r1.ok) throw new Error('migrate purchases insert failed: ' + r1.status);
      }
      if (aRows.length > 0) {
        const r2 = await supa('POST', 'analyses', aRows, { 'Prefer': 'return=minimal' });
        if (!r2.ok) throw new Error('migrate analyses insert failed: ' + r2.status);
      }
      return res.status(200).json({ ok: true, migrated: pRows.length + aRows.length });
    }

    // ─── 선물 쿠폰 전역 1회용 ───
    if (body.action === 'redeem') {
      const code = String(body.code || '').trim().toLowerCase();
      if (!/^gift-[a-z]+-[a-z0-9]{4,10}-[a-f0-9]{8}$/.test(code)) {
        return res.status(400).json({ ok: false, error: 'bad code' });
      }
      const ins = await supa('POST', 'coupon_redemptions', {
        code: code,
        user_kakao_id: kakaoId
      }, { 'Prefer': 'return=minimal' });
      if (ins.status === 409) {
        return res.status(200).json({ ok: false, already: true, error: '이미 사용된 쿠폰입니다.' });
      }
      if (!ins.ok) throw new Error('redeem insert failed: ' + ins.status);
      return res.status(200).json({ ok: true });
    }

    // ─── 최근 구매 전체 조회 (마스터 전용) ───
    if (body.action === 'recent') {
      if (kakaoId !== 'kakao_4876030261') return res.status(403).json({ ok: false, error: 'forbidden' });
      const q = await supa('GET', 'purchases?select=user_kakao_id,product_id,raw,created_at&order=created_at.desc&limit=10');
      return res.status(200).json({ ok: q.ok, rows: q.json });
    }

    // ─── 메일 발송 기록 조회 (마스터 전용 — coupon_redemptions의 maillog# 행) ───
    if (body.action === 'maillog') {
      if (kakaoId !== 'kakao_4876030261') return res.status(403).json({ ok: false, error: 'forbidden' });
      const q = await supa('GET', 'coupon_redemptions?select=*&code=like.maillog%23*&order=redeemed_at.desc&limit=20');
      return res.status(200).json({ ok: q.ok, status: q.status, rows: q.json });
    }

    // ─── 메일 파이프라인 진단 (마스터 전용) ───
    if (body.action === 'mailtest') {
      if (kakaoId !== 'kakao_4876030261') return res.status(403).json({ ok: false, error: 'forbidden' });
      const RESEND = process.env.RESEND_API_KEY;
      if (!RESEND) return res.status(200).json({ ok: false, diag: 'RESEND_API_KEY 미설정' });
      // body.full=true면 실결제 알림과 동일한 형태의 페이로드로 테스트
      const _payload = body.full ? {
        from: '사주다이어리 <noreply@sajudiary.com>',
        to: [process.env.PAYMENT_NOTIFY_EMAIL || 'cleanblue99@gmail.com'],
        subject: '💰 결제 완료 — 전문가용 (Deep) 29,900원 [실페이로드 테스트]',
        html: '<div style="font-family:sans-serif;max-width:480px"><h2 style="color:#b13a2c">🎉 카카오페이 결제 완료</h2>' +
          '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
          '<tr><td style="padding:6px 0;color:#888">상품</td><td><b>전문가용 (Deep)</b></td></tr>' +
          '<tr><td style="padding:6px 0;color:#888">금액</td><td><b>29,900원</b></td></tr>' +
          '<tr><td style="padding:6px 0;color:#888">결제수단</td><td>카드(카카오페이)</td></tr>' +
          '<tr><td style="padding:6px 0;color:#888">구매자 ID</td><td>kakao_0000000000</td></tr>' +
          '<tr><td style="padding:6px 0;color:#888">주문번호</td><td style="font-size:12px">sajudiary_kakao_0000000000_1755300000000</td></tr>' +
          '<tr><td style="padding:6px 0;color:#888">승인시각</td><td>2026-08-16T12:00:00</td></tr></table>' +
          '<p style="margin-top:16px"><a href="https://pg.kakao.com" style="color:#b13a2c">→ 파트너어드민에서 상세 보기</a></p></div>'
      } : {
        from: '사주다이어리 <noreply@sajudiary.com>',
        to: [process.env.PAYMENT_NOTIFY_EMAIL || 'cleanblue99@gmail.com'],
        subject: '🔧 메일 파이프라인 테스트',
        html: '<p>이 메일이 보이면 발송 인프라 정상입니다.</p>'
      };
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify(_payload)
      });
      const txt = await r.text();
      return res.status(200).json({ ok: true, resendStatus: r.status, resendBody: txt.slice(0, 400) });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('[ledger]', e);
    return res.status(500).json({ ok: false, error: '원장 서버 오류' });
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   게시판·후기·명부 쓰기 대행 (Vercel 서버리스 → Supabase service_role)

   2026-09-02 보안 강화 — anon 키로 열려 있던 UPDATE/DELETE·비밀글 SELECT 정책을
   RLS에서 폐기하고(security_rls_lockdown.sql), 세션(HMAC) 검증을 통과한 요청만
   이 함수가 service_role 키로 대행한다. 클라이언트는 공개 데이터 읽기·익명 글쓰기만
   anon 키로 직접 수행.

   actions (모두 POST { session, action, ...payload } → { ok, data | error }):
   - inquiries.list   { category?, limit?, offset? }  공개글 + 내 비밀글 (마스터: 비밀글 전체)
   - inquiries.mine                                    내 글 전체 (공개+비밀, 마이페이지)
   - inquiries.delete { id }                           본인 글 또는 마스터
   - replies.create   { inquiryId, content, nickname } 마스터 전용
   - replies.delete   { id }                           마스터 전용
   - comments.delete  { id }                           본인 댓글 또는 마스터
   - reviews.write    { productId, rating, content, photoUrls, nickname }  본인 후기 upsert
   - reviews.delete   { id }                           본인 후기 또는 마스터
   - manse.meta.get / manse.meta.set { verifier }      마스터 전용 (명부 암호 검증값)
   - manse.list / manse.insert { rows } / manse.update { id, patch } / manse.delete { id }

   환경변수: SESSION_SECRET (kakao-token.js와 동일), SUPABASE_SERVICE_KEY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const crypto = require('crypto');

const SUPA_URL = 'https://hlxttdvvwftiquzqxgxs.supabase.co';
// 마스터 카카오 ID — config.js MASTER_KAKAO_IDS 중 실제 카카오 로그인으로 세션이 발급되는 ID만
const MASTER_IDS = ['kakao_4876030261'];
// 명부 소유자 키 (tools/manse-ledger.html OWNER 상수와 동일)
const MANSE_OWNER = 'manse_ledger_master';
const VALID_PRODUCTS = ['light', 'deep', 'couple', 'couple_plus'];
// 후기 사진은 자사 Storage 공개 버킷 URL만 허용 (stored XSS·외부 이미지 삽입 차단)
const PHOTO_URL_RE = /^https:\/\/hlxttdvvwftiquzqxgxs\.supabase\.co\/storage\/v1\/object\/public\/review-photos\/[A-Za-z0-9_\-./]{1,200}$/;
const REPLY_EMBED = 'replies(id,content,is_master,author_nickname,created_at)';

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
    const id = String(data.id);
    // PostgREST 필터에 직접 들어가므로 문자 집합 제한
    if (!/^[A-Za-z0-9_]{1,64}$/.test(id)) return null;
    return id;
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

function intId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 1e12 ? n : null;
}
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
// reviews.js maskNickname과 동일 규칙 (서버에서도 마스킹해 저장)
function maskNickname(nickname) {
  if (!nickname) return '회원';
  const t = String(nickname).trim();
  if (t.length <= 1) return t;
  if (t.length === 2) return 'O' + t[1];
  if (t.length === 3) return t[0] + 'O' + t[2];
  return t[0] + 'O'.repeat(t.length - 2) + t[t.length - 1];
}
function pick(obj, keys) {
  const out = {};
  keys.forEach(k => { if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; });
  return out;
}
function supaMsg(q) {
  return (q.json && (q.json.message || q.json.hint)) ? ' ' + (q.json.message || q.json.hint) : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  if (!process.env.SESSION_SECRET || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ ok: false, error: 'board_disabled' });
  }

  const body = req.body || {};
  const kakaoId = verifySession(body.session, process.env.SESSION_SECRET);
  if (!kakaoId) {
    return res.status(401).json({ ok: false, error: '세션이 만료되었습니다. 다시 로그인해주세요.', reauth: true });
  }
  const isMaster = MASTER_IDS.includes(kakaoId);
  const enc = encodeURIComponent(kakaoId);
  const action = String(body.action || '');
  const fail = (status, msg) => res.status(status).json({ ok: false, error: msg });
  const forbid = () => fail(403, '권한이 없습니다.');

  try {
    /* ━━━━━━━━━━━━━━━━ 문의 (inquiries) ━━━━━━━━━━━━━━━━ */
    if (action === 'inquiries.list') {
      let path = 'inquiries?select=*,' + REPLY_EMBED + '&order=created_at.desc';
      if (typeof body.category === 'string' && /^[a-z_]{1,32}$/.test(body.category)) {
        path += '&category=eq.' + body.category;
      }
      if (!isMaster) {
        // 공개글 OR 내 비밀글
        path += '&or=(is_private.eq.false,and(is_private.eq.true,user_kakao_id.eq.' + enc + '))';
      }
      path += '&limit=' + clampInt(body.limit, 1, 200, 50);
      const offset = clampInt(body.offset, 0, 100000, 0);
      if (offset > 0) path += '&offset=' + offset;
      const q = await supa('GET', path);
      if (!q.ok) throw new Error('inquiries.list ' + q.status + supaMsg(q));
      return res.status(200).json({ ok: true, data: q.json || [] });
    }

    if (action === 'inquiries.mine') {
      const q = await supa('GET', 'inquiries?select=*,replies(id,content,is_master,created_at)&user_kakao_id=eq.' + enc + '&order=created_at.desc&limit=200');
      if (!q.ok) throw new Error('inquiries.mine ' + q.status + supaMsg(q));
      return res.status(200).json({ ok: true, data: q.json || [] });
    }

    if (action === 'inquiries.delete') {
      const id = intId(body.id); if (!id) return fail(400, 'bad id');
      let path = 'inquiries?id=eq.' + id;
      if (!isMaster) path += '&user_kakao_id=eq.' + enc;
      const q = await supa('DELETE', path, null, { 'Prefer': 'return=representation' });
      if (!q.ok) throw new Error('inquiries.delete ' + q.status + supaMsg(q));
      const n = Array.isArray(q.json) ? q.json.length : 0;
      if (n === 0) return forbid();
      return res.status(200).json({ ok: true, data: { deleted: n } });
    }

    /* ━━━━━━━━━━━━━━━━ 답글 (replies) — 마스터 전용 ━━━━━━━━━━━━━━━━ */
    if (action === 'replies.create') {
      if (!isMaster) return forbid();
      const inquiryId = intId(body.inquiryId); if (!inquiryId) return fail(400, 'bad inquiryId');
      const text = String(body.content || '').trim();
      if (text.length < 2) return fail(400, '답글이 너무 짧습니다.');
      if (text.length > 3000) return fail(400, '답글은 3,000자 이내로 작성해주세요.');
      const nick = String(body.nickname || '운영자').trim().slice(0, 30) || '운영자';
      const q = await supa('POST', 'replies', {
        inquiry_id: inquiryId, content: text, is_master: true,
        author_kakao_id: kakaoId, author_nickname: nick
      }, { 'Prefer': 'return=representation' });
      if (!q.ok) throw new Error('replies.create ' + q.status + supaMsg(q));
      return res.status(200).json({ ok: true, data: Array.isArray(q.json) ? q.json[0] : q.json });
    }

    if (action === 'replies.delete') {
      if (!isMaster) return forbid();
      const id = intId(body.id); if (!id) return fail(400, 'bad id');
      const q = await supa('DELETE', 'replies?id=eq.' + id, null, { 'Prefer': 'return=minimal' });
      if (!q.ok) throw new Error('replies.delete ' + q.status + supaMsg(q));
      return res.status(200).json({ ok: true, data: null });
    }

    /* ━━━━━━━━━━━━━━━━ 칼럼 댓글 (column_comments) ━━━━━━━━━━━━━━━━ */
    if (action === 'comments.delete') {
      const id = intId(body.id); if (!id) return fail(400, 'bad id');
      let path = 'column_comments?id=eq.' + id;
      if (!isMaster) path += '&user_kakao_id=eq.' + enc;
      const q = await supa('DELETE', path, null, { 'Prefer': 'return=representation' });
      if (!q.ok) throw new Error('comments.delete ' + q.status + supaMsg(q));
      const n = Array.isArray(q.json) ? q.json.length : 0;
      if (n === 0) return forbid();
      return res.status(200).json({ ok: true, data: { deleted: n } });
    }

    /* ━━━━━━━━━━━━━━━━ 후기 (reviews) ━━━━━━━━━━━━━━━━ */
    if (action === 'reviews.write') {
      const productId = String(body.productId || '');
      if (!VALID_PRODUCTS.includes(productId)) return fail(400, '상품 정보가 올바르지 않습니다.');
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(400, '별점은 1~5점');
      const content = String(body.content || '').trim();
      if (content.length < 5) return fail(400, '5자 이상 작성해주세요');
      if (content.length > 2000) return fail(400, '후기는 2,000자 이내로 작성해주세요.');
      const urls = (Array.isArray(body.photoUrls) ? body.photoUrls : [])
        .filter(u => typeof u === 'string' && PHOTO_URL_RE.test(u)).slice(0, 2);
      const realNick = String(body.nickname || '').trim().slice(0, 50) || null;
      const row = {
        user_kakao_id: kakaoId,
        user_real_nickname: realNick,
        display_nickname: maskNickname(realNick || '회원'),
        product_id: productId,
        rating: rating,
        content: content,
        photo_urls: urls.length > 0 ? urls : null,
        updated_at: new Date().toISOString()
      };
      // (user_kakao_id, product_id) unique → 같은 상품 재작성은 update
      const q = await supa('POST', 'reviews?on_conflict=user_kakao_id,product_id', row,
        { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      if (!q.ok) {
        console.error('[board] reviews.write', q.status, JSON.stringify(q.json));
        return fail(500, '후기 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
      return res.status(200).json({ ok: true, data: null });
    }

    if (action === 'reviews.delete') {
      const id = intId(body.id); if (!id) return fail(400, 'bad id');
      let path = 'reviews?id=eq.' + id;
      if (!isMaster) path += '&user_kakao_id=eq.' + enc;
      const q = await supa('DELETE', path, null, { 'Prefer': 'return=representation' });
      if (!q.ok) throw new Error('reviews.delete ' + q.status + supaMsg(q));
      const n = Array.isArray(q.json) ? q.json.length : 0;
      if (n === 0) return forbid();
      return res.status(200).json({ ok: true, data: { deleted: n } });
    }

    /* ━━━━━━━━━━━━━━━━ 나만의 만세력 명부 — 마스터 전용 ━━━━━━━━━━━━━━━━ */
    if (action.startsWith('manse.')) {
      if (!isMaster) return forbid();
      const ownerQ = 'owner_kakao_id=eq.' + encodeURIComponent(MANSE_OWNER);
      const RECORD_COLS = ['name_enc', 'memo_enc', 'gender', 'birth_year', 'birth_month', 'birth_day',
        'birth_hour', 'calendar', 'pillars', 'summary', 'tags'];

      if (action === 'manse.meta.get') {
        const q = await supa('GET', 'manse_meta?select=*&' + ownerQ + '&limit=1');
        if (!q.ok) return res.status(200).json({ ok: false, error: 'meta ' + q.status + supaMsg(q) });
        return res.status(200).json({ ok: true, data: (q.json && q.json[0]) || null });
      }
      if (action === 'manse.meta.set') {
        const verifier = String(body.verifier || '');
        if (!verifier || verifier.length > 512) return fail(400, 'bad verifier');
        const q = await supa('POST', 'manse_meta?on_conflict=owner_kakao_id',
          { owner_kakao_id: MANSE_OWNER, verifier: verifier },
          { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
        if (!q.ok) throw new Error('manse.meta.set ' + q.status + supaMsg(q));
        return res.status(200).json({ ok: true, data: null });
      }
      if (action === 'manse.list') {
        const q = await supa('GET', 'manse_records?select=*&' + ownerQ + '&order=created_at.desc&limit=5000');
        if (!q.ok) return res.status(200).json({ ok: false, error: 'list ' + q.status + supaMsg(q) });
        return res.status(200).json({ ok: true, data: q.json || [] });
      }
      if (action === 'manse.insert') {
        const src = Array.isArray(body.rows) ? body.rows : (body.row ? [body.row] : []);
        if (src.length === 0 || src.length > 500) return fail(400, 'bad rows');
        const rows = src.map(r => Object.assign(pick(r, RECORD_COLS), { owner_kakao_id: MANSE_OWNER }));
        const q = await supa('POST', 'manse_records', rows, { 'Prefer': 'return=representation' });
        if (!q.ok) return res.status(200).json({ ok: false, error: 'insert ' + q.status + supaMsg(q) });
        return res.status(200).json({ ok: true, data: Array.isArray(body.rows) ? q.json : (q.json && q.json[0]) });
      }
      if (action === 'manse.update') {
        const id = intId(body.id); if (!id) return fail(400, 'bad id');
        const patch = pick(body.patch || {}, RECORD_COLS);
        if (Object.keys(patch).length === 0) return fail(400, 'empty patch');
        const q = await supa('PATCH', 'manse_records?id=eq.' + id + '&' + ownerQ, patch, { 'Prefer': 'return=minimal' });
        if (!q.ok) return res.status(200).json({ ok: false, error: 'update ' + q.status + supaMsg(q) });
        return res.status(200).json({ ok: true, data: null });
      }
      if (action === 'manse.delete') {
        const id = intId(body.id); if (!id) return fail(400, 'bad id');
        const q = await supa('DELETE', 'manse_records?id=eq.' + id + '&' + ownerQ, null, { 'Prefer': 'return=minimal' });
        if (!q.ok) return res.status(200).json({ ok: false, error: 'delete ' + q.status + supaMsg(q) });
        return res.status(200).json({ ok: true, data: null });
      }
    }

    return fail(400, 'unknown action');
  } catch (e) {
    console.error('[board]', action, e);
    return res.status(500).json({ ok: false, error: '게시판 서버 오류' });
  }
};

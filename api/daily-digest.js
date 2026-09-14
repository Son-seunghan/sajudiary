/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   일일 리포트 메일 (Vercel 서버리스 + Cron)
   매일 08:00 KST (vercel.json crons — UTC 23:00) 어제(KST) 지표를 모아 발송.

   지표 소스 2곳:
   - 우리 Supabase: 만세력 조회·가입/재방문·구매/매출·쿠폰·후기·QNA
   - GA4 Data API : 방문자·페이지뷰·유입경로·클릭 이벤트·인기 페이지
     (GA_* 환경변수 미설정이면 해당 섹션만 "연동 대기"로 표시)

   중복 방지: coupon_redemptions 에 maillog#digest#YYYY-MM-DD 행을 남겨
   하루 1통 보장 — 엔드포인트가 공개여도 재발송 못 함. ?test=1 은 가드 무시.

   환경변수: SUPABASE_SERVICE_KEY, RESEND_API_KEY, PAYMENT_NOTIFY_EMAIL(선택),
             GA_PROPERTY_ID, GA_CLIENT_EMAIL, GA_PRIVATE_KEY (선택 — GA4 섹션용)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const crypto = require('crypto');

const SUPA_URL = 'https://hlxttdvvwftiquzqxgxs.supabase.co';
const PRODUCT_LABEL = {
  light: '입문용', deep: '전문가용', couple: '궁합', couple_plus: '궁합 성인용'
};

/* ─── KST 날짜 유틸: offsetDays=-1 → 어제 (라벨 + UTC 경계) ─── */
function kstDay(offsetDays) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dayStart = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
    + offsetDays * 86400000;
  const d = new Date(dayStart);
  const label = d.getUTCFullYear() + '-'
    + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
    + String(d.getUTCDate()).padStart(2, '0');
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return {
    label: label, weekday: weekday,
    startISO: new Date(dayStart - 9 * 3600 * 1000).toISOString(),
    endISO: new Date(dayStart - 9 * 3600 * 1000 + 86400000).toISOString()
  };
}

/* ─── Supabase 헬퍼 ─── */
function supaHeaders(KEY, extra) {
  return Object.assign({
    'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'
  }, extra || {});
}
// 카운트만 (Range 0-0 + count=exact) — 실패 시 null
async function supaCount(KEY, pathWithFilters) {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + pathWithFilters, {
      headers: supaHeaders(KEY, { 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' })
    });
    if (!r.ok) return null;
    const cr = r.headers.get('content-range');
    if (!cr || cr.indexOf('/') < 0) return null;
    const total = parseInt(cr.split('/')[1], 10);
    return isNaN(total) ? null : total;
  } catch (e) { return null; }
}
async function supaRows(KEY, pathWithFilters) {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + pathWithFilters, { headers: supaHeaders(KEY) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

/* ─── GA4 Data API (서비스 계정 JWT → runReport) ─── */
async function gaToken(email, privateKey) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const input = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
      iss: email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600
    });
    const key = privateKey.indexOf('\\n') >= 0 ? privateKey.replace(/\\n/g, '\n') : privateKey;
    const sig = crypto.createSign('RSA-SHA256').update(input).sign(key, 'base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')
        + '&assertion=' + encodeURIComponent(input + '.' + sig)
    });
    const j = await r.json();
    return j.access_token || null;
  } catch (e) {
    console.error('[digest] GA 토큰 실패:', e.message);
    return null;
  }
}
async function gaReport(token, propertyId, body) {
  try {
    const r = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + propertyId + ':runReport', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) { console.error('[digest] GA report HTTP', r.status); return null; }
    return await r.json();
  } catch (e) { return null; }
}
const gaMetric = (rep, rowIdx, mIdx) => {
  try { return parseInt(rep.rows[rowIdx].metricValues[mIdx].value, 10); } catch (e) { return null; }
};

/* ─── 메일 ─── */
async function sendMail(RESEND, to, subject, html) {
  const senders = ['사주다이어리 <noreply@sajudiary.com>', '사주다이어리 <onboarding@resend.dev>'];
  for (let i = 0; i < senders.length; i++) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: senders[i], to: [to], subject: subject, html: html })
      });
      if (r.ok) return true;
      console.error('[digest] 메일 거절(시도 ' + (i + 1) + ') HTTP', r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error('[digest] 메일 연결 실패:', e.message); }
    await new Promise(rs => setTimeout(rs, 400));
  }
  return false;
}

const fmt = v => (v === null || v === undefined) ? '—' : Number(v).toLocaleString('ko-KR');
const cmp = (v, prev) => (v === null || prev === null || prev === undefined) ? '' :
  ' <span style="color:#999;font-size:12px">(전일 ' + Number(prev).toLocaleString('ko-KR') + ')</span>';
const tr = (label, val) =>
  '<tr><td style="padding:5px 0;color:#888">' + label + '</td><td style="text-align:right"><b>' + val + '</b></td></tr>';

module.exports = async (req, res) => {
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND = process.env.RESEND_API_KEY;
  const NOTIFY_TO = process.env.PAYMENT_NOTIFY_EMAIL || 'cleanblue99@gmail.com';
  if (!KEY || !RESEND) return res.status(503).json({ ok: false, error: 'env 미설정' });

  const isTest = (req.query && req.query.test === '1') || (req.body && req.body.test === true);
  const day = kstDay(-1);       // 어제
  const prevDay = kstDay(-2);   // 전전일 (전일 대비용)

  // ─── 중복 발송 가드 ───
  const guardCode = 'maillog#digest#' + day.label + (isTest ? '#test' + Date.now() : '');
  if (!isTest) {
    const dup = await supaCount(KEY, 'coupon_redemptions?select=code&code=eq.' + encodeURIComponent('maillog#digest#' + day.label));
    if (dup !== null && dup > 0) {
      return res.status(200).json({ ok: true, already: true, day: day.label });
    }
  }

  const range = (col, dd) => col + '=gte.' + encodeURIComponent(dd.startISO) + '&' + col + '=lt.' + encodeURIComponent(dd.endISO);

  // ─── 우리 DB 지표 (병렬) ───
  const [
    manseCnt, mansePrev,
    newUsers, newUsersPrev, returnUsers,
    purchaseRows, couponCnt, reviewCnt, qnaCnt
  ] = await Promise.all([
    supaCount(KEY, 'manse_lookups?select=id&' + range('created_at', day)),
    supaCount(KEY, 'manse_lookups?select=id&' + range('created_at', prevDay)),
    supaCount(KEY, 'site_users?select=kakao_id&' + range('first_seen', day)),
    supaCount(KEY, 'site_users?select=kakao_id&' + range('first_seen', prevDay)),
    supaCount(KEY, 'site_users?select=kakao_id&' + range('last_seen', day) + '&first_seen=lt.' + encodeURIComponent(day.startISO)),
    supaRows(KEY, 'purchases?select=product_id,raw&' + range('created_at', day)),
    supaCount(KEY, 'coupon_redemptions?select=code&' + range('redeemed_at', day) + '&code=not.like.' + encodeURIComponent('maillog#') + '*'),
    supaCount(KEY, 'reviews?select=id&' + range('created_at', day)),
    supaCount(KEY, 'inquiries?select=id&' + range('created_at', day))
  ]);

  // 구매 집계
  let saleCnt = null, saleSum = null, saleDetail = '';
  if (Array.isArray(purchaseRows)) {
    saleCnt = purchaseRows.length;
    saleSum = purchaseRows.reduce((s, r) => s + ((r.raw && Number(r.raw.amount)) || 0), 0);
    const byProd = {};
    purchaseRows.forEach(r => { byProd[r.product_id] = (byProd[r.product_id] || 0) + 1; });
    saleDetail = Object.keys(byProd).map(k => (PRODUCT_LABEL[k] || k) + ' ' + byProd[k]).join(' · ');
  }

  // ─── GA4 지표 ───
  const GA_ID = process.env.GA_PROPERTY_ID, GA_EMAIL = process.env.GA_CLIENT_EMAIL, GA_KEY = process.env.GA_PRIVATE_KEY;
  let ga = null;
  if (GA_ID && GA_EMAIL && GA_KEY) {
    const token = await gaToken(GA_EMAIL, GA_KEY);
    if (token) {
      const yRange = [{ startDate: 'yesterday', endDate: 'yesterday' }];
      const [totals, totalsPrev, sources, events, pages] = await Promise.all([
        gaReport(token, GA_ID, { dateRanges: yRange, metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }] }),
        gaReport(token, GA_ID, { dateRanges: [{ startDate: '2daysAgo', endDate: '2daysAgo' }], metrics: [{ name: 'activeUsers' }] }),
        gaReport(token, GA_ID, { dateRanges: yRange, dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 6 }),
        gaReport(token, GA_ID, {
          dateRanges: yRange, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
          dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['manse_lookup', 'review_open', 'product_click'] } } }
        }),
        gaReport(token, GA_ID, { dateRanges: yRange, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 5 })
      ]);
      const evMap = {};
      if (events && events.rows) events.rows.forEach(r => { evMap[r.dimensionValues[0].value] = parseInt(r.metricValues[0].value, 10); });
      ga = {
        visitors: gaMetric(totals, 0, 0), pageviews: gaMetric(totals, 0, 1), sessions: gaMetric(totals, 0, 2),
        visitorsPrev: gaMetric(totalsPrev, 0, 0),
        sources: (sources && sources.rows) ? sources.rows.map(r => ({ name: r.dimensionValues[0].value, n: parseInt(r.metricValues[0].value, 10) })) : [],
        events: evMap,
        pages: (pages && pages.rows) ? pages.rows.map(r => ({ path: r.dimensionValues[0].value, n: parseInt(r.metricValues[0].value, 10) })) : []
      };
    }
  }

  // ─── 메일 본문 ───
  let html = '<div style="font-family:sans-serif;max-width:520px">'
    + '<h2 style="color:#b13a2c;margin-bottom:2px">📊 사주다이어리 일일 리포트</h2>'
    + '<p style="color:#888;margin-top:0;font-size:13px">' + day.label + ' (' + day.weekday + ') 하루 집계' + (isTest ? ' — <b>[테스트 발송]</b>' : '') + '</p>';

  html += '<h3 style="margin-bottom:4px">🏪 사이트 활동</h3>'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px">'
    + tr('매출', fmt(saleSum) + '원 · ' + fmt(saleCnt) + '건' + (saleDetail ? ' <span style="color:#999;font-size:12px">(' + saleDetail + ')</span>' : ''))
    + tr('쿠폰 사용', fmt(couponCnt) + '건')
    + tr('신규 가입', fmt(newUsers) + '명' + cmp(newUsers, newUsersPrev))
    + tr('재방문 로그인', fmt(returnUsers) + '명')
    + tr('무료 만세력 조회', fmt(manseCnt) + '건' + cmp(manseCnt, mansePrev))
    + tr('새 후기', fmt(reviewCnt) + '건')
    + tr('새 QNA 글', fmt(qnaCnt) + '건')
    + '</table>';
  if (manseCnt === null || newUsers === null) {
    html += '<p style="color:#b8923c;font-size:12px">⚠ 만세력/가입 지표가 — 로 나오면 analytics_setup.sql 이 아직 실행 전입니다.</p>';
  }

  if (ga) {
    html += '<h3 style="margin-bottom:4px">🌐 방문 (GA4)</h3>'
      + '<table style="width:100%;border-collapse:collapse;font-size:14px">'
      + tr('방문자', fmt(ga.visitors) + '명' + cmp(ga.visitors, ga.visitorsPrev))
      + tr('페이지뷰', fmt(ga.pageviews))
      + tr('세션', fmt(ga.sessions))
      + tr('후기 클릭', fmt(ga.events.review_open) + '회')
      + tr('상품 버튼 클릭', fmt(ga.events.product_click) + '회')
      + '</table>';
    if (ga.sources.length > 0) {
      html += '<p style="margin:8px 0 2px;font-size:13px;color:#888">유입경로 (세션)</p>'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + ga.sources.map(s => tr(s.name === '(direct)' ? '직접 접속' : s.name, fmt(s.n))).join('') + '</table>';
    }
    if (ga.pages.length > 0) {
      html += '<p style="margin:8px 0 2px;font-size:13px;color:#888">인기 페이지</p>'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + ga.pages.map(p => tr(p.path, fmt(p.n))).join('') + '</table>';
    }
  } else {
    html += '<p style="color:#b8923c;font-size:13px">🌐 방문자·유입경로는 GA4 연동 대기 중입니다 (GA4_연동_가이드.md 참고 — GA_PROPERTY_ID·GA_CLIENT_EMAIL·GA_PRIVATE_KEY 설정 시 자동 표시).</p>';
  }

  html += '<p style="margin-top:14px;font-size:12px;color:#aaa">매일 아침 8시 자동 발송 · sajudiary.com</p></div>';

  const subject = (isTest ? '[테스트] ' : '') + '📊 일일 리포트 ' + day.label
    + ' — 매출 ' + fmt(saleSum) + '원 · 만세력 ' + fmt(manseCnt) + '건';

  const sent = await sendMail(RESEND, NOTIFY_TO, subject, html);

  // 발송 기록 (성공 시에만 — 실패하면 다음 트리거가 재시도)
  if (sent) {
    try {
      await fetch(SUPA_URL + '/rest/v1/coupon_redemptions', {
        method: 'POST',
        headers: supaHeaders(KEY, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ code: guardCode, user_kakao_id: '일일리포트 발송' + (isTest ? '(테스트)' : '') })
      });
    } catch (e) {}
  }

  return res.status(200).json({ ok: sent, day: day.label, ga: !!ga, test: isTest });
};

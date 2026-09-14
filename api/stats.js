/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   통계 수집 (Vercel 서버리스) — 무료 만세력 조회 기록
   manse.html 조회 성공 시 fire-and-forget 호출.
   익명 페이지라 세션 불필요 — 이름은 받지도 저장하지도 않음.
   테이블: manse_lookups (RLS 정책 없음 = service key 전용)
   환경변수: SUPABASE_SERVICE_KEY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SUPA_URL = 'https://hlxttdvvwftiquzqxgxs.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(200).json({ ok: false });

  const b = req.body || {};
  if (b.action !== 'manse') return res.status(400).json({ ok: false });

  // 엄격 검증 — 열린 엔드포인트라 쓰레기 데이터 방지
  const y = parseInt(b.y, 10), m = parseInt(b.m, 10), d = parseInt(b.d, 10);
  const h = parseFloat(b.h);
  if (!y || y < 1900 || y > 2050 || !m || m < 1 || m > 12 || !d || d < 1 || d > 31) {
    return res.status(400).json({ ok: false });
  }
  const gender = b.gender === 'female' ? 'female' : 'male';
  const clean = s => String(s || '').slice(0, 8);
  const pillars = (b.pillars && typeof b.pillars === 'object') ? {
    y: clean(b.pillars.y), m: clean(b.pillars.m),
    d: clean(b.pillars.d), h: b.pillars.h ? clean(b.pillars.h) : null
  } : null;

  try {
    const r = await fetch(SUPA_URL + '/rest/v1/manse_lookups', {
      method: 'POST',
      headers: {
        'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        birth_year: y, birth_month: m, birth_day: d,
        birth_hour: isNaN(h) ? -1 : h,
        gender: gender, pillars: pillars
      })
    });
    // 테이블 미생성 등 실패해도 200 — 클라이언트는 신경 쓸 필요 없음
    return res.status(200).json({ ok: r.ok });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
};

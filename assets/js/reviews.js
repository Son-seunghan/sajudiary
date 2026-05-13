/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 — 리뷰 시스템 (reviews.js)
   Supabase 기반 (반영 2026-05-13).
   - 모든 조회/저장 메서드는 Promise 반환 (async)
   - 사진 첨부 — Supabase Storage 'review-photos' 버킷
   - 클라이언트 사이드 이미지 압축 (max 1600px, JPEG 85%)
   - 동기 유틸리티(maskNickname, renderStars, formatDate, getProductTagClass)는 그대로
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Reviews = (function () {
  const cfg = window.SAJULOG_CONFIG;
  let _client = null;
  let _failed = false;

  // SajuSupa가 같은 페이지에 로드돼 있으면 그 client 재사용, 아니면 자체 init
  function client() {
    if (_client) return _client;
    if (_failed) return null;
    if (typeof window.SajuSupa !== 'undefined' && SajuSupa.getClient) {
      const c = SajuSupa.getClient();
      if (c) { _client = c; return _client; }
    }
    if (!cfg || !cfg.SUPABASE_ENABLED) { _failed = true; return null; }
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.warn('[Reviews] Supabase JS SDK가 로드되지 않음');
      _failed = true; return null;
    }
    _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
    return _client;
  }

  function isEnabled() { return client() !== null; }

  // ─── DB row → 기존 외부 코드용 shape으로 정규화 ───
  function _normalize(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_kakao_id,
      userNickname: row.display_nickname || '회원',
      productId: row.product_id,
      rating: row.rating,
      content: row.content,
      photoUrls: Array.isArray(row.photo_urls) ? row.photo_urls : [],
      // 호환성을 위해 photoUrl도 유지 (첫 사진)
      photoUrl: Array.isArray(row.photo_urls) && row.photo_urls.length > 0 ? row.photo_urls[0] : null,
      likesCount: row.likes_count || 0,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null
    };
  }

  // ─── 조회 (모두 async) ───
  async function getAll() {
    const sb = client(); if (!sb) return [];
    const { data, error } = await sb.from('reviews')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('[Reviews] getAll:', error); return []; }
    return (data || []).map(_normalize);
  }

  async function getByProduct(productId) {
    const sb = client(); if (!sb) return [];
    const { data, error } = await sb.from('reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[Reviews] getByProduct:', error); return []; }
    return (data || []).map(_normalize);
  }

  async function getByUser(userId) {
    const sb = client(); if (!sb) return [];
    if (!userId) return [];
    const { data, error } = await sb.from('reviews')
      .select('*')
      .eq('user_kakao_id', userId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[Reviews] getByUser:', error); return []; }
    return (data || []).map(_normalize);
  }

  async function getUserReviewForProduct(userId, productId) {
    const sb = client(); if (!sb) return null;
    if (!userId || !productId) return null;
    const { data, error } = await sb.from('reviews')
      .select('*')
      .eq('user_kakao_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
    if (error) { console.error('[Reviews] getUserReviewForProduct:', error); return null; }
    return _normalize(data);
  }

  // ─── 작성/수정 (upsert) ───
  // photoUrls: string[] (최대 2장) — null/undefined면 빈 배열
  async function write({ userId, userNickname, productId, rating, content, photoUrls }) {
    if (!userId || !productId || !rating) return { success: false, error: '필수 정보 누락' };
    if (rating < 1 || rating > 5) return { success: false, error: '별점은 1~5점' };
    if (!content || content.trim().length < 5) return { success: false, error: '5자 이상 작성해주세요' };

    const sb = client();
    if (!sb) return { success: false, error: 'Supabase 미설정 — 후기 시스템 비활성' };

    // photoUrls 정규화: 배열로 변환, 최대 2장 제한, 빈 문자열 제거
    const cleanUrls = Array.isArray(photoUrls)
      ? photoUrls.filter(u => typeof u === 'string' && u.trim().length > 0).slice(0, 2)
      : [];

    const payload = {
      user_kakao_id: userId,
      user_real_nickname: userNickname || null,
      display_nickname: maskNickname(userNickname || '회원'),
      product_id: productId,
      rating: rating,
      content: content.trim(),
      photo_urls: cleanUrls.length > 0 ? cleanUrls : null,
      updated_at: new Date().toISOString()
    };

    // (user_kakao_id, product_id) unique 제약 → 같은 사용자가 같은 상품에 다시 쓰면 update
    const { error } = await sb.from('reviews').upsert(payload, {
      onConflict: 'user_kakao_id,product_id'
    });
    if (error) {
      console.error('[Reviews] write:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  // ─── 삭제 (본인 또는 마스터) ───
  async function remove(reviewId, userId) {
    const sb = client();
    if (!sb) return false;
    if (!userId) return false;
    const isMaster = typeof AuthGuard !== 'undefined' && AuthGuard.isMaster && AuthGuard.isMaster();
    let q = sb.from('reviews').delete().eq('id', reviewId);
    if (!isMaster) q = q.eq('user_kakao_id', userId);
    const { error } = await q;
    if (error) { console.error('[Reviews] remove:', error); return false; }
    return true;
  }

  // ─── 평균 별점 ───
  async function getAverageRating(productId = null) {
    const list = productId ? await getByProduct(productId) : await getAll();
    if (list.length === 0) return { average: 0, count: 0 };
    const sum = list.reduce((s, r) => s + r.rating, 0);
    return {
      average: Math.round(sum / list.length * 10) / 10,
      count: list.length
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 사진 업로드 (Supabase Storage)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 사진 1장을 압축 후 review-photos 버킷에 업로드 → public URL 반환
   * @param {File} file - 사용자가 선택한 이미지 파일
   * @param {string} userId - 작성자 카카오 ID (폴더 구분용)
   * @returns {Promise<{url?: string, error?: string}>}
   */
  async function uploadPhoto(file, userId) {
    if (!file) return { error: '파일이 없습니다' };
    if (!userId) return { error: '로그인이 필요합니다' };
    const sb = client();
    if (!sb) return { error: 'Supabase 미설정' };

    // MIME 체크 (이미지만)
    if (!file.type || !file.type.startsWith('image/')) {
      return { error: '이미지 파일만 업로드 가능합니다' };
    }

    // 크기 체크 (10MB 한도 — 버킷 설정과 일치)
    if (file.size > 10 * 1024 * 1024) {
      return { error: '10MB 이하의 사진만 가능합니다' };
    }

    try {
      // 1) 클라이언트 사이드 압축 (1600px, JPEG 85)
      const blob = await compressImage(file, 1600, 0.85);

      // 2) 업로드 경로: userId/timestamp_rand.jpg
      const filename = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await sb.storage.from('review-photos').upload(filename, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: false
      });
      if (upErr) { console.error('[Reviews] uploadPhoto:', upErr); return { error: upErr.message }; }

      // 3) Public URL 추출
      const { data: urlData } = sb.storage.from('review-photos').getPublicUrl(filename);
      return { url: urlData.publicUrl, path: filename };
    } catch (e) {
      console.error('[Reviews] uploadPhoto fatal:', e);
      return { error: e.message || '업로드 실패' };
    }
  }

  /**
   * Canvas 기반 이미지 압축
   * @param {File|Blob} file
   * @param {number} maxWidth - 긴 변 최대 픽셀 (기본 1600)
   * @param {number} quality - JPEG 품질 0~1 (기본 0.85)
   * @returns {Promise<Blob>}
   */
  function compressImage(file, maxWidth = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const longSide = Math.max(img.width, img.height);
          const ratio = longSide > maxWidth ? maxWidth / longSide : 1;
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('압축 결과 비어있음'));
            resolve(blob);
          }, 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('이미지 로드 실패'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsDataURL(file);
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 동기 유틸리티 (기존과 동일)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 닉네임 마스킹 (개인정보 보호)
  // 김민정 → 김O정 / 박수 → 박O / O수아 → O수아 (3자 이상만 마스킹)
  function maskNickname(nickname) {
    if (!nickname) return '회원';
    const trimmed = nickname.trim();
    if (trimmed.length <= 2) return trimmed;
    if (trimmed.length === 3) return trimmed[0] + 'O' + trimmed[2];
    return trimmed[0] + 'O'.repeat(trimmed.length - 2) + trimmed[trimmed.length - 1];
  }

  // 별점 HTML 렌더링
  function renderStars(rating, size = 'text-base') {
    const full = Math.floor(rating);
    const html = [];
    for (let i = 0; i < 5; i++) {
      html.push(`<span class="${i < full ? 'star-on' : 'star-off'}">★</span>`);
    }
    return `<span class="stars ${size}">${html.join('')}</span>`;
  }

  // 날짜 포맷 (number 또는 ISO string 모두 받음)
  function formatDate(ts) {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  }

  // 상품 태그 클래스
  function getProductTagClass(productId) {
    const colorMap = { jade: 'tag-light', vermil: 'tag-deep', plum: 'tag-couple', wine: 'tag-wine' };
    const product = cfg.PRODUCTS[productId];
    return product ? (colorMap[product.color] || '') : '';
  }

  return {
    isEnabled,
    getAll, getByProduct, getByUser, getUserReviewForProduct,
    write, remove,
    uploadPhoto, compressImage,
    getAverageRating,
    maskNickname, renderStars, formatDate, getProductTagClass
  };
})();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 — 칼럼 댓글 위젯 (column-comments.js)
   - 자기완결형: 의존성만 있으면 자동 마운트
   - 의존: config.js, auth-guard.js, supabase-client.js, @supabase/supabase-js@2 (CDN)
   - 칼럼 페이지 본문 끝(article-nav 다음)에 자동 삽입
   - column_slug는 URL filename에서 자동 추출 (e.g., 2026-05-01-saju-intro)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function () {
  'use strict';

  // ─── 1. CSS 주입 ───
  const CSS = `
  .col-comments-wrap {
    max-width: 760px;
    margin: 80px auto 40px;
    padding: 0 24px;
  }
  .col-comments-head {
    text-align: center;
    margin-bottom: 28px;
  }
  .col-comments-head .label {
    font-family: 'Shilla Gothic', 'Pretendard', sans-serif;
    font-size: 12px;
    color: var(--ink3, #6b5d4f);
    letter-spacing: 0.3em;
    margin-bottom: 8px;
  }
  .col-comments-head h3 {
    font-family: 'Shilla Culture', 'Noto Serif KR', serif;
    font-weight: 700;
    font-size: 22px;
    color: var(--ink, #2c2520);
    margin: 0 0 6px;
  }
  .col-comments-head .desc {
    font-size: 12px;
    color: var(--ink4, #8a7d6b);
    line-height: 1.6;
  }
  .col-comments-trust {
    background: linear-gradient(135deg, #faf5e8 0%, #fff7e0 100%);
    border: 1px solid var(--gold, #b8923c);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 12px;
    color: var(--ink2, #4a3f33);
    text-align: center;
    margin: 14px auto 28px;
    max-width: 480px;
  }
  .col-comments-trust strong { color: var(--vermil, #b13a2c); }

  .col-comments-form {
    background: var(--paper2, #faf5e8);
    border: 1px solid var(--paper-dk, #ebe1c4);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
  }
  .col-cc-textarea {
    width: 100%;
    min-height: 80px;
    padding: 12px 14px;
    border: 1px solid var(--paper-dk, #ebe1c4);
    border-radius: 8px;
    background: #fff;
    font-family: 'Pretendard', sans-serif;
    font-size: 14px;
    color: var(--ink, #2c2520);
    line-height: 1.6;
    resize: vertical;
    box-sizing: border-box;
  }
  .col-cc-textarea:focus { outline: none; border-color: var(--gold, #b8923c); }

  .col-cc-row {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    margin-top: 10px;
  }
  .col-cc-nick {
    flex: 1; min-width: 140px;
    padding: 8px 12px;
    border: 1px solid var(--paper-dk, #ebe1c4);
    border-radius: 8px;
    background: #fff;
    font-family: 'Pretendard', sans-serif;
    font-size: 13px;
    color: var(--ink, #2c2520);
  }
  .col-cc-nick:focus { outline: none; border-color: var(--gold, #b8923c); }

  .col-cc-submit {
    background: var(--ink, #2c2520);
    color: var(--paper2, #faf5e8);
    border: none;
    padding: 9px 22px;
    border-radius: 8px;
    font-family: 'Shilla Gothic', 'Pretendard', sans-serif;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background .15s ease;
  }
  .col-cc-submit:hover { background: var(--vermil, #b13a2c); }
  .col-cc-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .col-cc-list { display: flex; flex-direction: column; gap: 14px; }

  .col-cc-item {
    background: var(--paper2, #faf5e8);
    border: 1px solid var(--paper-dk, #ebe1c4);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .col-cc-item.is-reply {
    margin-left: 32px;
    background: #fff;
    border-left: 3px solid var(--paper-dk, #ebe1c4);
  }
  .col-cc-item.is-master {
    background: linear-gradient(180deg, #fff7e0 0%, #fdf3d0 100%);
    border-left: 3px solid var(--gold, #b8923c);
  }
  .col-cc-meta {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-bottom: 6px;
    font-family: 'Shilla Gothic', 'Pretendard', sans-serif;
    font-size: 12px;
  }
  .col-cc-nickname {
    font-weight: 700;
    color: var(--ink, #2c2520);
  }
  .col-cc-badge {
    background: var(--gold, #b8923c);
    color: var(--ink, #2c2520);
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .col-cc-time {
    color: var(--ink4, #8a7d6b);
    font-size: 11px;
  }
  .col-cc-content {
    font-size: 14px;
    line-height: 1.7;
    color: var(--ink, #2c2520);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .col-cc-actions {
    margin-top: 8px;
    display: flex; gap: 12px;
    font-size: 11px;
    font-family: 'Shilla Gothic', sans-serif;
  }
  .col-cc-actions button {
    background: transparent;
    border: none;
    color: var(--ink3, #6b5d4f);
    cursor: pointer;
    padding: 2px 0;
  }
  .col-cc-actions button:hover { color: var(--vermil, #b13a2c); }
  .col-cc-actions .like.liked { color: var(--vermil, #b13a2c); font-weight: 700; }

  .col-cc-reply-form {
    margin-top: 10px;
    padding: 12px;
    background: rgba(184,146,60,0.06);
    border: 1px dashed var(--gold, #b8923c);
    border-radius: 8px;
  }
  .col-cc-reply-form.hidden { display: none; }

  .col-cc-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--ink4, #8a7d6b);
    font-size: 13px;
  }
  .col-cc-empty .ic { font-size: 28px; opacity: 0.3; display: block; margin-bottom: 8px; }

  .col-cc-toast {
    position: fixed;
    bottom: 24px; left: 50%;
    transform: translateX(-50%);
    background: var(--ink, #2c2520);
    color: var(--paper2, #faf5e8);
    padding: 10px 20px;
    border-radius: 999px;
    font-size: 13px;
    font-family: 'Shilla Gothic', sans-serif;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 9999;
    opacity: 0;
    transition: opacity .2s ease;
    pointer-events: none;
  }
  .col-cc-toast.show { opacity: 1; }
  `;

  function injectCss() {
    if (document.getElementById('col-cc-css')) return;
    const style = document.createElement('style');
    style.id = 'col-cc-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ─── 2. slug 추출 ───
  function getSlug() {
    const path = window.location.pathname;
    const m = path.match(/\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\.html/i);
    if (m) return m[1];
    // fallback
    const file = path.split('/').pop().replace(/\.html?$/i, '');
    return file || 'unknown';
  }

  // ─── 3. 마운트 ───
  function mount() {
    if (document.querySelector('.col-comments-wrap')) return; // 중복 방지

    const target = document.querySelector('.article-nav')
                || document.querySelector('.article-cta')
                || document.querySelector('main')
                || document.body;

    const wrap = document.createElement('section');
    wrap.className = 'col-comments-wrap';
    wrap.innerHTML = `
      <div class="col-comments-head">
        <p class="label">COMMENTS</p>
        <h3>이 글에 대한 댓글</h3>
        <p class="desc">읽으신 소감, 궁금한 점, 다른 시각을 자유롭게 남겨주세요</p>
      </div>
      <div class="col-comments-trust">
        ※ 운영자(<strong>손승한</strong>) 답글은 <strong>AI 자동응답이 아닌 직접 작성</strong>입니다.
      </div>
      <div class="col-comments-form" id="col-cc-form-wrap"></div>
      <div class="col-cc-list" id="col-cc-list"></div>
      <div class="col-cc-toast" id="col-cc-toast"></div>
    `;

    if (target.classList && target.classList.contains('article-nav')) {
      target.parentNode.insertBefore(wrap, target.nextSibling);
    } else if (target.tagName === 'MAIN') {
      target.appendChild(wrap);
    } else {
      target.appendChild(wrap);
    }

    return wrap;
  }

  // ─── 4. 토스트 ───
  let toastTimer = null;
  function toast(msg, ms = 2200) {
    const t = document.getElementById('col-cc-toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ─── 5. 폼 렌더 ───
  function renderForm() {
    const wrap = document.getElementById('col-cc-form-wrap');
    if (!wrap) return;

    if (!SajuSupa.isEnabled()) {
      wrap.innerHTML = `<p class="col-cc-empty" style="padding:20px">댓글 시스템 준비 중입니다.</p>`;
      return;
    }

    wrap.innerHTML = `
      <textarea class="col-cc-textarea" id="col-cc-textarea" maxlength="1000" placeholder="댓글을 작성해주세요 (2자 이상, 1,000자 이내)"></textarea>
      <div class="col-cc-row">
        <input class="col-cc-nick" id="col-cc-nick" type="text" maxlength="30" placeholder="닉네임 (비우면 익명)" />
        <button class="col-cc-submit" id="col-cc-submit-btn">댓글 등록</button>
      </div>
    `;

    document.getElementById('col-cc-submit-btn').addEventListener('click', onSubmit);
  }

  // ─── 6. 댓글 등록 ───
  let SLUG = '';
  let parentReplyId = null;  // 답글 대상 (null이면 일반 댓글)

  async function onSubmit() {
    const ta = document.getElementById('col-cc-textarea');
    const nickEl = document.getElementById('col-cc-nick');
    const text = ta.value.trim();
    if (text.length < 2) { toast('댓글이 너무 짧습니다.'); return; }

    const customNickname = nickEl.value.trim();
    const anonymous = !customNickname;
    const btn = document.getElementById('col-cc-submit-btn');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    const { error } = await SajuSupa.createComment({
      columnSlug: SLUG,
      content: text,
      anonymous,
      customNickname,
      parentId: parentReplyId
    });

    btn.disabled = false;
    btn.textContent = '댓글 등록';

    if (error) { toast('등록 실패: ' + error.message); return; }
    ta.value = '';
    parentReplyId = null;
    toast('댓글이 등록되었습니다');
    await loadComments();
  }

  // ─── 7. 답글 등록 ───
  async function onReplySubmit(parentId, content) {
    const text = String(content || '').trim();
    if (text.length < 2) { toast('답글이 너무 짧습니다.'); return; }
    const { error } = await SajuSupa.createComment({
      columnSlug: SLUG,
      content: text,
      anonymous: !AuthGuard.isMaster(),  // 마스터는 자기 닉네임 (운영자)
      customNickname: '',
      parentId: parentId
    });
    if (error) { toast(error.message); return; }
    toast('답글 등록 완료');
    await loadComments();
  }

  // ─── 8. 목록 로드 ───
  async function loadComments() {
    const listEl = document.getElementById('col-cc-list');
    if (!listEl || !SajuSupa.isEnabled()) return;

    const { data, error } = await SajuSupa.listComments(SLUG);
    if (error) {
      listEl.innerHTML = `<p class="col-cc-empty">불러오기 실패: ${SajuSupa.escapeHtml(error.message)}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      listEl.innerHTML = `
        <div class="col-cc-empty">
          <span class="ic">💬</span>
          아직 댓글이 없어요. 첫 댓글의 주인공이 되어주세요.
        </div>
      `;
      return;
    }

    // 트리 구조: parent_id 기반 그룹화
    const roots = data.filter(c => !c.parent_id);
    const children = data.filter(c => c.parent_id);
    const childMap = {};
    children.forEach(c => {
      if (!childMap[c.parent_id]) childMap[c.parent_id] = [];
      childMap[c.parent_id].push(c);
    });

    const likedSet = await SajuSupa.getUserLikes('comment', data.map(d => d.id));

    listEl.innerHTML = roots.map(c => renderItem(c, false, likedSet, childMap)).join('');
  }

  function renderItem(c, isReply, likedSet, childMap) {
    const user = AuthGuard.getUser();
    const isMine = user && c.user_kakao_id === user.id;
    const liked = likedSet.has(c.id);
    const showDelete = isMine || AuthGuard.isMaster();
    const masterClass = c.is_master ? ' is-master' : '';
    const replyClass = isReply ? ' is-reply' : '';

    const replies = (childMap[c.id] || []).map(r => renderItem(r, true, likedSet, childMap)).join('');

    return `
      <div class="col-cc-item${replyClass}${masterClass}" data-id="${c.id}">
        <div class="col-cc-meta">
          <span class="col-cc-nickname">${SajuSupa.escapeHtml(c.display_nickname)}</span>
          ${c.is_master ? '<span class="col-cc-badge">운영자</span>' : ''}
          <span class="col-cc-time">· ${SajuSupa.formatTime(c.created_at)}</span>
        </div>
        <div class="col-cc-content">${SajuSupa.escapeHtml(c.content)}</div>
        <div class="col-cc-actions">
          <button class="like ${liked ? 'liked' : ''}" data-like="${c.id}">${liked ? '♥' : '♡'} <span data-lc="${c.id}">${c.likes_count || 0}</span></button>
          ${!isReply ? `<button data-reply-toggle="${c.id}">답글</button>` : ''}
          ${showDelete ? `<button data-del="${c.id}">삭제</button>` : ''}
        </div>
        ${!isReply ? `
          <div class="col-cc-reply-form hidden" data-reply-form="${c.id}">
            <textarea class="col-cc-textarea" data-reply-ta="${c.id}" placeholder="답글 작성..."></textarea>
            <div class="col-cc-row">
              <button class="col-cc-submit" data-reply-submit="${c.id}">답글 등록</button>
            </div>
          </div>
        ` : ''}
        ${replies}
      </div>
    `;
  }

  // ─── 9. 클릭 위임 ───
  function attachListEvents() {
    const listEl = document.getElementById('col-cc-list');
    if (!listEl) return;

    listEl.addEventListener('click', async (e) => {
      // 좋아요
      const likeId = e.target.closest('[data-like]')?.dataset.like;
      if (likeId) {
        const r = await SajuSupa.toggleLike('comment', parseInt(likeId));
        if (r.error) { toast(r.error.message); return; }
        const btn = e.target.closest('[data-like]');
        const cntEl = btn.querySelector(`[data-lc="${likeId}"]`);
        const cur = parseInt(cntEl.textContent) || 0;
        if (r.liked) {
          btn.classList.add('liked');
          btn.innerHTML = `♥ <span data-lc="${likeId}">${cur + 1}</span>`;
        } else {
          btn.classList.remove('liked');
          btn.innerHTML = `♡ <span data-lc="${likeId}">${Math.max(0, cur - 1)}</span>`;
        }
        return;
      }

      // 답글 토글
      const toggleId = e.target.closest('[data-reply-toggle]')?.dataset.replyToggle;
      if (toggleId) {
        const form = document.querySelector(`[data-reply-form="${toggleId}"]`);
        if (form) form.classList.toggle('hidden');
        return;
      }

      // 답글 등록
      const subId = e.target.closest('[data-reply-submit]')?.dataset.replySubmit;
      if (subId) {
        const ta = document.querySelector(`[data-reply-ta="${subId}"]`);
        await onReplySubmit(parseInt(subId), ta.value);
        return;
      }

      // 삭제
      const delId = e.target.closest('[data-del]')?.dataset.del;
      if (delId) {
        if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
        const { error } = await SajuSupa.deleteComment(parseInt(delId));
        if (error) { toast(error.message); return; }
        toast('삭제됨');
        await loadComments();
      }
    });
  }

  // ─── 10. 초기화 ───
  function init() {
    if (typeof SajuSupa === 'undefined' || typeof AuthGuard === 'undefined') {
      console.warn('[column-comments] SajuSupa 또는 AuthGuard가 로드되지 않았습니다.');
      return;
    }
    SLUG = getSlug();
    injectCss();
    if (!mount()) return;
    renderForm();
    attachListEvents();
    if (SajuSupa.isEnabled()) loadComments();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

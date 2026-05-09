/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 - 결과 공유/저장 (share.js)
   분석 페이지 우하단에 떠있는 플로팅 공유 바
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function () {
  // 분석 페이지에서만 동작 (products/ 아래 파일들)
  // 결과를 봐야 의미있으므로 페이지 로드 후 5초 뒤 표시
  function init() {
    if (document.getElementById('sajudiary-share-bar')) return; // 중복 방지

    // ─── 플로팅 바 HTML ───
    const bar = document.createElement('div');
    bar.id = 'sajudiary-share-bar';
    bar.innerHTML = `
      <style>
        #sajudiary-share-bar {
          position: fixed; right: 20px; bottom: 20px;
          z-index: 9999;
          font-family: 'Pretendard', system-ui, sans-serif;
          opacity: 0; transform: translateY(20px);
          transition: opacity .4s ease, transform .4s ease;
        }
        #sajudiary-share-bar.show { opacity: 1; transform: translateY(0); }
        .sj-share-toggle {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #b13a2c, #8a2418);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px;
          box-shadow: 0 8px 24px rgba(177, 58, 44, 0.4);
          cursor: pointer;
          transition: all .2s ease;
          border: 2px solid #b8923c;
        }
        .sj-share-toggle:hover { transform: scale(1.08); box-shadow: 0 12px 32px rgba(177, 58, 44, 0.55); }
        .sj-share-menu {
          position: absolute; right: 0; bottom: 70px;
          background: #faf5e8;
          border: 1px solid #ebe1c4;
          border-radius: 12px;
          padding: 8px;
          box-shadow: 0 12px 32px rgba(60, 45, 30, 0.18);
          min-width: 200px;
          opacity: 0; transform: scale(0.85); transform-origin: bottom right;
          transition: opacity .2s ease, transform .2s ease;
          pointer-events: none;
        }
        #sajudiary-share-bar.open .sj-share-menu {
          opacity: 1; transform: scale(1); pointer-events: auto;
        }
        .sj-share-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 14px; font-weight: 500;
          color: #2c2520;
          cursor: pointer;
          transition: background .15s ease;
          width: 100%; text-align: left; border: none; background: transparent;
        }
        .sj-share-item:hover { background: #f0e8d2; }
        .sj-share-item .ico { font-size: 18px; width: 24px; text-align: center; }
        .sj-share-toast {
          position: fixed; left: 50%; bottom: 100px;
          transform: translateX(-50%);
          background: #2c2520; color: #faf5e8;
          padding: 12px 24px; border-radius: 999px;
          font-size: 14px; font-weight: 500;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          opacity: 0; pointer-events: none;
          transition: opacity .25s ease;
          z-index: 10000;
        }
        .sj-share-toast.show { opacity: 1; }
      </style>
      <div class="sj-share-toggle" id="sj-share-toggle" title="공유하기">📤</div>
      <div class="sj-share-menu">
        <p style="padding:8px 12px 4px;font-size:11px;color:#8a7d6b;letter-spacing:.05em">친구에게 추천</p>
        <button class="sj-share-item" data-action="kakao">
          <span class="ico" style="color:#3C1E1E">💬</span>
          <span>카카오톡으로 추천</span>
        </button>
        <p style="padding:10px 12px 4px;font-size:11px;color:#8a7d6b;letter-spacing:.05em;border-top:1px solid #ebe1c4;margin-top:4px">내 결과 저장</p>
        <button class="sj-share-item" data-action="image">
          <span class="ico">📸</span>
          <span>이미지로 저장 (인증샷)</span>
        </button>
        <button class="sj-share-item" data-action="print">
          <span class="ico">🖨️</span>
          <span>프린트 / PDF 저장</span>
        </button>
      </div>
      <div class="sj-share-toast" id="sj-share-toast"></div>
    `;
    document.body.appendChild(bar);

    // 페이드인
    setTimeout(() => bar.classList.add('show'), 800);

    // ─── 이벤트 ───
    const toggle = document.getElementById('sj-share-toggle');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      bar.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!bar.contains(e.target)) bar.classList.remove('open');
    });

    bar.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        bar.classList.remove('open');
        handleAction(action);
      });
    });
  }

  // ─── 토스트 메시지 ───
  function toast(msg, durationMs = 2200) {
    const t = document.getElementById('sj-share-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), durationMs);
  }

  // ─── 공유 액션 ───
  // ⚠️ 보안/사생활 보호: 분석 결과는 본인 데이터로 생성된 것이므로
  //    "결과 자체"를 다른 사람에게 보낼 수는 없습니다 (개인정보).
  //    카카오톡/링크 = 사이트(사주다이어리) 추천만 가능
  //    이미지/PDF = 본인 보관/SNS 인증샷용
  function handleAction(action) {
    const homeUrl = window.location.origin;
    const title = '사주다이어리 ✦ 나도 사주 봤어요';
    const description = '정통 명리학과 데이터 분석으로 풀어낸 나의 사주. 너도 한번 받아봐!';

    switch (action) {
      case 'kakao':
        shareToKakao(homeUrl, title, description);
        break;
      case 'copy':
        copyLink(homeUrl);
        break;
      case 'image':
        saveAsImage();
        break;
      case 'print':
        window.print();
        break;
    }
  }

  // ─── 카카오톡 공유 ───
  function shareToKakao(url, title, description) {
    // Kakao SDK가 있고 초기화된 경우 → 정식 공유
    if (typeof Kakao !== 'undefined' && Kakao.Share) {
      try {
        if (!Kakao.isInitialized()) {
          // config.js 사용
          const cfg = window.SAJULOG_CONFIG;
          if (cfg && cfg.KAKAO_JS_KEY && cfg.KAKAO_JS_KEY !== 'YOUR_KAKAO_JS_KEY_HERE') {
            Kakao.init(cfg.KAKAO_JS_KEY);
          }
        }
        if (Kakao.isInitialized()) {
          Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: title,
              description: description,
              imageUrl: url + '/og-image.png',  // 추후 이미지 추가 시
              link: { mobileWebUrl: url, webUrl: url }
            },
            buttons: [
              { title: '나도 보러가기', link: { mobileWebUrl: url, webUrl: url } }
            ]
          });
          return;
        }
      } catch (e) {
        console.warn('[Share] Kakao SDK 공유 실패:', e);
      }
    }

    // 폴백 — Web Share API 또는 링크 복사
    if (navigator.share) {
      navigator.share({ title, text: description, url }).catch(() => copyLink(url));
    } else {
      copyLink(url);
      toast('카카오톡 공유 SDK 미초기화 → 링크가 복사되었습니다');
    }
  }

  // ─── 링크 복사 ───
  function copyLink(url) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => toast('사주다이어리 사이트 주소가 복사되었습니다 ✓'),
        () => fallbackCopy(url)
      );
    } else {
      fallbackCopy(url);
    }
  }
  function fallbackCopy(url) {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    toast('사주다이어리 사이트 주소가 복사되었습니다 ✓');
  }

  // ─── 이미지 저장 (html2canvas 동적 로드) ───
  function saveAsImage() {
    toast('이미지 생성 중...', 5000);
    loadHtml2Canvas().then(html2canvas => {
      // 공유 바는 화면에서 숨기고 캡처
      const bar = document.getElementById('sajudiary-share-bar');
      bar.style.visibility = 'hidden';
      html2canvas(document.body, {
        backgroundColor: '#f7f0df',
        scale: 1.5,
        useCORS: true,
        logging: false,
        windowHeight: document.body.scrollHeight
      }).then(canvas => {
        bar.style.visibility = '';
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        link.download = `사주다이어리_${dateStr}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('이미지가 저장되었습니다 ✓');
      }).catch(err => {
        bar.style.visibility = '';
        console.error('[Share] 이미지 캡처 실패:', err);
        toast('이미지 저장 실패. 프린트로 PDF 저장을 이용해보세요');
      });
    }).catch(err => {
      console.error('[Share] html2canvas 로드 실패:', err);
      toast('이미지 저장 라이브러리 로드 실패');
    });
  }

  // html2canvas CDN 동적 로드
  function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ─── 시작 ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

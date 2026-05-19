/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   사주다이어리 - 전역 설정 (config.js)
   카카오 / 토스페이먼츠 키를 여기에 입력합니다.
   ⚠️ JS 키는 공개되어도 되는 키입니다 (REST/관리자 키와 다름).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

window.SAJULOG_CONFIG = {

  // ─────────────────────────────────────────
  // 1. 카카오 로그인 설정
  // ─────────────────────────────────────────
  // 발급 방법:
  //   1) https://developers.kakao.com 접속 → 카카오 계정으로 로그인
  //   2) "내 애플리케이션" → "애플리케이션 추가하기"
  //   3) 앱 이름: 사주다이어리 / 사업자명: 본인 이름 또는 회사명
  //   4) 생성 후 → 앱 키 → "JavaScript 키" 복사 → 아래에 붙여넣기
  //   5) 플랫폼 → Web → 사이트 도메인 등록 (예: http://localhost:5500, https://sajudiary.com)
  //   6) 카카오 로그인 → "활성화" ON
  //   7) 동의항목 → 닉네임(필수), 프로필 사진(선택)
  KAKAO_JS_KEY: 'cc0a54d5766ad91297c565b0c3e9a589',  // 사주다이어리 앱 — JavaScript 키

  // ─────────────────────────────────────────
  // 1-1. 마스터 계정 화이트리스트
  // ─────────────────────────────────────────
  // 여기에 등록된 ID는 자동으로 isMaster=true 부여 (재로그인해도 마스터 유지)
  //
  // 본인 ID 확인 방법:
  //   1) sajudiary.com 접속 → 카카오 로그인 완료
  //   2) 브라우저 개발자도구 열기 (F12 또는 Ctrl+Shift+I)
  //   3) Console 탭 클릭 → 다음 한 줄 입력 후 엔터:
  //        JSON.parse(localStorage.getItem('sajudiary_user')).id
  //   4) 출력되는 문자열 (예: 'kakao_fb_1747...' 또는 'kakao_12345678')을
  //      아래 배열에 따옴표로 감싸서 추가하고 push + 재배포
  MASTER_KAKAO_IDS: [
    // 'kakao_fb_XXXXXXX',  // 손승한 (본인) — 콘솔에서 확인 후 여기에 추가
  ],

  // ─────────────────────────────────────────
  // 2. 토스페이먼츠 결제 설정
  // ─────────────────────────────────────────
  // 발급 방법:
  //   1) https://app.tosspayments.com/signup 가입
  //   2) 회원가입 후 → 좌측 메뉴 "API 키" → 테스트 환경 클라이언트 키 복사
  //   3) 사업자 등록 없이도 테스트 모드 사용 가능
  //
  // ⚠️ 아래는 토스가 공식 문서에서 제공하는 데모용 테스트 키입니다.
  //    누구나 쓸 수 있고, 실제 돈이 빠지지 않습니다.
  //    본인 계정 가입 후에는 본인 키로 교체하세요.
  TOSS_CLIENT_KEY: 'test_ck_Z61JOxRQVEoRwDoO7qzQ8W0X9bAq',  // 마일(사주다이어리) 본인 테스트 키 — API 개별 연동

  // 결제 성공/실패 시 돌아올 URL (자동 계산)
  get TOSS_SUCCESS_URL() { return window.location.origin + '/success.html'; },
  get TOSS_FAIL_URL()    { return window.location.origin + '/fail.html'; },

  // ─────────────────────────────────────────
  // 3. 상품 정보 (가격/이름/연결 파일)
  // ─────────────────────────────────────────
  PRODUCTS: {
    light: {
      id: 'light',
      name: '입문용 (Light)',
      hanja: '始',
      price: 9900,
      description: '사주가 처음이라면 — 나는 어떤 사람일까?',
      file: 'products/saju_letter.html',
      color: 'jade'
    },
    deep: {
      id: 'deep',
      name: '전문가용 (Deep)',
      hanja: '命',
      price: 29900,
      description: '더 이상 사주에 돈을 쓰지 않아도 되는 완전판',
      file: 'products/saju.html',
      color: 'vermil'
    },
    couple: {
      id: 'couple',
      name: '궁합 분석',
      hanja: '緣',
      price: 14900,
      description: '연인·친구·직장 — 두 사람의 깊은 인연',
      file: 'products/gunghap_letter.html?mode=normal',
      color: 'plum'
    },
    couple_plus: {
      id: 'couple_plus',
      name: '궁합 분석 (성인용)',
      hanja: '桃',
      price: 17900,
      description: '연인·부부 — 더 깊고, 더 솔직하게',
      file: 'products/gunghap_letter.html?mode=adult',
      color: 'wine',
      adultOnly: true
    }
  },

  // ─────────────────────────────────────────
  // 3-B. Supabase (QNA·칼럼 댓글 시스템)
  // ─────────────────────────────────────────
  // 셋업 가이드: 사주다이어리_Supabase_셋업.md
  // Project Settings → API에서 두 값 복사
  //
  // 비어있는 상태(값 없음/placeholder)에서는 QNA·댓글 기능이 자동 비활성화됨.
  // (사이트는 정상 동작, 게시판만 "준비 중" 메시지 표시)
  SUPABASE_URL:      'https://hlxttdvvwftiquzqxgxs.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_AdiQDdgZQpTwYonJTff7wg_rLgjPuBp',  // publishable key (anon key의 새 이름)

  get SUPABASE_ENABLED() {
    return !!(this.SUPABASE_URL && this.SUPABASE_ANON_KEY
              && this.SUPABASE_URL.startsWith('https://')
              && this.SUPABASE_ANON_KEY.length > 20);
  },

  // ─────────────────────────────────────────
  // 4-A. 무료 액세스 쿠폰 (마스터 발급용)
  // ─────────────────────────────────────────
  // 친구·체험단 등에 코드로 상품 1회 무료 액세스 부여.
  // 각 디바이스(브라우저)당 1회 사용 — 같은 코드를 다른 사람에게 보내면 그쪽에서도 1회 가능.
  // 코드는 대소문자 무시. 카카오톡으로 코드만 보내면 결제 페이지에서 입력 가능.
  FREE_COUPONS: {
    'saju2026-light':  { productId: 'light',       label: '입문용 무료체험' },
    'saju2026-deep':   { productId: 'deep',        label: '전문가용 무료체험' },
    'saju2026-couple': { productId: 'couple',      label: '궁합 무료체험' },
    'saju2026-adult':  { productId: 'couple_plus', label: '성인 궁합 무료체험' }
  },

  // ─────────────────────────────────────────
  // 4. 쿠폰 정의
  // ─────────────────────────────────────────
  COUPONS: {
    WELCOME3000: {
      id: 'WELCOME3000',
      name: '신규 환영 쿠폰',
      description: '카카오 첫 로그인 감사 쿠폰',
      discountType: 'fixed',  // 'fixed' (정액) | 'percent' (정률)
      discountValue: 3000,    // 3,000원
      minOrderAmount: 9900,   // 9,900원 이상 주문 시 사용 가능
      autoIssue: 'first_login',  // 'first_login' | 'manual' | 'after_purchase'
      validDays: 30           // 발급 후 30일
    },
    REPEAT5: {
      id: 'REPEAT5',
      name: '재구매 감사 쿠폰',
      description: '다음 구매 시 5% 할인',
      discountType: 'percent',
      discountValue: 5,       // 5% 할인
      minOrderAmount: 9900,
      autoIssue: 'after_purchase',
      validDays: 90           // 90일 동안 사용 가능
    }
  },

  // ─────────────────────────────────────────
  // 5. 동적 묶음 할인 규칙 (구매 상품 수에 따라)
  // ─────────────────────────────────────────
  // [최소 상품 수, 할인율(%)] — 상품 수 많을수록 큰 할인 적용
  // ★ 토스 카드사 심사 기간 동안 임시 비활성화 (2026-05-18)
  //   "상품 금액과 결제 금액이 같아야" 정책 충돌 회피
  //   심사 통과 후 아래 3줄 주석 해제하면 즉시 복구
  BUNDLE_DISCOUNTS: [
    // { minItems: 4, percent: 30, label: '🎁 전상품 패키지 30% OFF' },
    // { minItems: 3, percent: 20, label: '✨ 3종 묶음 20% OFF' },
    // { minItems: 2, percent: 10, label: '💫 2종 묶음 10% OFF' }
    // 1개는 할인 없음
  ],

  // ─────────────────────────────────────────
  // 6. 개발 모드 플래그
  // ─────────────────────────────────────────
  get DEV_MODE() {
    return !this.KAKAO_JS_KEY || this.KAKAO_JS_KEY === 'YOUR_KAKAO_JS_KEY_HERE';
  },

  // ─────────────────────────────────────────
  // 헬퍼: 묶음 할인 계산
  // ─────────────────────────────────────────
  getBundleDiscount(itemCount) {
    return this.BUNDLE_DISCOUNTS.find(b => itemCount >= b.minItems) || null;
  }
};

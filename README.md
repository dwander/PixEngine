# PixEngine

고성능 이미지 뷰어 및 컬링 도구 - React + Tauri로 구축된 데스크톱 애플리케이션

## 주요 기능

- 🚀 **고성능 썸네일 생성**: JPEG DCT 스케일링을 활용한 빠른 썸네일 로딩
- 🖼️ **대용량 이미지 지원**: 가상 스크롤링으로 수천 개의 이미지를 부드럽게 처리
- 🎯 **스마트 캐싱**: LRU 캐시와 예측 프리로딩으로 최적화된 성능
- 💾 **유휴 시간 활용**: 백그라운드에서 고화질 썸네일 생성
- 🎨 **커스터마이징 가능한 레이아웃**: dockview를 사용한 유연한 패널 시스템
- ⚡ **반응형 UI**: 세로/가로 모드 지원 및 동적 썸네일 크기 조정

## 기술 스택

### 프론트엔드
- React 19 + TypeScript
- TailwindCSS
- @tanstack/react-virtual
- dockview-react
- Zustand (상태 관리)

### 백엔드
- Rust (Tauri 2.x)
- 병렬 처리 (Rayon, Tokio)
- 이미지 처리 (image, jpeg-decoder)

## 개발 환경 설정

### 필수 요구사항
- Node.js 18+
- Rust 1.70+
- Tauri CLI

### 설치

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev

# Tauri 개발 모드
npm run tauri dev
```

### 빌드

```bash
# 프로덕션 빌드
npm run build
npm run tauri build
```

## 테스트

```bash
# 단위 테스트 실행
npm test

# 테스트 UI
npm run test:ui

# 커버리지
npm run test:coverage
```

## 코드 품질

```bash
# ESLint 검사
npm run lint

# Prettier 포맷팅
npm run format

# Prettier 검사
npm run format:check
```

## 성능 최적화

### 프론트엔드
- **가상 스크롤링**: 뷰포트 내 이미지만 렌더링
- **이미지 캐싱**: 최대 20개 이미지 LRU 캐시
- **예측 프리로딩**: 이전 2개, 다음 3개 이미지 프리로드
- **디바운싱**: 150ms 디바운스로 과도한 업데이트 방지

### 백엔드
- **DCT 스케일링**: 하드웨어 가속 JPEG 디코딩
- **2단계 썸네일 전략**:
  1. EXIF 썸네일 (즉시)
  2. HQ DCT 썸네일 (유휴 시간)
- **스마트 우선순위**: 뷰포트 우선 처리
- **병렬 처리**: CPU 코어의 25% 활용

## 라이선스

MIT

## 기여

이슈 및 풀 리퀘스트를 환영합니다!

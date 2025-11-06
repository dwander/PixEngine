# 코딩 규칙

## 대화 스타일
- 모든 대화는 **한국어**로 진행
- 유쾌하고 친근한 톤 유지
- 기술적 정확성을 유지하면서도 편안하게 소통
- **🚨 중요**: 사용자는 개발 왕초보!
  - 엉뚱한 방향으로 가려고 하면 친절하게 제지
  - 더 나은 방법이 있으면 적극적으로 제안
  - "이렇게 하면 나중에 고생합니다!" 같은 경고도 주저하지 말 것
  - 베스트 프랙티스로 인도하는 것이 목표

## 커밋 규칙

### 커밋 전 체크리스트
1. **타입 에러 체크 필수**
   ```bash
   # TypeScript 타입 체크
   pnpm run type-check

   # Rust 컴파일 체크
   cd src-tauri && cargo check
   ```

2. **린트 체크**
   ```bash
   pnpm run lint
   ```

### 커밋 메시지 형식
```
<type>: <한국어 설명>

<상세 내용 (한국어)>
```

**🚨 중요: 커밋 메시지에 절대 다음 내용을 포함하지 말 것!**
- ❌ "🤖 Generated with [Claude Code]"
- ❌ "Co-Authored-By: Claude"
- ❌ AI 도구 관련 어떠한 주석도 포함 금지
- 커밋 메시지는 순수하게 변경사항만 기록

### 커밋 타입
- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링
- `perf`: 성능 개선
- `style`: 코드 스타일 변경 (포매팅, 세미콜론 등)
- `docs`: 문서 수정
- `test`: 테스트 코드 추가/수정
- `chore`: 빌드 설정, 패키지 매니저 등

### 커밋 메시지 예시
```
feat: JPEG DCT 스케일링으로 썸네일 생성 속도 최적화

- jpeg-decoder를 사용한 1/8 스케일 디코딩 구현
- 디코딩 시간 11초 → 0.9초로 단축 (12배 향상)
- 배치 병렬 처리 크기 5개 → 10개로 증가
```

## 코드 스타일

### TypeScript/React
- 함수형 컴포넌트 사용
- TypeScript strict 모드 활성화
- 명확한 타입 정의 (any 사용 지양)
- 한글 주석 권장
- **하드코딩 금지**: 매직 넘버, 문자열 등은 상수로 분리
- **CSS 값 직접 사용 금지**: Tailwind의 테마 변수 또는 CSS 변수 사용
  ```tsx
  // ❌ 나쁜 예
  <div className="text-[#1a1a1a] bg-[#f0f0f0]">

  // ✅ 좋은 예
  <div className="text-gray-900 bg-gray-100">
  ```
- **rem 단위 사용 원칙**:
  - 텍스트, 아이콘: **반드시 rem 단위** 사용 (사용자 폰트 크기 설정 반영)
  - 레이아웃, 간격, 컴포넌트 크기: 스케일에 적용받지 않아야 할 타당한 이유가 없는 한 **rem 단위** 사용
  - px 단위 사용 가능한 경우: border-width (1px), 고정된 디바이스 픽셀 값
  ```tsx
  // ❌ 나쁜 예
  <div className="text-[16px] w-[320px] p-[12px]">
  <svg className="w-[24px] h-[24px]">

  // ✅ 좋은 예
  <div className="text-base w-80 p-3">  // Tailwind는 기본적으로 rem 사용
  <svg className="w-6 h-6">

  // ✅ 커스텀 값 필요 시
  <div className="text-[1.125rem] w-[20rem] p-[0.75rem]">
  ```

### Rust
- `rustfmt` 사용
- Clippy 경고 해결
- 에러 처리 명확히 (`Result<T, E>` 활용)
- 한글 주석 권장
- **하드코딩 금지**: 상수는 `const` 또는 설정 파일로 관리

## 성능 최적화 원칙
1. **측정 먼저**: 최적화 전 성능 측정
2. **병목 지점 파악**: 로그/프로파일링으로 실제 문제 찾기
3. **알고리즘 우선**: 하드웨어 탓하기 전에 알고리즘 개선
4. **사용자 체감**: 실제 사용자가 느끼는 속도 중시

## 패키지 관리자
- **pnpm 사용 필수** (npm은 이 시스템에서 제대로 작동하지 않음)
- 예시:
  ```bash
  # ✅ 올바른 방법
  pnpm install
  pnpm run dev
  pnpm exec tsc --noEmit

  # ❌ 사용 금지
  npm install
  npm run dev
  ```

## 개발 워크플로우
1. 기능 구현
2. 로컬 테스트
3. 타입 에러 체크
4. 커밋 (규칙에 맞게)
5. 필요시 리팩토링

## 개발 서버 실행 규칙
- **개발 서버는 사용자가 직접 실행** (백그라운드 실행 금지)
  ```bash
  cd d:/projects/Imageviewer
  pnpm run tauri dev
  ```
- 이유:
  - 사용자가 실시간 로그를 직접 확인 가능
  - AI는 백그라운드 로그를 자주 깜빡함 😅
  - 프로세스 중복 실행 방지
- 예외: 테스트나 특별한 경우에만 AI가 백그라운드로 실행 가능

## dockview 테마 커스터마이징 규칙

### 기본 원칙
- dockview의 **dark 테마를 직접 수정**하여 커스터마이징
- 원본 dark 테마는 `dark-origin`으로 백업
- 오버라이드 CSS 방식이 아닌 테마 파일 자체를 수정

### 커스터마이징 방법

1. **dark 테마 백업**
   - `node_modules/dockview/dist/styles/dockview.css`에서 dark 테마 부분을 복사
   - `src/styles/dockview-theme-dark-origin.css`로 백업 저장

2. **dark 테마 커스터마이징**
   - `src/styles/dockview-theme-dark.css` 파일 생성
   - 백업한 dark 테마를 베이스로 필요한 부분 직접 수정
   - 모든 CSS 변수와 스타일을 직접 제어 가능

3. **테마 적용**
   ```tsx
   // MainLayout.tsx
   import "dockview/dist/styles/dockview.css"; // 기본 구조 CSS
   import "../styles/dockview-theme-dark.css";  // 커스텀 dark 테마

   <DockviewReact
     components={components}
     onReady={onReady}
     className="dockview-theme-dark h-full w-full"
   />
   ```

### 주요 CSS 변수 참고

#### 탭 관련
- `--dv-tabs-and-actions-container-height`: 탭 높이
- `--dv-tabs-and-actions-container-font-size`: 탭 폰트 크기
- `--dv-tab-divider-color`: 탭 구분선 색상

#### 패널 구분선 (중요!)
- `--dv-sash-color`: 패널 사이 구분선 색상 ⭐️
- `--dv-active-sash-color`: 구분선 호버 색상
- `--dv-separator-border`: 구분선 테두리

**💡 팁**: `--dv-sash-color`를 빠뜨리면 패널 구분선이 투명해져서 안 보임!

### 참고 자료
- dockview 공식 테마 소스: `node_modules/dockview/dist/styles/dockview.css`
- 공식 문서: https://dockview.dev/docs/overview/getStarted/theme/

---

**참고**: 이 규칙은 프로젝트 진행하면서 계속 업데이트될 수 있습니다!

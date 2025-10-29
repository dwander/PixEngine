/**
 * PixEngine 테마 색상 정의
 *
 * 모든 색상은 여기서 중앙 관리하여 테마 변경 시 일관성 유지
 */

export const theme = {
  // 배경색
  background: {
    primary: "bg-neutral-900",      // 메인 배경 (#171717)
    titlebar: "bg-[#1c1c1c]",       // 타이틀바 배경 (dockview 탭과 동일)
    secondary: "bg-gray-800",        // 호버/활성 배경
    hover: "bg-gray-800",            // 일반 호버
    hoverSubtle: "bg-gray-800/50",   // 은은한 호버
    danger: "bg-red-500/20",         // 위험 액션 호버
  },

  // 텍스트 색상
  text: {
    // 포커스 상태
    primary: "text-gray-200",        // 주요 텍스트 (포커스)
    secondary: "text-gray-300",      // 보조 텍스트 (포커스)
    tertiary: "text-gray-400",       // 3차 텍스트 (포커스)
    quaternary: "text-gray-500",     // 4차 텍스트 (포커스)

    // 비포커스 상태
    unfocusedPrimary: "text-gray-500",   // 주요 텍스트 (비포커스)
    unfocusedSecondary: "text-gray-600",  // 보조 텍스트 (비포커스)
  },

  // 아이콘 색상
  icon: {
    // 포커스 상태
    default: "text-gray-400",
    hover: "text-gray-200",

    // 비포커스 상태
    unfocusedDefault: "text-gray-600",
    unfocusedHover: "text-gray-500",

    // 특수
    dangerHover: "text-white",
  },

  // 레이아웃
  layout: {
    titleBarHeight: "h-10",
    statusBarHeight: "h-6",
    borderColor: "border-gray-700",
  },

  // 전환 효과
  transition: {
    default: "transition-colors",
    all: "transition-all",
  },

  // 둥근 모서리
  rounded: {
    default: "rounded",
    md: "rounded-md",
    lg: "rounded-lg",
  },
} as const;

/**
 * 포커스 상태에 따른 색상 헬퍼
 */
export const getFocusedColor = (
  focused: boolean,
  focusedColor: string,
  unfocusedColor: string
) => (focused ? focusedColor : unfocusedColor);

/**
 * 타이틀바용 색상 유틸리티
 * Tailwind CSS의 JIT 컴파일을 위해 완전한 클래스 문자열 반환
 */
export const getTitleBarColors = (isFocused: boolean) => ({
  // 타이틀 색상
  title: getFocusedColor(
    isFocused,
    theme.text.secondary,
    theme.text.unfocusedPrimary
  ),

  // 메뉴 버튼 전체 클래스 (hover 포함)
  menuButton: isFocused
    ? `px-3 py-1 text-sm ${theme.text.tertiary} hover:text-gray-200 hover:bg-gray-800 ${theme.rounded.default} ${theme.transition.default}`
    : `px-3 py-1 text-sm ${theme.text.unfocusedSecondary} hover:text-gray-500 hover:bg-gray-800/50 ${theme.rounded.default} ${theme.transition.default}`,

  // 윈도우 컨트롤 버튼 기본 클래스
  controlButton: `group w-12 ${theme.layout.titleBarHeight} flex items-center justify-center ${theme.transition.default} cursor-pointer`,

  // 각 컨트롤 버튼별 호버 배경
  minimizeHover: "hover:bg-gray-800",
  maximizeHover: "hover:bg-gray-800",
  closeHover: "hover:bg-red-600",

  // 아이콘 색상 (group-hover 포함)
  icon: isFocused
    ? `${theme.transition.default} ${theme.icon.default} group-hover:text-gray-200`
    : `${theme.transition.default} ${theme.icon.unfocusedDefault} group-hover:text-gray-500`,

  // 닫기 버튼 아이콘 (더 강렬한 빨간색 호버)
  closeIcon: isFocused
    ? `${theme.transition.default} ${theme.icon.default} group-hover:text-white`
    : `${theme.transition.default} ${theme.icon.unfocusedDefault} group-hover:text-gray-300`,
});

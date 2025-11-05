// 애플리케이션 전역 상수

// 이미지 캐싱
export const IMAGE_CACHE_SIZE = 50; // 최대 캐시 이미지 수 (20→50으로 증가, 성능 개선)
export const PRELOAD_PREVIOUS_COUNT = 3; // 이전 이미지 프리로드 개수 (2→3으로 증가)
export const PRELOAD_NEXT_COUNT = 5; // 다음 이미지 프리로드 개수 (3→5로 증가)

// 썸네일
export const THUMBNAIL_SIZE_MIN = 75; // 최소 썸네일 크기 (px)
export const THUMBNAIL_SIZE_MAX = 320; // 최대 썸네일 크기 (px)
export const THUMBNAIL_SIZE_DEFAULT = 150; // 기본 썸네일 크기 (px)
export const THUMBNAIL_SIZE_STEP = 25; // 썸네일 크기 조정 단계 (px)

// 디바운스/쓰로틀 시간 (ms)
export const DEBOUNCE_FOCUS_INDEX = 150; // 포커스 인덱스 변경 디바운스
export const DEBOUNCE_WINDOW_STATE = 500; // 윈도우 상태 저장 디바운스
export const DEBOUNCE_LAYOUT_STATE = 500; // 레이아웃 상태 저장 디바운스

// 가상 스크롤
export const VIRTUAL_SCROLL_OVERSCAN = 5; // 가상 스크롤 오버스캔 아이템 수

// UI
export const PANEL_MIN_SIZE = 200; // 패널 최소 크기 (px)
export const THUMBNAIL_GAP = 8; // 썸네일 간격 (px)

import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState, useEffect, useRef } from "react";
import { Minus, Square, Copy, X, RefreshCw } from "lucide-react";
import { theme, getTitleBarColors } from "../../lib/theme";
import { useWindowFocus } from "../../contexts/WindowFocusContext";
import { useFolderContext } from "../../contexts/FolderContext";

const appWindow = getCurrentWindow();

interface TitleBarProps {
  onTogglePanel?: (panelId: string) => void;
  visiblePanels?: {
    folders: boolean;
    metadata: boolean;
    thumbnails: boolean;
  };
  onToggleGrid?: (gridType: 'none' | '3div' | '6div') => void;
  activeGrid?: 'none' | '3div' | '6div';
}

export function TitleBar({ onTogglePanel, visiblePanels, onToggleGrid, activeGrid = 'none' }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const { isFocused } = useWindowFocus(); // WindowFocusContext에서 포커스 상태 가져오기
  const { refreshCurrentFolder, currentFolder, isLoading } = useFolderContext(); // 새로고침 함수
  const [isPanelMenuOpen, setIsPanelMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [isAnyMenuOpen, setIsAnyMenuOpen] = useState(false); // 메뉴가 한 번이라도 열렸는지 추적
  const panelMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const devMenuRef = useRef<HTMLDivElement>(null);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    // 윈도우 상태 감지
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };

    checkMaximized();

    // 이벤트 리스너 등록
    const setupListeners = async () => {
      const unlistenResize = await appWindow.onResized(() => {
        checkMaximized();
      });

      return () => {
        unlistenResize();
      };
    };

    let cleanup: (() => void) | undefined;
    setupListeners().then((fn) => {
      cleanup = fn;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // 메뉴 열림 상태 추적
  useEffect(() => {
    if (isPanelMenuOpen || isViewMenuOpen || isDevMenuOpen) {
      setIsAnyMenuOpen(true);
    } else {
      setIsAnyMenuOpen(false);
    }
  }, [isPanelMenuOpen, isViewMenuOpen, isDevMenuOpen]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelMenuRef.current && !panelMenuRef.current.contains(event.target as Node)) {
        setIsPanelMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
      if (devMenuRef.current && !devMenuRef.current.contains(event.target as Node)) {
        setIsDevMenuOpen(false);
      }
    };

    if (isPanelMenuOpen || isViewMenuOpen || isDevMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPanelMenuOpen, isViewMenuOpen]);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await appWindow.minimize();
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await appWindow.toggleMaximize();
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await appWindow.close();
  };

  const handleDragStart = async (e: React.MouseEvent) => {
    // 버튼이나 SVG 요소 클릭이 아닐 때만 드래그 시작
    const target = e.target as HTMLElement;
    const isButton = target.closest('button') !== null;

    if (!isButton) {
      await appWindow.startDragging();
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentFolder && !isLoading) {
      await refreshCurrentFolder();
    }
  };

  // 테마 색상 가져오기
  const colors = getTitleBarColors(isFocused);

  return (
    <div
      onMouseDown={handleDragStart}
      className={`${theme.layout.titleBarHeight} ${theme.background.titlebar} flex items-center justify-between pl-4 select-none`}
    >
      {/* 왼쪽: 앱 제목 + 메뉴 */}
      <div className="flex items-center gap-6">
        <h1 className={`text-sm font-medium ${theme.transition.default} ${colors.title}`}>
          PixEngine
        </h1>

        {/* 메뉴 */}
        <nav className="flex items-center gap-1">
          <button className={colors.menuButton}>
            파일
          </button>
          <button className={colors.menuButton}>
            편집
          </button>

          {/* 보기 메뉴 (드롭다운) */}
          <div className="relative" ref={viewMenuRef}>
            <button
              className={colors.menuButton}
              onClick={(e) => {
                e.stopPropagation();
                setIsViewMenuOpen(!isViewMenuOpen);
                setIsPanelMenuOpen(false);
              }}
              onMouseEnter={() => {
                if (isAnyMenuOpen) {
                  setIsViewMenuOpen(true);
                  setIsPanelMenuOpen(false);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              보기
            </button>

            {isViewMenuOpen && (
              <div
                className="absolute top-full left-0 mt-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg py-1 min-w-[160px] z-50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between"
                  style={{ fontSize: '1rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleGrid?.(activeGrid === '3div' ? 'none' : '3div');
                  }}
                >
                  <span>3분할 격자선</span>
                  <span className="text-neutral-500">{activeGrid === '3div' ? '✓' : ''}</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between"
                  style={{ fontSize: '1rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleGrid?.(activeGrid === '6div' ? 'none' : '6div');
                  }}
                >
                  <span>6분할 격자선</span>
                  <span className="text-neutral-500">{activeGrid === '6div' ? '✓' : ''}</span>
                </button>
              </div>
            )}
          </div>

          {/* 패널 메뉴 (드롭다운) */}
          <div className="relative" ref={panelMenuRef}>
            <button
              className={colors.menuButton}
              onClick={(e) => {
                e.stopPropagation();
                setIsPanelMenuOpen(!isPanelMenuOpen);
                setIsViewMenuOpen(false);
              }}
              onMouseEnter={() => {
                if (isAnyMenuOpen) {
                  setIsPanelMenuOpen(true);
                  setIsViewMenuOpen(false);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              패널
            </button>

            {isPanelMenuOpen && (
              <div
                className="absolute top-full left-0 mt-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg py-1 min-w-[160px] z-50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between"
                  style={{ fontSize: '1rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePanel?.('folders');
                  }}
                >
                  <span>폴더</span>
                  <span className="text-neutral-500">{visiblePanels?.folders ? '✓' : ''}</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between"
                  style={{ fontSize: '1rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePanel?.('metadata');
                  }}
                >
                  <span>메타데이터</span>
                  <span className="text-neutral-500">{visiblePanels?.metadata ? '✓' : ''}</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between"
                  style={{ fontSize: '1rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePanel?.('thumbnails');
                  }}
                >
                  <span>썸네일</span>
                  <span className="text-neutral-500">{visiblePanels?.thumbnails ? '✓' : ''}</span>
                </button>
              </div>
            )}
          </div>

          {/* 개발자 도구 메뉴 (개발 모드에서만) */}
          {isDev && (
            <div className="relative" ref={devMenuRef}>
              <button
                className={colors.menuButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDevMenuOpen(!isDevMenuOpen);
                  setIsPanelMenuOpen(false);
                  setIsViewMenuOpen(false);
                }}
                onMouseEnter={() => {
                  if (isAnyMenuOpen) {
                    setIsDevMenuOpen(true);
                    setIsPanelMenuOpen(false);
                    setIsViewMenuOpen(false);
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                개발
              </button>

              {isDevMenuOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg py-1 min-w-[160px] z-50"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-neutral-700"
                    style={{ fontSize: '1rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePanel?.('devTools');
                      setIsDevMenuOpen(false);
                    }}
                  >
                    UI 컴포넌트 테스트
                  </button>
                </div>
              )}
            </div>
          )}

          <button className={colors.menuButton}>
            도움말
          </button>
        </nav>
      </div>

      {/* 중앙: 빈 공간 */}
      <div className="flex-1"></div>

      {/* 새로고침 버튼 */}
      <button
        onClick={handleRefresh}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={!currentFolder || isLoading}
        className={`px-3 py-1 ${colors.menuButton} disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5`}
        aria-label="새로고침"
        title="현재 폴더 새로고침 (F5)"
      >
        <RefreshCw
          size={14}
          className={`${colors.icon} ${isLoading ? 'animate-spin' : ''}`}
        />
        <span className="text-xs">새로고침</span>
      </button>

      {/* 오른쪽: 윈도우 컨트롤 버튼 */}
      <div className="flex items-center gap-0">
        {/* 최소화 */}
        <button
          onClick={handleMinimize}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${colors.controlButton} ${colors.minimizeHover}`}
          aria-label="최소화"
        >
          <Minus
            size={14}
            className={colors.icon}
          />
        </button>

        {/* 최대화/복원 */}
        <button
          onClick={handleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${colors.controlButton} ${colors.maximizeHover}`}
          aria-label={isMaximized ? "복원" : "최대화"}
        >
          {isMaximized ? (
            <Copy
              size={12}
              className={colors.icon}
            />
          ) : (
            <Square
              size={12}
              className={colors.icon}
            />
          )}
        </button>

        {/* 닫기 */}
        <button
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${colors.controlButton} ${colors.closeHover}`}
          aria-label="닫기"
        >
          <X
            size={14}
            className={colors.closeIcon}
          />
        </button>
      </div>
    </div>
  );
}

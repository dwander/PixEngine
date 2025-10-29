import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState, useEffect } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { theme, getTitleBarColors } from "../../lib/theme";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    // 윈도우 상태 감지
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };

    const checkFocused = async () => {
      const focused = await appWindow.isFocused();
      setIsFocused(focused);
    };

    checkMaximized();
    checkFocused();

    // 이벤트 리스너 등록
    const setupListeners = async () => {
      const unlistenResize = await appWindow.onResized(() => {
        checkMaximized();
      });

      const unlistenFocus = await appWindow.onFocusChanged(({ payload: focused }) => {
        setIsFocused(focused);
      });

      return () => {
        unlistenResize();
        unlistenFocus();
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
            File
          </button>
          <button className={colors.menuButton}>
            Edit
          </button>
          <button className={colors.menuButton}>
            View
          </button>
          <button className={colors.menuButton}>
            Help
          </button>
        </nav>
      </div>

      {/* 중앙: 빈 공간 (드래그 가능) */}
      <div className="flex-1" />

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

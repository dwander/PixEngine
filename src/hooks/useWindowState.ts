import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const appWindow = getCurrentWindow();

/**
 * 윈도우 위치와 크기를 저장하고 렌더링 완료 후 윈도우를 표시하는 훅
 */
export function useWindowState() {
  useEffect(() => {
    let saveTimeout: ReturnType<typeof setTimeout>;
    let isMounted = true;
    let isShown = false;

    // 초기 렌더링 완료 후 윈도우 표시
    const showWindow = async () => {
      if (!isShown) {
        try {
          await invoke("show_window");
          isShown = true;
        } catch (error) {
          console.error("윈도우 표시 실패:", error);
        }
      }
    };

    // 현재 윈도우 상태 저장 (Rust 커맨드 사용)
    const saveWindowState = async () => {
      try {
        const position = await appWindow.outerPosition();
        const size = await appWindow.outerSize();
        const maximized = await appWindow.isMaximized();

        await invoke("save_window_state", {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          maximized,
        });
      } catch (error) {
        console.error("윈도우 상태 저장 실패:", error);
      }
    };

    // 디바운스된 저장 함수 (연속된 이벤트를 묶어서 처리)
    const debouncedSave = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (isMounted) {
          saveWindowState();
        }
      }, 500);
    };

    // 초기 렌더링 완료 후 윈도우 표시
    showWindow();

    // 이벤트 리스너 등록
    const setupListeners = async () => {
      const unlistenMove = await appWindow.onMoved(() => {
        debouncedSave();
      });

      const unlistenResize = await appWindow.onResized(() => {
        debouncedSave();
      });

      // 정리 함수
      return () => {
        unlistenMove();
        unlistenResize();
      };
    };

    let cleanup: (() => void) | undefined;
    setupListeners().then((fn) => {
      cleanup = fn;
    });

    // 컴포넌트 언마운트 시 정리
    return () => {
      isMounted = false;
      clearTimeout(saveTimeout);
      if (cleanup) cleanup();

      // 마지막 상태 저장
      saveWindowState();
    };
  }, []);
}

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
    let previousMaximized = false;
    let isFullscreen = false; // 확장 모드(전체화면) 상태 추적

    // 초기 렌더링 완료 후 윈도우 표시
    const showWindow = async () => {
      if (!isShown) {
        try {
          await invoke("show_window");
          isShown = true;
          // 초기 최대화 상태 저장
          previousMaximized = await appWindow.isMaximized();
        } catch (error) {
          console.error("윈도우 표시 실패:", error);
        }
      }
    };

    // 현재 윈도우 상태 저장 (Rust 커맨드 사용)
    const saveWindowState = async () => {
      // 확장 모드(전체화면)일 때는 저장하지 않음
      if (isFullscreen) {
        return;
      }

      try {
        const maximized = await appWindow.isMaximized();
        const position = await appWindow.outerPosition();
        const size = await appWindow.outerSize();

        await invoke("save_window_state", {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          maximized,
        });

        previousMaximized = maximized;
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
      let skipNextSave = false;

      const unlistenMove = await appWindow.onMoved(() => {
        // 복원 직후 스킵 플래그가 있으면 한 번만 건너뛰고 해제
        if (skipNextSave) {
          skipNextSave = false;
          return;
        }
        debouncedSave();
      });

      const unlistenResize = await appWindow.onResized(async () => {
        // 최대화 상태 변경 감지
        const currentMaximized = await appWindow.isMaximized();

        // 최대화 → 복원으로 변경되는 경우
        if (previousMaximized && !currentMaximized) {
          // 복원 직후에는 저장하지 않음 (잘못된 중앙 위치 방지)
          previousMaximized = currentMaximized;
          skipNextSave = true; // 다음 move 이벤트도 한 번 건너뛰기
          return;
        }

        debouncedSave();
      });

      // 전체화면 상태 변경 감지 (확장 모드)
      const checkFullscreen = async () => {
        const currentFullscreen = await appWindow.isFullscreen();
        if (currentFullscreen !== isFullscreen) {
          isFullscreen = currentFullscreen;
        }
      };

      // 주기적으로 전체화면 상태 체크 (100ms마다)
      const fullscreenCheckInterval = setInterval(checkFullscreen, 100);

      // 정리 함수
      return () => {
        unlistenMove();
        unlistenResize();
        clearInterval(fullscreenCheckInterval);
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

import { useState, useCallback, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TitleBar } from "./components/layout/TitleBar";
import { MainLayout } from "./components/layout/MainLayout";
import { StatusBar } from "./components/layout/StatusBar";
import { useWindowState } from "./hooks/useWindowState";
import { theme } from "./lib/theme";
import { FolderProvider, useFolderContext } from "./contexts/FolderContext";
import { ImageProvider } from "./contexts/ImageContext";
import { WindowFocusProvider } from "./contexts/WindowFocusContext";
import { DialogProvider } from "./contexts/DialogContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useViewerStore } from "./store/viewerStore";

const appWindow = getCurrentWindow();

function AppContent() {
  const { refreshCurrentFolder, currentFolder } = useFolderContext();

  // ViewerStore에서 필요한 함수들 가져오기
  const setToggleFullscreen = useViewerStore((state) => state.setToggleFullscreen);
  const isFullscreenViewer = useViewerStore((state) => state.isFullscreenViewer);
  const setIsFullscreenViewer = useViewerStore((state) => state.setIsFullscreenViewer);

  // 브라우저 기본 컨텍스트 메뉴 비활성화
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // 새로고침 키 처리: 개발 환경에서는 모두 허용, 프로덕션에서는 커스텀 동작
  useEffect(() => {
    const isDev = import.meta.env.DEV;

    // 개발 환경에서는 새로고침 키를 가로채지 않음
    if (isDev) {
      return;
    }

    // 프로덕션: 커스텀 새로고침 동작
    const handleRefreshKey = (e: KeyboardEvent) => {
      // F5: 폴더 새로고침
      if (e.key === 'F5') {
        e.preventDefault();
        if (currentFolder) {
          refreshCurrentFolder();
          console.log('[App] Folder refreshed via F5');
        }
      }
      // Ctrl+R 또는 Cmd+R: 전체 새로고침 차단
      else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        console.log('[App] Page refresh prevented - use F5 to refresh folder');
      }
    };

    window.addEventListener('keydown', handleRefreshKey);

    return () => {
      window.removeEventListener('keydown', handleRefreshKey);
    };
  }, [currentFolder, refreshCurrentFolder]);

  const [visiblePanels, setVisiblePanels] = useState({
    folders: true,
    metadata: true,
    thumbnails: true,
  });

  const [togglePanelId, setTogglePanelId] = useState<string | null>(null);

  // 격자선 상태 관리
  const [gridType, setGridType] = useState<'none' | '3div' | '6div'>(() => {
    const saved = localStorage.getItem('imageViewer.gridType');
    return (saved as 'none' | '3div' | '6div') || 'none';
  });

  // 전체화면 뷰어 상태는 ViewerStore에서 관리

  const handleTogglePanel = useCallback((panelId: string) => {
    setTogglePanelId(panelId);
    // 상태 즉시 업데이트 (낙관적 업데이트)
    setVisiblePanels(prev => ({
      ...prev,
      [panelId]: !prev[panelId as keyof typeof prev],
    }));
  }, []);

  const handlePanelVisibilityChange = useCallback((panels: typeof visiblePanels) => {
    setVisiblePanels(panels);
    setTogglePanelId(null);
  }, []);

  // 격자선 토글 핸들러
  const handleToggleGrid = useCallback((newGridType: 'none' | '3div' | '6div') => {
    setGridType(newGridType);
    localStorage.setItem('imageViewer.gridType', newGridType);
  }, []);

  // 격자선 상태 저장
  useEffect(() => {
    localStorage.setItem('imageViewer.gridType', gridType);
  }, [gridType]);

  // 전체화면 뷰어 토글 핸들러
  const handleToggleFullscreenViewer = useCallback(async () => {
    const newFullscreenState = !isFullscreenViewer;
    setIsFullscreenViewer(newFullscreenState);

    // 타우리 네이티브 전체화면 API 호출
    try {
      if (newFullscreenState) {
        // 전체화면 진입 전에 최대화 상태 해제 (OS 작업 표시줄 덮기 위해)
        const isMaximized = await appWindow.isMaximized();
        if (isMaximized) {
          await appWindow.toggleMaximize();
          // 최대화 해제 후 약간의 딜레이를 주고 전체화면 설정
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      await appWindow.setFullscreen(newFullscreenState);
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error);
    }
  }, [isFullscreenViewer]);

  // ViewerStore에 toggleFullscreen 함수 등록
  useEffect(() => {
    setToggleFullscreen(handleToggleFullscreenViewer);
    return () => setToggleFullscreen(null);
  }, [handleToggleFullscreenViewer, setToggleFullscreen]);

  // ESC, Enter 키로 전체화면 종료
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.key === 'Escape' || e.key === 'Enter') && isFullscreenViewer) {
        e.preventDefault();
        setIsFullscreenViewer(false);
        try {
          await appWindow.setFullscreen(false);
        } catch (error) {
          console.error('Failed to exit fullscreen:', error);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreenViewer]);

  // 앱 종료 전 확장 모드 해제 (패널 크기 깨짐 방지)
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (isFullscreenViewer) {
        try {
          await appWindow.setFullscreen(false);
        } catch (error) {
          console.error('Failed to exit fullscreen before unload:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isFullscreenViewer]);

  return (
    <div className={`flex flex-col h-screen ${theme.background.primary}`}>
      {/* 커스텀 타이틀바 */}
      {!isFullscreenViewer && (
        <TitleBar
          onTogglePanel={handleTogglePanel}
          visiblePanels={visiblePanels}
          onToggleGrid={handleToggleGrid}
          activeGrid={gridType}
        />
      )}

      {/* 메인 레이아웃 (dockview) */}
      <main className="flex-1 overflow-hidden">
        <MainLayout
          onPanelVisibilityChange={handlePanelVisibilityChange}
          togglePanelId={togglePanelId}
          gridType={gridType}
          isFullscreenViewer={isFullscreenViewer}
          onToggleFullscreenViewer={handleToggleFullscreenViewer}
        />
      </main>

      {/* 상태 표시 영역 */}
      {!isFullscreenViewer && <StatusBar />}
    </div>
  );
}

function App() {
  // 윈도우 상태 저장/복원
  useWindowState();

  return (
    <ErrorBoundary>
      <ToastProvider>
        <DialogProvider>
          <WindowFocusProvider>
            <FolderProvider>
              <ImageProvider>
                <AppContent />
              </ImageProvider>
            </FolderProvider>
          </WindowFocusProvider>
        </DialogProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;

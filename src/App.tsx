import { useState, useCallback, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TitleBar } from "./components/layout/TitleBar";
import { MainLayout } from "./components/layout/MainLayout";
import { StatusBar } from "./components/layout/StatusBar";
import { useWindowState } from "./hooks/useWindowState";
import { theme } from "./lib/theme";
import { FolderProvider } from "./contexts/FolderContext";
import { ImageProvider } from "./contexts/ImageContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

const appWindow = getCurrentWindow();

function App() {
  // 윈도우 상태 저장/복원
  useWindowState();

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

  // 전체화면 뷰어 상태 관리
  const [isFullscreenViewer, setIsFullscreenViewer] = useState(false);

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
      await appWindow.setFullscreen(newFullscreenState);
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error);
    }
  }, [isFullscreenViewer]);

  // ESC 키로 전체화면 종료
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreenViewer) {
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

  return (
    <ErrorBoundary>
      <FolderProvider>
        <ImageProvider>
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
        </ImageProvider>
      </FolderProvider>
    </ErrorBoundary>
  );
}

export default App;

import { useState, useCallback, useEffect } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { MainLayout } from "./components/layout/MainLayout";
import { StatusBar } from "./components/layout/StatusBar";
import { useWindowState } from "./hooks/useWindowState";
import { theme } from "./lib/theme";
import { FolderProvider } from "./contexts/FolderContext";
import { ImageProvider } from "./contexts/ImageContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

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

  return (
    <ErrorBoundary>
      <FolderProvider>
        <ImageProvider>
          <div className={`flex flex-col h-screen ${theme.background.primary}`}>
            {/* 커스텀 타이틀바 */}
            <TitleBar
              onTogglePanel={handleTogglePanel}
              visiblePanels={visiblePanels}
              onToggleGrid={handleToggleGrid}
              activeGrid={gridType}
            />

            {/* 메인 레이아웃 (dockview) */}
            <main className="flex-1 overflow-hidden">
              <MainLayout
                onPanelVisibilityChange={handlePanelVisibilityChange}
                togglePanelId={togglePanelId}
                gridType={gridType}
              />
            </main>

            {/* 상태 표시 영역 */}
            <StatusBar />
          </div>
        </ImageProvider>
      </FolderProvider>
    </ErrorBoundary>
  );
}

export default App;

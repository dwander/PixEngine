import { useState, useCallback } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { MainLayout } from "./components/layout/MainLayout";
import { useWindowState } from "./hooks/useWindowState";
import { theme } from "./lib/theme";
import { FolderProvider } from "./contexts/FolderContext";
import { ImageProvider } from "./contexts/ImageContext";

function App() {
  // 윈도우 상태 저장/복원
  useWindowState();

  const [visiblePanels, setVisiblePanels] = useState({
    folders: true,
    metadata: true,
    thumbnails: true,
  });

  const [togglePanelId, setTogglePanelId] = useState<string | null>(null);

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

  return (
    <FolderProvider>
      <ImageProvider>
        <div className={`flex flex-col h-screen ${theme.background.primary}`}>
          {/* 커스텀 타이틀바 */}
          <TitleBar
            onTogglePanel={handleTogglePanel}
            visiblePanels={visiblePanels}
          />

          {/* 메인 레이아웃 (dockview) */}
          <main className="flex-1 overflow-hidden">
            <MainLayout
              onPanelVisibilityChange={handlePanelVisibilityChange}
              togglePanelId={togglePanelId}
            />
          </main>

          {/* 상태 표시 영역 */}
          <footer className={`${theme.layout.statusBarHeight} ${theme.background.primary} flex items-center px-4 text-xs ${theme.text.quaternary} border-t border-neutral-800`}>
            <span>준비 완료</span>
          </footer>
        </div>
      </ImageProvider>
    </FolderProvider>
  );
}

export default App;

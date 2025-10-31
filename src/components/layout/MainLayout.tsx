import { useRef, useCallback, useEffect } from "react";
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "../../styles/dockview-theme-dark.css";
import { FolderTreePanel } from "../panels/FolderTreePanel";
import { ThumbnailPanel as ThumbnailPanelComponent } from "../panels/ThumbnailPanel";
import { ImageViewerPanel as ImageViewerPanelComponent } from "../panels/ImageViewerPanel";

// 패널 래퍼 컴포넌트
function ImageViewerPanelWrapper(_props: IDockviewPanelProps) {
  return <ImageViewerPanelComponent />;
}

function FolderTreePanelWrapper(_props: IDockviewPanelProps) {
  return <FolderTreePanel />;
}

function MetadataPanel(_props: IDockviewPanelProps) {
  return (
    <div className="flex items-center justify-center h-full bg-neutral-900 text-gray-400">
      <div className="text-center">
        <p className="text-lg font-bold mb-2">Metadata</p>
        <p className="text-xs">메타데이터 패널</p>
      </div>
    </div>
  );
}

function ThumbnailPanelWrapper(_props: IDockviewPanelProps) {
  return <ThumbnailPanelComponent />;
}

// 컴포넌트 맵
const components = {
  imageViewer: ImageViewerPanelWrapper,
  folderTree: FolderTreePanelWrapper,
  metadata: MetadataPanel,
  thumbnails: ThumbnailPanelWrapper,
};

interface MainLayoutProps {
  onPanelVisibilityChange?: (visiblePanels: {
    folders: boolean;
    metadata: boolean;
    thumbnails: boolean;
  }) => void;
  togglePanelId?: string | null;
}

export function MainLayout({ onPanelVisibilityChange, togglePanelId }: MainLayoutProps) {
  const api = useRef<DockviewReadyEvent | null>(null);
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const panelSizesBeforeDragRef = useRef<Map<string, { width: number; height: number }>>(new Map());

  // 패널 가시성 체크 및 콜백 호출
  const updatePanelVisibility = useCallback(() => {
    if (!api.current) return;

    const visiblePanels = {
      folders: !!api.current.api.getPanel('folders'),
      metadata: !!api.current.api.getPanel('metadata'),
      thumbnails: !!api.current.api.getPanel('thumbnails'),
    };

    onPanelVisibilityChange?.(visiblePanels);
  }, [onPanelVisibilityChange]);

  // 패널 토글 함수
  const togglePanel = useCallback((panelId: string) => {
    if (!api.current) return;

    const panel = api.current.api.getPanel(panelId);

    if (panel) {
      // 패널이 있으면 제거
      api.current.api.removePanel(panel);
    } else {
      // 패널이 없으면 플로팅 윈도우로 추가 (기존 레이아웃 유지)
      const panelConfig = {
        folders: { id: 'folders', component: 'folderTree', title: '폴더' },
        metadata: { id: 'metadata', component: 'metadata', title: '메타데이터' },
        thumbnails: { id: 'thumbnails', component: 'thumbnails', title: '썸네일' },
      };

      const config = panelConfig[panelId as keyof typeof panelConfig];
      if (config) {
        api.current.api.addPanel({
          id: config.id,
          component: config.component,
          title: config.title,
          floating: true, // 플로팅 윈도우로 추가
        });
      }
    }

    // 가시성 업데이트
    setTimeout(updatePanelVisibility, 100);
  }, [updatePanelVisibility]);

  // 외부에서 패널 토글 요청 처리
  useEffect(() => {
    if (togglePanelId) {
      togglePanel(togglePanelId);
    }
  }, [togglePanelId, togglePanel]);

  const onReady = async (event: DockviewReadyEvent) => {
    api.current = event;

    // ImageViewerPanel 그룹으로의 드롭 방지
    event.api.onWillShowOverlay((e) => {
      // center 패널이 속한 그룹으로의 드롭을 막음
      const centerPanel = event.api.getPanel("center");
      const overlayEvent = e as { group?: { id: string }; preventDefault: () => void };
      if (centerPanel && overlayEvent.group?.id === centerPanel.group.id) {
        e.preventDefault();
      }
    });

    // 패널 드래그 시작 시 모든 그룹의 크기 저장
    event.api.onWillDragPanel(() => {
      panelSizesBeforeDragRef.current.clear();

      // 모든 그룹의 현재 크기 저장
      event.api.groups.forEach((group) => {
        panelSizesBeforeDragRef.current.set(group.id, {
          width: group.width,
          height: group.height,
        });
      });
    });

    // 패널 드롭 후 ImageViewer 외 패널들의 크기 복원
    event.api.onDidMovePanel(() => {
      // 약간의 딜레이 후 크기 복원 (레이아웃 재계산 후)
      setTimeout(() => {
        const centerPanel = event.api.getPanel("center");

        event.api.groups.forEach((group) => {
          // ImageViewer 그룹은 제외
          if (centerPanel && group.id === centerPanel.group.id) {
            return;
          }

          const savedSize = panelSizesBeforeDragRef.current.get(group.id);
          if (savedSize) {
            // 크기 복원
            if (group.api.width !== savedSize.width) {
              group.api.setSize({ width: savedSize.width });
            }
            if (group.api.height !== savedSize.height) {
              group.api.setSize({ height: savedSize.height });
            }
          }
        });
      }, 100);
    });

    // 저장된 dockview 레이아웃 복원 시도
    let layoutRestored = false;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const savedLayout = await invoke<any>("load_dockview_layout");

      if (savedLayout) {
        event.api.fromJSON(savedLayout);

        // 이미지 뷰어 탭 헤더 숨기기 (복원 후)
        const centerPanel = event.api.getPanel("center");
        if (centerPanel?.group) {
          (centerPanel.group as any).header.hidden = true;
        }

        // 초기 패널 가시성 체크
        updatePanelVisibility();

        layoutRestored = true;
      }
    } catch (error) {
      console.warn('[Layout] Failed to restore layout, creating default:', error);
    }

    // 기본 레이아웃 로드 (복원 실패 시)
    if (!layoutRestored) {
      try {
        console.log('[Layout] Loading default layout from public/dockview-layout.json');

        // public/dockview-layout.json 파일 로드
        const response = await fetch('/dockview-layout.json');
        const defaultLayout = await response.json();

        console.log('[Layout] Default layout loaded, applying...');

        // 기본 레이아웃 적용
        event.api.fromJSON(defaultLayout);

        // 이미지 뷰어 탭 헤더 숨기기
        const centerPanel = event.api.getPanel("center");
        if (centerPanel?.group) {
          (centerPanel.group as any).header.hidden = true;
        }

        // 초기 패널 가시성 체크
        updatePanelVisibility();

        // 기본 레이아웃을 AppData에 저장
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("save_dockview_layout", { layout: defaultLayout });

        console.log('[Layout] Default layout saved to AppData');
      } catch (error) {
        console.error('[Layout] Failed to load default layout:', error);
      }
    }

    // 레이아웃 변경 시 자동 저장 (디바운스) - 항상 등록
    event.api.onDidLayoutChange(() => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const layout = event.api.toJSON();
          await invoke("save_dockview_layout", { layout });
        } catch (error) {
          console.error('[Layout] Save failed:', error);
        }
      }, 500);
    });

    // 페이지 언로드 전 pending된 저장 강제 실행
    const handleBeforeUnload = async () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const layout = event.api.toJSON();
          await invoke("save_dockview_layout", { layout });
        } catch (error) {
          console.error('[Layout] Save on unload failed:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
  };

  // dockview가 레이아웃을 자동으로 관리하므로 별도의 resize 로직 불필요

  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      className="dockview-theme-dark h-full w-full"
    />
  );
}

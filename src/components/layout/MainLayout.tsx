import { useRef } from "react";
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

export function MainLayout() {
  const api = useRef<DockviewReadyEvent | null>(null);
  const saveTimeoutRef = useRef<number | undefined>(undefined);

  const onReady = async (event: DockviewReadyEvent) => {
    api.current = event;

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

import { useRef, useEffect } from "react";
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "../../styles/dockview-theme-dark.css";
import { useLayoutState } from "../../hooks/useLayoutState";

// 임시 패널 컴포넌트들
function ImageViewerPanel(_props: IDockviewPanelProps) {
  return (
    <div className="flex items-center justify-center h-full bg-neutral-900 text-gray-400">
      <div className="text-center">
        <p className="text-2xl font-bold mb-2">Image Viewer</p>
        <p className="text-sm">메인 이미지 뷰어 영역</p>
      </div>
    </div>
  );
}

function FolderTreePanel(_props: IDockviewPanelProps) {
  return (
    <div className="flex items-center justify-center h-full bg-neutral-900 text-gray-400">
      <div className="text-center">
        <p className="text-lg font-bold mb-2">Folder Tree</p>
        <p className="text-xs">폴더 트리 패널</p>
      </div>
    </div>
  );
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

function ThumbnailPanel(_props: IDockviewPanelProps) {
  return (
    <div className="flex items-center justify-center h-full bg-neutral-900 text-gray-400">
      <div className="text-center">
        <p className="text-lg font-bold mb-2">Thumbnails</p>
        <p className="text-xs">썸네일 스트립</p>
      </div>
    </div>
  );
}

// 컴포넌트 맵
const components = {
  imageViewer: ImageViewerPanel,
  folderTree: FolderTreePanel,
  metadata: MetadataPanel,
  thumbnails: ThumbnailPanel,
};

export function MainLayout() {
  const api = useRef<DockviewReadyEvent | null>(null);
  const { loadLayoutState, saveLayoutState } = useLayoutState();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // 고정할 패널 크기 추적
  const fixedPanelSizes = useRef<{
    folderWidth: number;
    metadataHeight: number;
    thumbnailWidth: number;
  }>({
    folderWidth: 250,
    metadataHeight: 300,
    thumbnailWidth: 200,
  });

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

    // 기본 레이아웃 구성 (복원 실패 시에만)
    if (!layoutRestored) {
    // 중앙: 이미지 뷰어
    const centerPanel = event.api.addPanel({
      id: "center",
      component: "imageViewer",
      title: "Viewer",
    });

    if (centerPanel?.group) {
      (centerPanel.group as any).header.hidden = true;
    }

    // 왼쪽: 폴더 트리
    event.api.addPanel({
      id: "folders",
      component: "folderTree",
      title: "Folders",
      position: { direction: "left" },
    });

    // 왼쪽: 메타데이터 (폴더와 같은 곳에 탭으로)
    event.api.addPanel({
      id: "metadata",
      component: "metadata",
      title: "Metadata",
      position: { direction: "left" },
    });

      // 오른쪽: 썸네일
      event.api.addPanel({
        id: "thumbnails",
        component: "thumbnails",
        title: "Thumbnails",
        position: { direction: "right" },
      });
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

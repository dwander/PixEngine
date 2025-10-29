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

    // 저장된 레이아웃 크기 로드
    const savedLayout = await loadLayoutState();
    fixedPanelSizes.current = {
      folderWidth: savedLayout.folderWidth,
      metadataHeight: savedLayout.metadataHeight,
      thumbnailWidth: savedLayout.thumbnailWidth,
    };

    // 기본 레이아웃 구성
    // 중앙: 이미지 뷰어 (메인, 탭 헤더 숨김)
    const centerPanel = event.api.addPanel({
      id: "center",
      component: "imageViewer",
      title: "Viewer",
    });

    // 이미지 뷰어 그룹의 탭 헤더 숨기기
    if (centerPanel?.group) {
      (centerPanel.group as any).header.hidden = true;
    }

    // 왼쪽: 폴더 트리
    const folderPanel = event.api.addPanel({
      id: "folders",
      component: "folderTree",
      title: "Folders",
      position: { direction: "left" },
    });

    // 왼쪽 하단: 메타데이터 (폴더 패널과 같은 그룹에 아래쪽으로 분할)
    const metadataPanel = event.api.addPanel({
      id: "metadata",
      component: "metadata",
      title: "Metadata",
      position: {
        referencePanel: folderPanel,
        direction: "below",
      },
    });

    // 오른쪽: 썸네일 스트립
    const thumbnailPanel = event.api.addPanel({
      id: "thumbnails",
      component: "thumbnails",
      title: "Thumbnails",
      position: { direction: "right" },
    });

    // 저장된 크기로 초기 설정
    if (folderPanel?.api) {
      folderPanel.api.setSize({ width: fixedPanelSizes.current.folderWidth });
    }
    if (metadataPanel?.api) {
      metadataPanel.api.setSize({ height: fixedPanelSizes.current.metadataHeight });
    }
    if (thumbnailPanel?.api) {
      thumbnailPanel.api.setSize({ width: fixedPanelSizes.current.thumbnailWidth });
    }

    // 패널 크기 변경 시 저장
    event.api.onDidLayoutChange(() => {
      const folder = event.api.getPanel("folders");
      const metadata = event.api.getPanel("metadata");
      const thumbnail = event.api.getPanel("thumbnails");

      if (folder?.group) {
        fixedPanelSizes.current.folderWidth = folder.group.width;
      }
      if (metadata?.group) {
        fixedPanelSizes.current.metadataHeight = metadata.group.height;
      }
      if (thumbnail?.group) {
        fixedPanelSizes.current.thumbnailWidth = thumbnail.group.width;
      }

      // 디바운스된 저장
      saveLayoutState(fixedPanelSizes.current);
    });
  };

  // 창 크기 변경 시 고정 패널 크기 복원
  useEffect(() => {
    const restorePanelSizes = () => {
      if (!api.current) return;

      // dockview의 resize 이후에 실행
      requestAnimationFrame(() => {
        if (!api.current) return;

        const folderPanel = api.current.api.getPanel("folders");
        const metadataPanel = api.current.api.getPanel("metadata");
        const thumbnailPanel = api.current.api.getPanel("thumbnails");

        if (folderPanel?.group) {
          folderPanel.group.api.setSize({
            width: fixedPanelSizes.current.folderWidth,
          });
        }

        if (metadataPanel?.group) {
          metadataPanel.group.api.setSize({
            height: fixedPanelSizes.current.metadataHeight,
          });
        }

        if (thumbnailPanel?.group) {
          thumbnailPanel.group.api.setSize({
            width: fixedPanelSizes.current.thumbnailWidth,
          });
        }
      });
    };

    window.addEventListener("resize", restorePanelSizes);

    // 디바운스된 복원 (최대화/복원 등)
    let resizeTimeout: number;
    const debouncedRestore = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(restorePanelSizes, 100);
    };
    window.addEventListener("resize", debouncedRestore);

    return () => {
      window.removeEventListener("resize", restorePanelSizes);
      window.removeEventListener("resize", debouncedRestore);
      clearTimeout(resizeTimeout);
    };
  }, []);

  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      className="dockview-theme-dark h-full w-full"
    />
  );
}

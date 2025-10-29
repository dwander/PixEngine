import { useRef } from "react";
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "../../styles/dockview-theme-dark.css";

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

  const onReady = (event: DockviewReadyEvent) => {
    api.current = event;

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

    // 초기 크기 조정
    if (folderPanel?.api) {
      folderPanel.api.setSize({ width: 250 });
    }
    if (metadataPanel?.api) {
      metadataPanel.api.setSize({ height: 300 });
    }
    if (thumbnailPanel?.api) {
      thumbnailPanel.api.setSize({ width: 200 });
    }
  };

  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      className="dockview-theme-dark h-full w-full"
    />
  );
}

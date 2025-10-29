import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface LayoutState {
  folderWidth: number;
  metadataHeight: number;
  thumbnailWidth: number;
}

// 기본 레이아웃 크기
const DEFAULT_LAYOUT: LayoutState = {
  folderWidth: 250,
  metadataHeight: 300,
  thumbnailWidth: 200,
};

/**
 * 레이아웃 상태를 저장하고 복원하는 훅
 */
export function useLayoutState() {
  const layoutRef = useRef<LayoutState>(DEFAULT_LAYOUT);

  // 초기 레이아웃 상태 로드
  const loadLayoutState = async (): Promise<LayoutState> => {
    try {
      const saved = await invoke<{
        folder_width: number;
        metadata_height: number;
        thumbnail_width: number;
      } | null>("load_layout_state");

      if (saved) {
        const layout: LayoutState = {
          folderWidth: saved.folder_width,
          metadataHeight: saved.metadata_height,
          thumbnailWidth: saved.thumbnail_width,
        };
        layoutRef.current = layout;
        return layout;
      }
    } catch (error) {
      console.error("레이아웃 상태 로드 실패:", error);
    }

    return DEFAULT_LAYOUT;
  };

  // 레이아웃 상태 저장 (디바운스)
  const saveLayoutState = async (layout: LayoutState) => {
    layoutRef.current = layout;

    try {
      await invoke("save_layout_state", {
        folderWidth: layout.folderWidth,
        metadataHeight: layout.metadataHeight,
        thumbnailWidth: layout.thumbnailWidth,
      });
    } catch (error) {
      console.error("레이아웃 상태 저장 실패:", error);
    }
  };

  return {
    loadLayoutState,
    saveLayoutState,
    currentLayout: layoutRef.current,
  };
}

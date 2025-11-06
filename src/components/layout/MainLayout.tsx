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
import { MetadataPanel as MetadataPanelComponent } from "../panels/MetadataPanel";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

// 패널 래퍼 컴포넌트
function ImageViewerPanelWrapper(props: IDockviewPanelProps<{ gridType?: 'none' | '3div' | '6div'; isFullscreenMode?: boolean; onToggleFullscreen?: () => void }>) {
  return <ImageViewerPanelComponent gridType={props.params?.gridType} isFullscreenMode={props.params?.isFullscreenMode} onToggleFullscreen={props.params?.onToggleFullscreen} />;
}

function FolderTreePanelWrapper(_props: IDockviewPanelProps) {
  return <FolderTreePanel />;
}

function MetadataPanelWrapper(_props: IDockviewPanelProps) {
  return <MetadataPanelComponent />;
}

function ThumbnailPanelWrapper(_props: IDockviewPanelProps) {
  return <ThumbnailPanelComponent />;
}

// 컴포넌트 맵
const components = {
  imageViewer: ImageViewerPanelWrapper,
  folderTree: FolderTreePanelWrapper,
  metadata: MetadataPanelWrapper,
  thumbnails: ThumbnailPanelWrapper,
};

interface MainLayoutProps {
  onPanelVisibilityChange?: (visiblePanels: {
    folders: boolean;
    metadata: boolean;
    thumbnails: boolean;
  }) => void;
  togglePanelId?: string | null;
  gridType?: 'none' | '3div' | '6div';
  isFullscreenViewer?: boolean;
  onToggleFullscreenViewer?: () => void;
}

export function MainLayout({ onPanelVisibilityChange, togglePanelId, gridType = 'none', isFullscreenViewer = false, onToggleFullscreenViewer }: MainLayoutProps) {
  const api = useRef<DockviewReadyEvent | null>(null);
  const saveTimeoutRef = useRef<number | undefined>(undefined);

  // 그룹 크기 저장 (픽셀 단위)
  const groupSizesRef = useRef<Map<string, { width: number; height: number }>>(new Map());

  // 개별 패널 크기 저장 (픽셀 단위) - 세로 스택에서 가장 작은 패널들의 크기만 저장
  const panelSizesRef = useRef<Map<string, { width: number; height: number }>>(new Map());

  // 전체화면 전환 중 플래그 (이 동안은 저장하지 않음)
  const isTransitioningRef = useRef<boolean>(false);

  // 그룹 내 모든 패널의 크기를 저장하는 함수
  const savePanelSizes = useCallback(async () => {
    if (!api.current) return;

    // 전체화면 전환 중이면 저장하지 않음
    if (isTransitioningRef.current) {
      return;
    }

    // 확장 모드(전체화면)일 때는 저장하지 않음
    try {
      const appWindow = getCurrentWindow();
      const isFullscreen = await appWindow.isFullscreen();

      if (isFullscreen) {
        return;
      }
    } catch (error) {
      console.error('[Layout] Failed to check fullscreen state:', error);
    }

    // 전체화면 모드(maximize 상태)에서는 저장하지 않음
    const centerPanel = api.current.api.getPanel('center');
    if (centerPanel?.api.isMaximized()) {
      return;
    }

    // 1단계: ImageViewer를 제외한 모든 그룹 정보 수집
    const groups: Array<{ id: string; group: any; x: number; y: number; width: number; height: number }> = [];

    api.current.api.groups.forEach((group) => {
      // ImageViewer 그룹은 제외
      if (centerPanel && group.id === centerPanel.group.id) {
        return;
      }

      // 그룹 element 찾기 - dockview는 element 속성을 직접 제공
      const groupElement = (group as any).element;
      if (groupElement) {
        const rect = groupElement.getBoundingClientRect();
        groups.push({
          id: group.id,
          group: group,
          x: rect.x,
          y: rect.y,
          width: group.width,
          height: group.height,
        });
      }
    });

    // 2단계: 세로로 배치된 그룹들을 컬럼별로 그룹핑 (x 좌표가 비슷하면 같은 컬럼)
    const columns: Array<typeof groups> = [];
    const xThreshold = 10; // x 좌표 차이가 10px 이내면 같은 컬럼으로 간주

    groups.forEach((g) => {
      let foundColumn = false;
      for (const col of columns) {
        // 같은 컬럼의 첫 번째 그룹과 x 좌표 비교
        if (Math.abs(col[0].x - g.x) < xThreshold) {
          col.push(g);
          foundColumn = true;
          break;
        }
      }
      if (!foundColumn) {
        columns.push([g]);
      }
    });

    // 3단계: 각 컬럼 내에서 가장 큰 그룹만 가변으로, 나머지는 고정 크기로 저장
    columns.forEach((column) => {
      if (column.length > 1) {
        // 컬럼 내에서 가장 큰 높이를 가진 그룹 찾기
        const maxHeightGroup = column.reduce((max, g) => g.height > max.height ? g : max);

        // 가장 큰 그룹이 아닌 그룹들만 저장 (고정 크기)
        column.forEach((g) => {
          if (g.id !== maxHeightGroup.id) {
            groupSizesRef.current.set(g.id, {
              width: g.width,
              height: g.height,
            });
          }
        });
      } else {
        // 컬럼에 그룹이 하나뿐이면 너비만 저장 (높이는 가변)
        const g = column[0];
        groupSizesRef.current.set(g.id, {
          width: g.width,
          height: 0, // 0으로 표시하여 높이는 복원하지 않음
        });
      }

      // 그룹 내 탭 패널들 처리 (기존 로직)
      column.forEach((g) => {
        const panels = g.group.panels;
        if (panels.length > 1) {
          const panelHeights = panels.map((p: any) => {
            const panelElement = document.querySelector(`[data-panel-id="${p.id}"]`);
            const height = panelElement ? panelElement.clientHeight : 0;
            return { id: p.id, height };
          });

          const validPanelHeights = panelHeights.filter((p: { id: string; height: number }) => p.height > 0);
          if (validPanelHeights.length > 1) {
            const maxHeightPanel = validPanelHeights.reduce((max: { id: string; height: number }, p: { id: string; height: number }) => p.height > max.height ? p : max);

            validPanelHeights.forEach((panelInfo: { id: string; height: number }) => {
              if (panelInfo.id !== maxHeightPanel.id) {
                panelSizesRef.current.set(panelInfo.id, {
                  width: g.width,
                  height: panelInfo.height,
                });
              }
            });
          }
        }
      });
    });
  }, []);

  // 저장된 크기로 패널을 복원하는 함수
  const restorePanelSizes = useCallback(() => {
    if (!api.current) return;

    const centerPanel = api.current.api.getPanel('center');

    api.current.api.groups.forEach((group) => {
      // ImageViewer 그룹은 제외
      if (centerPanel && group.id === centerPanel.group.id) {
        return;
      }

      // 그룹 크기 복원
      const savedGroupSize = groupSizesRef.current.get(group.id);
      if (savedGroupSize) {
        // 너비 복원
        if (Math.abs(group.api.width - savedGroupSize.width) > 1) {
          group.api.setSize({ width: savedGroupSize.width });
        }

        // 높이 복원 (0이 아닌 경우만)
        if (savedGroupSize.height > 0 && Math.abs(group.api.height - savedGroupSize.height) > 1) {
          group.api.setSize({ height: savedGroupSize.height });
        }
      }

      // 그룹 내 패널들 크기 복원 (탭 그룹의 경우)
      const panels = group.panels;
      if (panels.length > 1) {
        // 세로 스택: 저장된 고정 크기 패널들 복원
        panels.forEach((panel) => {
          const savedPanelSize = panelSizesRef.current.get(panel.id);

          if (savedPanelSize) {
            // 현재 높이 확인
            const panelElement = document.querySelector(`[data-panel-id="${panel.id}"]`);
            const currentHeight = panelElement ? panelElement.clientHeight : 0;

            if (currentHeight > 0 && Math.abs(currentHeight - savedPanelSize.height) > 1) {
              panel.api.setSize({ height: savedPanelSize.height });
            }
          }
        });
      }
    });
  }, []);

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

  // gridType 변경 시 ImageViewer 패널 업데이트
  useEffect(() => {
    if (!api.current) return;

    const centerPanel = api.current.api.getPanel('center');
    if (centerPanel) {
      centerPanel.api.updateParameters({ gridType, isFullscreenMode: isFullscreenViewer, onToggleFullscreen: onToggleFullscreenViewer });
    }
  }, [gridType, isFullscreenViewer, onToggleFullscreenViewer]);

  // 전체화면 뷰어 모드: center 패널을 maximize/restore
  useEffect(() => {
    if (!api.current) return;

    const centerPanel = api.current.api.getPanel('center');
    if (!centerPanel) return;

    if (isFullscreenViewer) {
      // 전체화면 진입 전에 모든 패널의 크기 저장 (maximize 전!)
      if (!centerPanel.api.isMaximized()) {
        isTransitioningRef.current = true; // 전환 시작
        savePanelSizes();
        centerPanel.api.maximize();

        // 전환 완료 후 플래그 해제 (200ms 후)
        setTimeout(() => {
          isTransitioningRef.current = false;
        }, 200);
      }
    } else {
      // 일반 모드: 패널 restore
      if (centerPanel.api.isMaximized()) {
        isTransitioningRef.current = true; // 전환 시작
        centerPanel.api.exitMaximized();

        // 약간의 딜레이 후 저장된 크기로 복원
        setTimeout(() => {
          restorePanelSizes();

          // 복원 완료 후 플래그 해제
          setTimeout(() => {
            isTransitioningRef.current = false;
          }, 100);
        }, 100);
      }
    }
  }, [isFullscreenViewer, savePanelSizes, restorePanelSizes]);

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

    // 패널 드래그 시작 시 모든 패널의 크기 저장
    event.api.onWillDragPanel(() => {
      savePanelSizes();
    });

    // 패널 드롭 후 크기 복원
    event.api.onDidMovePanel(() => {
      // 약간의 딜레이 후 크기 복원 (레이아웃 재계산 후)
      setTimeout(() => {
        restorePanelSizes();
      }, 100);
    });

    // 패널 크기 변경 시 저장 (수동 리사이즈 시)
    event.api.onDidLayoutChange(() => {
      savePanelSizes();
    });

    // 저장된 dockview 레이아웃 복원 시도
    let layoutRestored = false;
    try {
      const savedLayout = await invoke<any>("load_dockview_layout");

      if (savedLayout) {
        event.api.fromJSON(savedLayout);

        // 이미지 뷰어 탭 헤더 숨기기 및 파라미터 업데이트 (복원 후)
        const centerPanel = event.api.getPanel("center");
        if (centerPanel?.group) {
          (centerPanel.group as any).header.hidden = true;
        }

        // 레이아웃 복원 후 center 패널의 콜백 재설정 (JSON에서 함수는 복원 불가)
        if (centerPanel) {
          centerPanel.api.updateParameters({
            gridType,
            isFullscreenMode: isFullscreenViewer,
            onToggleFullscreen: onToggleFullscreenViewer
          });
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

        // 이미지 뷰어 탭 헤더 숨기기 및 파라미터 업데이트
        const centerPanel = event.api.getPanel("center");
        if (centerPanel?.group) {
          (centerPanel.group as any).header.hidden = true;
        }

        // 레이아웃 복원 후 center 패널의 콜백 재설정 (JSON에서 함수는 복원 불가)
        if (centerPanel) {
          centerPanel.api.updateParameters({
            gridType,
            isFullscreenMode: isFullscreenViewer,
            onToggleFullscreen: onToggleFullscreenViewer
          });
        }

        // 초기 패널 가시성 체크
        updatePanelVisibility();

        // 기본 레이아웃을 AppData에 저장
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
          // 확장 모드(전체화면)일 때는 저장하지 않음
              const appWindow = getCurrentWindow();
          const isFullscreen = await appWindow.isFullscreen();

          if (isFullscreen) {
            return;
          }

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
          // 확장 모드(전체화면)일 때는 저장하지 않음
              const appWindow = getCurrentWindow();
          const isFullscreen = await appWindow.isFullscreen();

          if (isFullscreen) {
            return;
          }

              const layout = event.api.toJSON();
          await invoke("save_dockview_layout", { layout });
        } catch (error) {
          console.error('[Layout] Save on unload failed:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // 창 리사이즈 시 패널 크기 복원
    const handleWindowResize = () => {
      restorePanelSizes();
    };

    // 리사이즈 이벤트 리스너 등록 (디바운스 적용)
    let resizeTimeout: number | undefined;
    const debouncedResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(handleWindowResize, 100);
    };

    window.addEventListener('resize', debouncedResize);

    // 클린업
    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  };

  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      className="dockview-theme-dark h-full w-full"
    />
  );
}

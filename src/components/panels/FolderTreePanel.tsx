import { Folder, FolderOpen, ChevronRight, ChevronDown, HardDrive, Monitor, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { useFolderContext } from "../../contexts/FolderContext";
import { useImageContext } from "../../contexts/ImageContext";
import { normalizePath } from "../../lib/pathUtils";

interface FolderNode {
  name: string;
  path: string;
  isOpen?: boolean;
  children?: FolderNode[];
  imageCount?: number;
  isDrive?: boolean;
  isCategory?: boolean;
  isFavorite?: boolean;
  icon?: 'computer' | 'star';
  treeId?: string; // 트리 구분용 ID (main, favorites 등)
}

const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.svg', '.ico', '.tiff', '.tif', '.heic', '.heif',
  '.JPG', '.JPEG', '.PNG', '.GIF', '.BMP', '.WEBP',
  '.SVG', '.ICO', '.TIFF', '.TIF', '.HEIC', '.HEIF'
];

interface DriveInfo {
  name: string;
  path: string;
}

interface FolderInfo {
  name: string;
  path: string;
}

interface LastAccessed {
  path: string;
  treeId: string;
}

interface Favorite {
  name: string;
  path: string;
}

export function FolderTreePanel() {
  const [rootNodes, setRootNodes] = useState<FolderNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastAccessed, setLastAccessed] = useState<LastAccessed | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useEffect(() => {
    const initialize = async () => {
      await loadRootStructure();
      await loadFavorites();
      await loadLastAccessed();
    };
    initialize();
  }, []);

  const loadLastAccessed = async () => {
    try {
      const store = await load("settings.json");
      const stored = await store.get<LastAccessed>("lastAccessed");

      // 저장된 경로가 있고 유효한 경우
      if (stored && stored.path) {
        // 경로가 실제로 존재하는지 확인
        try {
          await invoke("read_directory_contents", { path: stored.path });
          setLastAccessed(stored);
          return;
        } catch (error) {
          // 경로가 존재하지 않으면 기본값으로 설정
          console.warn("Last accessed path does not exist:", stored.path);
        }
      }

      // 저장된 값이 없거나 경로가 유효하지 않은 경우 사진 폴더를 기본값으로 설정
      try {
        const pictureInfo = await invoke<FolderInfo | null>("get_picture_folder");
        if (pictureInfo) {
          const defaultAccess: LastAccessed = {
            path: pictureInfo.path,
            treeId: 'pictures'
          };
          setLastAccessed(defaultAccess);
          // 기본값을 저장
          await store.set("lastAccessed", defaultAccess);
          await store.save();
        }
      } catch (error) {
        console.error("Failed to set default picture folder:", error);
      }
    } catch (error) {
      console.error("Failed to load last accessed:", error);
    }
  };

  const saveLastAccessed = async (path: string, treeId: string) => {
    try {
      const data: LastAccessed = { path, treeId };
      const store = await load("settings.json");
      await store.set("lastAccessed", data);
      await store.save();
      setLastAccessed(data);
    } catch (error) {
      console.error("Failed to save last accessed:", error);
    }
  };

  const loadFavorites = async () => {
    try {
      const store = await load("settings.json");
      const stored = await store.get<Favorite[]>("favorites");
      if (stored) {
        setFavorites(stored);
      }
    } catch (error) {
      console.error("Failed to load favorites:", error);
    }
  };

  const saveFavorites = async (newFavorites: Favorite[]) => {
    try {
      const store = await load("settings.json");
      await store.set("favorites", newFavorites);
      await store.save();
      setFavorites(newFavorites);
    } catch (error) {
      console.error("Failed to save favorites:", error);
    }
  };

  const addFavorite = (name: string, path: string) => {
    const newFavorites = [...favorites, { name, path }];
    saveFavorites(newFavorites);
  };

  const removeFavorite = (path: string) => {
    const newFavorites = favorites.filter(fav => fav.path !== path);
    saveFavorites(newFavorites);
  };

  const isFavorite = (path: string) => {
    return favorites.some(fav => fav.path === path);
  };

  const loadRootStructure = async () => {
    try {
      const driveList = await invoke<DriveInfo[]>("get_drives");
      const driveNodes: FolderNode[] = driveList.map(drive => ({
        name: drive.name,
        path: drive.path,
        isOpen: false,
        children: undefined,
        isDrive: true,
        treeId: 'main',
      }));

      // "내 PC" 카테고리
      const myPCNode: FolderNode = {
        name: "내 PC",
        path: "my-pc",
        isOpen: true,
        isCategory: true,
        children: driveNodes,
        icon: "computer",
        treeId: 'main',
      };

      const nodes: FolderNode[] = [myPCNode];

      // "바탕화면" 폴더
      try {
        const desktopInfo = await invoke<FolderInfo | null>("get_desktop_folder");
        if (desktopInfo) {
          nodes.push({
            name: desktopInfo.name,
            path: desktopInfo.path,
            isOpen: false,
            children: undefined,
            treeId: 'desktop', // 독립적인 트리 ID
          });
        }
      } catch (error) {
        console.error("Failed to load desktop folder:", error);
      }

      // "사진" 폴더
      try {
        const pictureInfo = await invoke<FolderInfo | null>("get_picture_folder");
        if (pictureInfo) {
          nodes.push({
            name: pictureInfo.name,
            path: pictureInfo.path,
            isOpen: false,
            children: undefined,
            treeId: 'pictures', // 독립적인 트리 ID
          });
        }
      } catch (error) {
        console.error("Failed to load picture folder:", error);
      }

      setRootNodes(nodes);
    } catch (error) {
      console.error("Failed to load root structure:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full bg-neutral-900 overflow-y-auto overflow-x-hidden py-2">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <HardDrive className="h-12 w-12 mb-2 opacity-50 animate-pulse" />
          <p className="text-sm">로딩 중...</p>
        </div>
      ) : (
        <>
          {rootNodes.map((node) => (
            <FolderTreeItem
              key={node.path}
              node={node}
              level={0}
              lastAccessed={lastAccessed}
              onFolderClick={saveLastAccessed}
              onAddFavorite={addFavorite}
              onRemoveFavorite={removeFavorite}
              isFavorite={isFavorite}
            />
          ))}
          <FolderTreeItem
            key="favorites"
            node={{
              name: "즐겨찾기",
              path: "favorites",
              isOpen: true,
              isCategory: true,
              icon: "star",
              treeId: 'favorites',
              children: favorites.map((fav, idx) => ({
                name: fav.name,
                path: fav.path,
                isOpen: false,
                children: undefined,
                isFavorite: true,
                treeId: `favorites-${idx}`,
              })),
            }}
            level={0}
            lastAccessed={lastAccessed}
            onFolderClick={saveLastAccessed}
            onAddFavorite={addFavorite}
            onRemoveFavorite={removeFavorite}
            isFavorite={isFavorite}
          />
        </>
      )}
    </div>
  );
}

interface FolderTreeItemProps {
  node: FolderNode;
  level: number;
}

function FolderTreeItem({
  node,
  level,
  lastAccessed,
  onFolderClick,
  onAddFavorite,
  onRemoveFavorite,
  isFavorite: checkIsFavorite
}: FolderTreeItemProps & {
  lastAccessed?: LastAccessed | null;
  onFolderClick?: (path: string, treeId: string) => void;
  onAddFavorite?: (name: string, path: string) => void;
  onRemoveFavorite?: (path: string) => void;
  isFavorite?: (path: string) => boolean;
}) {
  const { setCurrentFolder, currentFolder } = useFolderContext();
  const { loadImageList } = useImageContext();
  const [isOpen, setIsOpen] = useState(node.isOpen || false);
  const [children, setChildren] = useState<FolderNode[]>(node.children || []);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubdirs, setHasSubdirs] = useState<boolean | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // 서브폴더가 없는 폴더는 다른 폴더로 이동하면 자동으로 닫힘
  useEffect(() => {
    if (hasSubdirs === false && isOpen && currentFolder) {
      const normalizePathForComparison = (path: string) => {
        return normalizePath(path).toLowerCase().replace(/^\\\\\?\\/, '');
      };
      const isCurrentFolder = normalizePathForComparison(node.path) === normalizePathForComparison(currentFolder);

      if (!isCurrentFolder) {
        setIsOpen(false);
      }
    }
  }, [currentFolder, hasSubdirs, isOpen, node.path]);

  useEffect(() => {
    if (node.children !== undefined) {
      setChildren(node.children);
    }
  }, [node.children]);

  // 서브디렉토리 존재 여부 확인
  useEffect(() => {
    const checkSubdirs = async () => {
      if (!node.isCategory && node.children === undefined && !node.isDrive) {
        try {
          const result = await invoke<boolean>("has_subdirectories", { path: node.path });
          setHasSubdirs(result);
        } catch (error) {
          console.warn("Failed to check subdirectories:", node.path, error);
          setHasSubdirs(false);
        }
      }
    };
    checkSubdirs();
  }, [node.path, node.isCategory, node.children, node.isDrive]);

  // 마지막 접근 경로 자동 복원
  useEffect(() => {
    if (!lastAccessed || hasAutoExpanded || node.isCategory || isLoading) {
      return;
    }

    const autoExpand = async () => {
      // treeId가 다르면 자동 확장하지 않음
      if (node.treeId !== lastAccessed.treeId) {
        return;
      }

      // 경로 정규화
      const normalizePathForComparison = (path: string) => {
        return normalizePath(path).toLowerCase().replace(/^\\\\\?\\/, '').replace(/\/+$/, '');
      };

      const normalizedNodePath = normalizePathForComparison(node.path);
      const normalizedLastPath = normalizePathForComparison(lastAccessed.path);

      // 현재 노드가 마지막 접근 경로의 부모이거나 정확히 일치하는지 확인
      const isMatch = normalizedNodePath === normalizedLastPath || normalizedLastPath.startsWith(normalizedNodePath + '/');

      if (!isMatch || isOpen) {
        return;
      }

      setHasAutoExpanded(true);

      // 카테고리나 이미 children이 있는 노드는 단순 펼치기
      if (node.children !== undefined) {
        setIsOpen(true);
        return;
      }

      // 드라이브는 폴더 목록만 로드 (이미지 필터링 없음)
      if (node.isDrive) {
        setIsLoading(true);
        try {
          const entries = await invoke<Array<{ name: string; path: string; isDir: boolean }>>(
            "read_directory_contents",
            { path: node.path }
          );
          const folderNodes: FolderNode[] = entries
            .filter(entry => entry.isDir)
            .map(entry => ({ name: entry.name, path: entry.path, isOpen: false, children: undefined, treeId: node.treeId }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setChildren(folderNodes);
          setIsOpen(true);
        } catch (error) {
          console.error("Failed to read drive:", node.path, error);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // 일반 폴더는 loadFolderContents 사용
      await loadFolderContents();
      setIsOpen(true);
    };

    autoExpand();
  }, [lastAccessed, hasAutoExpanded, node.isCategory, node.path, node.treeId, isOpen, isLoading, node.children, node.isDrive]);

  const loadFolderContents = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const entries = await invoke<Array<{ name: string; path: string; isDir: boolean }>>(
        "read_directory_contents",
        { path: node.path }
      );

      // 폴더와 이미지 파일 분리
      const folderNodes: FolderNode[] = [];
      const imageFiles: string[] = [];

      for (const entry of entries) {
        if (entry.isDir) {
          folderNodes.push({
            name: entry.name,
            path: entry.path,
            isOpen: false,
            children: undefined,
            treeId: node.treeId, // 부모의 treeId 상속
          });
        } else {
          // 이미지 파일인지 확인
          const isImage = IMAGE_EXTENSIONS.some(ext => entry.name.toLowerCase().endsWith(ext.toLowerCase()));
          if (isImage) {
            imageFiles.push(entry.path);
          }
        }
      }

      // 폴더 정렬
      folderNodes.sort((a, b) => a.name.localeCompare(b.name));

      setChildren(folderNodes);
      setImagePaths(imageFiles);

      // 이전 폴더의 모든 백그라운드 작업 즉시 취소
      try {
        await invoke("cancel_hq_thumbnail_generation");
      } catch (error) {
        // 취소 실패는 무시 (이미 완료되었거나 실행 중이 아닐 수 있음)
      }

      // ImageContext와 FolderContext 업데이트
      if (imageFiles.length > 0) {
        // 총 용량 계산
        let totalSize = 0;
        try {
          totalSize = await invoke<number>("calculate_images_total_size", { paths: imageFiles });
        } catch (error) {
          console.error("Failed to calculate total size:", error);
        }

        // Context 업데이트
        setCurrentFolder(node.path, imageFiles.length, totalSize);
        await loadImageList(imageFiles);

        // 마지막 접근 경로 저장
        if (onFolderClick && node.treeId) {
          onFolderClick(node.path, node.treeId);
        }
      } else {
        // 이미지가 없으면 빈 배열로 초기화
        setCurrentFolder(node.path, 0, 0);
        await loadImageList([]);
      }
    } catch (error) {
      console.error("Failed to read directory:", node.path, error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    // 카테고리는 단순 토글
    if (node.isCategory) {
      setIsOpen(!isOpen);
      return;
    }

    // 이미 children이 있으면 단순 토글
    if (node.children !== undefined) {
      setIsOpen(!isOpen);
      return;
    }

    const newIsOpen = !isOpen;

    // 처음 열 때 폴더 내용 로드
    if (newIsOpen && children.length === 0 && !isLoading) {
      await loadFolderContents();
      setIsOpen(true);
    } else {
      // 서브폴더가 없는 폴더는 닫히지 않도록 처리
      // (실제로 펼쳐지지 않았으므로 닫는 동작이 불필요)
      if (!newIsOpen && hasSubdirs === false) {
        // 이미 열려있고 서브폴더가 없으면 Context만 업데이트 (닫지 않음)
        // 즉, 아무것도 하지 않음 (클릭만으로 Context 업데이트는 이미 됨)
        return;
      }

      setIsOpen(newIsOpen);

      // 이미 로드된 데이터가 있으면 다시 Context 업데이트
      if (newIsOpen) {
        // 이전 폴더의 모든 백그라운드 작업 즉시 취소
        try {
          await invoke("cancel_hq_thumbnail_generation");
        } catch (error) {
          // 취소 실패는 무시 (이미 완료되었거나 실행 중이 아닐 수 있음)
        }

        if (imagePaths.length > 0) {
          let totalSize = 0;
          try {
            totalSize = await invoke<number>("calculate_images_total_size", { paths: imagePaths });
          } catch (error) {
            console.error("Failed to calculate total size:", error);
          }

          setCurrentFolder(node.path, imagePaths.length, totalSize);
          await loadImageList(imagePaths);

          // 마지막 접근 경로 저장
          if (onFolderClick && node.treeId) {
            onFolderClick(node.path, node.treeId);
          }
        } else {
          // 이미지가 없으면 빈 배열로 초기화
          setCurrentFolder(node.path, 0, 0);
          await loadImageList([]);
        }
      }
    }
  };

  const hasChildren = node.isCategory || node.isDrive || children.length > 0 || isLoading || node.children !== undefined || hasSubdirs === true;
  const isDrive = node.isDrive || false;

  // 현재 폴더인지 확인 (경로 정규화)
  const normalizePathForComparison = (path: string) => {
    return normalizePath(path).toLowerCase().replace(/^\\\\\?\\/, '');
  };
  const isCurrentFolder = currentFolder && normalizePathForComparison(node.path) === normalizePathForComparison(currentFolder);

  // 컨텍스트 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    // 카테고리는 우클릭 메뉴 없음
    if (node.isCategory) return;

    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleAddFavorite = () => {
    if (onAddFavorite) {
      onAddFavorite(node.name, node.path);
    }
    setContextMenu(null);
  };

  const handleRemoveFavorite = () => {
    if (onRemoveFavorite) {
      onRemoveFavorite(node.path);
    }
    setContextMenu(null);
  };

  const isInFavorites = checkIsFavorite ? checkIsFavorite(node.path) : false;

  const renderIcon = () => {
    if (node.icon === 'computer') {
      return <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />;
    }
    if (node.icon === 'star') {
      return <Star className="h-3.5 w-3.5 flex-shrink-0 text-yellow-400" />;
    }
    if (isDrive) {
      return <HardDrive className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />;
    }
    if (isOpen) {
      return <FolderOpen className={`h-3.5 w-3.5 flex-shrink-0 ${isCurrentFolder ? 'text-blue-500' : 'text-blue-400'}`} />;
    }
    return <Folder className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />;
  };

  return (
    <div className="pr-1">
      <div
        className="flex items-center cursor-pointer group"
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
      >
        {/* 들여쓰기 공간 */}
        <div style={{ width: `${level * 16}px` }} className="flex-shrink-0" />

        {/* 실제 콘텐츠 영역 (선택 바가 여기서 시작) */}
        <div
          className={`flex items-center gap-1 pl-0.5 pr-1 py-0.5 rounded flex-1 min-w-0 ${
            isCurrentFolder
              ? 'bg-blue-900/30 border border-blue-500/50 hover:bg-blue-900/40'
              : 'hover:bg-neutral-800'
          }`}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 ${isCurrentFolder ? 'text-blue-400' : ''}`} />
            ) : (
              <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${isCurrentFolder ? 'text-blue-400' : ''}`} />
            )
          ) : (
            <span className="w-3.5" />
          )}
          {renderIcon()}
          <span className={`text-xs flex-1 truncate ${isCurrentFolder ? 'text-blue-300 font-semibold' : 'text-gray-200'}`}>
            {node.name}
          </span>
        </div>
      </div>
      {isOpen && (
        <div>
          {children.length === 0 && node.icon === 'star' ? (
            <div
              className="px-2 py-2 text-xs text-gray-400 italic"
              style={{ paddingLeft: `${(level + 1) * 14 + 6}px` }}
            >
              폴더에 우클릭하여 즐겨찾기에 추가할 수 있습니다
            </div>
          ) : (
            children.map((child) => (
              <FolderTreeItem
                key={child.path}
                node={child}
                level={level + 1}
                lastAccessed={lastAccessed}
                onFolderClick={onFolderClick}
                onAddFavorite={onAddFavorite}
                onRemoveFavorite={onRemoveFavorite}
                isFavorite={checkIsFavorite}
              />
            ))
          )}
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 z-50 min-w-[10rem]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {isInFavorites || node.isFavorite ? (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-neutral-700 cursor-pointer text-gray-200"
              onClick={handleRemoveFavorite}
            >
              즐겨찾기에서 제거
            </button>
          ) : (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-neutral-700 cursor-pointer text-gray-200"
              onClick={handleAddFavorite}
            >
              즐겨찾기에 추가
            </button>
          )}
        </div>
      )}
    </div>
  );
}

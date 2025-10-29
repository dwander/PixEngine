import { Folder, FolderOpen, ChevronRight, ChevronDown, HardDrive, Monitor } from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { useFolderContext } from "../../contexts/FolderContext";
import { useImageContext } from "../../contexts/ImageContext";

interface FolderNode {
  name: string;
  path: string;
  isOpen?: boolean;
  children?: FolderNode[];
  imageCount?: number;
  isDrive?: boolean;
  isCategory?: boolean;
  icon?: 'computer';
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
}

export function FolderTreePanel() {
  const [rootNodes, setRootNodes] = useState<FolderNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastAccessedPath, setLastAccessedPath] = useState<string | undefined>(undefined);

  useEffect(() => {
    const initialize = async () => {
      await loadRootStructure();
      await loadLastAccessed();
    };
    initialize();
  }, []);

  const loadLastAccessed = async () => {
    try {
      const store = await load("settings.json");
      const stored = await store.get<LastAccessed>("lastAccessed");
      if (stored) {
        setLastAccessedPath(stored.path);
      }
    } catch (error) {
      console.error("Failed to load last accessed:", error);
    }
  };

  const saveLastAccessed = async (path: string) => {
    try {
      const data: LastAccessed = { path };
      const store = await load("settings.json");
      await store.set("lastAccessed", data);
      await store.save();
      setLastAccessedPath(path);
    } catch (error) {
      console.error("Failed to save last accessed:", error);
    }
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
      }));

      // "내 PC" 카테고리
      const myPCNode: FolderNode = {
        name: "내 PC",
        path: "my-pc",
        isOpen: true,
        isCategory: true,
        children: driveNodes,
        icon: "computer",
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
    <div className="h-full bg-neutral-900 overflow-auto p-2">
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
              lastAccessedPath={lastAccessedPath}
              onFolderClick={saveLastAccessed}
            />
          ))}
        </>
      )}
    </div>
  );
}

interface FolderTreeItemProps {
  node: FolderNode;
  level: number;
}

function FolderTreeItem({ node, level, lastAccessedPath, onFolderClick }: FolderTreeItemProps & { lastAccessedPath?: string; onFolderClick?: (path: string) => void }) {
  const { setCurrentFolder, currentFolder } = useFolderContext();
  const { loadImageList } = useImageContext();
  const [isOpen, setIsOpen] = useState(node.isOpen || false);
  const [children, setChildren] = useState<FolderNode[]>(node.children || []);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubdirs, setHasSubdirs] = useState<boolean | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);

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
    if (!lastAccessedPath || hasAutoExpanded || node.isCategory || isLoading) {
      return;
    }

    const autoExpand = async () => {
      // 경로 정규화
      const normalizePath = (path: string) => {
        return path.toLowerCase().replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '');
      };

      const normalizedNodePath = normalizePath(node.path);
      const normalizedLastPath = normalizePath(lastAccessedPath);

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
            .map(entry => ({ name: entry.name, path: entry.path, isOpen: false, children: undefined }))
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
  }, [lastAccessedPath, hasAutoExpanded, node.isCategory, node.path, isOpen, isLoading, node.children, node.isDrive]);

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

      // 이미지가 있으면 ImageContext와 FolderContext 업데이트
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
        if (onFolderClick) {
          onFolderClick(node.path);
        }
      } else {
        setCurrentFolder(node.path, 0, 0);
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
      setIsOpen(newIsOpen);

      // 이미 로드된 이미지가 있으면 다시 Context 업데이트
      if (newIsOpen && imagePaths.length > 0) {
        let totalSize = 0;
        try {
          totalSize = await invoke<number>("calculate_images_total_size", { paths: imagePaths });
        } catch (error) {
          console.error("Failed to calculate total size:", error);
        }

        setCurrentFolder(node.path, imagePaths.length, totalSize);
        await loadImageList(imagePaths);

        // 마지막 접근 경로 저장
        if (onFolderClick) {
          onFolderClick(node.path);
        }
      }
    }
  };

  const hasChildren = node.isCategory || node.isDrive || children.length > 0 || isLoading || node.children !== undefined || hasSubdirs === true;
  const isDrive = node.isDrive || false;

  // 현재 폴더인지 확인 (경로 정규화)
  const normalizePathForComparison = (path: string) => {
    return path.toLowerCase().replace(/\\/g, '/').replace(/^\\\\\?\\/, '');
  };
  const isCurrentFolder = currentFolder && normalizePathForComparison(node.path) === normalizePathForComparison(currentFolder);

  const renderIcon = () => {
    if (node.icon === 'computer') {
      return <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />;
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
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer group ${
          isCurrentFolder
            ? 'bg-blue-900/30 border border-blue-500/50 hover:bg-blue-900/40'
            : 'hover:bg-neutral-800'
        }`}
        style={{ paddingLeft: `${level * 14 + 6}px` }}
        onClick={handleToggle}
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
      {isOpen && (
        <div>
          {children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              lastAccessedPath={lastAccessedPath}
              onFolderClick={onFolderClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

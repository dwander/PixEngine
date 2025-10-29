import { Folder, FolderOpen, ChevronRight, ChevronDown, HardDrive, Monitor } from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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

export function FolderTreePanel() {
  const [rootNodes, setRootNodes] = useState<FolderNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRootStructure();
  }, []);

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

function FolderTreeItem({ node, level }: FolderTreeItemProps) {
  const { setCurrentFolder } = useFolderContext();
  const { loadImageList } = useImageContext();
  const [isOpen, setIsOpen] = useState(node.isOpen || false);
  const [children, setChildren] = useState<FolderNode[]>(node.children || []);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubdirs, setHasSubdirs] = useState<boolean | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);

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
        setIsOpen(true);

        // 이미지가 있으면 ImageContext와 FolderContext 업데이트
        if (imageFiles.length > 0) {
          console.log(`[FolderTree] Loaded ${imageFiles.length} images from ${node.path}`);
          console.log('[FolderTree] Image paths:', imageFiles);

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
        } else {
          console.log(`[FolderTree] No images found in ${node.path}`);
          setCurrentFolder(node.path, 0, 0);
        }
      } catch (error) {
        console.error("Failed to read directory:", node.path, error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsOpen(newIsOpen);

      // 이미 로드된 이미지가 있으면 다시 Context 업데이트
      if (newIsOpen && imagePaths.length > 0) {
        console.log(`[FolderTree] Reloading ${imagePaths.length} images from ${node.path}`);

        let totalSize = 0;
        try {
          totalSize = await invoke<number>("calculate_images_total_size", { paths: imagePaths });
        } catch (error) {
          console.error("Failed to calculate total size:", error);
        }

        setCurrentFolder(node.path, imagePaths.length, totalSize);
        await loadImageList(imagePaths);
      }
    }
  };

  const hasChildren = node.isCategory || node.isDrive || children.length > 0 || isLoading || node.children !== undefined || hasSubdirs === true;
  const isDrive = node.isDrive || false;

  const renderIcon = () => {
    if (node.icon === 'computer') {
      return <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />;
    }
    if (isDrive) {
      return <HardDrive className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />;
    }
    if (isOpen) {
      return <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />;
    }
    return <Folder className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />;
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 hover:bg-neutral-800 rounded cursor-pointer group"
        style={{ paddingLeft: `${level * 14 + 6}px` }}
        onClick={handleToggle}
      >
        {hasChildren ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {renderIcon()}
        <span className="text-xs flex-1 truncate text-gray-200">{node.name}</span>
      </div>
      {isOpen && (
        <div>
          {children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { Folder, FolderOpen, ChevronRight, ChevronDown, HardDrive, Monitor, Star } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { useFolderContext } from "../../contexts/FolderContext";
import { useImageContext } from "../../contexts/ImageContext";
import { ContextMenu } from "../ui/ContextMenu";

interface FolderNode {
  name: string;
  path: string;
  isOpen?: boolean;
  children?: FolderNode[];
  imageCount?: number;
  isLoading?: boolean;
  isDrive?: boolean;
  isCategory?: boolean;
  isFavorite?: boolean;
  icon?: 'computer' | 'star';
  treeId?: string; // 트리 구분용 ID (main, favorites 등)
  isImage?: boolean; // 이미지 파일 여부
}

interface Favorite {
  name: string;
  path: string;
}

interface DriveInfo {
  name: string;
  path: string;
}

interface FolderInfo {
  name: string;
  path: string;
}

const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.svg', '.ico', '.tiff', '.tif', '.heic', '.heif',
  '.JPG', '.JPEG', '.PNG', '.GIF', '.BMP', '.WEBP',
  '.SVG', '.ICO', '.TIFF', '.TIF', '.HEIC', '.HEIF'
];

interface LastAccessed {
  path: string;
  treeId: string;
}

export function FolderTreePanel() {
  const [rootNodes, setRootNodes] = useState<FolderNode[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [lastAccessed, setLastAccessed] = useState<LastAccessed | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      await loadRootStructure();
      await loadFavorites();
      await loadLastAccessed();
    };
    initialize();
  }, []);

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

  const loadLastAccessed = async () => {
    try {
      const store = await load("settings.json");
      const stored = await store.get<LastAccessed>("lastAccessed");
      if (stored) {
        setLastAccessed(stored);
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
      }));

      // "바탕화면" 폴더 가져오기
      let desktopNode: FolderNode | null = null;
      try {
        const desktopInfo = await invoke<FolderInfo | null>("get_desktop_folder");
        if (desktopInfo) {
          desktopNode = {
            name: desktopInfo.name,
            path: desktopInfo.path,
            isOpen: false,
            children: undefined,
            treeId: 'desktop',
          };
        }
      } catch (error) {
        console.error("Failed to load desktop folder:", error);
      }

      // "사진" 폴더 가져오기
      let pictureNode: FolderNode | null = null;
      try {
        const pictureInfo = await invoke<FolderInfo | null>("get_picture_folder");
        if (pictureInfo) {
          pictureNode = {
            name: pictureInfo.name,
            path: pictureInfo.path,
            isOpen: false,
            children: undefined,
            treeId: 'pictures',
          };
        }
      } catch (error) {
        console.error("Failed to load picture folder:", error);
      }

      // "내 PC" 카테고리
      const myPCNode: FolderNode = {
        name: "내 PC",
        path: "my-pc",
        isOpen: true,
        isCategory: true,
        children: driveNodes.map(drive => ({ ...drive, treeId: 'main' })),
        icon: "computer",
        treeId: 'main',
      };

      const nodes = [myPCNode];
      if (desktopNode) {
        nodes.push(desktopNode);
      }
      if (pictureNode) {
        nodes.push(pictureNode);
      }

      setRootNodes(nodes);
    } catch (error) {
      console.error("Failed to load root structure:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full bg-background overflow-auto p-2">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
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
              onAddFavorite={addFavorite}
              onRemoveFavorite={removeFavorite}
              isFavorite={isFavorite}
              lastAccessed={lastAccessed}
              onAccessPath={saveLastAccessed}
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
            onAddFavorite={addFavorite}
            onRemoveFavorite={removeFavorite}
            isFavorite={isFavorite}
            lastAccessed={lastAccessed}
            onAccessPath={saveLastAccessed}
          />
        </>
      )}
    </div>
  );
}

async function loadFolderContents(
  folderPath: string,
  callback: (children: FolderNode[], imageCount: number, imagePaths: string[]) => void
) {
  try {
    const entries = await invoke<Array<{ name: string; path: string; isDir: boolean }>>(
      "read_directory_contents",
      { path: folderPath }
    );

    const children: FolderNode[] = [];
    const imagePaths: string[] = [];
    let imageCount = 0;

    for (const entry of entries) {
      if (entry.isDir) {
        const childFolder: FolderNode = {
          name: entry.name,
          path: entry.path,
          isOpen: false,
          children: undefined,
        };
        children.push(childFolder);
      } else {
        const isImage = IMAGE_EXTENSIONS.some(ext => entry.name.toLowerCase().endsWith(ext));
        if (isImage) {
          imageCount++;
          imagePaths.push(entry.path);
        }
      }
    }

    children.sort((a, b) => a.name.localeCompare(b.name));

    callback(children, imageCount, imagePaths);
  } catch (error) {
    console.error("Failed to read directory:", folderPath, error);
    callback([], 0, []);
  }
}

interface FolderTreeItemProps {
  node: FolderNode;
  level: number;
  onAddFavorite: (name: string, path: string) => void;
  onRemoveFavorite: (path: string) => void;
  isFavorite: (path: string) => boolean;
  lastAccessed: LastAccessed | null;
  onAccessPath: (path: string, treeId: string) => void;
}

function FolderTreeItem({
  node,
  level,
  onAddFavorite,
  onRemoveFavorite,
  isFavorite,
  lastAccessed,
  onAccessPath
}: FolderTreeItemProps) {
  const { setCurrentFolder } = useFolderContext();
  const { loadImageList } = useImageContext();
  const [isOpen, setIsOpen] = useState(node.isOpen || false);
  const [children, setChildren] = useState<FolderNode[]>(node.children || []);
  const [imageCount, setImageCount] = useState(node.imageCount);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubdirs, setHasSubdirs] = useState<boolean | null>(null);

  const hasAutoLoaded = useRef(false);

  useEffect(() => {
    if (!lastAccessed || !node.treeId || !lastAccessed.treeId) return;
    if (hasAutoLoaded.current) return;

    const isSameTree =
      node.treeId === lastAccessed.treeId ||
      lastAccessed.treeId.startsWith(node.treeId);

    if (isSameTree && lastAccessed.path === node.path && !isLoading) {
      hasAutoLoaded.current = true;
      handleToggle();
      return;
    }

    const shouldAutoExpand = isSameTree &&
      lastAccessed.path.startsWith(node.path) &&
      lastAccessed.path !== node.path;

    if (shouldAutoExpand && !isOpen && !isLoading) {
      setIsOpen(true);
      if (children.length === 0 && node.children === undefined) {
        setIsLoading(true);
        loadFolderContents(node.path, (loadedChildren, count, paths) => {
          const childrenWithTreeId = loadedChildren.map(child => ({
            ...child,
            treeId: node.treeId
          }));
          setChildren(childrenWithTreeId);
          setImageCount(count);
          setImagePaths(paths);
          setIsLoading(false);
        });
      }
    }
  }, [lastAccessed, node.path, node.treeId, node.children, isOpen, isLoading, children.length]);

  useEffect(() => {
    if (node.children !== undefined) {
      setChildren(node.children);
    }
    if (node.imageCount !== undefined) {
      setImageCount(node.imageCount);
    }
  }, [node.children, node.imageCount]);

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
    const newIsOpen = !isOpen;

    if (node.isCategory) {
      setIsOpen(newIsOpen);
      return;
    }

    if (node.children !== undefined) {
      setIsOpen(newIsOpen);
      return;
    }

    // hasSubdirs가 아직 null이면 (로딩 중) 아무것도 하지 않음
    if (hasSubdirs === null) {
      return;
    }

    if (hasSubdirs === false) {
      if (node.treeId) {
        onAccessPath(node.path, node.treeId);
      }

      if (imagePaths.length === 0) {
        setIsLoading(true);
        loadFolderContents(node.path, async (_loadedChildren, count, paths) => {
          setImageCount(count);
          setImagePaths(paths);
          setIsLoading(false);

          let totalSize = 0;
          if (paths.length > 0) {
            try {
              totalSize = await invoke<number>("calculate_images_total_size", { paths });
            } catch (error) {
              console.error("Failed to calculate total size:", error);
            }
          }

          setCurrentFolder(node.path, count, totalSize);
          if (paths.length > 0) {
            await loadImageList(paths);
          }
        });
      } else {
        const count = imagePaths.length;
        let totalSize = 0;
        if (imagePaths.length > 0) {
          try {
            totalSize = await invoke<number>("calculate_images_total_size", { paths: imagePaths });
          } catch (error) {
            console.error("Failed to calculate total size:", error);
          }
        }
        setCurrentFolder(node.path, count, totalSize);
        if (imagePaths.length > 0) {
          await loadImageList(imagePaths);
        }
      }
      return;
    }

    if (newIsOpen && children.length === 0 && !isLoading) {
      setIsLoading(true);
      loadFolderContents(node.path, async (loadedChildren, count, paths) => {
        const childrenWithTreeId = loadedChildren.map(child => ({
          ...child,
          treeId: node.treeId
        }));
        setChildren(childrenWithTreeId);
        setImageCount(count);
        setImagePaths(paths);
        setIsLoading(false);
        setIsOpen(true);

        let totalSize = 0;
        if (paths.length > 0) {
          try {
            totalSize = await invoke<number>("calculate_images_total_size", { paths });
          } catch (error) {
            console.error("Failed to calculate total size:", error);
          }
        }

        setCurrentFolder(node.path, count, totalSize);
        if (paths.length > 0) {
          await loadImageList(paths);
        }
      });
    } else {
      setIsOpen(newIsOpen);
      const count = imagePaths.length > 0 ? imagePaths.length : (imageCount || 0);

      let totalSize = 0;
      if (imagePaths.length > 0) {
        try {
          totalSize = await invoke<number>("calculate_images_total_size", { paths: imagePaths });
        } catch (error) {
          console.error("Failed to calculate total size:", error);
        }
      }

      setCurrentFolder(node.path, count, totalSize);
      if (newIsOpen && imagePaths.length > 0) {
        await loadImageList(imagePaths);
      }
    }

    if (!node.isCategory && node.treeId) {
      onAccessPath(node.path, node.treeId);
    }
  };

  const hasChildren = node.isCategory || node.isDrive || children.length > 0 || isLoading || node.children !== undefined || hasSubdirs === true;
  const isDrive = node.isDrive || false;
  const isInFavorites = isFavorite(node.path);
  const isLastAccessed = lastAccessed && lastAccessed.path === node.path && lastAccessed.treeId === node.treeId;

  const renderIcon = () => {
    if (node.icon === 'computer') {
      return <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-primary" />;
    }
    if (node.icon === 'star') {
      return <Star className="h-3.5 w-3.5 flex-shrink-0 text-primary" />;
    }
    if (isDrive) {
      return <HardDrive className="h-3.5 w-3.5 flex-shrink-0 text-primary" />;
    }
    if (isOpen) {
      return <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-primary" />;
    }
    return <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />;
  };

  const contextMenuItems = node.isCategory ? [] : [
    {
      label: isInFavorites || node.isFavorite ? "즐겨찾기에서 제거" : "즐겨찾기에 추가",
      onClick: () => {
        if (isInFavorites || node.isFavorite) {
          onRemoveFavorite(node.path);
        } else {
          onAddFavorite(node.name, node.path);
        }
      }
    }
  ];

  return (
    <div>
      <ContextMenu items={contextMenuItems}>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 hover:bg-accent rounded cursor-pointer group ${isLastAccessed ? 'bg-accent/50' : ''}`}
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
          <span className="text-xs flex-1 truncate">{node.name}</span>
          {node.isFavorite && <Star className="h-2.5 w-2.5 text-primary fill-primary" />}
        </div>
      </ContextMenu>
      {isOpen && (
        <div>
          {children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              onAddFavorite={onAddFavorite}
              onRemoveFavorite={onRemoveFavorite}
              isFavorite={isFavorite}
              lastAccessed={lastAccessed}
              onAccessPath={onAccessPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

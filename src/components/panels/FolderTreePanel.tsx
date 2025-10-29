import { Folder, FolderOpen, ChevronRight, ChevronDown, HardDrive, Monitor } from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FolderNode {
  name: string;
  path: string;
  isOpen?: boolean;
  children?: FolderNode[];
  isDrive?: boolean;
  isCategory?: boolean;
  icon?: 'computer';
}

interface DriveInfo {
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

      setRootNodes([myPCNode]);
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
  const [isOpen, setIsOpen] = useState(node.isOpen || false);
  const [children, setChildren] = useState<FolderNode[]>(node.children || []);

  useEffect(() => {
    if (node.children !== undefined) {
      setChildren(node.children);
    }
  }, [node.children]);

  const handleToggle = async () => {
    if (node.isCategory) {
      setIsOpen(!isOpen);
      return;
    }

    // TODO: 폴더 내용 로드 로직 추가
    setIsOpen(!isOpen);
  };

  const hasChildren = node.isCategory || node.isDrive || children.length > 0;
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

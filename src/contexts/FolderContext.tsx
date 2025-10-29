import { createContext, useContext, useState, ReactNode } from "react";

interface FolderContextType {
  currentFolder: string | null;
  imageCount: number;
  totalSize: number; // bytes 단위
  setCurrentFolder: (path: string | null, count: number, size: number) => void;
}

const FolderContext = createContext<FolderContextType | undefined>(undefined);

export function FolderProvider({ children }: { children: ReactNode }) {
  const [currentFolder, setCurrentFolderState] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);

  const setCurrentFolder = (path: string | null, count: number, size: number) => {
    setCurrentFolderState(path);
    setImageCount(count);
    setTotalSize(size);
  };

  return (
    <FolderContext.Provider value={{ currentFolder, imageCount, totalSize, setCurrentFolder }}>
      {children}
    </FolderContext.Provider>
  );
}

export function useFolderContext() {
  const context = useContext(FolderContext);
  if (context === undefined) {
    throw new Error("useFolderContext must be used within a FolderProvider");
  }
  return context;
}

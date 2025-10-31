import { createContext, useContext, useState, ReactNode } from "react";

interface FolderContextType {
  currentFolder: string | null;
  imageCount: number;
  totalSize: number; // bytes 단위
  isLoading: boolean;
  setCurrentFolder: (path: string | null, count: number, size: number) => void;
  setLoading: (loading: boolean) => void;
}

const FolderContext = createContext<FolderContextType | undefined>(undefined);

export function FolderProvider({ children }: { children: ReactNode }) {
  const [currentFolder, setCurrentFolderState] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const setCurrentFolder = (path: string | null, count: number, size: number) => {
    setCurrentFolderState(path);
    setImageCount(count);
    setTotalSize(size);
  };

  const setLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  return (
    <FolderContext.Provider value={{ currentFolder, imageCount, totalSize, isLoading, setCurrentFolder, setLoading }}>
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

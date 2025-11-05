import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { invoke } from '@tauri-apps/api/core';
import { logError } from '../lib/errorHandler';

// 경량 메타데이터 (정렬용)
export interface LightMetadata {
  path: string;
  file_size?: number;
  modified_time?: string;
  date_taken?: string;
}

interface FolderContextType {
  currentFolder: string | null;
  imageFiles: string[]; // 정렬되지 않은 원본 이미지 리스트
  imageCount: number;
  totalSize: number; // bytes 단위
  isLoading: boolean;
  lightMetadataMap: Map<string, LightMetadata>;
  setFolderImages: (folder: string, files: string[], size: number) => void;
  setLoading: (loading: boolean) => void;
  loadLightMetadata: (imagePaths: string[]) => Promise<void>;
}

const FolderContext = createContext<FolderContextType | undefined>(undefined);

export function FolderProvider({ children }: { children: ReactNode }) {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [lightMetadataMap, setLightMetadataMap] = useState<Map<string, LightMetadata>>(new Map());

  const setFolderImages = (folder: string, files: string[], size: number) => {
    setCurrentFolder(folder);
    setImageFiles(files);
    setImageCount(files.length);
    setTotalSize(size);
    // 폴더 변경 시 메타데이터 맵 초기화
    setLightMetadataMap(new Map());
  };

  const setLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  // 경량 메타데이터 로딩 (백그라운드)
  const loadLightMetadata = useCallback(async (imagePaths: string[]) => {
    if (imagePaths.length === 0) return;

    try {
      const results = await invoke<LightMetadata[]>('get_images_light_metadata', {
        filePaths: imagePaths
      });

      // Map으로 변환
      const newMap = new Map<string, LightMetadata>();
      results.forEach(metadata => {
        newMap.set(metadata.path, metadata);
      });

      setLightMetadataMap(newMap);
    } catch (error) {
      logError(error, 'Load light metadata');
    }
  }, []);

  return (
    <FolderContext.Provider value={{
      currentFolder,
      imageFiles,
      imageCount,
      totalSize,
      isLoading,
      lightMetadataMap,
      setFolderImages,
      setLoading,
      loadLightMetadata,
    }}>
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

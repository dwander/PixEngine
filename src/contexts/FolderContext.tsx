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
  refreshCurrentFolder: () => Promise<void>;
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

  // 현재 폴더 새로고침 (이미지 목록 및 메타데이터 재로드)
  const refreshCurrentFolder = useCallback(async () => {
    if (!currentFolder) return;

    try {
      setIsLoading(true);

      // 폴더의 이미지 파일 목록 다시 가져오기
      const result = await invoke<{ files: string[]; total_size: number }>('scan_folder', {
        folderPath: currentFolder
      });

      setImageFiles(result.files);
      setImageCount(result.files.length);
      setTotalSize(result.total_size);

      // 경량 메타데이터 다시 로드
      if (result.files.length > 0) {
        await loadLightMetadata(result.files);
      } else {
        setLightMetadataMap(new Map());
      }

      console.log(`[FolderContext] Refreshed folder: ${currentFolder} (${result.files.length} images)`);
    } catch (error) {
      logError(error, 'Refresh current folder');
    } finally {
      setIsLoading(false);
    }
  }, [currentFolder, loadLightMetadata]);

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
      refreshCurrentFolder,
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

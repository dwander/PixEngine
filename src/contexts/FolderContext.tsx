import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { logError } from '../lib/errorHandler';

// 경량 메타데이터 (정렬용)
export interface LightMetadata {
  path: string;
  file_size?: number;
  modified_time?: string;
  date_taken?: string;
  rating?: number; // XMP 별점 (0-5)
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
  renameFileInList: (oldPath: string, newPath: string) => void;
  pauseFolderWatch: () => Promise<void>;
  resumeFolderWatch: () => Promise<void>;
}

const FolderContext = createContext<FolderContextType | undefined>(undefined);

export function FolderProvider({ children }: { children: ReactNode }) {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [lightMetadataMap, setLightMetadataMap] = useState<Map<string, LightMetadata>>(new Map());

  const setFolderImages = useCallback((folder: string, files: string[], size: number) => {
    setCurrentFolder(folder);
    setImageFiles(files);
    setImageCount(files.length);
    setTotalSize(size);
    // 폴더 변경 시 메타데이터 맵 초기화
    setLightMetadataMap(new Map());

    // 폴더 변경 시 감시 시작
    invoke('start_folder_watch', { folderPath: folder }).catch((err) => {
      console.error('Failed to start folder watch:', err);
    });
  }, []);

  const setLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  // 파일명 변경 시 로컬 상태 즉시 업데이트
  const renameFileInList = useCallback((oldPath: string, newPath: string) => {
    setImageFiles((prev) => {
      const index = prev.indexOf(oldPath);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = newPath;
      return next;
    });

    // 메타데이터 맵도 업데이트
    setLightMetadataMap((prev) => {
      const metadata = prev.get(oldPath);
      if (!metadata) return prev;
      const next = new Map(prev);
      next.delete(oldPath);
      next.set(newPath, { ...metadata, path: newPath });
      return next;
    });
  }, []);

  // 폴더 감시 일시 중지
  const pauseFolderWatch = useCallback(async () => {
    try {
      await invoke('stop_folder_watch');
    } catch (err) {
      console.error('Failed to pause folder watch:', err);
    }
  }, []);

  // 폴더 감시 재개
  const resumeFolderWatch = useCallback(async () => {
    if (!currentFolder) return;
    try {
      await invoke('start_folder_watch', { folderPath: currentFolder });
    } catch (err) {
      console.error('Failed to resume folder watch:', err);
    }
  }, [currentFolder]);

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
    } catch (error) {
      logError(error, 'Refresh current folder');
    } finally {
      setIsLoading(false);
    }
  }, [currentFolder, loadLightMetadata]);

  // 폴더 변화 이벤트 리스너
  useEffect(() => {
    const unlisten = listen<{ type: string; path: string }>('folder-change', (event) => {
      const { type, path } = event.payload;

      if (type === 'file_added') {
        // 파일 추가: 목록에 추가하고 메타데이터 로드
        setImageFiles((prev) => {
          if (prev.includes(path)) return prev;
          return [...prev, path];
        });
        setImageCount((prev) => prev + 1);

        // 새 파일의 메타데이터 로드
        loadLightMetadata([path]).catch((err) => {
          console.error('Failed to load metadata for new file:', err);
        });
      } else if (type === 'file_removed') {
        // 파일 삭제: 목록에서 제거
        setImageFiles((prev) => prev.filter((f) => f !== path));
        setImageCount((prev) => prev - 1);

        // 메타데이터 맵에서 제거
        setLightMetadataMap((prev) => {
          const newMap = new Map(prev);
          newMap.delete(path);
          return newMap;
        });
      } else if (type === 'file_modified') {
        // 파일 수정: 메타데이터 다시 로드
        loadLightMetadata([path]).catch((err) => {
          console.error('Failed to reload metadata for modified file:', err);
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadLightMetadata]);

  // 컴포넌트 언마운트 시 폴더 감시 중지
  useEffect(() => {
    return () => {
      invoke('stop_folder_watch').catch((err) => {
        console.error('Failed to stop folder watch:', err);
      });
    };
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
      refreshCurrentFolder,
      renameFileInList,
      pauseFolderWatch,
      resumeFolderWatch,
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

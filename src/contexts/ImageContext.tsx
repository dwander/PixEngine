import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { flushSync } from "react-dom";
import { convertFileSrc } from '@tauri-apps/api/core';

interface ImageCacheEntry {
  imageElement: HTMLImageElement;
  timestamp: number;
}

interface ImageContextType {
  currentPath: string | null;
  imageList: string[];
  currentIndex: number;
  loadImageList: (paths: string[]) => Promise<void>;
  loadImage: (path: string) => Promise<void>;
  goToIndex: (index: number) => Promise<void>;
  getCachedImage: (path: string) => HTMLImageElement | undefined;
  preloadImages: (paths: string[]) => Promise<void>;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

// 이미지 캐시 맵 (전역)
const imageCache = new Map<string, ImageCacheEntry>();
const MAX_CACHE_SIZE = 20; // 최대 20개 이미지 캐싱

export function ImageProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // 이미지 캐시에서 가져오기
  const getCachedImage = useCallback((path: string): HTMLImageElement | undefined => {
    const cached = imageCache.get(path);
    if (cached) {
      // 타임스탬프 업데이트 (LRU)
      cached.timestamp = Date.now();
      return cached.imageElement;
    }
    return undefined;
  }, []);

  // 이미지 프리로딩 (백그라운드)
  const preloadImages = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      // 이미 캐시에 있으면 스킵
      if (imageCache.has(path)) continue;

      try {
        // convertFileSrc를 사용하여 asset URL 생성
        const assetUrl = convertFileSrc(path);

        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // 캐시 크기 제한
            if (imageCache.size >= MAX_CACHE_SIZE) {
              // 가장 오래된 항목 제거 (LRU)
              let oldestKey: string | null = null;
              let oldestTime = Date.now();

              for (const [key, entry] of imageCache.entries()) {
                if (entry.timestamp < oldestTime) {
                  oldestTime = entry.timestamp;
                  oldestKey = key;
                }
              }

              if (oldestKey) {
                imageCache.delete(oldestKey);
              }
            }

            // 캐시에 추가
            imageCache.set(path, {
              imageElement: img,
              timestamp: Date.now()
            });
            resolve();
          };
          img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
          img.src = assetUrl;
        });
      } catch (error) {
        console.error(`Failed to preload image: ${path}`, error);
      }
    }
  }, []);

  const loadImage = useCallback(async (path: string) => {
    // 이미지 리스트에서 현재 인덱스 찾기
    const index = imageList.indexOf(path);

    // 상태 업데이트 배칭 (flushSync를 사용하여 동기적으로 업데이트)
    flushSync(() => {
      setCurrentPath(path);
      if (index !== -1) {
        setCurrentIndex(index);
      }
    });

    // 주변 이미지 프리로딩 (백그라운드)
    if (index !== -1) {
      const preloadPaths: string[] = [];

      // 앞 2개
      for (let i = Math.max(0, index - 2); i < index; i++) {
        if (imageList[i]) preloadPaths.push(imageList[i]);
      }

      // 뒤 3개 (현재 + 뒤 2개)
      for (let i = index; i < Math.min(imageList.length, index + 3); i++) {
        if (imageList[i]) preloadPaths.push(imageList[i]);
      }

      // 백그라운드에서 프리로딩 (await 하지 않음)
      preloadImages(preloadPaths).catch(console.error);
    }
  }, [imageList, preloadImages]);

  const loadImageList = useCallback(async (paths: string[]) => {
    setImageList(paths);
    if (paths.length > 0) {
      // 현재 경로가 새 리스트에 있으면 유지
      if (currentPath && paths.indexOf(currentPath) !== -1) {
        const index = paths.indexOf(currentPath);
        setCurrentIndex(index);
      } else {
        // 없으면 첫 번째 이미지 자동 로드
        await loadImage(paths[0]);
      }
    } else {
      // 이미지가 없으면 상태 초기화
      setCurrentPath(null);
      setCurrentIndex(-1);
    }
  }, [currentPath, loadImage]);

  const goToIndex = useCallback(async (index: number) => {
    if (index < 0 || index >= imageList.length) return;

    const path = imageList[index];
    if (path) {
      await loadImage(path);
    }
  }, [imageList, loadImage]);

  return (
    <ImageContext.Provider
      value={{
        currentPath,
        imageList,
        currentIndex,
        loadImage,
        loadImageList,
        goToIndex,
        getCachedImage,
        preloadImages,
      }}
    >
      {children}
    </ImageContext.Provider>
  );
}

export function useImageContext() {
  const context = useContext(ImageContext);
  if (context === undefined) {
    throw new Error("useImageContext must be used within an ImageProvider");
  }
  return context;
}

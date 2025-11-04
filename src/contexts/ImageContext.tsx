import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { logError } from '../lib/errorHandler';
import { IMAGE_CACHE_SIZE, PRELOAD_PREVIOUS_COUNT, PRELOAD_NEXT_COUNT } from '../lib/constants';

interface ImageCacheEntry {
  imageElement: HTMLImageElement;
  timestamp: number;
}

// EXIF 메타데이터 인터페이스
export interface ExifMetadata {
  // 카메라 정보
  camera_make?: string;
  camera_model?: string;
  lens_model?: string;

  // 촬영 설정
  iso?: string;
  aperture?: string;
  shutter_speed?: string;
  focal_length?: string;
  exposure_bias?: string;
  flash?: string;
  metering_mode?: string;
  white_balance?: string;

  // 날짜/시간
  date_time_original?: string;
  date_time_digitized?: string;

  // 이미지 정보
  image_width?: number;
  image_height?: number;
  orientation?: string;
  color_space?: string;

  // GPS 정보
  gps_latitude?: string;
  gps_longitude?: string;
  gps_altitude?: string;

  // 소프트웨어
  software?: string;

  // 저작권
  copyright?: string;
  artist?: string;

  // 추가 정보 (get_image_info에서 가져오는 것들)
  file_size?: number;
  modified_time?: string;
}

interface ImageContextType {
  currentPath: string | null;
  imageList: string[];
  currentIndex: number;
  isLoading: boolean;
  metadata: ExifMetadata | null;
  loadImageList: (paths: string[]) => Promise<void>;
  loadImage: (path: string) => Promise<void>;
  goToIndex: (index: number) => Promise<void>;
  getCachedImage: (path: string) => HTMLImageElement | undefined;
  preloadImages: (paths: string[]) => Promise<void>;
  clearCache: () => void;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export function ImageProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState<ExifMetadata | null>(null);

  // 각 인스턴스별 캐시 (메모리 누수 방지)
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());

  // 캐시 정리 함수
  const clearCache = useCallback(() => {
    imageCacheRef.current.clear();
  }, []);

  // 컴포넌트 언마운트 시 캐시 정리
  useEffect(() => {
    return () => {
      clearCache();
    };
  }, [clearCache]);

  // 이미지 캐시에서 가져오기
  const getCachedImage = useCallback((path: string): HTMLImageElement | undefined => {
    const cached = imageCacheRef.current.get(path);
    if (cached) {
      // 타임스탬프 업데이트 (LRU)
      cached.timestamp = Date.now();
      return cached.imageElement;
    }
    return undefined;
  }, []);

  // 이미지 프리로딩 (백그라운드)
  const preloadImages = useCallback(async (paths: string[]) => {
    const cache = imageCacheRef.current;

    for (const path of paths) {
      // 이미 캐시에 있으면 스킵
      if (cache.has(path)) continue;

      try {
        // convertFileSrc를 사용하여 asset URL 생성
        const assetUrl = convertFileSrc(path);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // 캐시 크기 제한
            if (cache.size >= IMAGE_CACHE_SIZE) {
              // 가장 오래된 항목 제거 (LRU)
              let oldestKey: string | null = null;
              let oldestTime = Date.now();

              for (const [key, entry] of cache.entries()) {
                if (entry.timestamp < oldestTime) {
                  oldestTime = entry.timestamp;
                  oldestKey = key;
                }
              }

              if (oldestKey) {
                cache.delete(oldestKey);
              }
            }

            // 캐시에 추가
            cache.set(path, {
              imageElement: img,
              timestamp: Date.now()
            });
            resolve();
          };
          img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
          img.src = assetUrl;
        });
      } catch (error) {
        logError(error, `Preload image: ${path}`);
      }
    }
  }, []);

  const loadImage = useCallback(async (path: string) => {
    setIsLoading(true);
    try {
      // 이미지 리스트에서 현재 인덱스 찾기
      const index = imageList.indexOf(path);

      // 상태 업데이트 (React 18의 자동 배칭 활용)
      setCurrentPath(path);
      if (index !== -1) {
        setCurrentIndex(index);
      }

      // EXIF 메타데이터 로드 (백그라운드)
      invoke<ExifMetadata>('get_exif_metadata', { filePath: path })
        .then((data) => setMetadata(data))
        .catch((error) => {
          logError(error, 'Load EXIF metadata');
          setMetadata(null);
        });

    // 주변 이미지 프리로딩 (백그라운드)
    if (index !== -1) {
      const preloadPaths: string[] = [];

      // 이전 이미지들
      for (let i = Math.max(0, index - PRELOAD_PREVIOUS_COUNT); i < index; i++) {
        if (imageList[i]) preloadPaths.push(imageList[i]);
      }

      // 다음 이미지들 (현재 포함)
      for (let i = index; i < Math.min(imageList.length, index + PRELOAD_NEXT_COUNT); i++) {
        if (imageList[i]) preloadPaths.push(imageList[i]);
      }

        // 백그라운드에서 프리로딩 (await 하지 않음)
        preloadImages(preloadPaths).catch((error) => logError(error, 'Load image preloading'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [imageList, preloadImages]);

  const loadImageList = useCallback(async (paths: string[]) => {
    // 폴더 변경 시 캐시 정리
    clearCache();

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
  }, [currentPath, loadImage, clearCache]);

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
        isLoading,
        metadata,
        loadImage,
        loadImageList,
        goToIndex,
        getCachedImage,
        preloadImages,
        clearCache,
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

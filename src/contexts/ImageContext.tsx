import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { logError } from '../lib/errorHandler';
import { IMAGE_CACHE_SIZE } from '../lib/constants';

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
  currentSortedIndex: number; // 썸네일 패널의 정렬된 순서 인덱스
  isLoading: boolean;
  metadata: ExifMetadata | null;
  preloadProgress: { loaded: number; total: number } | null;
  loadImage: (path: string, sortedIndex?: number) => Promise<void>;
  getCachedImage: (path: string) => HTMLImageElement | undefined;
  preloadImages: (paths: string[]) => Promise<void>;
  clearCache: () => void;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export function ImageProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [currentSortedIndex, setCurrentSortedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState<ExifMetadata | null>(null);
  const [preloadProgress, setPreloadProgress] = useState<{ loaded: number; total: number } | null>(null);

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
      console.log('💾 [Cache] Retrieved from cache:', path);
      return cached.imageElement;
    }
    console.log('🔍 [Cache] Not found in cache:', path);
    return undefined;
  }, []);

  // 이미지 프리로딩 (백그라운드)
  const preloadImages = useCallback(async (paths: string[]) => {
    const cache = imageCacheRef.current;
    const total = paths.length;

    // 캐시에 이미 있는 이미지 개수 확인
    const cachedCount = paths.filter(path => cache.has(path)).length;

    console.log(`📦 [Preload] Starting: ${cachedCount}/${total} already cached`);

    // 버퍼 상태 업데이트 (완료 후에도 유지)
    setPreloadProgress({ loaded: cachedCount, total });

    // 캐시되지 않은 이미지만 로드
    for (const path of paths) {
      // 이미 캐시에 있으면 스킵
      if (cache.has(path)) {
        continue;
      }

      try {
        console.log(`⬇️ [Preload] Loading:`, path);
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

            // 버퍼 상태 업데이트
            const currentCached = paths.filter(p => cache.has(p)).length;
            console.log(`✅ [Preload] Cached: ${currentCached}/${total}`, path);
            setPreloadProgress({ loaded: currentCached, total });

            resolve();
          };
          img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
          img.src = assetUrl;
        });
      } catch (error) {
        console.error(`❌ [Preload] Failed:`, path, error);
        logError(error, `Preload image: ${path}`);
      }
    }

    // 최종 버퍼 상태 업데이트 (사라지지 않음)
    const finalCached = paths.filter(p => cache.has(p)).length;
    console.log(`🎉 [Preload] Complete: ${finalCached}/${total} cached`);
    setPreloadProgress({ loaded: finalCached, total });
  }, []);

  const loadImage = useCallback(async (path: string, sortedIndex?: number) => {
    setIsLoading(true);
    try {
      // 상태 업데이트
      setCurrentPath(path);
      // 정렬된 인덱스 업데이트 (제공되지 않으면 -1)
      setCurrentSortedIndex(sortedIndex ?? -1);

      // EXIF 메타데이터 로드 (백그라운드)
      invoke<ExifMetadata>('get_exif_metadata', { filePath: path })
        .then((data) => setMetadata(data))
        .catch((error) => {
          logError(error, 'Load EXIF metadata');
          setMetadata(null);
        });
    } finally {
      setIsLoading(false);
    }
  }, []);


  return (
    <ImageContext.Provider
      value={{
        currentPath,
        currentSortedIndex,
        isLoading,
        metadata,
        preloadProgress,
        loadImage,
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

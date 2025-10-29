import { createContext, useContext, useState, useCallback, ReactNode, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ExifData {
  datetime?: string;
  datetime_original?: string;
  camera_make?: string;
  camera_model?: string;
  lens_model?: string;
  focal_length?: number;
  aperture?: number;
  shutter_speed?: string;
  iso?: number;
  orientation: number;
  gps?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  width?: number;
  height?: number;
}

interface ImageContextType {
  currentPath: string | null;
  imageList: string[];
  currentIndex: number;
  exifData: ExifData | null;
  isLoading: boolean;
  error: string | null;
  thumbnailUrlMap: Map<string, string>; // 썸네일 URL 캐시
  thumbnailPreloadProgress: number; // 썸네일 프리로드 진행률 (0-100%)
  setThumbnailUrl: (path: string, url: string) => void;
  setThumbnailPreloadProgress: (progress: number) => void;
  loadImage: (path: string) => Promise<void>;
  loadImageList: (paths: string[]) => Promise<void>;
  loadNext: () => Promise<void>;
  loadPrev: () => Promise<void>;
  loadNextFast: () => void; // EXIF 없이 빠른 이동
  loadPrevFast: () => void; // EXIF 없이 빠른 이동
  goToIndex: (index: number) => Promise<void>;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export function ImageProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const currentIndexRef = useRef(-1); // 실시간 index (점프 방지용)
  const [exifData, setExifData] = useState<ExifData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnailUrlMap] = useState<Map<string, string>>(new Map());
  const [thumbnailPreloadProgress, setThumbnailPreloadProgress] = useState(0);

  const setThumbnailUrl = useCallback((path: string, url: string) => {
    thumbnailUrlMap.set(path, url);
  }, [thumbnailUrlMap]);

  const loadImage = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    setCurrentPath(path);

    try {
      // EXIF 데이터만 로드 (이미지는 브라우저가 직접 로드)
      try {
        const exif = await invoke<ExifData>("get_exif_data", { path });
        setExifData(exif);
      } catch (exifError) {
        console.warn("Failed to load EXIF data:", exifError);
        setExifData(null);
      }

      // 이미지 리스트에서 현재 인덱스 찾기
      if (imageList.length > 0) {
        const index = imageList.indexOf(path);
        if (index !== -1) {
          setCurrentIndex(index);
          currentIndexRef.current = index; // Ref도 동기 업데이트
        }
      }
    } catch (err) {
      const errorMessage = typeof err === "string" ? err : "Failed to load image";
      setError(errorMessage);
      console.error("Failed to load image:", err);
    } finally {
      setIsLoading(false);
    }
  }, [imageList]);

  const loadImageList = useCallback(async (paths: string[]) => {
    setImageList(paths);
    if (paths.length > 0) {
      // 현재 경로가 새 리스트에 있으면 유지
      if (currentPath && paths.indexOf(currentPath) !== -1) {
        const index = paths.indexOf(currentPath);
        setCurrentIndex(index);
        currentIndexRef.current = index;
      } else {
        // 없으면 첫 번째 이미지 자동 로드
        await loadImage(paths[0]);
      }
    }
  }, [currentPath, loadImage]);

  const loadNext = useCallback(async () => {
    if (imageList.length === 0) return;

    // Ref에서 최신 index 읽기 (점프 방지)
    const currentIdx = currentIndexRef.current;
    const nextIndex = (currentIdx + 1) % imageList.length;
    const nextPath = imageList[nextIndex];

    if (nextPath) {
      await loadImage(nextPath);
    }
  }, [imageList, loadImage]);

  const loadPrev = useCallback(async () => {
    if (imageList.length === 0) return;

    // Ref에서 최신 index 읽기 (점프 방지)
    const currentIdx = currentIndexRef.current;
    const prevIndex = currentIdx - 1 < 0 ? imageList.length - 1 : currentIdx - 1;
    const prevPath = imageList[prevIndex];

    if (prevPath) {
      await loadImage(prevPath);
    }
  }, [imageList, loadImage]);

  // 빠른 네비게이션 (EXIF 없이, 고속 모드 전용)
  const loadImageFast = useCallback((path: string, index: number) => {
    setCurrentPath(path);
    setCurrentIndex(index);
    currentIndexRef.current = index; // Ref 동기 업데이트
    // EXIF는 로드하지 않음
  }, []);

  const loadNextFast = useCallback(() => {
    if (imageList.length === 0) return;

    const currentIdx = currentIndexRef.current;
    const nextIndex = (currentIdx + 1) % imageList.length;
    const nextPath = imageList[nextIndex];

    if (nextPath) {
      loadImageFast(nextPath, nextIndex);
    }
  }, [imageList, loadImageFast]);

  const loadPrevFast = useCallback(() => {
    if (imageList.length === 0) return;

    const currentIdx = currentIndexRef.current;
    const prevIndex = currentIdx - 1 < 0 ? imageList.length - 1 : currentIdx - 1;
    const prevPath = imageList[prevIndex];

    if (prevPath) {
      loadImageFast(prevPath, prevIndex);
    }
  }, [imageList, loadImageFast]);

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
        exifData,
        isLoading,
        error,
        thumbnailUrlMap,
        thumbnailPreloadProgress,
        setThumbnailUrl,
        setThumbnailPreloadProgress,
        loadImage,
        loadImageList,
        loadNext,
        loadPrev,
        loadNextFast,
        loadPrevFast,
        goToIndex,
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

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface ImageContextType {
  currentPath: string | null;
  imageList: string[];
  currentIndex: number;
  loadImageList: (paths: string[]) => Promise<void>;
  loadImage: (path: string) => Promise<void>;
  goToIndex: (index: number) => Promise<void>;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export function ImageProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const loadImage = useCallback(async (path: string) => {
    setCurrentPath(path);

    // 이미지 리스트에서 현재 인덱스 찾기
    if (imageList.length > 0) {
      const index = imageList.indexOf(path);
      if (index !== -1) {
        setCurrentIndex(index);
      }
    }
  }, [imageList]);

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

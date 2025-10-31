import { useEffect, useState, useRef, useCallback, memo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useImageContext } from '../../contexts/ImageContext'

interface ImageInfo {
  path: string
  width: number
  height: number
  file_size: number
}

export const ImageViewerPanel = memo(function ImageViewerPanel() {
  const { currentPath, imageList, currentIndex, goToIndex, getCachedImage } = useImageContext()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigationQueueRef = useRef<number[]>([])
  const isProcessingRef = useRef(false)
  const currentImageRef = useRef<HTMLImageElement | null>(null)

  // Canvas에 이미지 렌더링 함수
  const renderImageToCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = currentImageRef.current

    if (!canvas || !container || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 컨테이너 크기 (5px 패딩 적용)
    const containerWidth = container.clientWidth - 10 // 5px * 2
    const containerHeight = container.clientHeight - 10 // 5px * 2

    // 이미지 원본 크기
    const imgWidth = img.width
    const imgHeight = img.height

    // 뷰포트에 맞게 스케일 계산
    const scale = Math.min(
      containerWidth / imgWidth,
      containerHeight / imgHeight,
      1 // 원본보다 크게 확대하지 않음
    )

    // Canvas 표시 크기 (CSS)
    const displayWidth = Math.floor(imgWidth * scale)
    const displayHeight = Math.floor(imgHeight * scale)

    // Canvas 실제 해상도 (고해상도 지원)
    const dpr = window.devicePixelRatio || 1
    canvas.width = displayWidth * dpr
    canvas.height = displayHeight * dpr

    // CSS 크기 설정
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`

    // 고해상도 스케일 적용
    ctx.scale(dpr, dpr)

    // 이미지 그리기
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight)
  }, [])

  // 이미지 로딩 (캐시 우선)
  useEffect(() => {
    if (!currentPath) {
      setImageUrl(null)
      setImageInfo(null)
      setImageLoaded(false)
      return
    }

    async function loadImage() {
      if (!currentPath) return;

      setImageLoaded(false)

      try {
        // 캐시에서 이미지 확인
        const cachedImg = getCachedImage(currentPath);

        // 1. 이미지 정보 가져오기
        const info = await invoke<ImageInfo>('get_image_info', {
          filePath: currentPath,
        })

        setImageInfo(info)

        // 2. 캐시된 이미지가 있으면 즉시 렌더링
        if (cachedImg) {
          currentImageRef.current = cachedImg

          // 다음 프레임에서 렌더링 (DOM 업데이트 후)
          requestAnimationFrame(() => {
            renderImageToCanvas()
            setImageLoaded(true)
          })
        } else {
          // 캐시에 없으면 일반적인 로드 프로세스
          const assetUrl = convertFileSrc(currentPath!)
          setImageUrl(assetUrl)
        }
      } catch (err) {
        console.error('Failed to load image:', err)
      }
    }

    loadImage()
  }, [currentPath, getCachedImage, renderImageToCanvas])

  // Canvas에 이미지 렌더링 (뷰포트에 맞게 리사이즈) - 캐시에 없는 경우
  useEffect(() => {
    if (!imageUrl || !canvasRef.current || !containerRef.current) return

    const img = new Image()
    img.onload = () => {
      currentImageRef.current = img
      renderImageToCanvas()
      setImageLoaded(true)
    }
    img.onerror = () => {
      console.error('Failed to load image:', imageUrl)
    }
    img.src = imageUrl
  }, [imageUrl, renderImageToCanvas])

  // 창 크기 변경 시 다시 렌더링 (ResizeObserver 사용)
  useEffect(() => {
    if (!currentImageRef.current || !containerRef.current) return

    // ResizeObserver는 maximize/minimize를 포함한 모든 크기 변경을 감지
    const resizeObserver = new ResizeObserver(() => {
      renderImageToCanvas()
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [renderImageToCanvas])

  // 이미지 로드 완료 시 다음 큐 항목 처리
  useEffect(() => {
    if (imageLoaded && navigationQueueRef.current.length > 0) {
      // 현재 이미지 렌더링이 완료되면 즉시 다음 이미지로
      const nextIndex = navigationQueueRef.current.shift()!
      isProcessingRef.current = false
      goToIndex(nextIndex)
    } else if (imageLoaded) {
      isProcessingRef.current = false
    }
  }, [imageLoaded, goToIndex])

  return (
    <div
      ref={containerRef}
      className="h-full bg-neutral-900 relative focus:outline-none"
      tabIndex={0}
    >
      {/* 이미지 정보 오버레이 (상단) */}
      {imageInfo && (
        <div className="absolute top-0 left-0 right-0 z-10 m-2.5 text-sm text-neutral-300 flex justify-between items-start" style={{ textShadow: '0 0 8px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9), 2px 2px 4px rgba(0,0,0,0.8)' }}>
          <div>
            {imageInfo.width} x {imageInfo.height}
          </div>
          {imageList.length > 0 && (
            <div>
              {currentIndex + 1} / {imageList.length}
            </div>
          )}
        </div>
      )}

      {/* Canvas로 이미지 렌더링 - 완전 중앙 정렬 */}
      <div className="h-full flex items-center justify-center" style={{ padding: '5px' }}>
        {imageUrl && <canvas ref={canvasRef} />}
      </div>
    </div>
  )
})

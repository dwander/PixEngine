import { useEffect, useState, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useImageContext } from '../../contexts/ImageContext'

interface ImageInfo {
  path: string
  width: number
  height: number
  file_size: number
}

export function ImageViewerPanel() {
  const { currentPath, imageList, currentIndex, goToIndex } = useImageContext()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigationQueueRef = useRef<number[]>([])
  const isProcessingRef = useRef(false)

  useEffect(() => {
    if (!currentPath) {
      setImageUrl(null)
      setImageInfo(null)
      setError(null)
      setImageLoaded(false)
      return
    }

    async function loadImage() {
      setLoading(true)
      setError(null)
      setImageLoaded(false)

      try {
        // 1. 이미지 정보 가져오기
        const info = await invoke<ImageInfo>('get_image_info', {
          filePath: currentPath,
        })

        setImageInfo(info)

        // 2. convertFileSrc로 asset URL 생성
        const assetUrl = convertFileSrc(currentPath)
        setImageUrl(assetUrl)
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }

    loadImage()
  }, [currentPath])

  // Canvas에 이미지 렌더링 (뷰포트에 맞게 리사이즈)
  useEffect(() => {
    if (!imageUrl || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      // 컨테이너 크기
      const containerWidth = container.clientWidth - 32 // padding 제외
      const containerHeight = container.clientHeight - 100 // 정보 영역 제외

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
      setImageLoaded(true)
    }
    img.onerror = () => {
      setError('이미지 로딩 실패')
    }
    img.src = imageUrl
  }, [imageUrl])

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

  // 키보드 네비게이션 - 큐에 추가
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (imageList.length === 0) return

      let targetIndex: number | null = null

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        // 이전 이미지
        const currentOrLast = navigationQueueRef.current.length > 0
          ? navigationQueueRef.current[navigationQueueRef.current.length - 1]
          : currentIndex
        targetIndex = currentOrLast > 0 ? currentOrLast - 1 : imageList.length - 1
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        // 다음 이미지
        const currentOrLast = navigationQueueRef.current.length > 0
          ? navigationQueueRef.current[navigationQueueRef.current.length - 1]
          : currentIndex
        targetIndex = currentOrLast < imageList.length - 1 ? currentOrLast + 1 : 0
      }

      if (targetIndex !== null) {
        if (!isProcessingRef.current) {
          // 처리 중이 아니면 즉시 이동
          isProcessingRef.current = true
          goToIndex(targetIndex)
        } else {
          // 처리 중이면 큐에 추가
          navigationQueueRef.current.push(targetIndex)
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // 키를 떼면 즉시 큐 비우기
        navigationQueueRef.current = []
      }
    }

    // containerRef에 포커스를 주어야 키보드 이벤트를 받을 수 있음
    if (containerRef.current) {
      containerRef.current.focus()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [imageList, currentIndex, goToIndex])

  return (
    <div
      ref={containerRef}
      className="h-full bg-neutral-900 relative focus:outline-none"
      tabIndex={0}
    >
      {/* 이미지 정보 오버레이 (상단) */}
      {imageInfo && (
        <div className="absolute top-0 left-0 right-0 z-10 p-4 text-sm text-neutral-400 flex justify-between items-start bg-gradient-to-b from-black/50 to-transparent">
          <div>
            <div>크기: {imageInfo.width} x {imageInfo.height}</div>
            <div>용량: {(imageInfo.file_size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          {imageList.length > 0 && (
            <div className="text-neutral-500">
              {currentIndex + 1} / {imageList.length}
            </div>
          )}
        </div>
      )}

      {/* Canvas로 이미지 렌더링 - 완전 중앙 정렬 */}
      <div className="h-full flex items-center justify-center p-4">
        {imageUrl && <canvas ref={canvasRef} />}
      </div>
    </div>
  )
}

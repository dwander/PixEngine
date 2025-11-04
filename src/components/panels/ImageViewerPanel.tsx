import { useEffect, useState, useRef, useCallback, memo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useImageContext } from '../../contexts/ImageContext'
import { Check } from 'lucide-react'

interface ImageInfo {
  path: string
  width: number
  height: number
  file_size: number
  modified_time?: string
  date_taken?: string
}

// 측광 모드 아이콘 선택
function getMeteringModeIcon(mode: string | undefined): string {
  if (!mode) return ''
  const lowerMode = mode.toLowerCase()
  if (lowerMode.includes('multi') || lowerMode.includes('matrix') || lowerMode.includes('evaluative')) {
    return '/icons/meterring_multi.svg'
  }
  if (lowerMode.includes('center') || lowerMode.includes('weighted')) {
    return '/icons/meterring_center.svg'
  }
  if (lowerMode.includes('spot')) {
    return '/icons/meterring_spot.svg'
  }
  if (lowerMode.includes('average')) {
    return '/icons/meterring_average.svg'
  }
  return ''
}

// 화이트밸런스 아이콘 선택
function getWhiteBalanceIcon(wb: string | undefined): string {
  if (!wb) return ''
  const lowerWb = wb.toLowerCase()
  if (lowerWb.includes('auto')) {
    return '/icons/wb_auto.svg'
  }
  if (lowerWb.includes('daylight') || lowerWb.includes('sunny')) {
    return '/icons/wb_daylight.svg'
  }
  if (lowerWb.includes('cloudy') || lowerWb.includes('overcast')) {
    return '/icons/wb_cloudy.svg'
  }
  if (lowerWb.includes('shade')) {
    return '/icons/wb_shade.svg'
  }
  if (lowerWb.includes('tungsten') || lowerWb.includes('incandescent')) {
    return '/icons/wb_tungsten.svg'
  }
  if (lowerWb.includes('fluorescent')) {
    return '/icons/wb_Incandescent.svg'
  }
  if (lowerWb.includes('flash')) {
    return '/icons/wb_flash.svg'
  }
  if (lowerWb.includes('kelvin') || lowerWb.includes('manual')) {
    return '/icons/wb_kelvin.svg'
  }
  if (lowerWb.includes('custom')) {
    return '/icons/wb_custom.svg'
  }
  return '/icons/wb_mode.svg'
}

// 플래시 아이콘 선택
function getFlashIcon(flash: string | undefined): string {
  if (!flash) return ''
  const lowerFlash = flash.toLowerCase()
  if (lowerFlash.includes('not fired') || lowerFlash.includes('no flash') || lowerFlash.includes('off')) {
    return '/icons/Flash_off.svg'
  }
  if (lowerFlash.includes('fired') && !lowerFlash.includes('no return')) {
    return '/icons/flash_ttl.svg'
  }
  if (lowerFlash.includes('fired')) {
    return '/icons/flash_on.svg'
  }
  return ''
}

export const ImageViewerPanel = memo(function ImageViewerPanel() {
  const { currentPath, imageList, currentIndex, goToIndex, getCachedImage, metadata } = useImageContext()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigationQueueRef = useRef<number[]>([])
  const isProcessingRef = useRef(false)
  const currentImageRef = useRef<HTMLImageElement | null>(null)

  // 컨텍스트 메뉴 및 표시 옵션
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showShootingInfo, setShowShootingInfo] = useState(() => {
    const saved = localStorage.getItem('imageViewer.showShootingInfo')
    return saved ? JSON.parse(saved) : true
  })
  const [showHistogram, setShowHistogram] = useState(() => {
    const saved = localStorage.getItem('imageViewer.showHistogram')
    return saved ? JSON.parse(saved) : false
  })

  // 컨텍스트 메뉴 핸들러
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // containerRef 기준 상대 좌표로 변환
    const container = containerRef.current
    if (container) {
      const rect = container.getBoundingClientRect()
      setContextMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }, [])

  // 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [contextMenu])

  // 촬영 정보 토글 상태 저장
  useEffect(() => {
    localStorage.setItem('imageViewer.showShootingInfo', JSON.stringify(showShootingInfo))
  }, [showShootingInfo])

  // 히스토그램 토글 상태 저장
  useEffect(() => {
    localStorage.setItem('imageViewer.showHistogram', JSON.stringify(showHistogram))
  }, [showHistogram])

  // Canvas에 이미지 렌더링 함수
  const renderImageToCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = currentImageRef.current

    if (!canvas || !container || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 컨테이너 크기 (패딩 없음, 촬영 정보 바 높이 고려)
    const infoBarHeight = showShootingInfo ? 48 : 0
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight - infoBarHeight

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

    // 컨텍스트 초기화 (기존 transform 제거)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // 고해상도 스케일 적용
    ctx.scale(dpr, dpr)

    // 이미지 그리기
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight)
  }, [showShootingInfo])

  // 컨테이너 리사이즈 핸들러 (ResizeObserver용)
  const handleResize = useCallback(() => {
    if (currentImageRef.current) {
      renderImageToCanvas()
    }
  }, [renderImageToCanvas])

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
    const container = containerRef.current
    if (!container) return

    // ResizeObserver는 maximize/minimize를 포함한 모든 크기 변경을 감지
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [handleResize])

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
    <div className="h-full bg-neutral-900 flex flex-col">
      {/* 메인 뷰어 영역 (Canvas + 오버레이) */}
      <div
        ref={containerRef}
        className="flex-1 relative focus:outline-none"
        tabIndex={0}
        onContextMenu={handleContextMenu}
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
        <div className="h-full flex items-center justify-center">
          <canvas ref={canvasRef} style={{ display: imageUrl ? 'block' : 'none' }} />
        </div>

        {/* 히스토그램 오버레이 (우측 하단) */}
        {showHistogram && (
          <div className="absolute bottom-4 right-4 w-64 h-48 bg-neutral-800/90 border border-neutral-700 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-xs text-gray-400 mb-2">히스토그램</div>
            <div className="flex items-end justify-center h-full text-gray-500 text-xs">
              [구현 예정]
            </div>
          </div>
        )}

        {/* 컨텍스트 메뉴 */}
        {contextMenu && (
          <div
            className="absolute bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-48 z-50"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-neutral-700 flex items-center justify-between"
              onClick={() => {
                setShowShootingInfo(!showShootingInfo)
                setContextMenu(null)
              }}
            >
              <span>촬영 정보</span>
              {showShootingInfo && <Check className="h-4 w-4 text-blue-500" />}
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-neutral-700 flex items-center justify-between"
              onClick={() => {
                setShowHistogram(!showHistogram)
                setContextMenu(null)
              }}
            >
              <span>히스토그램</span>
              {showHistogram && <Check className="h-4 w-4 text-blue-500" />}
            </button>
          </div>
        )}
      </div>

      {/* 촬영 정보 바 (하단 고정) */}
      {showShootingInfo && metadata && (
        <div className="h-12 px-4 flex items-center justify-between text-xs">
          {/* 좌측: 카메라 + 렌즈 정보 (1줄, | 구분) */}
          <div className="flex items-center gap-2 text-gray-300">
            {(metadata.camera_make || metadata.camera_model) && (
              <span>
                {metadata.camera_make && metadata.camera_model
                  ? `${metadata.camera_make} ${metadata.camera_model}`
                  : metadata.camera_model || metadata.camera_make || ''}
              </span>
            )}
            {(metadata.camera_make || metadata.camera_model) && metadata.lens_model && (
              <span className="text-gray-600">|</span>
            )}
            {metadata.lens_model && (
              <span className="text-gray-400">{metadata.lens_model}</span>
            )}
          </div>

          {/* 우측: 촬영 설정 (아이콘 + 값) */}
          <div className="flex items-center gap-4 text-gray-300">
            {/* 셔터 속도 */}
            {metadata.shutter_speed && (
              <div className="flex items-center gap-0.5" title="셔터 속도">
                <img src="/icons/shutter.svg" alt="shutter" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.shutter_speed}</span>
              </div>
            )}

            {/* 조리개 */}
            {metadata.aperture && (
              <div className="flex items-center gap-0.5" title="조리개">
                <img src="/icons/iris.svg" alt="aperture" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.aperture}</span>
              </div>
            )}

            {/* ISO */}
            {metadata.iso && (
              <div className="flex items-center gap-0.5" title="ISO">
                <img src="/icons/iso.svg" alt="ISO" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.iso}</span>
              </div>
            )}

            {/* 초점 거리 */}
            {metadata.focal_length && (
              <div className="flex items-center gap-0.5" title="초점 거리">
                <img src="/icons/focal_length.svg" alt="focal length" style={{ width: '30px', height: '30px' }} className="opacity-60 invert" />
                <span>{metadata.focal_length}</span>
              </div>
            )}

            {/* 노출 보정 */}
            {metadata.exposure_bias && (
              <div className="flex items-center gap-0.5" title="노출 보정">
                <img src="/icons/expose.svg" alt="exposure" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.exposure_bias}</span>
              </div>
            )}

            {/* 플래시 */}
            {metadata.flash && getFlashIcon(metadata.flash) ? (
              <div className="flex items-center gap-0.5" title={metadata.flash}>
                <img src={getFlashIcon(metadata.flash)} alt="flash" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.flash ? (
              <div className="flex items-center gap-0.5" title={metadata.flash}>
                <span>--</span>
              </div>
            ) : null}

            {/* 측광 모드 */}
            {metadata.metering_mode && getMeteringModeIcon(metadata.metering_mode) ? (
              <div className="flex items-center gap-0.5" title={metadata.metering_mode}>
                <img src={getMeteringModeIcon(metadata.metering_mode)} alt="metering" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.metering_mode ? (
              <div className="flex items-center gap-0.5" title={metadata.metering_mode}>
                <span>--</span>
              </div>
            ) : null}

            {/* 화이트밸런스 */}
            {metadata.white_balance && getWhiteBalanceIcon(metadata.white_balance) ? (
              <div className="flex items-center gap-0.5" title={metadata.white_balance}>
                <img src={getWhiteBalanceIcon(metadata.white_balance)} alt="white balance" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.white_balance ? (
              <div className="flex items-center gap-0.5" title={metadata.white_balance}>
                <span>--</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
})

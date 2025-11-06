import { useEffect, useState, useRef, useCallback, memo } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useImageContext } from '../../contexts/ImageContext'
import { Check, Shrink, Expand, X } from 'lucide-react'
import type { HistogramWorkerMessage, HistogramWorkerResult } from '../../workers/histogram.worker'
import { KonvaImageViewer } from '../viewers/KonvaImageViewer'

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
  if (lowerMode.includes('pattern')) {
    return '/icons/meterring_pattern.svg'
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

  // 발광하지 않음: "not fired, no return light detection"으로 시작
  if (lowerFlash.startsWith('not fired') && lowerFlash.includes('no return')) {
    return '/icons/Flash_off.svg'
  }

  // TTL 발광: "fired, return light detected, forced"
  if (lowerFlash.includes('fired') && lowerFlash.includes('return light detected') && lowerFlash.includes('forced')) {
    return '/icons/flash_ttl.svg'
  }

  // 강제 발광: "fired, return light not detected, forced"
  if (lowerFlash.includes('fired') && lowerFlash.includes('return light not detected') && lowerFlash.includes('forced')) {
    return '/icons/flash_on.svg'
  }

  // 기타 발광 상태
  if (lowerFlash.includes('fired')) {
    return '/icons/flash_on.svg'
  }

  return ''
}

interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

interface ImageViewerPanelProps {
  gridType?: 'none' | '3div' | '6div';
  isFullscreenMode?: boolean;
  onToggleFullscreen?: () => void;
}

export const ImageViewerPanel = memo(function ImageViewerPanel({ gridType = 'none', isFullscreenMode = false, onToggleFullscreen }: ImageViewerPanelProps) {
  const { currentPath, getCachedImage, metadata } = useImageContext()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [_imageLoaded, setImageLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentImageRef = useRef<HTMLImageElement | null>(null)
  const histogramCanvasRef = useRef<HTMLCanvasElement>(null)
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null)

  // Web Worker for histogram calculation
  const histogramWorkerRef = useRef<Worker | null>(null)

  // Konva.js viewer container size
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Track fullscreen mode in ref to avoid stale closures
  const isFullscreenModeRef = useRef(isFullscreenMode)

  // Update ref when prop changes and immediately update size
  useEffect(() => {
    isFullscreenModeRef.current = isFullscreenMode

    // 전체화면 모드 변경 시 즉시 크기 업데이트
    if (isFullscreenMode) {
      // 전체화면으로 전환: window 크기 사용
      setContainerSize({
        width: window.innerWidth,
        height: window.innerHeight
      })

      // 확장 모드 진입 시 자동으로 포커스 가져오기
      // setTimeout으로 렌더링 후 포커스 설정
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.focus()
        }
      }, 0)
    }
    // 일반 모드로 복귀: ResizeObserver가 자동으로 감지
  }, [isFullscreenMode])

  // Handle viewer errors
  const handleViewerError = useCallback((error: Error) => {
    console.error('Konva viewer error:', error)
  }, [])

  // 컨텍스트 메뉴 및 표시 옵션
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isFitToScreen, setIsFitToScreen] = useState(true) // 줌 상태 추적
  const suppressContextMenuRef = useRef(false) // 우클릭 줌 해제 후 컨텍스트 메뉴 억제
  const [showShootingInfo, setShowShootingInfo] = useState(() => {
    const saved = localStorage.getItem('imageViewer.showShootingInfo')
    return saved ? JSON.parse(saved) : true
  })
  const [showHistogram, setShowHistogram] = useState(() => {
    const saved = localStorage.getItem('imageViewer.showHistogram')
    return saved ? JSON.parse(saved) : false
  })

  // 줌 상태 변경 핸들러
  const handleZoomStateChange = useCallback((fitToScreen: boolean) => {
    setIsFitToScreen(fitToScreen)
  }, [])

  // 우클릭 줌 해제 핸들러 - 컨텍스트 메뉴 억제
  const handleRightClickZoomReset = useCallback(() => {
    suppressContextMenuRef.current = true
    // 100ms 후 억제 해제
    setTimeout(() => {
      suppressContextMenuRef.current = false
    }, 100)
  }, [])

  // 컨텍스트 메뉴 핸들러 - 스크린 핏 상태일 때만 표시
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // 우클릭 줌 해제 후 억제 중이면 메뉴 표시 안 함
    if (suppressContextMenuRef.current) {
      return
    }

    // 스크린 핏 상태일 때만 컨텍스트 메뉴 표시
    if (!isFitToScreen) {
      return
    }

    // containerRef 기준 상대 좌표로 변환
    const container = containerRef.current
    if (container) {
      const rect = container.getBoundingClientRect()
      setContextMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }, [isFitToScreen])

  // 컨텍스트 메뉴 닫기 (ESC 키만)
  useEffect(() => {
    if (!contextMenu) return

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
      }
    }
    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
  }, [contextMenu])

  // 촬영 정보 토글 상태 저장
  useEffect(() => {
    localStorage.setItem('imageViewer.showShootingInfo', JSON.stringify(showShootingInfo))
  }, [showShootingInfo])

  // 히스토그램 토글 상태 저장
  useEffect(() => {
    localStorage.setItem('imageViewer.showHistogram', JSON.stringify(showHistogram))
  }, [showHistogram])

  // Web Worker 초기화 및 정리
  useEffect(() => {
    // Web Worker 생성
    histogramWorkerRef.current = new Worker(new URL('../../workers/histogram.worker.ts', import.meta.url), {
      type: 'module'
    })

    // Worker 메시지 핸들러
    histogramWorkerRef.current.onmessage = (e: MessageEvent<HistogramWorkerResult>) => {
      setHistogramData(e.data.histogram)
    }

    // 컴포넌트 언마운트 시 Worker 정리
    return () => {
      if (histogramWorkerRef.current) {
        histogramWorkerRef.current.terminate()
        histogramWorkerRef.current = null
      }
    }
  }, [])

  // 히스토그램 계산 함수 (Web Worker로 위임)
  const calculateHistogram = useCallback((img: HTMLImageElement): void => {
    try {
      // 임시 캔버스 생성하여 픽셀 데이터 추출
      const tempCanvas = document.createElement('canvas')
      const sampleSize = 400 // 성능을 위해 다운샘플링
      const aspectRatio = img.width / img.height

      tempCanvas.width = sampleSize
      tempCanvas.height = Math.floor(sampleSize / aspectRatio)

      const ctx = tempCanvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        return
      }

      // CORS 이슈 방지: 이미지 그리기
      ctx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height)

      let imageData
      try {
        imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
      } catch (error) {
        console.warn('Cannot read image data (CORS), skipping histogram calculation')
        return
      }

      // Web Worker로 계산 위임
      if (histogramWorkerRef.current) {
        const message: HistogramWorkerMessage = { imageData }
        histogramWorkerRef.current.postMessage(message)
      }
    } catch (error) {
      console.error('Error preparing histogram calculation:', error)
    }
  }, [])

  // 히스토그램 렌더링 함수
  const renderHistogram = useCallback(() => {
    const canvas = histogramCanvasRef.current
    if (!canvas || !histogramData) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // 캔버스 초기화
    ctx.clearRect(0, 0, width, height)

    // 최대값 찾기 (정규화를 위해)
    const maxRed = Math.max(...histogramData.red)
    const maxGreen = Math.max(...histogramData.green)
    const maxBlue = Math.max(...histogramData.blue)
    const maxLum = Math.max(...histogramData.luminance)
    const maxValue = Math.max(maxRed, maxGreen, maxBlue, maxLum)

    // 히스토그램 그리기 함수
    const drawChannel = (data: number[], color: string, alpha: number) => {
      ctx.globalCompositeOperation = 'lighten'
      ctx.fillStyle = color
      ctx.globalAlpha = alpha

      const barWidth = width / 256

      for (let i = 0; i < 256; i++) {
        const value = data[i]
        const normalizedHeight = (value / maxValue) * height
        const x = i * barWidth
        const y = height - normalizedHeight

        ctx.fillRect(x, y, barWidth, normalizedHeight)
      }
    }

    // 밝기 (회색, 먼저 그림)
    drawChannel(histogramData.luminance, '#ffffff', 0.5)

    // RGB 채널 (블렌딩 모드로 겹쳐서 그림)
    drawChannel(histogramData.red, '#ff0000', 0.7)
    drawChannel(histogramData.green, '#00ff00', 0.7)
    drawChannel(histogramData.blue, '#0000ff', 0.7)

    // 리셋
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1.0
  }, [histogramData])

  // Konva.js가 모든 렌더링을 처리하므로 별도의 Canvas 렌더링 코드 불필요

  // 이미지 URL 설정 (캐시 우선 사용)
  useEffect(() => {
    if (!currentPath) {
      setImageUrl(null)
      setImageLoaded(false)
      return
    }

    setImageLoaded(false)

    // 캐시에서 이미지 확인
    const cachedImg = getCachedImage(currentPath)

    if (cachedImg) {
      // 🟢 캐시 히트: 이미 로드된 HTMLImageElement 사용
      console.log('🟢 [Cache HIT] Using cached image:', currentPath)
      currentImageRef.current = cachedImg
      calculateHistogram(cachedImg)

      // Konva에 전달할 URL 설정 (브라우저 캐시 활용)
      const assetUrl = convertFileSrc(currentPath)
      setImageUrl(assetUrl)
      setImageLoaded(true)
    } else {
      // 🔴 캐시 미스: 새로 로드 필요
      console.log('🔴 [Cache MISS] Loading new image:', currentPath)
      const assetUrl = convertFileSrc(currentPath)

      // 이미지 로드
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        currentImageRef.current = img
        calculateHistogram(img)
        setImageUrl(assetUrl)
        setImageLoaded(true)
      }

      img.onerror = () => {
        console.error('❌ Failed to load image:', currentPath)
        setImageLoaded(false)
      }

      img.src = assetUrl
    }
  }, [currentPath, getCachedImage, calculateHistogram])

  // 히스토그램 데이터 변경 시 렌더링
  useEffect(() => {
    if (histogramData && showHistogram) {
      renderHistogram()
    }
  }, [histogramData, showHistogram, renderHistogram])

  // 창 크기 변경 시 컨테이너 크기 업데이트 (Konva가 자동으로 리렌더링)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      const currentFullscreenMode = isFullscreenModeRef.current

      if (currentFullscreenMode) {
        // 전체화면 모드: window 크기 직접 사용
        setContainerSize({
          width: window.innerWidth,
          height: window.innerHeight
        })
      } else {
        // 일반 모드: containerRef의 가장 가까운 부모 dv-content-container를 찾기
        const dvContainer = container.closest('.dv-content-container')
        if (dvContainer) {
          const rect = dvContainer.getBoundingClientRect()
          setContainerSize({ width: rect.width, height: rect.height })
        } else {
          // fallback to containerRef
          const { width, height } = container.getBoundingClientRect()
          setContainerSize({ width, height })
        }
      }
    }

    // 전체화면 모드에서는 window resize만 감지
    const handleWindowResize = () => {
      if (isFullscreenModeRef.current) {
        updateSize()
      }
    }

    // 같은 dv-content-container를 찾아서 관찰 (closest로 통일)
    const dvContainer = container.closest('.dv-content-container')
    const targetElement = (dvContainer as Element) || container

    // ResizeObserver: 일반 모드에서만 처리
    const resizeObserver = new ResizeObserver(() => {
      // 전체화면 모드에서는 무시 (window resize 이벤트가 처리)
      if (!isFullscreenModeRef.current) {
        updateSize()
      }
    })

    resizeObserver.observe(targetElement)

    // Window resize 이벤트 등록 (전체화면용)
    window.addEventListener('resize', handleWindowResize)

    // Initial size
    updateSize()

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      resizeObserver.disconnect()
    }
  }, [])

  // 이미지 로드 완료 시 다음 큐 항목 처리

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
        <div className="absolute top-0 left-0 right-0 z-10 px-[20px] py-2.5 text-sm text-neutral-300 flex justify-between items-start" style={{ textShadow: '1px 1px 0 rgb(0,0,0)' }}>
          {/* 좌측: 카메라 + 렌즈 정보 */}
          {metadata && (
            <div className="flex items-center gap-2">
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
          )}
          {/* 우측: 전체화면 토글 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFullscreen?.();
            }}
            className="p-1.5 hover:bg-neutral-700/50 rounded-lg transition-all group"
            aria-label={isFullscreenMode ? "전체화면 종료" : "전체화면 확장"}
            title={isFullscreenMode ? "전체화면 종료" : "전체화면 확장"}
          >
            {isFullscreenMode ? (
              <Shrink size={16} className="text-neutral-400/50 group-hover:text-neutral-300 transition-colors" />
            ) : (
              <Expand size={16} className="text-neutral-400/50 group-hover:text-neutral-300 transition-colors" />
            )}
          </button>
        </div>

        {/* Konva.js 이미지 렌더링 */}
        <div className="h-full flex items-center justify-center relative overflow-hidden">
          {containerSize.width > 0 && containerSize.height > 0 && (
            <KonvaImageViewer
              imageUrl={imageUrl}
              gridType={gridType}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              onRenderComplete={() => setImageLoaded(true)}
              onError={handleViewerError}
              onZoomStateChange={handleZoomStateChange}
              onRightClickZoomReset={handleRightClickZoomReset}
              enableHardwareAcceleration={false}
            />
          )}
        </div>

        {/* 컨텍스트 메뉴 */}
        {contextMenu && (
          <div
            className="absolute bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-48 z-50"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {/* 닫기 버튼 */}
            <button
              className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded-full border border-neutral-600 transition-colors"
              onClick={() => setContextMenu(null)}
              aria-label="메뉴 닫기"
            >
              <X size={14} className="text-neutral-300" />
            </button>

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

        {showHistogram && (
          <div className="absolute left-4 bottom-4 w-64 rounded border border-neutral-700 overflow-hidden z-20" style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)', height: '80px' }}>
            <canvas
              ref={histogramCanvasRef}
              width={256}
              height={64}
              className="w-full h-full"
            />
          </div>
        )}

        {showShootingInfo && metadata && (
          <div className="absolute right-4 bottom-4 px-3 py-1 rounded-xl border border-neutral-700 z-20 flex items-center gap-2 text-gray-300" style={{ fontSize: '16px', backgroundColor: 'rgba(0, 0, 0, 0.75)' }}>
            {metadata.shutter_speed && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="셔터 속도">
                <img src="/icons/shutter.svg" alt="shutter" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.shutter_speed}</span>
              </div>
            )}

            {metadata.aperture && (
              <div className="flex items-center gap-0.5" style={{ width: '90px', paddingLeft: '15px' }} title="조리개">
                <img src="/icons/iris.svg" alt="aperture" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.aperture}</span>
              </div>
            )}

            {metadata.iso && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="ISO">
                <img src="/icons/iso.svg" alt="ISO" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.iso}</span>
              </div>
            )}

            {metadata.focal_length && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="초점 거리">
                <img src="/icons/focal_length.svg" alt="focal length" style={{ width: '30px', height: '30px' }} className="opacity-60 invert" />
                <span>{metadata.focal_length}</span>
              </div>
            )}

            {metadata.exposure_bias && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="노출 보정">
                <img src="/icons/expose.svg" alt="exposure" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.exposure_bias}</span>
              </div>
            )}

            {metadata.flash && getFlashIcon(metadata.flash) ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px', marginLeft: '20px' }} title={metadata.flash}>
                <img src={getFlashIcon(metadata.flash)} alt="flash" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.flash ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px', marginLeft: '20px' }} title={metadata.flash}>
                <span>--</span>
              </div>
            ) : null}

            {metadata.metering_mode && getMeteringModeIcon(metadata.metering_mode) ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px' }} title={metadata.metering_mode}>
                <img src={getMeteringModeIcon(metadata.metering_mode)} alt="metering" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.metering_mode ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px' }} title={metadata.metering_mode}>
                <span>--</span>
              </div>
            ) : null}

            {metadata.white_balance && getWhiteBalanceIcon(metadata.white_balance) ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px' }} title={metadata.white_balance}>
                <img src={getWhiteBalanceIcon(metadata.white_balance)} alt="white balance" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.white_balance ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px' }} title={metadata.white_balance}>
                <span>--</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
})

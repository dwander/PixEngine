import { useEffect, useState, useRef, useCallback, memo } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useImageContext } from '../../contexts/ImageContext'
import { useFolderContext } from '../../contexts/FolderContext'
import { Check } from 'lucide-react'
import type { HistogramWorkerMessage, HistogramWorkerResult } from '../../workers/histogram.worker'
import { PixiImageViewer } from '../viewers/PixiImageViewer'
import { isWebGLSupported } from '../../lib/webglUtils'

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
}

export const ImageViewerPanel = memo(function ImageViewerPanel({ gridType = 'none' }: ImageViewerPanelProps) {
  const { currentPath, getCachedImage, metadata } = useImageContext()
  const { imageFiles } = useFolderContext()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [_imageLoaded, setImageLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 현재 이미지 인덱스 계산
  const currentIndex = currentPath ? imageFiles.indexOf(currentPath) : -1
  const currentImageRef = useRef<HTMLImageElement | null>(null)
  const histogramCanvasRef = useRef<HTMLCanvasElement>(null)
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null)

  // Web Worker for histogram calculation
  const histogramWorkerRef = useRef<Worker | null>(null)

  // Grid overlay canvas (separate layer)
  const gridCanvasRef = useRef<HTMLCanvasElement>(null)

  // WebGL support detection and renderer selection
  const [usePixiRenderer, setUsePixiRenderer] = useState<boolean>(() => {
    const webglSupported = isWebGLSupported()
    console.log('WebGL supported:', webglSupported)
    return webglSupported
  })
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Handle Pixi.js errors and fallback to Canvas 2D
  const handlePixiError = useCallback((error: Error) => {
    console.error('Pixi.js error, falling back to Canvas 2D:', error)
    setUsePixiRenderer(false)
  }, [])

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

  // Canvas에 이미지 렌더링 함수
  const renderImageToCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = currentImageRef.current

    if (!canvas || !container || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 컨테이너 크기 (10px 패딩 적용)
    const padding = 10
    const containerWidth = container.clientWidth - (padding * 2)
    const containerHeight = container.clientHeight - (padding * 2)

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
  }, [])

  // 격자선 그리기 함수 (별도 분리) - useRef로 현재 gridType 참조
  const gridTypeRef = useRef(gridType)
  useEffect(() => {
    gridTypeRef.current = gridType
  }, [gridType])

  const drawGridLines = useCallback(() => {
    const imageCanvas = canvasRef.current
    const gridCanvas = gridCanvasRef.current
    const currentGridType = gridTypeRef.current

    if (!imageCanvas || !gridCanvas) return

    const ctx = gridCanvas.getContext('2d')
    if (!ctx) return

    // Grid canvas 크기를 image canvas와 동기화
    if (gridCanvas.width !== imageCanvas.width || gridCanvas.height !== imageCanvas.height) {
      gridCanvas.width = imageCanvas.width
      gridCanvas.height = imageCanvas.height
      gridCanvas.style.width = imageCanvas.style.width
      gridCanvas.style.height = imageCanvas.style.height
    }

    // 기존 격자선 지우기
    ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height)

    // gridType이 'none'이면 여기서 종료 (격자선 없음)
    if (currentGridType === 'none') return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = gridCanvas.width / dpr
    const displayHeight = gridCanvas.height / dpr

    // 고해상도 스케일 적용
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    // 격자선 그리기
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.lineWidth = 2

    if (currentGridType === '3div') {
      // 3분할 격자선 (Rule of Thirds)
      // 수직선 2개
      ctx.beginPath()
      ctx.moveTo(displayWidth / 3, 0)
      ctx.lineTo(displayWidth / 3, displayHeight)
      ctx.moveTo((displayWidth * 2) / 3, 0)
      ctx.lineTo((displayWidth * 2) / 3, displayHeight)
      // 수평선 2개
      ctx.moveTo(0, displayHeight / 3)
      ctx.lineTo(displayWidth, displayHeight / 3)
      ctx.moveTo(0, (displayHeight * 2) / 3)
      ctx.lineTo(displayWidth, (displayHeight * 2) / 3)
      ctx.stroke()
    } else if (currentGridType === '6div') {
      // 6분할 격자선 (긴 축: 6분할, 짧은 축: 3분할)
      const isLandscape = displayWidth > displayHeight
      ctx.beginPath()

      if (isLandscape) {
        // 가로모드: 가로 6분할 (세로선 5개), 세로 3분할 (가로선 2개)
        for (let i = 1; i <= 5; i++) {
          const x = (displayWidth * i) / 6
          ctx.moveTo(x, 0)
          ctx.lineTo(x, displayHeight)
        }
        for (let i = 1; i <= 2; i++) {
          const y = (displayHeight * i) / 3
          ctx.moveTo(0, y)
          ctx.lineTo(displayWidth, y)
        }
      } else {
        // 세로모드: 세로 6분할 (가로선 5개), 가로 3분할 (세로선 2개)
        for (let i = 1; i <= 5; i++) {
          const y = (displayHeight * i) / 6
          ctx.moveTo(0, y)
          ctx.lineTo(displayWidth, y)
        }
        for (let i = 1; i <= 2; i++) {
          const x = (displayWidth * i) / 3
          ctx.moveTo(x, 0)
          ctx.lineTo(x, displayHeight)
        }
      }
      ctx.stroke()
    }
  }, [])

  // 컨테이너 리사이즈 핸들러 (ResizeObserver용)
  const handleResize = useCallback(() => {
    if (currentImageRef.current) {
      // renderImageToCanvas는 캔버스 크기 조정 + 이미지 그리기
      renderImageToCanvas()
      // 격자선은 별도 레이어이므로 항상 다시 그림
      drawGridLines()
    }
  }, [renderImageToCanvas, drawGridLines])

  // 이미지 로딩 (캐시 우선)
  useEffect(() => {
    if (!currentPath) {
      setImageUrl(null)
      setImageLoaded(false)
      return
    }

    async function loadImage() {
      if (!currentPath) return;

      setImageLoaded(false)

      try {
        // 캐시에서 이미지 확인
        const cachedImg = getCachedImage(currentPath);

        // 캐시된 이미지가 있으면 즉시 렌더링
        if (cachedImg) {
          currentImageRef.current = cachedImg

          // 히스토그램 계산 (Web Worker에서 백그라운드 처리)
          calculateHistogram(cachedImg)

          // 다음 프레임에서 렌더링 (DOM 업데이트 후)
          requestAnimationFrame(() => {
            renderImageToCanvas()
            drawGridLines()
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
    // Tauri asset protocol은 CORS를 허용하므로 anonymous로 설정
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      currentImageRef.current = img

      // 히스토그램 계산 (Web Worker에서 백그라운드 처리)
      calculateHistogram(img)

      renderImageToCanvas()
      drawGridLines()
      setImageLoaded(true)
    }
    img.onerror = () => {
      console.error('Failed to load image:', imageUrl)
    }
    img.src = imageUrl
  }, [imageUrl, renderImageToCanvas, calculateHistogram, drawGridLines])

  // gridType 변경 시 격자선만 다시 그리기 (이미지는 재렌더링하지 않음)
  useEffect(() => {
    if (currentImageRef.current && gridCanvasRef.current) {
      drawGridLines()
    }
  }, [gridType, drawGridLines])

  // 히스토그램 데이터 변경 시 렌더링
  useEffect(() => {
    if (histogramData && showHistogram) {
      renderHistogram()
    }
  }, [histogramData, showHistogram, renderHistogram])

  // 창 크기 변경 시 다시 렌더링 (ResizeObserver 사용)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ResizeObserver는 maximize/minimize를 포함한 모든 크기 변경을 감지
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ width, height })
      }
      handleResize()
    })

    resizeObserver.observe(container)

    // Initial size
    setContainerSize({
      width: container.clientWidth,
      height: container.clientHeight
    })

    return () => {
      resizeObserver.disconnect()
    }
  }, [handleResize])

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
          {/* 우측: 이미지 인덱스 */}
          {imageFiles.length > 0 && currentIndex >= 0 && (
            <div>
              {currentIndex + 1} / {imageFiles.length}
            </div>
          )}
        </div>

        {/* Canvas로 이미지 렌더링 - 완전 중앙 정렬 */}
        <div className="h-full flex items-center justify-center relative">
          {usePixiRenderer && containerSize.width > 0 && containerSize.height > 0 ? (
            /* Pixi.js WebGL renderer */
            <PixiImageViewer
              imageUrl={imageUrl}
              gridType={gridType}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              onRenderComplete={() => setImageLoaded(true)}
              onError={handlePixiError}
            />
          ) : (
            /* Fallback Canvas 2D renderer */
            <>
              {/* Image canvas (base layer) */}
              <canvas ref={canvasRef} style={{ display: imageUrl ? 'block' : 'none' }} />
              {/* Grid overlay canvas (separate layer, positioned absolutely) */}
              <canvas
                ref={gridCanvasRef}
                style={{
                  display: imageUrl ? 'block' : 'none',
                  position: 'absolute',
                  pointerEvents: 'none'
                }}
              />
            </>
          )}
        </div>

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

      {/* 하단 정보 바 (히스토그램 + 촬영 정보) */}
      {(showHistogram || (showShootingInfo && metadata)) && (
        <div className="h-12 px-4 flex items-center justify-between relative" style={{ fontSize: '16px' }}>
          {/* 좌측: 히스토그램 (위로 올라가는 구조) */}
          <div className="flex items-center">
            {showHistogram && (
              <div className="absolute left-4 w-64 rounded-lg border border-neutral-700 overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', height: '80px', bottom: '8px' }}>
                <canvas
                  ref={histogramCanvasRef}
                  width={256}
                  height={64}
                  className="w-full h-full"
                />
              </div>
            )}
          </div>

          {/* 우측: 촬영 설정 (아이콘 + 값) */}
          {showShootingInfo && metadata && (
          <div className="flex items-center gap-2 text-gray-300">
            {/* 셔터 속도 */}
            {metadata.shutter_speed && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="셔터 속도">
                <img src="/icons/shutter.svg" alt="shutter" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.shutter_speed}</span>
              </div>
            )}

            {/* 조리개 */}
            {metadata.aperture && (
              <div className="flex items-center gap-0.5" style={{ width: '90px', paddingLeft: '15px' }} title="조리개">
                <img src="/icons/iris.svg" alt="aperture" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.aperture}</span>
              </div>
            )}

            {/* ISO */}
            {metadata.iso && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="ISO">
                <img src="/icons/iso.svg" alt="ISO" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.iso}</span>
              </div>
            )}

            {/* 초점 거리 */}
            {metadata.focal_length && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="초점 거리">
                <img src="/icons/focal_length.svg" alt="focal length" style={{ width: '30px', height: '30px' }} className="opacity-60 invert" />
                <span>{metadata.focal_length}</span>
              </div>
            )}

            {/* 노출 보정 */}
            {metadata.exposure_bias && (
              <div className="flex items-center gap-0.5" style={{ width: '90px' }} title="노출 보정">
                <img src="/icons/expose.svg" alt="exposure" className="w-10 h-10 opacity-60 invert" />
                <span>{metadata.exposure_bias}</span>
              </div>
            )}

            {/* 플래시 */}
            {metadata.flash && getFlashIcon(metadata.flash) ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px', marginLeft: '20px' }} title={metadata.flash}>
                <img src={getFlashIcon(metadata.flash)} alt="flash" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.flash ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px', marginLeft: '20px' }} title={metadata.flash}>
                <span>--</span>
              </div>
            ) : null}

            {/* 측광 모드 */}
            {metadata.metering_mode && getMeteringModeIcon(metadata.metering_mode) ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px' }} title={metadata.metering_mode}>
                <img src={getMeteringModeIcon(metadata.metering_mode)} alt="metering" className="w-10 h-10 opacity-60 invert" />
              </div>
            ) : metadata.metering_mode ? (
              <div className="flex items-center gap-0.5" style={{ width: '50px' }} title={metadata.metering_mode}>
                <span>--</span>
              </div>
            ) : null}

            {/* 화이트밸런스 */}
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
      )}
    </div>
  )
})

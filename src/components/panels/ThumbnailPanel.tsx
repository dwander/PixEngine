import { useEffect, useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Virtuoso } from 'react-virtuoso'
import { Loader2 } from 'lucide-react'
import { useImageContext } from '../../contexts/ImageContext'

interface ThumbnailResult {
  path: string
  thumbnail_base64: string
  width: number
  height: number
  source: 'cache' | 'exif' | 'dct'
  exif_metadata?: ExifMetadata
}

interface ExifMetadata {
  orientation: number
  datetime?: string
  datetime_original?: string
  camera_make?: string
  camera_model?: string
  lens_model?: string
  focal_length?: number
  aperture?: number
  shutter_speed?: string
  iso?: number
  width?: number
  height?: number
}

interface ThumbnailProgress {
  completed: number
  total: number
  current_path: string
}

export function ThumbnailPanel() {
  const { imageList: images, loadImage } = useImageContext()
  const [thumbnails, setThumbnails] = useState<Map<string, ThumbnailResult>>(new Map())
  const [progress, setProgress] = useState<ThumbnailProgress | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hqProgress, setHqProgress] = useState<ThumbnailProgress | null>(null)
  const [isGeneratingHq, setIsGeneratingHq] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [thumbnailSize, setThumbnailSize] = useState(150) // 75-320px
  const [isVertical, setIsVertical] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // 패널 방향 감지
  useEffect(() => {
    const checkOrientation = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        // 세로형: 높이가 너비보다 큼
        setIsVertical(height > width)
      }
    }

    // 초기 방향 체크 (약간 지연)
    const timeoutId = setTimeout(checkOrientation, 0)

    // ResizeObserver로 크기 변화 감지
    const resizeObserver = new ResizeObserver(checkOrientation)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [])

  // 가로 모드에서 마우스 휠로 좌우 스크롤
  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea || isVertical) return

    const handleWheel = (e: WheelEvent) => {
      // 가로 스크롤이 가능한 경우에만 처리
      if (scrollArea.scrollWidth > scrollArea.clientWidth) {
        e.preventDefault()
        scrollArea.scrollLeft += e.deltaY
      }
    }

    scrollArea.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      scrollArea.removeEventListener('wheel', handleWheel)
    }
  }, [isVertical])

  // 스크롤 시 뷰포트 계산 및 업데이트
  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    let timeoutId: NodeJS.Timeout

    const handleScroll = () => {
      // 디바운스: 100ms 후에 처리
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const container = scrollArea.querySelector('div')
        if (!container) return

        const items = container.querySelectorAll('div[data-index]')
        if (items.length === 0) return

        const visibleIndices: number[] = []
        const rect = scrollArea.getBoundingClientRect()

        items.forEach((item) => {
          const itemRect = item.getBoundingClientRect()
          const isVisible =
            itemRect.top < rect.bottom &&
            itemRect.bottom > rect.top &&
            itemRect.left < rect.right &&
            itemRect.right > rect.left

          if (isVisible) {
            const index = parseInt(item.getAttribute('data-index') || '0', 10)
            visibleIndices.push(index)
          }
        })

        if (visibleIndices.length > 0) {
          // HQ 생성 중이면 뷰포트 업데이트
          if (isGeneratingHq) {
            invoke('update_hq_viewport_indices', { indices: visibleIndices }).catch(console.error)
          }
        }
      }, 100)
    }

    scrollArea.addEventListener('scroll', handleScroll, { passive: true })
    // 초기 뷰포트 계산
    handleScroll()

    return () => {
      clearTimeout(timeoutId)
      scrollArea.removeEventListener('scroll', handleScroll)
    }
  }, [isGeneratingHq])

  // 썸네일 생성 시작
  useEffect(() => {
    // 폴더 변경 시 스크롤 위치 초기화
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0
      scrollAreaRef.current.scrollLeft = 0
    }

    if (images.length === 0) {
      setThumbnails(new Map())
      setProgress(null)
      setIsGenerating(false)
      setHqProgress(null)
      setIsGeneratingHq(false)
      // HQ 작업 취소
      invoke('cancel_hq_thumbnail_generation').catch(console.error)
      return
    }

    const startGeneration = async () => {
      try {
        // 이전 HQ 작업 취소 (폴더 변경 시)
        await invoke('cancel_hq_thumbnail_generation')
        setIsGeneratingHq(false)
        setHqProgress(null)

        setIsGenerating(true)
        setProgress({ completed: 0, total: images.length, current_path: '' })

        // 배치 생성 시작
        await invoke('start_thumbnail_generation', {
          imagePaths: images,
        })
      } catch (error) {
        console.error('Failed to start thumbnail generation:', error)
        setIsGenerating(false)
      }
    }

    startGeneration()
  }, [images])

  // 진행률 이벤트 리스너
  useEffect(() => {
    const unlistenProgress = listen<ThumbnailProgress>('thumbnail-progress', (event) => {
      setProgress(event.payload)
    })

    const unlistenCompleted = listen<ThumbnailResult>('thumbnail-completed', (event) => {
      setThumbnails((prev) => {
        const next = new Map(prev)
        next.set(event.payload.path, event.payload)
        return next
      })
    })

    const unlistenAllCompleted = listen('thumbnail-all-completed', async () => {
      setIsGenerating(false)

      // EXIF 썸네일 생성 완료 후 HQ 썸네일 처리
      try {
        // 1. HQ 썸네일 분류 (기존/신규)
        const classification = await invoke<{ existing: string[]; missing: string[] }>(
          'classify_hq_thumbnails',
          {
            imagePaths: images,
          }
        )

        console.log(
          `HQ thumbnails: ${classification.existing.length} existing, ${classification.missing.length} missing`
        )

        setIsGeneratingHq(true)
        setHqProgress({ completed: 0, total: images.length, current_path: '' })

        // 2. 기존 HQ 썸네일 즉시 로드 (유휴 시간 없음)
        if (classification.existing.length > 0) {
          await invoke('load_existing_hq_thumbnails', {
            imagePaths: classification.existing,
          })
        }

        // 3. 신규 HQ 썸네일 생성 시작 (유휴 시간 대기)
        if (classification.missing.length > 0) {
          await invoke('start_hq_thumbnail_generation', {
            imagePaths: classification.missing,
          })
        } else {
          // 모두 기존 HQ라면 로드만 하면 됨
          setIsGeneratingHq(false)
        }
      } catch (error) {
        console.error('Failed to start HQ thumbnail generation:', error)
        setIsGeneratingHq(false)
      }
    })

    // 고화질 썸네일 이벤트 리스너
    const unlistenHqProgress = listen<ThumbnailProgress>('thumbnail-hq-progress', (event) => {
      setHqProgress(event.payload)
    })

    const unlistenHqCompleted = listen<ThumbnailResult>('thumbnail-hq-completed', (event) => {
      setThumbnails((prev) => {
        const next = new Map(prev)
        next.set(event.payload.path, event.payload)
        return next
      })
    })

    const unlistenHqAllCompleted = listen('thumbnail-hq-all-completed', () => {
      setIsGeneratingHq(false)
    })

    const unlistenHqCancelled = listen('thumbnail-hq-cancelled', () => {
      setIsGeneratingHq(false)
    })

    const unlistenHqExistingLoaded = listen('thumbnail-hq-existing-loaded', () => {
      console.log('Existing HQ thumbnails loaded')
    })

    return () => {
      unlistenProgress.then((fn) => fn())
      unlistenCompleted.then((fn) => fn())
      unlistenAllCompleted.then((fn) => fn())
      unlistenHqProgress.then((fn) => fn())
      unlistenHqCompleted.then((fn) => fn())
      unlistenHqAllCompleted.then((fn) => fn())
      unlistenHqCancelled.then((fn) => fn())
      unlistenHqExistingLoaded.then((fn) => fn())
    }
  }, [images])

  // 뷰포트 내 이미지 우선순위 업데이트 (EXIF + HQ)
  const handleVisibleRangeChange = useCallback(
    async (visibleRange: { startIndex: number; endIndex: number }) => {
      const visibleIndices: number[] = []
      for (let i = visibleRange.startIndex; i <= visibleRange.endIndex; i++) {
        visibleIndices.push(i)
      }

      try {
        // EXIF 썸네일 생성 중이면 우선순위 업데이트
        if (isGenerating) {
          await invoke('update_thumbnail_priorities', { visibleIndices })
        }

        // HQ 썸네일 생성 중이면 뷰포트 인덱스 업데이트
        if (isGeneratingHq) {
          await invoke('update_hq_viewport_indices', { indices: visibleIndices })
        }
      } catch (error) {
        console.error('Failed to update viewport:', error)
      }
    },
    [isGenerating, isGeneratingHq]
  )

  // 이미지가 없을 때
  if (images.length === 0) {
    return (
      <div ref={containerRef} className="flex h-full items-center justify-center bg-neutral-900 text-gray-400">
        <p className="text-sm">폴더를 선택하여 이미지를 불러오세요</p>
      </div>
    )
  }

  // EXIF orientation을 CSS transform으로 변환
  const getOrientationTransform = (orientation?: number): string => {
    if (!orientation) return ''
    switch (orientation) {
      case 3:
        return 'rotate(180deg)'
      case 6:
        return 'rotate(90deg)'
      case 8:
        return 'rotate(-90deg)'
      default:
        return ''
    }
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-neutral-900">
      {/* 썸네일 영역 */}
      <div
        ref={scrollAreaRef}
        className={isVertical ? 'flex-1 overflow-auto p-2' : 'flex-1 overflow-x-auto overflow-y-hidden py-2'}
      >
        {/* 세로형: 그리드, 가로형: 한 줄 가로 스크롤 */}
        <div
          className={isVertical ? 'grid gap-2' : 'flex flex-nowrap gap-2 h-full items-center px-2'}
          style={
            isVertical
              ? {
                  gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`,
                }
              : undefined
          }
        >
          {images.map((imagePath, index) => {
            const thumbnail = thumbnails.get(imagePath)
            const transform = thumbnail?.exif_metadata
              ? getOrientationTransform(thumbnail.exif_metadata.orientation)
              : ''

            const isSelected = selectedImage === imagePath

            return (
              <div
                key={imagePath}
                data-index={index}
                className={isVertical ? 'w-full aspect-square' : 'h-full aspect-square flex-shrink-0'}
                onClick={() => {
                  setSelectedImage(imagePath)
                  loadImage(imagePath)
                }}
              >
                <div
                  className={`group relative w-full h-full cursor-pointer overflow-hidden ${
                    isSelected ? 'ring-2 ring-blue-500 rounded-lg' : ''
                  } hover:bg-neutral-800/50 transition-colors`}
                >
                  {thumbnail ? (
                    <img
                      src={`data:image/jpeg;base64,${thumbnail.thumbnail_base64}`}
                      alt={imagePath}
                      className="h-full w-full object-contain"
                      style={{ transform }}
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                    </div>
                  )}

                  {/* 호버 시 파일명 표시 */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="truncate text-xs text-white">{imagePath.split(/[/\\]/).pop()}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 하단 상태 표시 - 세로 모드일 때만 표시 */}
      {isVertical && (
        <div className="border-t border-neutral-700 bg-neutral-800 px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            {/* 진행 상태 - 통합 표시 */}
            <div className="flex items-center gap-2">
              {/* 진행률: HQ 생성 중이면 숫자만 파란색, 아니면 회색 */}
              {(progress || hqProgress) && (
                <>
                  <span className="text-xs whitespace-nowrap">
                    <span className={isGeneratingHq ? 'text-blue-400' : 'text-gray-400'}>
                      {isGeneratingHq ? hqProgress?.completed : progress?.completed}
                    </span>
                    <span className="text-gray-400">
                      /{isGeneratingHq ? hqProgress?.total : progress?.total}
                    </span>
                  </span>
                  {(isGenerating || isGeneratingHq) && (
                    <Loader2 className={`h-3.5 w-3.5 animate-spin ${isGeneratingHq ? 'text-blue-500' : 'text-gray-400'}`} />
                  )}
                </>
              )}
            </div>

            {/* 썸네일 크기 조절 슬라이더 */}
            <div className="flex items-center gap-2 mr-4" style={{ width: '150px' }}>
              <span className="text-xs text-gray-400 whitespace-nowrap">{thumbnailSize}px</span>
              <input
                type="range"
                min="75"
                max="320"
                value={thumbnailSize}
                onChange={(e) => setThumbnailSize(Number(e.target.value))}
                className="flex-1 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
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
  const { imageList: images } = useImageContext()
  const [thumbnails, setThumbnails] = useState<Map<string, ThumbnailResult>>(new Map())
  const [progress, setProgress] = useState<ThumbnailProgress | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // 썸네일 생성 시작
  useEffect(() => {
    if (images.length === 0) {
      setThumbnails(new Map())
      setProgress(null)
      setIsGenerating(false)
      return
    }

    const startGeneration = async () => {
      try {
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

    const unlistenAllCompleted = listen('thumbnail-all-completed', () => {
      setIsGenerating(false)
    })

    return () => {
      unlistenProgress.then((fn) => fn())
      unlistenCompleted.then((fn) => fn())
      unlistenAllCompleted.then((fn) => fn())
    }
  }, [])

  // 뷰포트 내 이미지 우선순위 업데이트
  const handleVisibleRangeChange = useCallback(
    async (visibleRange: { startIndex: number; endIndex: number }) => {
      if (!isGenerating) return

      const visibleIndices: number[] = []
      for (let i = visibleRange.startIndex; i <= visibleRange.endIndex; i++) {
        visibleIndices.push(i)
      }

      try {
        await invoke('update_thumbnail_priorities', { visibleIndices })
      } catch (error) {
        console.error('Failed to update priorities:', error)
      }
    },
    [isGenerating]
  )

  // 이미지가 없을 때
  if (images.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-900 text-gray-400">
        <p className="text-sm">폴더를 선택하여 이미지를 불러오세요</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-neutral-900">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between border-b border-neutral-700 bg-neutral-800 px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span>총 {images.length}개</span>
        </div>
        {progress && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>
              {progress.completed}/{progress.total}
            </span>
            {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </div>
        )}
      </div>

      {/* 썸네일 그리드 */}
      <div className="flex-1 overflow-hidden">
        <Virtuoso
          data={images}
          rangeChanged={handleVisibleRangeChange}
          itemContent={(_index, imagePath) => {
            const thumbnail = thumbnails.get(imagePath)

            return (
              <div className="p-2">
                <div className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-800">
                  {thumbnail ? (
                    <img
                      src={`data:image/jpeg;base64,${thumbnail.thumbnail_base64}`}
                      alt={imagePath}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                    </div>
                  )}

                  {/* 호버 시 파일명 표시 */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="truncate text-xs text-white">
                      {imagePath.split(/[/\\]/).pop()}
                    </p>
                  </div>
                </div>
              </div>
            )
          }}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}

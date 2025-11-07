import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2, Check, ChevronDown, Scissors, Copy, Trash2, Edit3, Star } from 'lucide-react'
import { useImageContext } from '../../contexts/ImageContext'
import { useFolderContext } from '../../contexts/FolderContext'
import { useDebounce } from '../../hooks/useDebounce'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { Store } from '@tauri-apps/plugin-store'
import { logError } from '../../lib/errorHandler'
import { useViewerStore } from '../../store/viewerStore'
import { readImageRating, writeImageRating } from '../../lib/rating'
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuSubmenu } from '../common/ContextMenu'
import { FileConflictDialog, DuplicateFileInfo } from '../common/FileConflictDialog'
import {
  THUMBNAIL_SIZE_DEFAULT,
  THUMBNAIL_SIZE_MIN,
  THUMBNAIL_SIZE_MAX,
  THUMBNAIL_GAP,
  DEBOUNCE_FOCUS_INDEX,
  VIRTUAL_SCROLL_OVERSCAN
} from '../../lib/constants'

type SortField = 'filename' | 'filesize' | 'date_taken' | 'modified_time'
type SortOrder = 'asc' | 'desc'

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

export const ThumbnailPanel = memo(function ThumbnailPanel() {
  const { loadImage, getCachedImage, preloadImages } = useImageContext()
  const { imageFiles, lightMetadataMap, currentFolder } = useFolderContext()
  const isZoomedIn = useViewerStore((state) => state.isZoomedIn)
  const toggleFullscreen = useViewerStore((state) => state.toggleFullscreen)
  const { success, error } = useToast()
  const { showConfirm } = useDialog()
  const [thumbnails, setThumbnails] = useState<Map<string, ThumbnailResult>>(new Map())
  const [progress, setProgress] = useState<ThumbnailProgress | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hqProgress, setHqProgress] = useState<ThumbnailProgress | null>(null)
  const [isGeneratingHq, setIsGeneratingHq] = useState(false)
  const [hqEnabled, setHqEnabled] = useState(false) // HQ 썸네일 생성 체크박스 상태
  const [hqClassification, setHqClassification] = useState<{ existing: string[]; missing: string[] } | null>(null) // HQ 썸네일 분류 결과
  // const [selectedImage, setSelectedImage] = useState<string | null>(null) // 임시 비활성화
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set()) // 다중 선택된 이미지들
  const [cutImages, setCutImages] = useState<Set<string>>(new Set()) // 잘라내기한 이미지들
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null) // Shift 클릭용
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null) // 컨텍스트 메뉴 위치
  const [showRatingSubmenu, setShowRatingSubmenu] = useState(false) // 별점 서브메뉴 표시 여부
  const [conflictDialog, setConflictDialog] = useState<{ file: DuplicateFileInfo; remainingFiles: DuplicateFileInfo[] } | null>(null) // 파일 충돌 다이얼로그
  const [overwriteFiles, setOverwriteFiles] = useState<string[]>([]) // 덮어쓰기할 파일 목록
  const [skipFiles, setSkipFiles] = useState<string[]>([]) // 건너뛸 파일 목록
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_SIZE_DEFAULT)
  const [isVertical, setIsVertical] = useState(true)
  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [showProgressIndicator, setShowProgressIndicator] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const horizontalContentRef = useRef<HTMLDivElement>(null) // 가로 모드 내부 컨테이너
  const [focusedIndex, setFocusedIndex] = useState(0) // 키보드 포커스 인덱스
  const [ratings, setRatings] = useState<Map<string, number>>(new Map()) // 이미지 별점 (경로 -> 0-5)
  const [renamingImage, setRenamingImage] = useState<string | null>(null) // 이름 변경 중인 이미지 경로
  const [newFileName, setNewFileName] = useState('') // 새 파일명

  // 정렬 상태
  const [sortField, setSortField] = useState<SortField>('filename')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 연속 재생 모드 상태
  const [continuousPlayState, setContinuousPlayState] = useState<{
    isActive: boolean
    direction: 'left' | 'right' | 'up' | 'down' | null
  }>({ isActive: false, direction: null })

  // 연속 재생 제어용 ref
  const continuousPlayRef = useRef<{
    animationFrameId: number | null
    lastFrameTime: number
  }>({ animationFrameId: null, lastFrameTime: 0 })

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])


  // 정렬된 이미지 리스트 (ThumbnailPanel 내부에서 독립적으로 관리)
  const sortedImages = useMemo(() => {
    const sorted = [...imageFiles]

    sorted.sort((a, b) => {
      let compareResult = 0

      switch (sortField) {
        case 'filename': {
          const aName = a.split(/[/\\]/).pop()?.toLowerCase() || ''
          const bName = b.split(/[/\\]/).pop()?.toLowerCase() || ''
          compareResult = aName.localeCompare(bName)
          break
        }
        case 'filesize': {
          const aMetadata = lightMetadataMap.get(a)
          const bMetadata = lightMetadataMap.get(b)
          const aSize = aMetadata?.file_size ?? 0
          const bSize = bMetadata?.file_size ?? 0
          compareResult = aSize - bSize
          break
        }
        case 'date_taken': {
          const aMetadata = lightMetadataMap.get(a)
          const bMetadata = lightMetadataMap.get(b)
          const aDate = aMetadata?.date_taken ?? ''
          const bDate = bMetadata?.date_taken ?? ''
          compareResult = aDate.localeCompare(bDate)
          break
        }
        case 'modified_time': {
          const aMetadata = lightMetadataMap.get(a)
          const bMetadata = lightMetadataMap.get(b)
          const aTime = aMetadata?.modified_time ?? ''
          const bTime = bMetadata?.modified_time ?? ''
          compareResult = aTime.localeCompare(bTime)
          break
        }
      }

      return sortOrder === 'asc' ? compareResult : -compareResult
    })

    return sorted
  }, [imageFiles, sortField, sortOrder, lightMetadataMap])

  // imageFiles 변경 (폴더 변경) 시 focusedIndex 초기화 및 첫 이미지 로드
  useEffect(() => {
    setFocusedIndex(0)
    // 첫 번째 이미지를 선택 상태로 초기화
    if (sortedImages.length > 0) {
      setSelectedImages(new Set([sortedImages[0]]))
      setLastSelectedIndex(0)
      loadImage(sortedImages[0], 0)
    } else {
      setSelectedImages(new Set())
      setLastSelectedIndex(null)
    }
  }, [imageFiles, loadImage, sortedImages])

  // 정렬 조건 변경 시 focusedIndex 초기화 및 첫 이미지 로드
  useEffect(() => {
    setFocusedIndex(0)
    if (sortedImages.length > 0) {
      loadImage(sortedImages[0], 0)
    }
  }, [sortField, sortOrder])

  // 썸네일 크기 및 정렬 설정 store에서 로드
  useEffect(() => {
    let store: Store | null = null

    const loadSettings = async () => {
      try {
        store = await Store.load('settings.json')
        const savedSize = await store.get<number>('thumbnailSize')
        if (savedSize !== null && savedSize !== undefined) {
          setThumbnailSize(savedSize)
        }
        const savedSortField = await store.get<SortField>('thumbnailSortField')
        if (savedSortField) {
          setSortField(savedSortField)
        }
        const savedSortOrder = await store.get<SortOrder>('thumbnailSortOrder')
        if (savedSortOrder) {
          setSortOrder(savedSortOrder)
        }
      } catch (error) {
        console.error('Failed to load thumbnail settings:', error)
      }
    }

    loadSettings()

    // cleanup
    return () => {
      store = null
    }
  }, [])

  // 썸네일 설정 변경 시 저장
  useEffect(() => {
    let store: Store | null = null
    let timeoutId: number | undefined

    const saveSettings = async () => {
      try {
        store = await Store.load('settings.json')
        await store.set('thumbnailSize', thumbnailSize)
        await store.set('thumbnailSortField', sortField)
        await store.set('thumbnailSortOrder', sortOrder)
        await store.save()
      } catch (error) {
        console.error('Failed to save thumbnail settings:', error)
      }
    }

    // 디바운스 (500ms 후 저장)
    timeoutId = window.setTimeout(saveSettings, 500)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      store = null
    }
  }, [thumbnailSize, sortField, sortOrder])

  // 패널 방향 및 크기 감지
  useEffect(() => {
    const checkOrientation = () => {
      if (containerRef.current) {
        const { width, height} = containerRef.current.getBoundingClientRect()
        // 세로형: 높이가 너비보다 큼
        setIsVertical(height > width)
        setContainerWidth(width)
        setContainerHeight(height)
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
      // 가로 모드에서는 항상 가로 스크롤 처리
      if (!isVertical) {
        e.preventDefault()
        scrollArea.scrollLeft += e.deltaY
      }
    }

    scrollArea.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      scrollArea.removeEventListener('wheel', handleWheel)
    }
  }, [isVertical, imageFiles.length])

  // 그리드 컬럼 수 계산 (세로 모드)
  const columnCount = useMemo(() => {
    if (!isVertical || containerWidth === 0) return 1
    const gap = 8 // 0.5rem = 8px
    const padding = 16 // p-2 = 0.5rem * 2 = 16px
    const availableWidth = containerWidth - padding
    return Math.max(1, Math.floor((availableWidth + gap) / (thumbnailSize + gap)))
  }, [isVertical, containerWidth, thumbnailSize])

  // 행별로 이미지 그룹화 (세로 모드)
  const rows = useMemo(() => {
    if (!isVertical) return []
    const result: string[][] = []
    for (let i = 0; i < sortedImages.length; i += columnCount) {
      result.push(sortedImages.slice(i, i + columnCount))
    }
    return result
  }, [sortedImages, columnCount, isVertical])

  // 실제 행 높이 계산 (aspect-square를 고려)
  const rowHeight = useMemo(() => {
    if (!isVertical || containerWidth === 0 || columnCount === 0) return thumbnailSize + 8
    const gap = 8
    const padding = 16
    const availableWidth = containerWidth - padding
    const itemWidth = (availableWidth - gap * (columnCount - 1)) / columnCount
    // aspect-square이므로 높이 = 너비
    return itemWidth + gap
  }, [isVertical, containerWidth, columnCount, thumbnailSize])

  // 가상화 설정 (세로 모드)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUAL_SCROLL_OVERSCAN,
    enabled: isVertical,
  })

  // 가로 모드 아이템 크기 상태
  const [horizontalItemSize, setHorizontalItemSize] = useState(THUMBNAIL_SIZE_DEFAULT + THUMBNAIL_GAP)

  // 가로 모드 아이템 크기 측정
  useEffect(() => {
    if (isVertical) return

    const measureSize = () => {
      const contentContainer = horizontalContentRef.current
      if (!contentContainer) return

      const contentHeight = contentContainer.getBoundingClientRect().height
      const gap = 8 // marginRight 0.5rem
      const newSize = contentHeight + gap

      setHorizontalItemSize(newSize)
    }

    // 초기 측정
    const timeoutId = setTimeout(measureSize, 100)

    return () => clearTimeout(timeoutId)
  }, [isVertical, containerHeight, imageFiles.length])

  // 가상화 설정 (가로 모드 - 수평 스크롤)
  const horizontalVirtualizer = useVirtualizer({
    horizontal: true,
    count: sortedImages.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => horizontalItemSize,
    overscan: VIRTUAL_SCROLL_OVERSCAN,
    enabled: !isVertical,
  })

  // rowHeight 변경 시 가상화 재측정 (세로 모드)
  useEffect(() => {
    if (isVertical) {
      rowVirtualizer.measure()
    }
  }, [rowHeight, isVertical, rows.length])

  // horizontalItemSize 변경 시 가상화 재측정 (가로 모드)
  useEffect(() => {
    if (!isVertical) {
      horizontalVirtualizer.measure()
    }
  }, [horizontalItemSize, isVertical])

  // 뷰포트 내 이미지 인덱스 추적 및 HQ 생성 우선순위 업데이트
  useEffect(() => {
    if (!isGeneratingHq) return

    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    let timeoutId: number

    const updateViewportIndices = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const visibleIndices: number[] = []

        if (isVertical) {
          // 세로 모드: 행 기반 가상화
          const virtualRows = rowVirtualizer.getVirtualItems()
          virtualRows.forEach((virtualRow) => {
            const startIndex = virtualRow.index * columnCount
            const endIndex = Math.min(startIndex + columnCount, sortedImages.length)
            for (let i = startIndex; i < endIndex; i++) {
              visibleIndices.push(i)
            }
          })
        } else {
          // 가로 모드: 수평 가상화
          const virtualItems = horizontalVirtualizer.getVirtualItems()
          virtualItems.forEach((item) => {
            visibleIndices.push(item.index)
          })
        }

        if (visibleIndices.length > 0) {
          // 뷰포트 내 썸네일의 전체 경로 추출
          const visiblePaths = visibleIndices.map(i => sortedImages[i]).filter(Boolean)

          invoke('update_hq_viewport_paths', { paths: visiblePaths }).catch((error) =>
            logError(error, 'Update HQ viewport paths')
          )
        }
      }, 100)
    }

    scrollArea.addEventListener('scroll', updateViewportIndices, { passive: true })
    // 초기 뷰포트 계산
    updateViewportIndices()

    return () => {
      clearTimeout(timeoutId)
      scrollArea.removeEventListener('scroll', updateViewportIndices)
    }
  }, [isGeneratingHq, isVertical, columnCount, imageFiles.length])

  // focusedIndex 변경 시 자동 스크롤
  useEffect(() => {
    if (focusedIndex < 0 || focusedIndex >= sortedImages.length) return

    if (isVertical) {
      // 세로 모드: 행으로 스크롤
      const rowIndex = Math.floor(focusedIndex / columnCount)
      rowVirtualizer.scrollToIndex(rowIndex, {
        align: 'auto', // 뷰포트 내에 있으면 스크롤 안함
      })
    } else {
      // 가로 모드: 개별 항목으로 스크롤
      horizontalVirtualizer.scrollToIndex(focusedIndex, {
        align: 'auto',
      })
    }
  }, [focusedIndex, isVertical, columnCount, sortedImages.length, rowVirtualizer, horizontalVirtualizer])

  // focusedIndex를 디바운싱 (연속 재생 모드일 때는 0ms로 즉시 적용)
  const debouncedFocusedIndex = useDebounce(
    focusedIndex,
    continuousPlayState.isActive ? 0 : DEBOUNCE_FOCUS_INDEX
  )

  // 디바운싱된 focusedIndex 변경 시 이미지 자동 로드 및 주변 이미지 프리로드
  useEffect(() => {
    if (debouncedFocusedIndex >= 0 && debouncedFocusedIndex < sortedImages.length) {
      const imagePath = sortedImages[debouncedFocusedIndex]
      loadImage(imagePath, debouncedFocusedIndex)

      // 주변 이미지 프리로드 (앞뒤 5장씩)
      const preloadCount = 5
      const preloadPaths: string[] = []
      for (let i = 1; i <= preloadCount; i++) {
        // 다음 이미지들
        if (debouncedFocusedIndex + i < sortedImages.length) {
          preloadPaths.push(sortedImages[debouncedFocusedIndex + i])
        }
        // 이전 이미지들
        if (debouncedFocusedIndex - i >= 0) {
          preloadPaths.push(sortedImages[debouncedFocusedIndex - i])
        }
      }

      // 프리로드할 이미지가 있으면 백그라운드에서 로드
      if (preloadPaths.length > 0) {
        preloadImages(preloadPaths)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFocusedIndex])

  // 연속 재생 중지 함수
  const stopContinuousPlay = useCallback(() => {
    if (continuousPlayRef.current.animationFrameId !== null) {
      cancelAnimationFrame(continuousPlayRef.current.animationFrameId)
      continuousPlayRef.current.animationFrameId = null
    }
    setContinuousPlayState({ isActive: false, direction: null })
  }, [])

  // 연속 재생 시작 함수 (모든 이미지를 빠짐없이 순차 재생)
  const startContinuousPlay = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    // 이미 실행 중이면 무시
    if (continuousPlayRef.current.animationFrameId !== null) return

    setContinuousPlayState({ isActive: true, direction })

    // 첫 이미지로 이동하여 연속 재생 시작
    // animationFrameId를 1로 설정하여 활성화 표시 (실제 RAF ID는 useEffect에서 관리)
    continuousPlayRef.current.animationFrameId = 1
  }, [])

  // 연속 재생 중 focusedIndex 변경 시 다음 이미지로 자동 이동
  useEffect(() => {
    if (!continuousPlayState.isActive) return
    if (continuousPlayRef.current.animationFrameId === null) return

    const MIN_FRAME_INTERVAL = 83 // 약 83ms (= 최대 12fps)

    // 이전 프레임 시간과 현재 시간 비교하여 최소 간격 보장
    const now = performance.now()
    const elapsed = now - continuousPlayRef.current.lastFrameTime

    // 이미지 로딩 완료 대기 시간 (캐시 미스 시 추가 대기)
    const imagePath = sortedImages[focusedIndex]
    const cachedImage = getCachedImage(imagePath)
    const loadWaitTime = cachedImage ? 0 : 50 // 캐시 미스 시 50ms 추가 대기

    // 최소 프레임 간격을 보장하기 위한 대기 시간 계산
    const frameWaitTime = Math.max(0, MIN_FRAME_INTERVAL - elapsed)
    const totalWaitTime = frameWaitTime + loadWaitTime

    const timer = setTimeout(() => {
      if (!continuousPlayState.isActive) return

      // 다음 인덱스 계산
      let nextIndex = focusedIndex

      if (continuousPlayState.direction === 'left') {
        nextIndex = Math.max(0, focusedIndex - 1)
      } else if (continuousPlayState.direction === 'right') {
        nextIndex = Math.min(sortedImages.length - 1, focusedIndex + 1)
      } else if (continuousPlayState.direction === 'up' && isVertical) {
        nextIndex = Math.max(0, focusedIndex - columnCount)
      } else if (continuousPlayState.direction === 'down' && isVertical) {
        nextIndex = Math.min(sortedImages.length - 1, focusedIndex + columnCount)
      }

      // 경계 체크: 더 이상 이동할 수 없으면 중지
      if (nextIndex === focusedIndex) {
        stopContinuousPlay()
        return
      }

      // 마지막 프레임 시간 업데이트
      continuousPlayRef.current.lastFrameTime = performance.now()

      // 다음 이미지로 이동
      setFocusedIndex(nextIndex)
    }, totalWaitTime)

    return () => clearTimeout(timer)
  }, [focusedIndex, continuousPlayState, sortedImages, isVertical, columnCount, getCachedImage, stopContinuousPlay])

  // 붙여넣기 함수
  const handlePaste = useCallback(async () => {
    if (!currentFolder) {
      error('폴더가 선택되지 않았습니다.')
      return
    }

    try {
      const duplicates = await invoke<DuplicateFileInfo[]>('paste_files_from_clipboard', {
        destinationDir: currentFolder,
        overwriteFiles,
        skipFiles,
      })

      // 중복 파일이 있으면 다이얼로그 표시
      if (duplicates.length > 0) {
        const [first, ...rest] = duplicates
        setConflictDialog({ file: first, remainingFiles: rest })
      } else {
        // 실제로 붙여넣은 파일이 있는지 확인
        // overwrite가 있거나, skip만 있지 않은 경우에만 성공 메시지 표시
        const hasActualPaste = overwriteFiles.length > 0 || skipFiles.length === 0

        if (hasActualPaste) {
          success('파일을 붙여넣었습니다.')
        }

        // 상태 초기화
        setOverwriteFiles([])
        setSkipFiles([])
        setCutImages(new Set())
      }
    } catch (err) {
      error(err as string)
    }
  }, [currentFolder, overwriteFiles, skipFiles, success, error])

  // 파일 충돌 해결 핸들러
  const handleConflictResolve = useCallback(
    async (resolution: 'overwrite' | 'skip' | 'cancel', applyToAll: boolean) => {
      if (!conflictDialog) return

      // 취소
      if (resolution === 'cancel') {
        setConflictDialog(null)
        setOverwriteFiles([])
        setSkipFiles([])
        return
      }

      const { file, remainingFiles } = conflictDialog

      // 모든 파일에 적용
      if (applyToAll) {
        // 모든 충돌 파일 목록 (현재 + 남은 파일들)
        const allConflictFiles = [file, ...remainingFiles].map((f) => f.file_name)

        if (resolution === 'overwrite') {
          const newOverwriteFiles = [...overwriteFiles, ...allConflictFiles]
          setOverwriteFiles(newOverwriteFiles)
          setConflictDialog(null)

          // 업데이트된 값으로 바로 붙여넣기
          try {
            const duplicates = await invoke<DuplicateFileInfo[]>('paste_files_from_clipboard', {
              destinationDir: currentFolder!,
              overwriteFiles: newOverwriteFiles,
              skipFiles,
            })

            if (duplicates.length === 0) {
              success('파일을 붙여넣었습니다.')
              setOverwriteFiles([])
              setSkipFiles([])
              setCutImages(new Set())
            }
          } catch (err) {
            error(err as string)
          }
        } else {
          const newSkipFiles = [...skipFiles, ...allConflictFiles]
          setSkipFiles(newSkipFiles)
          setConflictDialog(null)

          // 업데이트된 값으로 바로 붙여넣기
          try {
            const duplicates = await invoke<DuplicateFileInfo[]>('paste_files_from_clipboard', {
              destinationDir: currentFolder!,
              overwriteFiles,
              skipFiles: newSkipFiles,
            })

            if (duplicates.length === 0) {
              success('파일을 붙여넣었습니다.')
              setOverwriteFiles([])
              setSkipFiles([])
              setCutImages(new Set())
            }
          } catch (err) {
            error(err as string)
          }
        }
      } else {
        // 현재 파일만 처리
        if (resolution === 'overwrite') {
          setOverwriteFiles((prev) => [...prev, file.file_name])
        } else {
          setSkipFiles((prev) => [...prev, file.file_name])
        }

        if (remainingFiles.length > 0) {
          // 다음 충돌 파일 표시
          const [next, ...rest] = remainingFiles
          setConflictDialog({ file: next, remainingFiles: rest })
        } else {
          // 마지막 파일 처리 완료
          setConflictDialog(null)

          // 붙여넣기 재시도
          setTimeout(() => handlePaste(), 0)
        }
      }
    },
    [conflictDialog, handlePaste, overwriteFiles, skipFiles, currentFolder, success, error]
  )

  // 파일명 변경 핸들러
  const handleRename = useCallback(() => {
    // 선택된 이미지가 정확히 1개일 때만
    if (selectedImages.size !== 1) {
      return
    }

    const imagePath = Array.from(selectedImages)[0]
    const fileName = imagePath.split(/[/\\]/).pop() || ''
    const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName

    setRenamingImage(imagePath)
    setNewFileName(fileNameWithoutExt)
  }, [selectedImages])

  // 파일명 변경 완료 핸들러
  const handleRenameComplete = useCallback(async () => {
    if (!renamingImage || !newFileName.trim()) {
      setRenamingImage(null)
      setNewFileName('')
      return
    }

    const oldPath = renamingImage
    const oldFileName = oldPath.split(/[/\\]/).pop() || ''
    const extension = oldFileName.substring(oldFileName.lastIndexOf('.'))
    const newFileNameWithExt = newFileName.trim() + extension

    // 이름이 변경되지 않았으면 취소
    if (newFileNameWithExt === oldFileName) {
      setRenamingImage(null)
      setNewFileName('')
      return
    }

    try {
      const newPath = await invoke<string>('rename_file', {
        oldPath,
        newName: newFileNameWithExt,
      })

      success(`파일명을 변경했습니다.`)

      // 선택 상태 업데이트
      setSelectedImages(new Set([newPath]))

      // 이름 변경 상태 초기화
      setRenamingImage(null)
      setNewFileName('')
    } catch (err) {
      error(err as string)
      setRenamingImage(null)
      setNewFileName('')
    }
  }, [renamingImage, newFileName, success, error])

  // 파일명 변경 취소 핸들러
  const handleRenameCancel = useCallback(() => {
    setRenamingImage(null)
    setNewFileName('')
  }, [])

  // 파일 삭제 핸들러
  const handleDelete = useCallback(async () => {
    const imagesToDelete = Array.from(selectedImages)

    if (imagesToDelete.length === 0) {
      return
    }

    const fileCount = imagesToDelete.length
    let message: string
    if (fileCount === 1) {
      const fileName = imagesToDelete[0].split(/[/\\]/).pop() || '파일'
      message = `${fileName}을(를) 삭제하시겠습니까?`
    } else {
      message = `파일 ${fileCount}개를 삭제하시겠습니까?`
    }

    // 확인 다이얼로그 표시
    const result = await showConfirm(message, {
      confirmText: '삭제',
      cancelText: '취소',
      icon: 'warning',
      dontAskAgainKey: 'deleteFiles',
    })

    if (!result.confirmed) {
      return
    }

    try {
      await invoke('delete_files', { filePaths: imagesToDelete })

      let successMessage: string
      if (fileCount === 1) {
        const fileName = imagesToDelete[0].split(/[/\\]/).pop() || '파일'
        successMessage = `${fileName}을(를) 삭제했습니다.`
      } else {
        successMessage = `파일 ${fileCount}개를 삭제했습니다.`
      }

      success(successMessage)

      // 선택 상태 초기화
      setSelectedImages(new Set())
      setCutImages(new Set())
    } catch (err) {
      error(err as string)
    }
  }, [selectedImages, showConfirm, success, error])

  // 키보드 다운 핸들러 (e.repeat로 탭/홀드 구분)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 패널에 포커스가 없으면 무시 (폴더 트리의 키 이벤트와 충돌 방지)
    if (!scrollAreaRef.current?.contains(document.activeElement)) {
      return
    }

    // Ctrl+C로 클립보드 복사
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault()
      // 선택된 이미지들을 클립보드에 복사
      const imagesToCopy = Array.from(selectedImages)

      if (imagesToCopy.length === 0) {
        return
      }

      const fileCount = imagesToCopy.length

      invoke('copy_files_to_clipboard', { filePaths: imagesToCopy, isCut: false })
        .then(() => {
          let message: string
          if (fileCount === 1) {
            const fileName = imagesToCopy[0].split(/[/\\]/).pop() || '파일'
            message = `${fileName}을(를) 클립보드에 복사했습니다.`
          } else {
            message = `파일 ${fileCount}개를 클립보드에 복사했습니다.`
          }

          // 복사 시에는 잘라내기 상태 초기화
          setCutImages(new Set())

          success(message)
        })
        .catch(() => {
          error('클립보드 복사 실패')
        })

      return
    }

    // Ctrl+X로 클립보드 잘라내기
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault()
      const imagesToCut = Array.from(selectedImages)

      if (imagesToCut.length === 0) {
        return
      }

      const fileCount = imagesToCut.length

      invoke('copy_files_to_clipboard', { filePaths: imagesToCut, isCut: true })
        .then(() => {
          let message: string
          if (fileCount === 1) {
            const fileName = imagesToCut[0].split(/[/\\]/).pop() || '파일'
            message = `${fileName}을(를) 잘라냈습니다.`
          } else {
            message = `파일 ${fileCount}개를 잘라냈습니다.`
          }

          // 잘라낸 이미지 목록 저장 (디밍 효과용)
          setCutImages(new Set(imagesToCut))

          success(message)
        })
        .catch(() => {
          error('클립보드 잘라내기 실패')
        })

      return
    }

    // Ctrl+A로 전체 선택
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      setSelectedImages(new Set(sortedImages))
      return
    }

    // Ctrl+D로 선택 해제
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault()
      setSelectedImages(new Set())
      setCutImages(new Set())
      return
    }

    // Ctrl+I로 선택 반전
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault()
      const newSelection = new Set<string>()
      sortedImages.forEach(img => {
        if (!selectedImages.has(img)) {
          newSelection.add(img)
        }
      })
      setSelectedImages(newSelection)
      return
    }

    // Ctrl+V로 붙여넣기
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault()
      handlePaste()
      return
    }

    // F2 키로 파일명 변경
    if (e.key === 'F2') {
      e.preventDefault()
      handleRename()
      return
    }

    // Delete 키로 파일 삭제 (Ctrl/Cmd 키 없을 때만)
    if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      handleDelete()
      return
    }

    // Enter 키로 확장 모드 진입
    if (e.key === 'Enter') {
      e.preventDefault()
      toggleFullscreen?.()
      return
    }

    // 방향키 처리 (이미지 뷰어가 줌인 상태일 때는 무시)
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      // 이미지 뷰어가 줌인 상태면 방향키를 썸네일 네비게이션에 사용하지 않음
      if (isZoomedIn) {
        return
      }

      e.preventDefault()

      // 단일 탭: e.repeat === false
      if (!e.repeat) {
        // 연속 재생 모드 종료 (혹시 모를 상태 정리)
        stopContinuousPlay()

        // 즉시 이동 (현재 동작 유지)
        if (e.key === 'ArrowLeft') {
          setFocusedIndex(prev => Math.max(0, prev - 1))
        } else if (e.key === 'ArrowRight') {
          setFocusedIndex(prev => Math.min(sortedImages.length - 1, prev + 1))
        } else if (e.key === 'ArrowUp' && isVertical) {
          setFocusedIndex(prev => Math.max(0, prev - columnCount))
        } else if (e.key === 'ArrowDown' && isVertical) {
          setFocusedIndex(prev => Math.min(sortedImages.length - 1, prev + columnCount))
        }
      }
      // 연속 재생: e.repeat === true
      else {
        const direction = e.key === 'ArrowLeft' ? 'left'
                        : e.key === 'ArrowRight' ? 'right'
                        : e.key === 'ArrowUp' ? 'up'
                        : 'down'

        startContinuousPlay(direction)
      }
      return
    }

    // 나머지 키들 (Home, End, PageUp/Down, 검색)
    if (e.key === 'Home') {
      e.preventDefault()
      setFocusedIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setFocusedIndex(sortedImages.length - 1)
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      if (isVertical) {
        const virtualRows = rowVirtualizer.getVirtualItems()
        if (virtualRows.length > 0) {
          const firstRowIndex = virtualRows[0].index
          const firstVisibleIndex = firstRowIndex * columnCount
          setFocusedIndex(Math.max(0, firstVisibleIndex))
        }
      } else {
        const virtualItems = horizontalVirtualizer.getVirtualItems()
        if (virtualItems.length > 0) {
          setFocusedIndex(virtualItems[0].index)
        }
      }
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      if (isVertical) {
        const virtualRows = rowVirtualizer.getVirtualItems()
        if (virtualRows.length > 0) {
          const lastRowIndex = virtualRows[virtualRows.length - 1].index
          const lastVisibleIndex = Math.min(sortedImages.length - 1, (lastRowIndex + 1) * columnCount - 1)
          setFocusedIndex(lastVisibleIndex)
        }
      } else {
        const virtualItems = horizontalVirtualizer.getVirtualItems()
        if (virtualItems.length > 0) {
          setFocusedIndex(virtualItems[virtualItems.length - 1].index)
        }
      }
    } else if (e.key.length === 1 && /^[0-5]$/.test(e.key)) {
      // 0-5 숫자 키: 선택된 이미지들에 별점 설정
      e.preventDefault()

      const rating = parseInt(e.key, 10)
      const imagesToRate = Array.from(selectedImages)

      // 선택된 이미지가 없으면 현재 포커스된 이미지에 별점 설정
      if (imagesToRate.length === 0 && sortedImages[focusedIndex]) {
        imagesToRate.push(sortedImages[focusedIndex])
      }

      // 모든 선택된 이미지에 별점 설정 (순차 처리 - 파일 잠금 문제 방지)
      ;(async () => {
        for (const filePath of imagesToRate) {
          try {
            await writeImageRating(filePath, rating)
            // rating-changed 이벤트는 백엔드에서 발생하므로 자동으로 UI 업데이트됨
          } catch (error) {
            console.error(`Failed to set rating for ${filePath}:`, error)
          }
        }
      })()
    } else if (e.key.length === 1 && /^[a-zA-Z6-9]$/.test(e.key)) {
      // 알파벳/6-9 숫자 키: 단일 문자로 시작하는 다음 파일 검색
      e.preventDefault()

      const searchChar = e.key.toLowerCase()

      // 파일명에서 basename 추출
      const getBasename = (path: string) => {
        const parts = path.split(/[/\\]/)
        return parts[parts.length - 1].toLowerCase()
      }

      // 현재 위치 다음부터 검색
      let foundIndex = -1
      for (let i = focusedIndex + 1; i < sortedImages.length; i++) {
        if (getBasename(sortedImages[i]).startsWith(searchChar)) {
          foundIndex = i
          break
        }
      }

      // 못 찾으면 처음부터 현재 위치까지 검색 (순환)
      if (foundIndex === -1) {
        for (let i = 0; i <= focusedIndex; i++) {
          if (getBasename(sortedImages[i]).startsWith(searchChar)) {
            foundIndex = i
            break
          }
        }
      }

      // 찾았으면 이동
      if (foundIndex !== -1) {
        setFocusedIndex(foundIndex)
      }
    }
  }, [isZoomedIn, sortedImages, focusedIndex, isVertical, columnCount, rowVirtualizer, horizontalVirtualizer, stopContinuousPlay, startContinuousPlay, toggleFullscreen, selectedImages, success, error, handlePaste, handleDelete])

  // 키보드 업 핸들러 (연속 재생 종료)
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      stopContinuousPlay()
    }
  }, [stopContinuousPlay])

  // 키보드 네비게이션 (방향키 + Home/End + PageUp/PageDown + 검색)
  useEffect(() => {
    // 포커스 손실 시 연속 재생 중지
    const handleBlur = () => {
      stopContinuousPlay()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      stopContinuousPlay() // 클린업 시 연속 재생 중지
    }
  }, [handleKeyDown, handleKeyUp, stopContinuousPlay])

  // 썸네일 생성 시작
  useEffect(() => {
    // 폴더 변경 시 스크롤 위치 초기화 (focusedIndex는 별도 useEffect에서 처리)
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0
      scrollAreaRef.current.scrollLeft = 0
    }

    if (imageFiles.length === 0) {
      setThumbnails(new Map())
      setProgress(null)
      setIsGenerating(false)
      setHqProgress(null)
      setIsGeneratingHq(false)
      setShowProgressIndicator(true)
      // HQ 작업 취소
      invoke('cancel_hq_thumbnail_generation').catch((error) =>
        logError(error, 'Cancel HQ thumbnail generation')
      )
      return
    }

    const startGeneration = async () => {
      try {
        // 이전 HQ 작업 취소 (폴더 변경 시)
        await invoke('cancel_hq_thumbnail_generation')
        setIsGeneratingHq(false)
        setHqProgress(null)
        setHqEnabled(false)
        setHqClassification(null)

        setIsGenerating(true)
        setShowProgressIndicator(true)
        setProgress({ completed: 0, total: imageFiles.length, current_path: '' })

        // 배치 생성 시작
        await invoke('start_thumbnail_generation', {
          imagePaths: imageFiles,
        })
      } catch (error) {
        console.error('Failed to start thumbnail generation:', error)
        setIsGenerating(false)
      }
    }

    startGeneration()
  }, [imageFiles])

  // 이미지 별점 로드 (백그라운드에서 비동기로)
  useEffect(() => {
    if (imageFiles.length === 0) {
      setRatings(new Map())
      return
    }

    const loadRatings = async () => {
      const newRatings = new Map<string, number>()

      // 병렬로 모든 별점 로드 (실패해도 계속 진행)
      await Promise.allSettled(
        imageFiles.map(async (filePath) => {
          try {
            const rating = await readImageRating(filePath)
            if (rating > 0) { // 0은 저장하지 않음 (unrated)
              newRatings.set(filePath, rating)
            }
          } catch (error) {
            // 별점 읽기 실패는 무시 (XMP가 없는 파일일 수 있음)
          }
        })
      )

      setRatings(newRatings)
    }

    loadRatings()
  }, [imageFiles])

  // 별점 변경 이벤트 리스너 (실시간 업데이트)
  useEffect(() => {
    const unlisten = listen<{ path: string; rating: number }>('rating-changed', (event) => {
      const { path, rating } = event.payload

      setRatings((prev) => {
        const next = new Map(prev)
        if (rating > 0) {
          next.set(path, rating)
        } else {
          next.delete(path) // 0이면 배지 제거
        }
        return next
      })
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

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

      // EXIF 썸네일 생성 완료 후 HQ 썸네일 분류만 수행 (자동 생성 X)
      try {
        // 1. HQ 썸네일 분류 (기존/신규)
        const classification = await invoke<{ existing: string[]; missing: string[] }>(
          'classify_hq_thumbnails',
          {
            imagePaths: imageFiles,
          }
        )

        console.log(
          `HQ thumbnails: ${classification.existing.length} existing, ${classification.missing.length} missing`
        )

        // 분류 결과 저장
        setHqClassification(classification)

        // 2. 기존 HQ 썸네일만 즉시 로드 (유휴 시간 없음)
        if (classification.existing.length > 0) {
          await invoke('load_existing_hq_thumbnails', {
            imagePaths: classification.existing,
          })
        }

        // 3. EXIF 썸네일 로딩 완료 후 항상 2초 뒤 progress indicator 숨김
        // (missing이 있어도 체크박스로 사용자가 선택할 수 있으므로 진행률은 숨김)
        setTimeout(() => {
          setShowProgressIndicator(false)
          setProgress(null)
        }, 2000)
      } catch (error) {
        console.error('Failed to classify HQ thumbnails:', error)
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
      setHqEnabled(false)
      // HQ 썸네일 모두 생성 완료 - missing 비우기 (체크박스 숨김)
      if (hqClassification) {
        setHqClassification({ existing: [...hqClassification.existing, ...hqClassification.missing], missing: [] })
      }
      // 로딩 완료 후 2초 뒤에 progress indicator 숨김
      setTimeout(() => {
        setShowProgressIndicator(false)
        setProgress(null)
        setHqProgress(null)
      }, 2000)
    })

    const unlistenHqCancelled = listen('thumbnail-hq-cancelled', () => {
      setIsGeneratingHq(false)
      setHqEnabled(false)
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
  }, [imageFiles])

  // HQ 썸네일 생성 토글 핸들러
  const handleHqToggle = async (enabled: boolean) => {
    setHqEnabled(enabled)

    if (enabled && hqClassification) {
      // 체크: HQ 썸네일 생성 시작
      if (hqClassification.missing.length > 0) {
        try {
          setIsGeneratingHq(true)
          setHqProgress({ completed: hqClassification.existing.length, total: imageFiles.length, current_path: '' })

          await invoke('start_hq_thumbnail_generation', {
            imagePaths: hqClassification.missing,
          })
        } catch (error) {
          console.error('Failed to start HQ thumbnail generation:', error)
          setIsGeneratingHq(false)
        }
      }
    } else {
      // 체크 해제: HQ 썸네일 생성 중단
      try {
        await invoke('cancel_hq_thumbnail_generation')
        setIsGeneratingHq(false)
      } catch (error) {
        console.error('Failed to cancel HQ thumbnail generation:', error)
      }
    }
  }

  // 이미지가 없을 때
  if (imageFiles.length === 0) {
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
      {/* 정렬 드롭다운 */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-300 hover:bg-neutral-800"
          >
            <span>
              {sortField === 'filename' && '파일명'}
              {sortField === 'filesize' && '파일크기'}
              {sortField === 'date_taken' && '촬영날짜'}
              {sortField === 'modified_time' && '수정시간'}
            </span>
            <span className="text-gray-500">
              {sortOrder === 'asc' ? '↑' : '↓'}
            </span>
            <ChevronDown className="h-4 w-4" />
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border border-neutral-700 bg-neutral-800 shadow-lg">
              <div className="py-1">
                {/* 정렬 기준 */}
                <button
                  onClick={() => {
                    setSortField('filename')
                    setIsDropdownOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-neutral-700"
                >
                  <div className="w-4">
                    {sortField === 'filename' && <Check className="h-4 w-4" />}
                  </div>
                  <span>파일명</span>
                </button>
                <button
                  onClick={() => {
                    setSortField('filesize')
                    setIsDropdownOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-neutral-700"
                >
                  <div className="w-4">
                    {sortField === 'filesize' && <Check className="h-4 w-4" />}
                  </div>
                  <span>파일크기</span>
                </button>
                <button
                  onClick={() => {
                    setSortField('date_taken')
                    setIsDropdownOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-neutral-700"
                >
                  <div className="w-4">
                    {sortField === 'date_taken' && <Check className="h-4 w-4" />}
                  </div>
                  <span>촬영날짜</span>
                </button>
                <button
                  onClick={() => {
                    setSortField('modified_time')
                    setIsDropdownOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-neutral-700"
                >
                  <div className="w-4">
                    {sortField === 'modified_time' && <Check className="h-4 w-4" />}
                  </div>
                  <span>수정시간</span>
                </button>

                {/* 구분선 */}
                <div className="my-1 h-px bg-neutral-700" />

                {/* 정렬 순서 */}
                <button
                  onClick={() => {
                    setSortOrder('asc')
                    setIsDropdownOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-neutral-700"
                >
                  <div className="w-4">
                    {sortOrder === 'asc' && <Check className="h-4 w-4" />}
                  </div>
                  <span>오름차순</span>
                </button>
                <button
                  onClick={() => {
                    setSortOrder('desc')
                    setIsDropdownOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-neutral-700"
                >
                  <div className="w-4">
                    {sortOrder === 'desc' && <Check className="h-4 w-4" />}
                  </div>
                  <span>내림차순</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 썸네일 영역 */}
      <div
        ref={scrollAreaRef}
        tabIndex={0}
        className={isVertical ? 'flex-1 overflow-auto p-2 outline-none' : 'flex-1 overflow-x-auto overflow-y-hidden py-2 outline-none'}
      >
        {isVertical ? (
          /* 세로형: 가상화된 그리드 */
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowImages = rows[virtualRow.index]
              return (
                <div
                  key={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                    }}
                  >
                    {rowImages.map((imagePath, colIndex) => {
                      const index = virtualRow.index * columnCount + colIndex
                      const thumbnail = thumbnails.get(imagePath)
                      const transform = thumbnail?.exif_metadata
                        ? getOrientationTransform(thumbnail.exif_metadata.orientation)
                        : ''
                      // const isSelected = selectedImage === imagePath
                      const isFocused = focusedIndex === index
                      const rating = ratings.get(imagePath) || 0

                      const isSelected = selectedImages.has(imagePath)

                      return (
                        <div
                          key={imagePath}
                          data-index={index}
                          className="w-full aspect-square"
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              // Ctrl 클릭: 개별 선택/해제
                              setSelectedImages(prev => {
                                const next = new Set(prev)
                                if (next.has(imagePath)) {
                                  next.delete(imagePath)
                                } else {
                                  next.add(imagePath)
                                }
                                return next
                              })
                              setLastSelectedIndex(index)
                            } else if (e.shiftKey && lastSelectedIndex !== null) {
                              // Shift 클릭: 범위 선택
                              const start = Math.min(lastSelectedIndex, index)
                              const end = Math.max(lastSelectedIndex, index)
                              setSelectedImages(prev => {
                                const next = new Set(prev)
                                for (let i = start; i <= end; i++) {
                                  if (sortedImages[i]) {
                                    next.add(sortedImages[i])
                                  }
                                }
                                return next
                              })
                            } else {
                              // 일반 클릭: 단일 선택
                              setSelectedImages(new Set([imagePath]))
                              setLastSelectedIndex(index)
                            }
                            setFocusedIndex(index)
                            loadImage(imagePath, index)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            // 우클릭한 이미지가 선택되지 않았으면 해당 이미지만 선택
                            if (!selectedImages.has(imagePath)) {
                              setSelectedImages(new Set([imagePath]))
                              setLastSelectedIndex(index)
                            }
                            setShowRatingSubmenu(false) // 서브메뉴 초기화
                            setContextMenu({ x: e.clientX, y: e.clientY })
                          }}
                          onDoubleClick={() => {
                            toggleFullscreen?.()
                          }}
                        >
                          <div
                            className={`group relative w-full h-full cursor-pointer overflow-hidden rounded-lg ${
                              isFocused ? 'ring-2 ring-blue-500' : isSelected ? 'ring-2 ring-white/80' : ''
                            } hover:bg-neutral-800/50 transition-colors`}
                          >
                            {thumbnail ? (
                              <img
                                src={`data:image/jpeg;base64,${thumbnail.thumbnail_base64}`}
                                alt={imagePath}
                                className={`h-full w-full object-contain ${cutImages.has(imagePath) ? 'opacity-50' : ''}`}
                                style={{ transform }}
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                              </div>
                            )}
                            {/* 별점 배지 (우측 상단) */}
                            {rating > 0 && (
                              <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold rounded px-1.5 py-0.5 shadow-lg">
                                {rating}
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <p className="truncate text-xs text-white">{imagePath.split(/[/\\]/).pop()}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* 가로형: 가상화된 한 줄 가로 스크롤 */
          <div
            ref={horizontalContentRef}
            className="flex flex-nowrap h-full items-center"
            style={{
              paddingLeft: `${horizontalVirtualizer.getVirtualItems()[0]?.start ?? 0}px`,
              paddingRight: `${
                horizontalVirtualizer.getTotalSize() -
                (horizontalVirtualizer.getVirtualItems()[horizontalVirtualizer.getVirtualItems().length - 1]?.end ?? 0)
              }px`,
            }}
          >
            {horizontalVirtualizer.getVirtualItems().map((virtualItem) => {
              const imagePath = sortedImages[virtualItem.index]
              const thumbnail = thumbnails.get(imagePath)
              const transform = thumbnail?.exif_metadata
                ? getOrientationTransform(thumbnail.exif_metadata.orientation)
                : ''
              // const isSelected = selectedImage === imagePath
              const isFocused = focusedIndex === virtualItem.index
              const rating = ratings.get(imagePath) || 0
              const isSelected = selectedImages.has(imagePath)

              return (
                <div
                  key={virtualItem.index}
                  data-index={virtualItem.index}
                  className="h-full aspect-square flex-shrink-0"
                  style={{
                    marginRight: virtualItem.index < sortedImages.length - 1 ? '0.5rem' : '0',
                  }}
                  onClick={(e) => {
                    const index = virtualItem.index
                    if (e.ctrlKey || e.metaKey) {
                      // Ctrl 클릭: 개별 선택/해제
                      setSelectedImages(prev => {
                        const next = new Set(prev)
                        if (next.has(imagePath)) {
                          next.delete(imagePath)
                        } else {
                          next.add(imagePath)
                        }
                        return next
                      })
                      setLastSelectedIndex(index)
                    } else if (e.shiftKey && lastSelectedIndex !== null) {
                      // Shift 클릭: 범위 선택
                      const start = Math.min(lastSelectedIndex, index)
                      const end = Math.max(lastSelectedIndex, index)
                      setSelectedImages(prev => {
                        const next = new Set(prev)
                        for (let i = start; i <= end; i++) {
                          if (sortedImages[i]) {
                            next.add(sortedImages[i])
                          }
                        }
                        return next
                      })
                    } else {
                      // 일반 클릭: 단일 선택
                      setSelectedImages(new Set([imagePath]))
                      setLastSelectedIndex(index)
                    }
                    setFocusedIndex(index)
                    loadImage(imagePath, index)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const index = virtualItem.index
                    // 우클릭한 이미지가 선택되지 않았으면 해당 이미지만 선택
                    if (!selectedImages.has(imagePath)) {
                      setSelectedImages(new Set([imagePath]))
                      setLastSelectedIndex(index)
                    }
                    setShowRatingSubmenu(false) // 서브메뉴 초기화
                    setContextMenu({ x: e.clientX, y: e.clientY })
                  }}
                  onDoubleClick={() => {
                    toggleFullscreen?.()
                  }}
                >
                  <div
                    className={`group relative w-full h-full cursor-pointer overflow-hidden rounded-lg ${
                      isFocused ? 'ring-2 ring-blue-500' : isSelected ? 'ring-2 ring-white/80' : ''
                    } hover:bg-neutral-800/50 transition-colors`}
                  >
                    {thumbnail ? (
                      <img
                        src={`data:image/jpeg;base64,${thumbnail.thumbnail_base64}`}
                        alt={imagePath}
                        className={`h-full w-full object-contain ${cutImages.has(imagePath) ? 'opacity-50' : ''}`}
                        style={{ transform }}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                      </div>
                    )}
                    {/* 별점 배지 (우측 상단) */}
                    {rating > 0 && (
                      <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold rounded px-1.5 py-0.5 shadow-lg">
                        {rating}
                      </div>
                    )}
                    <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 transition-opacity ${renamingImage === imagePath ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {renamingImage === imagePath ? (
                        <input
                          type="text"
                          value={newFileName}
                          onChange={(e) => setNewFileName(e.target.value)}
                          onBlur={handleRenameComplete}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRenameComplete()
                            } else if (e.key === 'Escape') {
                              handleRenameCancel()
                            }
                            e.stopPropagation() // 부모의 키 이벤트 방지
                          }}
                          onClick={(e) => e.stopPropagation()} // 클릭 이벤트 전파 방지
                          autoFocus
                          className="w-full px-1 py-0.5 text-xs text-white bg-neutral-900/90 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="truncate text-xs text-white">{imagePath.split(/[/\\]/).pop()}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 하단 상태 표시 - 세로 모드일 때만 표시 */}
      {isVertical && (
        <div className="border-t border-neutral-700 bg-neutral-800 px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            {/* 진행 상태 - 통합 표시 */}
            <div className="flex items-center gap-2">
              {/* 진행률: showProgressIndicator가 true이고 progress가 있을 때만 표시 */}
              {showProgressIndicator && (progress || hqProgress) && (
                <>
                  {(isGenerating || isGeneratingHq) && (
                    <Loader2 className={`h-3.5 w-3.5 animate-spin ${isGeneratingHq ? 'text-blue-500' : 'text-gray-400'}`} />
                  )}
                  <span className={`text-xs whitespace-nowrap ${isGeneratingHq ? 'text-blue-400' : 'text-gray-400'}`}>
                    {isGeneratingHq
                      ? `${Math.round((hqProgress?.completed ?? 0) / (hqProgress?.total ?? 1) * 100)}%`
                      : `${Math.round((progress?.completed ?? 0) / (progress?.total ?? 1) * 100)}%`
                    }
                  </span>
                </>
              )}

              {/* HQ 썸네일 생성 체크박스: EXIF 로딩 완료 후, missing이 있는 경우에만 표시 */}
              {!isGenerating && hqClassification && hqClassification.missing.length > 0 && (
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={hqEnabled}
                    onChange={(e) => handleHqToggle(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-neutral-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 focus:ring-1 bg-neutral-700 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 group-hover:text-gray-300 whitespace-nowrap">
                    고화질 썸네일 생성
                  </span>
                </label>
              )}
            </div>

            {/* 썸네일 크기 조절 슬라이더 */}
            <div className="flex items-center gap-2 mr-4">
              <span className="text-xs text-gray-400 whitespace-nowrap inline-block text-right" style={{ width: '48px' }}>
                {thumbnailSize}px
              </span>
              <input
                type="range"
                min={THUMBNAIL_SIZE_MIN}
                max={THUMBNAIL_SIZE_MAX}
                value={thumbnailSize}
                onChange={(e) => setThumbnailSize(Number(e.target.value))}
                className="h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                style={{ width: '100px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => {
            setContextMenu(null)
            setShowRatingSubmenu(false)
          }}
          scrollRef={scrollAreaRef as React.RefObject<HTMLElement>}
        >
          <ContextMenuItem
            icon={<Scissors className="w-4 h-4" />}
            label="잘라내기"
            shortcut="Ctrl+X"
            onClick={() => {
              const imagesToCut = Array.from(selectedImages)
              if (imagesToCut.length === 0) return

              const fileCount = imagesToCut.length
              invoke('copy_files_to_clipboard', { filePaths: imagesToCut, isCut: true })
                .then(() => {
                  let message: string
                  if (fileCount === 1) {
                    const fileName = imagesToCut[0].split(/[/\\]/).pop() || '파일'
                    message = `${fileName}을(를) 잘라냈습니다.`
                  } else {
                    message = `파일 ${fileCount}개를 잘라냈습니다.`
                  }
                  setCutImages(new Set(imagesToCut))
                  success(message)
                })
                .catch(() => {
                  error('클립보드 잘라내기 실패')
                })
              setContextMenu(null)
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-4 h-4" />}
            label="복사"
            shortcut="Ctrl+C"
            onClick={() => {
              const imagesToCopy = Array.from(selectedImages)
              if (imagesToCopy.length === 0) return

              const fileCount = imagesToCopy.length
              invoke('copy_files_to_clipboard', { filePaths: imagesToCopy, isCut: false })
                .then(() => {
                  let message: string
                  if (fileCount === 1) {
                    const fileName = imagesToCopy[0].split(/[/\\]/).pop() || '파일'
                    message = `${fileName}을(를) 클립보드에 복사했습니다.`
                  } else {
                    message = `파일 ${fileCount}개를 클립보드에 복사했습니다.`
                  }
                  setCutImages(new Set())
                  success(message)
                })
                .catch(() => {
                  error('클립보드 복사 실패')
                })
              setContextMenu(null)
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-4 h-4 scale-x-[-1]" />}
            label="붙여넣기"
            shortcut="Ctrl+V"
            onClick={() => {
              handlePaste()
              setContextMenu(null)
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Edit3 className="w-4 h-4" />}
            label="이름 바꾸기"
            shortcut="F2"
            disabled={selectedImages.size !== 1}
            onClick={() => {
              handleRename()
              setContextMenu(null)
            }}
          />
          <ContextMenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label="삭제"
            shortcut="Delete"
            onClick={() => {
              handleDelete()
              setContextMenu(null)
            }}
          />
          <ContextMenuItem
            icon={<Edit3 className="w-4 h-4" />}
            label="이름변경"
            shortcut="F2"
            onClick={() => setContextMenu(null)}
          />

          <ContextMenuDivider />

          <ContextMenuItem
            label="전체선택"
            shortcut="Ctrl+A"
            onClick={() => {
              setSelectedImages(new Set(sortedImages))
              setContextMenu(null)
            }}
          />
          <ContextMenuItem
            label="선택해제"
            shortcut="Ctrl+D"
            onClick={() => {
              setSelectedImages(new Set())
              setCutImages(new Set())
              setContextMenu(null)
            }}
          />
          <ContextMenuItem
            label="선택반전"
            shortcut="Ctrl+I"
            onClick={() => {
              const newSelection = new Set<string>()
              sortedImages.forEach(img => {
                if (!selectedImages.has(img)) {
                  newSelection.add(img)
                }
              })
              setSelectedImages(newSelection)
              setContextMenu(null)
            }}
          />

          <ContextMenuDivider />

          <ContextMenuSubmenu
            icon={<Star className="w-4 h-4" />}
            label="별점주기"
            isOpen={showRatingSubmenu}
            onOpenChange={setShowRatingSubmenu}
            menuX={contextMenu.x}
          >
            {[0, 1, 2, 3, 4, 5].map(rating => (
              <ContextMenuItem
                key={rating}
                label={rating === 0 ? '별점 해제' : `★ ${rating}`}
                onClick={async () => {
                  const imagesToRate = Array.from(selectedImages)

                  // 순차 처리로 변경 (파일 잠금 문제 방지)
                  for (const filePath of imagesToRate) {
                    try {
                      await writeImageRating(filePath, rating)
                    } catch (error) {
                      console.error(`Failed to set rating for ${filePath}:`, error)
                    }
                  }

                  setContextMenu(null)
                  setShowRatingSubmenu(false)
                }}
              />
            ))}
          </ContextMenuSubmenu>
        </ContextMenu>
      )}

      {/* 파일 충돌 다이얼로그 */}
      {conflictDialog && (
        <FileConflictDialog
          duplicateFile={conflictDialog.file}
          onResolve={handleConflictResolve}
        />
      )}
    </div>
  )
})

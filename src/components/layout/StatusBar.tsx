import { useState, useEffect, useRef } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { ChevronDown } from 'lucide-react'
import { useFolderContext } from '../../contexts/FolderContext'
import { useImageContext } from '../../contexts/ImageContext'
import { theme } from '../../lib/theme'
import versionData from '../../../version.json'

const appWindow = getCurrentWebviewWindow()

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(0)}${sizes[i]}`
}

function getFileName(path: string | null): string {
  if (!path) return ''
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1]
}

function getFolderName(path: string | null): string {
  if (!path) return ''
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || parts[parts.length - 2] || ''
}

const ZOOM_LEVELS = [70, 85, 100, 110, 125, 150] as const

export function StatusBar() {
  const { currentFolder, imageCount, totalSize } = useFolderContext()
  const { currentPath, currentSortedIndex, metadata, preloadProgress } = useImageContext()

  // 현재 이미지의 인덱스 (썸네일 패널의 정렬된 순서)
  const currentIndex = currentSortedIndex

  // UI 크기 조절
  const [zoomLevel, setZoomLevel] = useState(100)
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false)
  const zoomMenuRef = useRef<HTMLDivElement>(null)

  // 초기 줌 레벨 로드
  useEffect(() => {
    const loadZoomLevel = async () => {
      try {
        const scaleFactor = await appWindow.scaleFactor()
        const savedZoom = localStorage.getItem('ui.zoomLevel')
        if (savedZoom) {
          const zoom = parseInt(savedZoom, 10)
          setZoomLevel(zoom)
          await appWindow.setZoom(zoom / 100 / scaleFactor)
        }
      } catch (error) {
        console.error('Failed to load zoom level:', error)
      }
    }
    loadZoomLevel()
  }, [])

  // 줌 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(event.target as Node)) {
        setIsZoomMenuOpen(false)
      }
    }

    if (isZoomMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isZoomMenuOpen])

  // 줌 레벨 변경 핸들러
  const handleZoomChange = async (newZoom: number) => {
    try {
      const scaleFactor = await appWindow.scaleFactor()
      await appWindow.setZoom(newZoom / 100 / scaleFactor)
      setZoomLevel(newZoom)
      localStorage.setItem('ui.zoomLevel', newZoom.toString())
      setIsZoomMenuOpen(false)
    } catch (error) {
      console.error('Failed to set zoom level:', error)
    }
  }

  // 줌 레벨 증가/감소 핸들러
  const handleZoomStep = async (direction: 'in' | 'out') => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel as typeof ZOOM_LEVELS[number])
    let newIndex: number

    if (direction === 'in') {
      // 현재 값이 배열에 없으면 가장 가까운 큰 값으로
      if (currentIndex === -1) {
        newIndex = ZOOM_LEVELS.findIndex(level => level > zoomLevel)
        if (newIndex === -1) newIndex = ZOOM_LEVELS.length - 1
      } else {
        newIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1)
      }
    } else {
      // 현재 값이 배열에 없으면 가장 가까운 작은 값으로
      if (currentIndex === -1) {
        newIndex = ZOOM_LEVELS.length - 1
        for (let i = 0; i < ZOOM_LEVELS.length; i++) {
          if (ZOOM_LEVELS[i] >= zoomLevel) {
            newIndex = Math.max(0, i - 1)
            break
          }
        }
      } else {
        newIndex = Math.max(currentIndex - 1, 0)
      }
    }

    await handleZoomChange(ZOOM_LEVELS[newIndex])
  }

  // 키보드 단축키 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Plus (또는 =)
      if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        handleZoomStep('in')
      }
      // Ctrl + Minus
      else if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        handleZoomStep('out')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel])

  if (!currentFolder || imageCount === 0) {
    return (
      <footer className={`${theme.layout.statusBarHeight} ${theme.background.primary} flex items-center justify-between px-4 text-xs ${theme.text.quaternary} border-t border-neutral-800`}>
        <span>준비 완료</span>

        <div className="flex items-center gap-4">
          {/* 이미지 프리로드 진행바 */}
          {preloadProgress && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">버퍼:</span>
                <div className="w-24 h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${(preloadProgress.loaded / preloadProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-gray-400 text-xs">
                  {preloadProgress.loaded}/{preloadProgress.total}
                </span>
              </div>
              <span className="text-gray-700">|</span>
            </>
          )}

          {/* UI 크기 조절 */}
          <div className="relative" ref={zoomMenuRef}>
          <button
            onClick={() => setIsZoomMenuOpen(!isZoomMenuOpen)}
            className="flex items-center gap-1 px-2 py-1 hover:bg-neutral-800 rounded text-gray-400 hover:text-gray-300"
          >
            <span>UI 크기: {zoomLevel}%</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {isZoomMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg py-1 min-w-[120px]">
              {ZOOM_LEVELS.map((zoom) => (
                <button
                  key={zoom}
                  onClick={() => handleZoomChange(zoom)}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between"
                >
                  <span>{zoom}%</span>
                  {zoomLevel === zoom && <span className="text-blue-500">✓</span>}
                </button>
              ))}
            </div>
          )}
          </div>

          <span className="text-gray-700">|</span>

          {/* 버전 표시 */}
          <span className="text-gray-500">v{versionData.version}</span>
        </div>
      </footer>
    )
  }

  return (
    <footer className={`${theme.layout.statusBarHeight} ${theme.background.primary} flex items-center justify-between px-4 text-xs ${theme.text.quaternary} border-t border-neutral-800`}>
      <div className="flex items-center gap-4 flex-1">
        {/* 전체 이미지 정보 */}
        {imageCount > 0 && (
          <>
            <span className="flex items-center gap-1">
              <span className="text-gray-300">
                {currentIndex >= 0 ? currentIndex + 1 : 0}<span className="text-gray-500">/</span>{imageCount}<span className="text-gray-500">개</span>
              </span>
              <span className="text-gray-500">({formatBytes(totalSize)})</span>
            </span>

            <span className="text-gray-700">|</span>
          </>
        )}

        {/* 현재 이미지 정보 */}
        {metadata && (
          <>
            <span className="flex items-center gap-1">
              <span className="text-gray-300 font-medium truncate max-w-xs" title={getFileName(currentPath)}>
                {getFileName(currentPath)}
              </span>
              {metadata.file_size && (
                <span className="text-gray-500">({formatBytes(metadata.file_size)})</span>
              )}
            </span>

            <span className="text-gray-700">|</span>

            {metadata.image_width && metadata.image_height && (
              <span className="text-gray-400">
                {metadata.image_width} x {metadata.image_height}
              </span>
            )}

            {metadata.date_time_original && (
              <>
                <span className="text-gray-700">|</span>
                <span className="text-gray-400">{metadata.date_time_original}</span>
              </>
            )}
          </>
        )}

        <span className="text-gray-700">|</span>

        {/* 현재 폴더명 */}
        <span className="text-gray-500 truncate flex-1" title={currentFolder}>
          {getFolderName(currentFolder)}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* 이미지 프리로드 진행바 */}
        {preloadProgress && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs">버퍼:</span>
              <div className="w-24 h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${(preloadProgress.loaded / preloadProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-gray-400 text-xs">
                {preloadProgress.loaded}/{preloadProgress.total}
              </span>
            </div>
            <span className="text-gray-700">|</span>
          </>
        )}

        {/* UI 크기 조절 */}
        <div className="relative" ref={zoomMenuRef}>
        <button
          onClick={() => setIsZoomMenuOpen(!isZoomMenuOpen)}
          className="flex items-center gap-1 px-2 py-1 hover:bg-neutral-800 rounded text-gray-400 hover:text-gray-300"
        >
          <span>UI 크기: {zoomLevel}%</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {isZoomMenuOpen && (
          <div className="absolute bottom-full right-0 mb-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg py-1 min-w-[120px]">
            {ZOOM_LEVELS.map((zoom) => (
              <button
                key={zoom}
                onClick={() => handleZoomChange(zoom)}
                className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between"
              >
                <span>{zoom}%</span>
                {zoomLevel === zoom && <span className="text-blue-500">✓</span>}
              </button>
            ))}
          </div>
        )}
        </div>

        <span className="text-gray-700">|</span>

        {/* 버전 표시 */}
        <span className="text-gray-500">v{versionData.version}</span>
      </div>
    </footer>
  )
}

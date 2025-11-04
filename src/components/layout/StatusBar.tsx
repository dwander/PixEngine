import { useFolderContext } from '../../contexts/FolderContext'
import { useImageContext } from '../../contexts/ImageContext'
import { theme } from '../../lib/theme'

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

export function StatusBar() {
  const { currentFolder, imageCount, totalSize } = useFolderContext()
  const { currentPath, currentIndex, imageList, metadata } = useImageContext()

  if (!currentFolder || imageCount === 0) {
    return (
      <footer className={`${theme.layout.statusBarHeight} ${theme.background.primary} flex items-center px-4 text-xs ${theme.text.quaternary} border-t border-neutral-800`}>
        <span>준비 완료</span>
      </footer>
    )
  }

  return (
    <footer className={`${theme.layout.statusBarHeight} ${theme.background.primary} flex items-center px-4 text-xs ${theme.text.quaternary} border-t border-neutral-800`}>
      <div className="flex items-center gap-4 flex-1">
        {/* 전체 이미지 정보 */}
        {imageList.length > 0 && (
          <>
            <span className="flex items-center gap-1">
              <span className="text-gray-400">
                {currentIndex + 1}/{imageList.length}개
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
    </footer>
  )
}

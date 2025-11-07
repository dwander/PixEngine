import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export interface DuplicateFileInfo {
  source: string
  destination: string
  file_name: string
}

interface FileConflictDialogProps {
  duplicateFile: DuplicateFileInfo
  onResolve: (resolution: 'overwrite' | 'skip' | 'cancel', applyToAll: boolean) => void
}

export function FileConflictDialog({ duplicateFile, onResolve }: FileConflictDialogProps) {
  const [applyToAll, setApplyToAll] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-900 rounded-lg shadow-2xl border border-neutral-700 p-6 w-[500px]">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-yellow-500" />
          <h2 className="text-lg font-semibold text-white">파일 덮어쓰기 확인</h2>
        </div>

        {/* 메시지 */}
        <div className="mb-6 space-y-2">
          <p className="text-neutral-300">
            다음 파일이 이미 존재합니다:
          </p>
          <p className="text-white font-medium bg-neutral-800 px-3 py-2 rounded break-all">
            {duplicateFile.file_name}
          </p>
          <p className="text-neutral-400 text-sm">
            대상: {duplicateFile.destination}
          </p>
        </div>

        {/* 모든 파일에 적용 체크박스 */}
        <div className="mb-6">
          <label className="flex items-center gap-2 cursor-pointer text-neutral-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span>모든 파일에 적용</span>
          </label>
        </div>

        {/* 버튼들 */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => onResolve('cancel', applyToAll)}
            className="px-4 py-2 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => onResolve('skip', applyToAll)}
            className="px-4 py-2 rounded bg-neutral-700 text-white hover:bg-neutral-600 transition-colors"
          >
            건너뛰기
          </button>
          <button
            onClick={() => onResolve('overwrite', applyToAll)}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            덮어쓰기
          </button>
        </div>
      </div>
    </div>
  )
}

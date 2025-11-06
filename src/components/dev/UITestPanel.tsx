import React, { useState } from 'react'
import { Button } from '../ui/Button'
import { useDialog } from '../../contexts/DialogContext'
import { useToast } from '../../contexts/ToastContext'
import { AlertCircle, CheckCircle, Info, AlertTriangle, FolderPlus, Trash2 } from 'lucide-react'

export function UITestPanel() {
  const dialog = useDialog()
  const toast = useToast()
  const [testValue, setTestValue] = useState('')

  const handleAlertTest = async () => {
    await dialog.showAlert('이것은 알림 메시지입니다.', {
      title: '알림',
      icon: 'info',
    })
    toast.info('알림 다이얼로그가 닫혔습니다')
  }

  const handleConfirmTest = async () => {
    const result = await dialog.showConfirm('정말로 삭제하시겠습니까?', {
      title: '확인',
      icon: 'warning',
      confirmText: '삭제',
      cancelText: '취소',
    })
    if (result.confirmed) {
      toast.success('삭제가 확인되었습니다')
    } else {
      toast.info('취소되었습니다')
    }
  }

  const handlePromptTest = async () => {
    const result = await dialog.showPrompt('새 폴더 이름을 입력하세요:', {
      title: '폴더 생성',
      placeholder: '새 폴더',
      defaultValue: 'My Folder',
      icon: 'none',
    })
    if (result.confirmed && result.value) {
      setTestValue(result.value)
      toast.success(`폴더 "${result.value}"가 생성되었습니다`)
    }
  }

  const handleDontAskAgainTest = async () => {
    const result = await dialog.showConfirm(
      '이 파일을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.',
      {
        title: '파일 삭제',
        icon: 'error',
        confirmText: '삭제',
        showDontAskAgain: true,
        dontAskAgainKey: 'test.deleteFile',
      }
    )
    if (result.dontAskAgain) {
      toast.warning('다시 묻지 않기가 활성화되었습니다')
    }
    if (result.confirmed) {
      toast.success('파일이 삭제되었습니다')
    }
  }

  const clearDontAskAgain = async () => {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json')
    await store.delete('dontAskAgain.test.deleteFile')
    await store.save()
    toast.info('다시 묻지 않기 설정이 초기화되었습니다')
  }

  return (
    <div className="p-6 bg-neutral-900 text-gray-200 h-full overflow-auto">
      <h1 className="text-2xl font-bold mb-6">UI 컴포넌트 테스트</h1>

      {/* Button Tests */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">버튼 컴포넌트</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" size="sm">
            Primary Small
          </Button>
          <Button variant="primary" size="md">
            Primary Medium
          </Button>
          <Button variant="primary" size="lg">
            Primary Large
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <Button variant="secondary" icon={FolderPlus} iconPosition="left">
            새 폴더
          </Button>
          <Button variant="danger" icon={Trash2} iconPosition="left">
            삭제
          </Button>
          <Button variant="ghost">취소</Button>
          <Button variant="primary" disabled>
            비활성화
          </Button>
        </div>
      </section>

      {/* Dialog Tests */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">다이얼로그 컴포넌트</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" icon={Info} onClick={handleAlertTest}>
            알림 테스트
          </Button>
          <Button variant="primary" icon={AlertTriangle} onClick={handleConfirmTest}>
            확인 테스트
          </Button>
          <Button variant="primary" onClick={handlePromptTest}>
            입력 테스트
          </Button>
          <Button variant="secondary" onClick={handleDontAskAgainTest}>
            다시 묻지 않기 테스트
          </Button>
          <Button variant="ghost" onClick={clearDontAskAgain}>
            설정 초기화
          </Button>
        </div>
        {testValue && (
          <div className="mt-3 p-3 bg-neutral-800 rounded border border-neutral-700">
            <p className="text-sm">입력된 값: {testValue}</p>
          </div>
        )}
      </section>

      {/* Toast Tests */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">토스트 메시지</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            icon={CheckCircle}
            onClick={() => toast.success('작업이 성공적으로 완료되었습니다')}
          >
            Success
          </Button>
          <Button
            variant="secondary"
            icon={AlertCircle}
            onClick={() => toast.error('오류가 발생했습니다')}
          >
            Error
          </Button>
          <Button
            variant="secondary"
            icon={AlertTriangle}
            onClick={() => toast.warning('주의가 필요합니다')}
          >
            Warning
          </Button>
          <Button
            variant="secondary"
            icon={Info}
            onClick={() => toast.info('정보 메시지입니다')}
          >
            Info
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              toast.success('첫 번째 메시지')
              setTimeout(() => toast.info('두 번째 메시지'), 500)
              setTimeout(() => toast.warning('세 번째 메시지'), 1000)
            }}
          >
            여러 개 표시
          </Button>
        </div>
      </section>

      {/* Combined Tests */}
      <section>
        <h2 className="text-lg font-semibold mb-4">통합 테스트</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={async () => {
              const result = await dialog.showConfirm('파일을 저장하시겠습니까?')
              if (result.confirmed) {
                toast.success('파일이 저장되었습니다')
              } else {
                toast.info('저장이 취소되었습니다')
              }
            }}
          >
            저장 확인 플로우
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const result = await dialog.showPrompt('삭제할 파일 이름을 입력하세요:', {
                title: '파일 삭제',
                icon: 'warning',
              })
              if (result.confirmed && result.value) {
                toast.error(`"${result.value}"가 삭제되었습니다`)
              }
            }}
          >
            삭제 플로우
          </Button>
        </div>
      </section>
    </div>
  )
}

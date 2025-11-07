import React, { useState, useEffect, useRef } from 'react'
import { X, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import { Button } from './Button'

export type DialogType = 'alert' | 'confirm' | 'prompt'
export type DialogIcon = 'info' | 'warning' | 'error' | 'success' | 'none'

export interface DialogOptions {
  type: DialogType
  title?: string
  message: string
  icon?: DialogIcon
  placeholder?: string // prompt용
  defaultValue?: string // prompt용
  confirmText?: string
  cancelText?: string
  showDontAskAgain?: boolean // "다시 묻지 않기" 옵션
  dontAskAgainKey?: string // localStorage 저장 키
  showHeader?: boolean // 헤더 표시 여부 (기본값: false)
}

export interface DialogResult {
  confirmed: boolean
  value?: string // prompt의 경우
  dontAskAgain?: boolean
}

interface DialogProps {
  isOpen: boolean
  options: DialogOptions
  onClose: (result: DialogResult) => void
}

export function Dialog({ isOpen, options, onClose }: DialogProps) {
  const [inputValue, setInputValue] = useState(options.defaultValue || '')
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [isTabPressed, setIsTabPressed] = useState(false)
  const [focusedButton, setFocusedButton] = useState<'cancel' | 'confirm' | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setInputValue(options.defaultValue || '')
      setDontAskAgain(false)
      setIsTabPressed(false)
      setPosition({ x: 0, y: 0 })
      setIsDragging(false)

      // 다이얼로그가 열릴 때 취소 버튼에 포커스 (실수 방지)
      // prompt 타입이 아닐 때만 (prompt는 input이 autoFocus 받음)
      if (options.type !== 'prompt') {
        setTimeout(() => {
          if (options.type === 'alert') {
            confirmButtonRef.current?.focus()
          } else {
            cancelButtonRef.current?.focus()
          }
        }, 100)
      }
    }
  }, [isOpen, options.defaultValue, options.type])

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (!isOpen) return

      // Escape 키로 닫기
      if (e.key === 'Escape') {
        handleCancel()
        return
      }

      // Tab 키 - 다이얼로그 내부에서만 순환
      if (e.key === 'Tab') {
        e.preventDefault()
        setIsTabPressed(true)

        const activeElement = document.activeElement

        // alert 타입 (확인 버튼만 있음)
        if (options.type === 'alert') {
          confirmButtonRef.current?.focus()
          setFocusedButton('confirm')
          return
        }

        // confirm/prompt 타입 (취소, 확인 버튼 둘 다)
        if (e.shiftKey) {
          // Shift+Tab: 역방향
          if (activeElement === confirmButtonRef.current) {
            cancelButtonRef.current?.focus()
            setFocusedButton('cancel')
          } else {
            confirmButtonRef.current?.focus()
            setFocusedButton('confirm')
          }
        } else {
          // Tab: 정방향
          if (activeElement === cancelButtonRef.current) {
            confirmButtonRef.current?.focus()
            setFocusedButton('confirm')
          } else {
            cancelButtonRef.current?.focus()
            setFocusedButton('cancel')
          }
        }
      }

      // Enter 또는 Space 키로 현재 포커스된 버튼 활성화
      if (e.key === 'Enter' || e.key === ' ') {
        const activeElement = document.activeElement

        // 버튼에 포커스가 있을 때만 처리
        if (activeElement === cancelButtonRef.current) {
          e.preventDefault()
          handleCancel()
        } else if (activeElement === confirmButtonRef.current) {
          e.preventDefault()
          handleConfirm()
        }
        // prompt input에서는 기존 Enter 핸들러가 작동하도록 여기서는 처리하지 않음
      }
    }

    document.addEventListener('keydown', handleKeyboard)
    return () => document.removeEventListener('keydown', handleKeyboard)
  }, [isOpen, options.type])

  // 드래그 핸들러
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 버튼이나 입력 필드를 클릭한 경우 드래그 시작하지 않음
    const target = e.target as HTMLElement
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return
    }

    e.preventDefault()

    // 단순화된 오프셋 계산 - 현재 position 기준
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      // 상태 업데이트 없이 직접 DOM 조작
      if (dialogRef.current) {
        const newX = e.clientX - dragStart.x
        const newY = e.clientY - dragStart.y
        dialogRef.current.style.transform = `translate(${newX}px, ${newY}px)`
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false)
      // 마지막 위치를 상태에 저장
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart])

  if (!isOpen) return null

  const handleConfirm = () => {
    onClose({
      confirmed: true,
      value: options.type === 'prompt' ? inputValue : undefined,
      dontAskAgain,
    })
  }

  const handleCancel = () => {
    onClose({
      confirmed: false,
      dontAskAgain,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  const renderIcon = () => {
    if (!options.icon || options.icon === 'none') return null

    const iconClasses = 'h-6 w-6 flex-shrink-0'
    switch (options.icon) {
      case 'info':
        return <Info className={`${iconClasses} text-blue-400`} />
      case 'warning':
        return <AlertTriangle className={`${iconClasses} text-yellow-400`} />
      case 'error':
        return <AlertCircle className={`${iconClasses} text-red-400`} />
      case 'success':
        return <CheckCircle className={`${iconClasses} text-green-400`} />
    }
  }

  const getDefaultConfirmText = () => {
    if (options.type === 'alert') return '확인'
    return '확인'
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          willChange: isDragging ? 'transform' : 'auto',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Header (선택적) */}
        {options.showHeader && options.title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
            <h2 className="text-base font-semibold text-gray-100">{options.title}</h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded hover:bg-neutral-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className={`px-4 space-y-4 ${options.showHeader ? 'py-4' : 'pt-5 pb-4'}`}>
          {/* Message with Icon */}
          <div className="flex gap-3">
            {renderIcon()}
            <p className="text-sm text-gray-200 flex-1 whitespace-pre-wrap">
              {options.message}
            </p>
          </div>

          {/* Prompt Input */}
          {options.type === 'prompt' && (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={options.placeholder}
              autoFocus
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          {/* Don't Ask Again Option (Left) */}
          {options.showDontAskAgain ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-800"
              />
              <span className="text-xs text-gray-400">
                {options.type === 'alert' ? '다시 알리지 않기' : '다시 묻지 않기'}
              </span>
            </label>
          ) : (
            <div />
          )}

          {/* Buttons (Right) */}
          <div className="flex gap-2">
            {options.type !== 'alert' && (
              <div className="relative">
                {isTabPressed && focusedButton === 'cancel' && (
                  <div className="absolute inset-0 -m-0.5 rounded border-2 border-neutral-500 pointer-events-none" />
                )}
                <Button
                  ref={cancelButtonRef}
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  onFocus={() => isTabPressed && setFocusedButton('cancel')}
                  onBlur={() => setFocusedButton(null)}
                >
                  {options.cancelText || '취소'}
                </Button>
              </div>
            )}
            <div className="relative">
              {isTabPressed && focusedButton === 'confirm' && (
                <div className="absolute inset-0 -m-0.5 rounded border-2 border-blue-500 pointer-events-none" />
              )}
              <Button
                ref={confirmButtonRef}
                variant={options.type === 'confirm' && options.icon === 'error' ? 'danger' : 'primary'}
                size="sm"
                onClick={handleConfirm}
                onFocus={() => isTabPressed && setFocusedButton('confirm')}
                onBlur={() => setFocusedButton(null)}
              >
                {options.confirmText || getDefaultConfirmText()}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

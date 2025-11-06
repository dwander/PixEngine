import React, { useState, useEffect } from 'react'
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

  useEffect(() => {
    if (isOpen) {
      setInputValue(options.defaultValue || '')
      setDontAskAgain(false)
    }
  }, [isOpen, options.defaultValue])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

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
      <div className="relative bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
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

          {/* Don't Ask Again Option */}
          {options.showDontAskAgain && (
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
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3">
          {options.type !== 'alert' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
            >
              {options.cancelText || '취소'}
            </Button>
          )}
          <Button
            variant={options.type === 'confirm' && options.icon === 'error' ? 'danger' : 'primary'}
            size="sm"
            onClick={handleConfirm}
          >
            {options.confirmText || getDefaultConfirmText()}
          </Button>
        </div>
      </div>
    </div>
  )
}

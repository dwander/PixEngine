import React, { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastData {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastProps {
  toast: ToastData
  onClose: (id: string) => void
}

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const duration = toast.duration || 3000
    const timer = setTimeout(() => {
      onClose(toast.id)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onClose])

  const renderIcon = () => {
    const iconClasses = 'h-5 w-5 flex-shrink-0'
    switch (toast.type) {
      case 'success':
        return <CheckCircle className={`${iconClasses} text-green-400`} />
      case 'error':
        return <AlertCircle className={`${iconClasses} text-red-400`} />
      case 'warning':
        return <AlertTriangle className={`${iconClasses} text-yellow-400`} />
      case 'info':
        return <Info className={`${iconClasses} text-blue-400`} />
    }
  }

  const getBgColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-900/90 border-green-700'
      case 'error':
        return 'bg-red-900/90 border-red-700'
      case 'warning':
        return 'bg-yellow-900/90 border-yellow-700'
      case 'info':
        return 'bg-blue-900/90 border-blue-700'
    }
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${getBgColor()} shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full duration-300`}
    >
      {renderIcon()}
      <p className="text-sm text-gray-100 flex-1">{toast.message}</p>
      <button
        onClick={() => onClose(toast.id)}
        className="text-gray-300 hover:text-gray-100 transition-colors p-0.5 rounded hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastData[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  )
}

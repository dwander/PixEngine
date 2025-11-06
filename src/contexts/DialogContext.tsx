import React, { createContext, useContext, useState, useCallback } from 'react'
import { Dialog, DialogOptions, DialogResult } from '../components/ui/Dialog'
import { load } from '@tauri-apps/plugin-store'

interface DialogContextValue {
  showAlert: (message: string, options?: Partial<DialogOptions>) => Promise<DialogResult>
  showConfirm: (message: string, options?: Partial<DialogOptions>) => Promise<DialogResult>
  showPrompt: (message: string, options?: Partial<DialogOptions>) => Promise<DialogResult>
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined)

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean
    options: DialogOptions
    resolver?: (result: DialogResult) => void
  }>({
    isOpen: false,
    options: {
      type: 'alert',
      message: '',
    },
  })

  const checkDontAskAgain = useCallback(async (key?: string): Promise<boolean> => {
    if (!key) return false

    try {
      const store = await load('settings.json')
      const dontAskAgain = await store.get<boolean>(`dontAskAgain.${key}`)
      return dontAskAgain === true
    } catch {
      return false
    }
  }, [])

  const saveDontAskAgain = useCallback(async (key: string, value: boolean) => {
    try {
      const store = await load('settings.json')
      await store.set(`dontAskAgain.${key}`, value)
      await store.save()
    } catch (error) {
      console.error('Failed to save dontAskAgain setting:', error)
    }
  }, [])

  const showDialog = useCallback(
    (type: DialogOptions['type'], message: string, options?: Partial<DialogOptions>): Promise<DialogResult> => {
      return new Promise(async (resolve) => {
        const fullOptions: DialogOptions = {
          type,
          message,
          icon: type === 'alert' ? 'info' : type === 'confirm' ? 'warning' : 'none',
          ...options,
        }

        // Check "don't ask again" setting
        if (fullOptions.dontAskAgainKey) {
          const skip = await checkDontAskAgain(fullOptions.dontAskAgainKey)
          if (skip) {
            resolve({ confirmed: true, dontAskAgain: true })
            return
          }
        }

        setDialogState({
          isOpen: true,
          options: fullOptions,
          resolver: resolve,
        })
      })
    },
    [checkDontAskAgain]
  )

  const handleClose = useCallback(
    (result: DialogResult) => {
      if (dialogState.resolver) {
        // Save "don't ask again" setting if needed
        if (result.dontAskAgain && dialogState.options.dontAskAgainKey) {
          saveDontAskAgain(dialogState.options.dontAskAgainKey, true)
        }

        dialogState.resolver(result)
      }
      setDialogState((prev) => ({ ...prev, isOpen: false }))
    },
    [dialogState.resolver, dialogState.options.dontAskAgainKey, saveDontAskAgain]
  )

  const showAlert = useCallback(
    (message: string, options?: Partial<DialogOptions>) => showDialog('alert', message, options),
    [showDialog]
  )

  const showConfirm = useCallback(
    (message: string, options?: Partial<DialogOptions>) => showDialog('confirm', message, options),
    [showDialog]
  )

  const showPrompt = useCallback(
    (message: string, options?: Partial<DialogOptions>) => showDialog('prompt', message, options),
    [showDialog]
  )

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      <Dialog isOpen={dialogState.isOpen} options={dialogState.options} onClose={handleClose} />
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider')
  }
  return context
}

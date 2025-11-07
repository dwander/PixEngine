import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

interface WindowFocusContextType {
  isFocused: boolean
  shouldConsumeClick: () => boolean
  setContextMenuOpen: (open: boolean) => void
}

const WindowFocusContext = createContext<WindowFocusContextType | undefined>(undefined)

const appWindow = getCurrentWindow()

export function WindowFocusProvider({ children }: { children: ReactNode }) {
  const [isFocused, setIsFocused] = useState(true)
  const pendingFocusRef = useRef(false) // 포커스를 방금 얻었는지 추적
  const contextMenuOpenRef = useRef(false) // 컨텍스트 메뉴가 열려있는지 추적

  useEffect(() => {
    // 포커스 이벤트 리스너
    const unlistenFocus = appWindow.onFocusChanged(({ payload: focused }) => {
      setIsFocused(focused)

      if (focused) {
        // 포커스를 얻었을 때 플래그 설정
        pendingFocusRef.current = true
      } else {
        // 포커스를 잃었을 때 플래그 해제
        pendingFocusRef.current = false
      }
    })

    // 초기 포커스 상태 확인
    appWindow.isFocused().then(focused => {
      setIsFocused(focused)
    })

    return () => {
      unlistenFocus.then(unlisten => unlisten())
    }
  }, [])

  // 클릭이 포커스 복원용으로 소비되어야 하는지 확인
  const shouldConsumeClick = () => {
    // 컨텍스트 메뉴가 열려있으면 클릭 소비
    if (contextMenuOpenRef.current) {
      contextMenuOpenRef.current = false
      return true
    }

    if (pendingFocusRef.current) {
      // 첫 클릭은 포커스 복원용으로 소비
      pendingFocusRef.current = false
      return true
    }
    return false
  }

  // 컨텍스트 메뉴 열림 상태 설정
  const setContextMenuOpen = (open: boolean) => {
    contextMenuOpenRef.current = open
  }

  return (
    <WindowFocusContext.Provider value={{ isFocused, shouldConsumeClick, setContextMenuOpen }}>
      {children}
    </WindowFocusContext.Provider>
  )
}

export function useWindowFocus() {
  const context = useContext(WindowFocusContext)
  if (context === undefined) {
    throw new Error('useWindowFocus must be used within a WindowFocusProvider')
  }
  return context
}

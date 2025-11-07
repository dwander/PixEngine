import { ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useWindowFocus } from '../../contexts/WindowFocusContext'

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
  scrollRef?: React.RefObject<HTMLElement>
}

/**
 * 재사용 가능한 컨텍스트 메뉴 컴포넌트
 *
 * 특징:
 * - 뷰포트 경계를 벗어나지 않도록 자동 위치 조정
 * - 외부 클릭/우클릭/스크롤 시 자동 닫힘
 * - Portal을 사용하여 body에 렌더링
 */
export function ContextMenu({ x, y, onClose, children, scrollRef }: ContextMenuProps) {
  const { setContextMenuOpen } = useWindowFocus()
  const menuRef = useRef<HTMLDivElement>(null)

  // 컨텍스트 메뉴가 열렸음을 알림
  useEffect(() => {
    setContextMenuOpen(true)
    return () => {
      setContextMenuOpen(false)
    }
  }, [setContextMenuOpen])

  // 외부 클릭 및 스크롤 감지
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // 메뉴 내부 클릭이면 무시
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return
      }

      // 외부 클릭이면 메뉴 닫기
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    const handleContextMenu = (e: MouseEvent) => {
      // 메뉴 내부 우클릭이면 무시
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return
      }

      // 외부 우클릭이면 메뉴 닫기
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    const handleScroll = () => onClose()

    // 캡처 단계에서 이벤트를 가로채서 처리
    document.addEventListener('click', handleClick, true)
    document.addEventListener('contextmenu', handleContextMenu, true)
    scrollRef?.current?.addEventListener('scroll', handleScroll)

    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('contextmenu', handleContextMenu, true)
      scrollRef?.current?.removeEventListener('scroll', handleScroll)
    }
  }, [onClose, scrollRef])

  // 뷰포트 경계를 벗어나지 않도록 위치 조정
  const menuWidth = 192 // min-w-[12rem] = 12 * 16px
  const menuHeight = 500 // 대략적인 메뉴 높이
  let adjustedX = x
  let adjustedY = y

  if (adjustedX + menuWidth > window.innerWidth) {
    adjustedX = window.innerWidth - menuWidth - 8
  }
  if (adjustedY + menuHeight > window.innerHeight) {
    adjustedY = window.innerHeight - menuHeight - 8
  }

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu-container fixed bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 z-[9998] min-w-[12rem]"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
      }}
      onClick={(e) => {
        // 메뉴 내부 클릭은 전파 중단
        e.stopPropagation()
      }}
      onContextMenu={(e) => {
        // 메뉴 내부 우클릭도 전파 중단
        e.stopPropagation()
      }}
    >
      {children}
    </div>,
    document.body
  )
}

interface ContextMenuItemProps {
  icon?: ReactNode
  label: string
  onClick: () => void | Promise<void>
  disabled?: boolean
  variant?: 'default' | 'danger'
}

/**
 * 컨텍스트 메뉴 아이템
 */
export function ContextMenuItem({ icon, label, onClick, disabled = false, variant = 'default' }: ContextMenuItemProps) {
  const colorClass = variant === 'danger' ? 'text-red-400' : disabled ? 'text-gray-400' : 'text-gray-300'

  return (
    <button
      className={`w-full px-3 py-1.5 text-left text-sm ${colorClass} hover:bg-neutral-700 flex items-center gap-2`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/**
 * 컨텍스트 메뉴 구분선
 */
export function ContextMenuDivider() {
  return <div className="h-px bg-neutral-700 my-1" />
}

interface ContextMenuSubmenuProps {
  icon?: ReactNode
  label: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  menuX: number
}

/**
 * 서브메뉴를 가진 컨텍스트 메뉴 아이템
 *
 * 특징:
 * - 뷰포트 경계에 따라 자동으로 왼쪽/오른쪽 열림 방향 결정
 */
export function ContextMenuSubmenu({ icon, label, isOpen, onOpenChange, children, menuX }: ContextMenuSubmenuProps) {
  const menuWidth = 192 // min-w-[12rem]
  const submenuWidth = 128 // min-w-[8rem]
  const shouldOpenLeft = menuX + menuWidth + submenuWidth > window.innerWidth

  return (
    <div className="relative">
      <button
        className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-neutral-700 flex items-center justify-between"
        onMouseEnter={() => onOpenChange(true)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute top-0 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[8rem] ${
            shouldOpenLeft ? 'right-full mr-1' : 'left-full ml-1'
          }`}
          onMouseLeave={() => onOpenChange(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";

interface ContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  shortcut?: string;
  checked?: boolean;
  separator?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const hasAdjustedPosition = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && menuRef.current && !hasAdjustedPosition.current) {
      // 여러 프레임을 기다려서 DOM이 완전히 렌더링되도록 함
      const timeoutId = setTimeout(() => {
        if (!menuRef.current) return;

        const menuRect = menuRef.current.getBoundingClientRect();
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        };

        let { x, y } = position;
        let adjusted = false;

        // 오른쪽 경계 체크
        if (x + menuRect.width > viewport.width - 10) {
          x = viewport.width - menuRect.width - 10;
          adjusted = true;
        }

        // 왼쪽 경계 체크
        if (x < 10) {
          x = 10;
          adjusted = true;
        }

        // 아래쪽 경계 체크
        if (y + menuRect.height > viewport.height - 10) {
          y = viewport.height - menuRect.height - 10;
          adjusted = true;
        }

        // 위쪽 경계 체크
        if (y < 10) {
          y = 10;
          adjusted = true;
        }

        // 위치가 변경되었으면 업데이트
        if (adjusted) {
          hasAdjustedPosition.current = true;
          setPosition({ x, y });
        }
      }, 10);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, position]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = e;
    hasAdjustedPosition.current = false; // 리셋
    setPosition({ x: clientX, y: clientY });
    setIsOpen(true);
  };

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled || item.separator) return;
    item.onClick?.();
    setIsOpen(false);
  };

  return (
    <>
      <div onContextMenu={handleContextMenu}>
        {children}
      </div>

      {isOpen && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[200px] bg-card border-2 border-border shadow-xl rounded-md py-1.5"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          {items.map((item, index) => (
            item.separator ? (
              <div key={`separator-${index}`} className="my-1 border-t border-border" />
            ) : (
              <button
                key={index}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                className={`w-full px-4 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center justify-between gap-3 ${
                  item.disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.checked !== undefined && (
                    <span className="w-4 h-4 flex items-center justify-center">
                      {item.checked && <Check className="w-4 h-4" />}
                    </span>
                  )}
                  {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
                {item.shortcut && (
                  <span className="text-xs text-muted-foreground">{item.shortcut}</span>
                )}
              </button>
            )
          ))}
        </div>
      )}
    </>
  );
}

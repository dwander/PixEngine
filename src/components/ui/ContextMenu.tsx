import { useState, useRef, useEffect } from "react";

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (isOpen && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      let { x, y } = position;

      // 오른쪽 경계 체크
      if (x + menuRect.width > viewport.width - 10) {
        x = viewport.width - menuRect.width - 10;
      }

      // 왼쪽 경계 체크
      if (x < 10) {
        x = 10;
      }

      // 아래쪽 경계 체크
      if (y + menuRect.height > viewport.height - 10) {
        y = viewport.height - menuRect.height - 10;
      }

      // 위쪽 경계 체크
      if (y < 10) {
        y = 10;
      }

      // 위치가 변경되었으면 업데이트
      if (x !== position.x || y !== position.y) {
        setPosition({ x, y });
      }
    }
  }, [isOpen, position]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = e;
    setPosition({ x: clientX, y: clientY });
    setIsOpen(true);
  };

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
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
          className="fixed z-50 min-w-[200px] bg-neutral-800 border border-neutral-700 shadow-xl rounded-md py-1"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              className={`w-full px-4 py-2 text-sm text-left hover:bg-neutral-700 transition-colors ${
                item.disabled ? 'opacity-50 cursor-not-allowed text-gray-500' : 'text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

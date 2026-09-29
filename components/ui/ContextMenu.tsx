"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!position) return;
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, handleClickOutside, handleKeyDown]);

  // Adjust position to stay within viewport
  const adjustedPosition = useCallback(() => {
    if (!position) return { x: 0, y: 0 };
    const menu = menuRef.current;
    if (!menu) return position;

    const rect = menu.getBoundingClientRect();
    const overflowX = position.x + rect.width - window.innerWidth;
    const overflowY = position.y + rect.height - window.innerHeight;

    return {
      x: overflowX > 0 ? position.x - rect.width : position.x,
      y: overflowY > 0 ? position.y - rect.height : position.y,
    };
  }, [position]);

  return (
    <AnimatePresence>
      {position && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          style={{
            left: adjustedPosition().x,
            top: adjustedPosition().y,
          }}
          className="fixed z-[300] min-w-[160px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-2xl"
          role="menu"
          aria-label="Context menu"
        >
          {items.map((item, idx) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.02, duration: 0.1 }}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                item.danger
                  ? "text-red-500 hover:bg-red-500/10"
                  : "text-[var(--color-text)] hover:bg-[var(--color-sidebar)]"
              }`}
              role="menuitem"
            >
              {item.icon && (
                <span className="flex h-4 w-4 items-center justify-center">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

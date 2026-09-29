"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { MessageSquare, Trash2, Pencil } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import type { Session } from "@/lib/store/chatStore";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

const SWIPE_THRESHOLD = -80;

export const SessionItem = memo(function SessionItem({
  session,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: SessionItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Motion values for swipe — runs on compositor thread, no React re-renders
  const dragX = useMotionValue(0);
  const deleteOpacity = useTransform(dragX, [0, -80], [0, 1]);
  const deleteScale = useTransform(dragX, [0, -80], [0, 1]);

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  const handleRename = useCallback(() => {
    setIsRenaming(true);
    setTitle(session.title);
  }, [session.title]);

  // Right-click to open context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Double-click to rename
  const handleDoubleClick = useCallback(() => {
    if (!isRenaming) {
      setIsRenaming(true);
      setTitle(session.title);
    }
  }, [isRenaming, session.title]);

  const handleSubmitRename = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  }, [title, session.title, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmitRename();
    if (e.key === "Escape") setIsRenaming(false);
  }, [handleSubmitRename]);

  // Swipe to delete — uses motion values for zero re-render during drag
  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      const x = info.offset.x;
      if (x < SWIPE_THRESHOLD) {
        onDelete();
      }
      dragX.set(0);
    },
    [onDelete, dragX],
  );

  const contextMenuItems: ContextMenuItem[] = [
    {
      id: "rename",
      label: "Rename",
      icon: <Pencil className="h-3.5 w-3.5" />,
      onClick: handleRename,
    },
    {
      id: "delete",
      label: "Delete",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      danger: true,
      onClick: onDelete,
    },
  ];

  return (
    <>
      <div className="relative overflow-hidden rounded-lg">
        {/* Delete zone background — opacity & scale on compositor thread */}
        <motion.div
          className="absolute inset-0 flex items-center justify-end rounded-lg bg-red-600 px-4"
          style={{ opacity: deleteOpacity, scale: deleteScale, transformOrigin: "right center" }}
        >
          <Trash2 className="h-5 w-5 text-white" />
        </motion.div>

        {/* Swipeable content */}
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDrag={(_, info) => dragX.set(info.offset.x)}
          onDragEnd={handleDragEnd}
          animate={{ x: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm ${
            isActive
              ? "bg-[var(--color-surface)] text-[var(--color-text)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]/50 hover:text-[var(--color-text)]"
          }`}
          onClick={isRenaming ? undefined : onSelect}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          style={{ touchAction: "pan-y" }}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />

          {isRenaming ? (
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSubmitRename}
              onKeyDown={handleKeyDown}
              className="min-w-0 flex-1 rounded border border-[var(--color-accent)] bg-transparent px-1 py-0 text-sm outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{session.title}</span>
          )}

          {/* Actions */}
          {!isRenaming && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRename();
                }}
                className="rounded p-1 hover:bg-[var(--color-border)]"
                aria-label="Rename session"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded p-1 hover:bg-red-500/10 hover:text-red-500"
                aria-label="Delete session"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {/* Right-click context menu */}
      <ContextMenu
        items={contextMenuItems}
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
      />
    </>
  );
});

"use client";

import { forwardRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { create } from "zustand";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "error" | "success" | "info" | "warning";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  action?: ToastAction;
  duration: number; // 0 = persistent (no auto-dismiss)
  // exit animation handled by AnimatePresence
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, options?: { title?: string; action?: ToastAction; duration?: number }) => void;
  removeToast: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (type, message, options) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const duration = options?.duration ?? 5000;
    const toast: Toast = {
      id,
      type,
      title: options?.title,
      message,
      action: options?.action,
      duration,
    };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience function to show toast from anywhere */
export function showToast(
  type: ToastType,
  message: string,
  options?: { title?: string; action?: ToastAction; duration?: number },
) {
  useToastStore.getState().addToast(type, message, options);
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:right-4 sm:bottom-4 max-sm:bottom-20 max-sm:left-4 max-sm:right-4"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <ToastItem toast={toast} onDismiss={() => removeToast(toast.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const iconMap: Record<ToastType, React.ReactNode> = {
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
};

const borderMap: Record<ToastType, string> = {
  error: "border-l-red-500",
  success: "border-l-green-500",
  info: "border-l-blue-500",
  warning: "border-l-amber-500",
};

const ToastItem = forwardRef<HTMLDivElement, { toast: Toast; onDismiss: () => void }>(
  function ToastItem({ toast, onDismiss }, ref) {
    return (
      <div
        ref={ref}
        className={`flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-lg border-l-4 ${borderMap[toast.type]} max-w-sm`}
      >
      <div className="shrink-0 pt-0.5">{iconMap[toast.type]}</div>
      <div className="flex-1 min-w-0">
        {toast.title && <p className="text-sm font-medium text-[var(--color-text)]">{toast.title}</p>}
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{toast.message}</p>
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      </div>
    );
  },
);

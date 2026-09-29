"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeft, Plus, Settings, Menu, Download, HelpCircle, Trash2, Search, X, MessageSquare } from "lucide-react";
import { useChatStore, type SessionSearchResult } from "@/lib/store/chatStore";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Logo } from "@/components/ui/Logo";
import { SessionItem } from "./SessionItem";
import { showToast } from "@/components/ui/Toast";

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

export function Sidebar({ onOpenSettings, onOpenHelp }: SidebarProps) {
  const { sessions, currentSessionId, createSession, selectSession, renameSession, removeSession } =
    useChatStore();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SessionSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced message search across all sessions (IndexedDB scan via store action)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      useChatStore
        .getState()
        .searchSessions(q)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSearchResult = useCallback(
    (result: SessionSearchResult) => {
      selectSession(result.sessionId);
      setMobileOpen(false);
    },
    [selectSession],
  );

  /** Render a search snippet with the query highlighted */
  const Snippet = useMemo(
    () =>
      function Snippet({ text }: { text: string }) {
        const q = searchQuery.trim();
        if (!q) return <>{text}</>;
        const lower = text.toLowerCase();
        const ql = q.toLowerCase();
        const parts: React.ReactNode[] = [];
        let pos = 0;
        let idx = lower.indexOf(ql);
        let key = 0;
        while (idx !== -1 && key < 8) {
          if (idx > pos) parts.push(<span key={key++}>{text.slice(pos, idx)}</span>);
          parts.push(
            <mark key={key++} className="rounded bg-[var(--color-accent)]/25 px-0.5 text-[var(--color-text)]">
              {text.slice(idx, idx + q.length)}
            </mark>,
          );
          pos = idx + q.length;
          idx = lower.indexOf(ql, pos);
        }
        parts.push(<span key={key++}>{text.slice(pos)}</span>);
        return <>{parts}</>;
      },
    [searchQuery],
  );

  const handleDeleteRequest = useCallback((id: string, title: string) => {
    setDeleteConfirmId(id);
    setDeleteConfirmTitle(title);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirmId) {
      await removeSession(deleteConfirmId);
    }
    setDeleteConfirmId(null);
    setDeleteConfirmTitle("");
  }, [deleteConfirmId, removeSession]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmId(null);
    setDeleteConfirmTitle("");
  }, []);

  const handleNewChat = useCallback(async () => {
    await createSession();
    setMobileOpen(false);
  }, [createSession]);

  const handleSelectSession = useCallback(
    (id: string) => {
      selectSession(id);
      setMobileOpen(false);
    },
    [selectSession],
  );

  const handleExport = useCallback(() => {
    const msgs = useChatStore.getState().messages;
    if (msgs.length === 0) {
      showToast("info", "No messages to export.");
      return;
    }

    const session = sessions.find((s) => s.id === currentSessionId);
    const title = session?.title ?? "chat-export";

    let md = `# ${title}\n\n`;
    md += `> Exported ${new Date().toLocaleString()}\n\n---\n\n`;

    for (const msg of msgs) {
      const role = msg.role === "user" ? "**You**" : "**Assistant**";
      md += `### ${role}\n\n${msg.content}\n\n`;
      if (msg.usage) {
        md += `*${msg.usage.inputTokens}↑ · ${msg.usage.outputTokens}↓ tokens*\n\n`;
      }
      md += `---\n\n`;
    }

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("success", "Chat exported as Markdown!");
  }, [sessions, currentSessionId]);

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        {!collapsed ? (
          <Logo size={22} />
        ) : (
          <Logo size={20} variant="icon" />
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)] md:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Search — hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-7 text-xs text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none transition-colors focus:border-[var(--color-accent)]"
              aria-label="Search messages in all chats"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Session list with layout animations */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2">
          {/* Search results replace the session list while searching */}
          {searchQuery.trim() ? (
            <div className="space-y-0.5 py-1">
              {isSearching ? (
                <p className="px-2 py-4 text-center text-xs text-[var(--color-text-secondary)]">
                  Searching…
                </p>
              ) : searchResults.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-[var(--color-text-secondary)]">
                  No messages match &ldquo;{searchQuery.trim()}&rdquo;.
                </p>
              ) : (
                <>
                  <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {searchResults.length} message{searchResults.length !== 1 ? "s" : ""} found
                  </p>
                  {searchResults.map((r) => (
                    <button
                      key={`${r.sessionId}:${r.messageId}`}
                      onClick={() => handleSelectSearchResult(r)}
                      className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--color-border)]"
                    >
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3 shrink-0 text-[var(--color-text-secondary)]" />
                        <span className="truncate text-xs font-medium text-[var(--color-text)]">
                          {r.sessionTitle}
                        </span>
                        <span
                          className={`ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${
                            r.role === "user"
                              ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                              : "bg-[var(--color-border)] text-[var(--color-text-secondary)]"
                          }`}
                        >
                          {r.role === "user" ? "You" : "AI"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--color-text-secondary)]">
                        <Snippet text={r.snippet} />
                      </p>
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : (
          <div className="space-y-0.5">
            <AnimatePresence mode="popLayout" initial={false}>
              {sessions.map((session) => (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <SessionItem
                    session={session}
                    isActive={session.id === currentSessionId}
                    onSelect={() => handleSelectSession(session.id)}
                    onRename={(title) => renameSession(session.id, title)}
                    onDelete={() => handleDeleteRequest(session.id, session.title)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {sessions.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-[var(--color-text-secondary)]">
                No conversations yet. Start a new chat!
              </p>
            )}
          </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        className={`border-t border-[var(--color-border)] py-2 ${
          collapsed
            ? "flex flex-col items-center gap-2 px-1"
            : "flex items-center justify-between px-3"
        }`}
      >
        <ThemeToggle />
        <div className={`flex items-center ${collapsed ? "flex-col gap-1.5" : "gap-0.5"}`}>
          <button
            onClick={onOpenHelp}
            className="rounded-lg p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            aria-label="Setup guide"
            title="Setup Guide"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            onClick={handleExport}
            className="rounded-lg p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            aria-label="Export chat as Markdown"
            title="Export as Markdown"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="rounded-lg p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-30 rounded-lg p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] md:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed bottom-0 left-0 top-0 z-50 w-[280px] border-r border-[var(--color-border)] bg-[var(--color-sidebar)] md:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 60 : 260 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="hidden overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-sidebar)] md:block"
      >
        {sidebarContent}
      </motion.aside>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/50"
              onClick={handleDeleteCancel}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="fixed inset-0 z-[201] flex items-center justify-center p-4"
            >
            <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Delete this chat?</h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                &ldquo;{deleteConfirmTitle}&rdquo; will be permanently deleted. This cannot be undone.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={handleDeleteCancel}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-sidebar)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </>
  );
}

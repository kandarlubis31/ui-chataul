"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ChatView } from "@/components/chat/ChatView";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastContainer } from "@/components/ui/Toast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// Code-split dialogs — only loaded on first open, never for SSR
const SettingsDialog = dynamic(
  () => import("@/components/settings/SettingsDialog").then((m) => m.SettingsDialog),
  { ssr: false },
);

const HelpDialog = dynamic(
  () => import("@/components/settings/HelpDialog").then((m) => m.HelpDialog),
  { ssr: false },
);

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Listen for custom event to open settings from toast actions
  useEffect(() => {
    const handler = () => {
      setSettingsOpen(true);
      setHelpOpen(false);
    };
    window.addEventListener("chataul:open-settings", handler);
    return () => window.removeEventListener("chataul:open-settings", handler);
  }, []);

  return (
    <ThemeProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar
          onOpenSettings={() => { setSettingsOpen(true); setHelpOpen(false); }}
          onOpenHelp={() => { setHelpOpen(true); setSettingsOpen(false); }}
        />
        <ErrorBoundary>
          <ChatView />
        </ErrorBoundary>
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
        <ToastContainer />
      </div>
    </ThemeProvider>
  );
}

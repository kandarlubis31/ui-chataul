"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "./Logo";

interface SplashScreenProps {
  loaded: boolean;
}

/**
 * Animated splash screen shown while stores load from IndexedDB.
 * Features:
 * - Circuit-like animated SVG path tracing
 * - Pulsing logo entry
 * - Glowing loading bar
 * - Smooth fade-out when loading completes
 */
export function SplashScreen({ loaded }: SplashScreenProps) {
  return (
    <AnimatePresence mode="wait">
      {!loaded && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--color-bg)]"
        >
          {/* Central logo with pulse */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative mb-8"
          >
            {/* Outer glow ring */}
            <motion.div
              className="absolute inset-[-12px] rounded-full border-2 border-[var(--color-accent)]/20"
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.08, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            {/* Inner glow ring */}
            <motion.div
              className="absolute inset-[-6px] rounded-full border border-[var(--color-accent)]/10"
              animate={{
                opacity: [0.5, 0.8, 0.5],
                scale: [1, 1.04, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3,
              }}
            />
            <Logo size={48} />
          </motion.div>

          {/* App name */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mb-1 text-xl font-semibold text-[var(--color-text)]"
          >
            UI ChatBotAul
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mb-10 text-sm text-[var(--color-text-secondary)]"
          >
            Loading your conversations...
          </motion.p>

          {/* Loading bar */}
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 160 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="relative h-1 overflow-hidden rounded-full bg-[var(--color-border)]"
          >
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)]"
              animate={{
                width: ["0%", "40%", "60%", "100%"],
                left: ["0%", "30%", "50%", "0%"],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>

          {/* Decorative dots at bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute bottom-12 flex items-center gap-2"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-tertiary)]"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

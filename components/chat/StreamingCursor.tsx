"use client";

import { motion } from "framer-motion";

/**
 * A pulsing thinking indicator with three dots, similar to Claude AI's loading state.
 * Shown while the AI is generating but no content has arrived yet.
 */
export function ThinkingDots() {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="inline-flex items-center gap-1"
      aria-label="AI is thinking"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-[var(--color-accent)]"
          animate={{
            opacity: [0.4, 1, 0.4],
            y: [0, -6, 0],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.2,
          }}
        />
      ))}
    </motion.span>
  );
}

/**
 * A simple blinking cursor for when text is already streaming.
 */
export function StreamingCursor() {
  return (
    <motion.span
      className="ml-0.5 inline-block h-[1.2em] w-[2px] bg-[var(--color-accent)] align-text-bottom"
      aria-hidden="true"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

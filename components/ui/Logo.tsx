"use client";

import { memo } from "react";

interface LogoProps {
  size?: number;
  className?: string;
  variant?: "full" | "icon";
}

export const Logo = memo(function Logo({ size = 28, className = "", variant = "full" }: LogoProps) {
  if (variant === "icon") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="UI ChatBotAul"
      >
        {/* Chat bubble background — Merah */}
        <path
          d="M12 28l-4-4H6c-1.7 0-3-1.3-3-3V9c0-1.7 1.3-3 3-3h20c1.7 0 3 1.3 3 3v12c0 1.7-1.3 3-3 3H12z"
          fill="#ef4444"
          opacity="0.12"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Circuit lines inside bubble */}
        <path
          d="M8 16h3l2-4 2 6 2-4 2 2h3"
          stroke="#ef4444"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        {/* Connection nodes */}
        <circle cx="6" cy="16" r="1.8" fill="#ef4444" opacity="0.7" />
        <circle cx="26" cy="16" r="1.8" fill="#ef4444" opacity="0.7" />
        {/* Center "A" letter */}
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#ef4444"
          fontFamily="system-ui, sans-serif"
        >
          A
        </text>
      </svg>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Outer chat bubble — Merah Putih */}
        <path
          d="M12 28l-4-4H6c-1.7 0-3-1.3-3-3V9c0-1.7 1.3-3 3-3h20c1.7 0 3 1.3 3 3v12c0 1.7-1.3 3-3 3H12z"
          fill="#ef4444"
          opacity="0.12"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Neural circuit lines */}
        <path
          d="M8 16h3l2-4 2 6 2-4 2 2h3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        {/* Connection nodes */}
        <circle cx="6" cy="16" r="1.8" fill="currentColor" opacity="0.7" />
        <circle cx="26" cy="16" r="1.8" fill="currentColor" opacity="0.7" />
        <circle cx="11" cy="16" r="1.2" fill="currentColor" opacity="0.5" />
        <circle cx="21" cy="16" r="1.2" fill="currentColor" opacity="0.5" />
        {/* Center "A" letter — Merah */}
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#ef4444"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.5"
        >
          A
        </text>
      </svg>
      <span className="text-sm font-semibold text-[var(--color-text)]">UI ChatBotAul</span>
    </div>
  );
});

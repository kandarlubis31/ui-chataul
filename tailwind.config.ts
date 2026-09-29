import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      maxWidth: {
        chat: "720px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      fontSize: {
        "body": ["0.9375rem", "1.6"],
      },
      colors: {
        light: {
          bg: "#fefefe",
          surface: "#ffffff",
          sidebar: "#fafafa",
          border: "#e5e7eb",
          text: "#0f172a",
          "text-secondary": "#475569",
          accent: "#dc2626",
          "accent-hover": "#b91c1c",
          "accent-soft": "#fef2f2",
          code: "#1a1a2e",
        },
        dark: {
          bg: "#0f0f14",
          surface: "#18181b",
          sidebar: "#141418",
          border: "#27272a",
          text: "#f1f5f9",
          "text-secondary": "#94a3b8",
          accent: "#ef4444",
          "accent-hover": "#dc2626",
          "accent-soft": "#1c1216",
          code: "#0d0d16",
        },
      },
    },
  },
  plugins: [],
};

export default config;

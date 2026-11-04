# Ui-chataul

## Tentang Project

A modern AI chat interface inspired by Claude.ai's clean, conversation-focused design. Built with Next.js 14, TypeScript, and Tailwind CSS.

**Fitur:** multi-provider (OpenAI / Anthropic / Ollama + endpoint OpenAI-compatible), streaming dengan buffered SSE parser, streaming markdown, upload gambar + PDF/teks (diekstrak server-side via unpdf), web search DuckDuckGo, pencarian chat lintas session, export Markdown, PWA-ready (manifest + ikon), virtualized message list, IndexedDB persistence (pesan lama dipaginasi, base64 file di-strip dari memori).

## Tech Stack

Next.js 14 · TypeScript · Tailwind CSS · Zustand · IndexedDB (idb) · react-virtuoso · react-markdown (+ KaTeX, highlight.js, GFM) · framer-motion · unpdf · cheerio · Zod

## Struktur Utama

```
app/            # page.tsx (layout), api/chat (streaming + rate limit + SSRF guard), api/health
components/     # chat/, sidebar/, settings/, markdown/, ui/ primitives
lib/            # providers/, store/ (Zustand), db/ (IndexedDB), sse.ts, markdown.ts, compressContext.ts, ratelimit.ts
tests/          # unit tests (vitest) untuk pure functions
public/         # manifest.json, icon.svg (PWA)
styles/         # globals.css (design tokens light/dark)
```

## Menjalankan

Package manager: **pnpm** (jangan npm — jaga `pnpm-lock.yaml` tetap sinkron).

```bash
pnpm install
pnpm dev        # development
pnpm build      # production build
pnpm test       # unit tests (vitest)
pnpm typecheck  # tsc --noEmit
pnpm lint       # next lint
```

Salin `.env.local.example` → `.env.local` untuk konfigurasi (provider key, `NEXT_PUBLIC_LOCKED` untuk shared mode).
# Ui-chataul — Project Context

## Ringkasan

A modern AI chat interface inspired by Claude.ai's clean, conversation-focused design. Built with Next.js 14, TypeScript, and Tailwind CSS.

## Arsitektur

- **`app/api/chat/route.ts`** — endpoint streaming: validasi Zod, rate limit per-IP (20 req/menit, in-memory sliding window), SSRF guard pada `baseURL` (scheme http/https saja; di locked mode juga blokir localhost/private/metadata IP), ekstraksi teks PDF & file teks via `unpdf`, auto-correct baseURL untuk key OpenRouter (`sk-or-v1-`), web search DuckDuckGo (cheerio), dan abort upstream saat client disconnect (tombol Stop).
- **`lib/sse.ts`** — buffered SSE parser; `data:` line yang kepotong antar TCP chunk tidak lagi hilang. Dipakai provider dan sisi client.
- **`lib/providers/`** — abstraksi `ChatProvider.streamChat()` dengan `signal?: AbortSignal`, callback `onToken`/`onUsage`/`onComplete`/`onError`. `openai.ts` (juga untuk Ollama/LM Studio via baseURL) & `anthropic.ts` (usage dari event `message_start`/`message_delta`).
- **`lib/store/chatStore.ts`** — Zustand + IndexedDB (`lib/db/indexeddb.ts`). `MAX_IN_MEMORY` 60 pesan, paginasi scroll-up 30, base64 file di-strip dari memori. `streamSessionId` guard: commit stream selalu ke session tempat stream dimulai. `deleteMessagesFrom` menghapus dari IndexedDB (dipakai edit/regenerate). Regenerate/edit meng-hydrate file (base64) dari DB via `getMessage`.
- **`lib/compressContext.ts`** — kompresi konteks: anchor percakapan awal + pesan terbaru sesuai budget token; tabel context window model modern (prefix match), fallback konservatif 8k untuk model lokal tak dikenal.
- **`components/`** — ChatView (streaming markdown dengan fence-balance + debounce, abort saat ganti session), MessageList (react-virtuoso), MessageInput, Sidebar (search bar lintas session via `searchMessages`, hasil diurutkan by recency + di-highlight), SettingsDialog (model picker searchable untuk OpenRouter/Ollama/endpoint OpenAI-compatible), UI primitives (Toast, ContextMenu, ErrorBoundary, ThemeProvider, SplashScreen).
- **`public/`** — PWA: `manifest.json` + `icon.svg` (terpasang di `app/layout.tsx` metadata).

## Konvensi

- Package manager: **pnpm** saja (jangan npm) — jaga `pnpm-lock.yaml` sinkron.
- Testing: `pnpm test` (vitest, `tests/`) untuk pure functions — SSE parser, markdown, token estimator, context compression, rate limiter.
- Sebelum commit: `pnpm typecheck && pnpm test && pnpm build`.

---

*Generated: 2026-08-08 · Updated: 2026-09-15 · Path: nodeJS\Ui-chataul*

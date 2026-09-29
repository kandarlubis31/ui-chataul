import { NextRequest } from "next/server";
import { z } from "zod";
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import { getProvider } from "@/lib/providers";
import { checkRateLimitAsync } from "@/lib/ratelimit";
import type { ChatProviderType, ChatMessage, StreamOptions, ChatProviderConfig } from "@/lib/providers";

/**
 * Text-based attachments (PDF, txt, md, json, csv, code files) are extracted
 * server-side and appended to the message text. Images stay as base64 and are
 * passed to the provider natively. Max text size kept generous but bounded.
 */
const MAX_TEXT_ATTACHMENT_CHARS = 100_000;

const TEXT_ATTACHMENT_TYPES: Record<string, "pdf" | "text"> = {
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
  "application/json": "text",
};

/** Infer kind from extension when MIME type is missing or generic */
function textAttachmentKind(type: string, name: string): "pdf" | "text" | null {
  const byType = TEXT_ATTACHMENT_TYPES[type];
  if (byType) return byType;
  if (type.startsWith("text/")) return "text";

  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["txt", "md", "markdown", "csv", "json", "log", "ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "css", "html", "xml", "yml", "yaml", "sql", "sh"].includes(ext)) {
    return "text";
  }
  return null;
}

async function extractPdfText(base64: string): Promise<string> {
  const base64Data = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const bytes = Buffer.from(base64Data, "base64");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

function decodeTextAttachment(base64: string): string {
  const base64Data = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  return Buffer.from(base64Data, "base64").toString("utf-8");
}

/**
 * Convert file attachments into model-readable content:
 * - images  → kept as base64 for the provider (handled per-provider)
 * - PDF/text → extracted text appended to the message content
 */
async function inlineTextAttachments(
  messages: Array<z.infer<typeof requestSchema>["messages"][number]>,
): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];

  for (const msg of messages) {
    if (!msg.files || msg.files.length === 0) {
      out.push({ role: msg.role, content: msg.content });
      continue;
    }

    let content = msg.content;

    for (const file of msg.files) {
      const kind = textAttachmentKind(file.type, file.name);
      if (!kind) continue; // images pass through untouched

      try {
        if (kind === "pdf") {
          const raw = await extractPdfText(file.data);
          const text = raw.replace(/\s+\n/g, "\n").trim().slice(0, MAX_TEXT_ATTACHMENT_CHARS);
          content += `\n\n--- Attached file: ${file.name} (PDF) ---\n${text || "[No extractable text found in this PDF]"}\n--- End of ${file.name} ---`;
        } else {
          const text = decodeTextAttachment(file.data).slice(0, MAX_TEXT_ATTACHMENT_CHARS);
          content += `\n\n--- Attached file: ${file.name} ---\n${text}\n--- End of ${file.name} ---`;
        }
      } catch (e) {
        content += `\n\n[Attachment ${file.name} could not be read: ${(e as Error).message}]`;
      }
    }

    out.push({ role: msg.role, content, files: msg.files as ChatMessage["files"] });
  }

  return out;
}

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Search DuckDuckGo and return formatted results as plain text.
 * Uses the HTML endpoint (no API key needed).
 */
async function searchDuckDuckGo(query: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: new URLSearchParams({ q: query }).toString(),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const results: string[] = [];
    $(".result").each((_i, el) => {
      const title = $(el).find(".result__title").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      if (title && snippet) {
        results.push(`${title}: ${snippet}`);
      }
    });

    return results.slice(0, 5).join("\n\n");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const requestSchema = z.object({
  provider: z.enum(["openai", "anthropic", "ollama"]),
  baseURL: z.string().url(),
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
      files: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            size: z.number(),
            data: z.string(),
            preview: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().min(1).max(32768).optional().default(4096),
  systemPrompt: z.string().optional(),
  useServerKey: z.boolean().optional().default(false),
  numCtx: z.number().min(128).max(32768).optional(),
  webSearchEnabled: z.boolean().optional().default(false),
  useModelDefaults: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    // --- Rate limiting ---
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const { allowed, remaining, resetMs } = await checkRateLimitAsync(ip, 20, 60_000);

    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Try again in ${Math.ceil(resetMs / 1000)}s.`,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(Math.ceil(resetMs / 1000)),
          },
        },
      );
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { provider, baseURL, model, messages, temperature, maxTokens, systemPrompt, webSearchEnabled, useModelDefaults } = parsed.data;

    // Extract text from PDF/text attachments so non-image files actually reach the model
    const inlinedMessages = await inlineTextAttachments(messages);

    // API key resolution:
    // - If locked mode or useServerKey is true, use PROVIDER_API_KEY from server .env
    // - Otherwise, use the client-provided Authorization header (BYOK)
    const serverKey = process.env.PROVIDER_API_KEY;
    const isLockedMode = process.env.NEXT_PUBLIC_LOCKED === "true";
    const shouldUseServerKey = parsed.data.useServerKey || isLockedMode;
    let apiKey: string;

    if (shouldUseServerKey) {
      if (!serverKey) {
        const errMsg = isLockedMode
          ? "Locked/shared mode is active but PROVIDER_API_KEY is not set in server .env. Ask the admin to add this environment variable."
          : "Server key mode is enabled but PROVIDER_API_KEY is not set in server environment.";
        return new Response(
          JSON.stringify({ error: errMsg }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      apiKey = serverKey;
    } else {
      apiKey = request.headers.get("Authorization")?.replace("Bearer ", "") || "";

      // If no client key provided but server has one, fall back to it with a warning
      if (!apiKey && serverKey) {
        console.warn(
          `[chataul] WARNING: Using server PROVIDER_API_KEY for request from ${ip}. ` +
          `Consider requiring client-side API keys for production deployments.`,
        );
        apiKey = serverKey;
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "No API key provided. Set it in Settings or provide the PROVIDER_API_KEY environment variable.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Auto-correct baseURL for OpenRouter keys: sk-or-v1- keys MUST go to OpenRouter
    let resolvedBaseURL = baseURL;
    let urlCorrected = false;
    if (/^sk-or-v1-/.test(apiKey) && !baseURL.includes("openrouter.ai")) {
      console.info(`[chataul] Auto-switching baseURL to OpenRouter (detected sk-or-v1- key)`);
      resolvedBaseURL = "https://openrouter.ai/api/v1";
      urlCorrected = true;
    }

    // ── SSRF guard ──
    // Always: only http(s) schemes are allowed (blocks file:/data:/etc).
    // In locked/shared mode: additionally block localhost, private ranges, and
    // cloud-metadata hosts, so users can't make the server call internal
    // services with the server key. (Self-hosted single-user setups keep
    // http://localhost:11434 Ollama working — the guard only bites when locked.)
    {
      let parsedURL: URL;
      try {
        parsedURL = new URL(resolvedBaseURL);
      } catch {
        return new Response(
          JSON.stringify({ error: `Invalid baseURL: ${resolvedBaseURL}` }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const host = parsedURL.hostname.toLowerCase();
      const schemeBlocked = parsedURL.protocol !== "https:" && parsedURL.protocol !== "http:";
      const internalHost =
        isLockedMode &&
        (host === "localhost" ||
          host.endsWith(".localhost") ||
          host === "0.0.0.0" ||
          host === "::1" ||
          host === "[::1]" ||
          host.startsWith("127.") ||
          host.startsWith("169.254.") ||
          host.startsWith("10.") ||
          host.startsWith("192.168.") ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
          host === "metadata.google.internal");
      if (schemeBlocked || internalHost) {
        return new Response(
          JSON.stringify({
            error: `Blocked baseURL "${resolvedBaseURL}": internal hosts are not allowed in locked/shared mode.`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // ── If Use Modelfile Defaults: null out overrides so Ollama uses Modelfile ──
    let resolvedSystemPrompt: string | undefined = systemPrompt;
    let resolvedTemperature: number | undefined = temperature;
    let resolvedMaxTokens: number | undefined = maxTokens;
    let resolvedNumCtx: number | undefined = parsed.data.numCtx;

    if (useModelDefaults) {
      resolvedSystemPrompt = undefined;
      resolvedTemperature = undefined;
      resolvedMaxTokens = undefined;
      resolvedNumCtx = undefined;
    }

    // ── Web Search: fetch DuckDuckGo results and inject into prompt ──
    if (webSearchEnabled && messages.length > 0) {
      // Get the last user message as search query
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg && lastUserMsg.content.trim()) {
        const searchQuery = lastUserMsg.content.trim().slice(0, 200);
        try {
          const searchResults = await searchDuckDuckGo(searchQuery);
          if (searchResults) {
            const searchContext = `Berikut adalah hasil pencarian web untuk konteks:\n\n${searchResults}\n\nGunakan informasi di atas untuk membantu menjawab pertanyaan user.`;
            resolvedSystemPrompt = resolvedSystemPrompt
              ? `${resolvedSystemPrompt}\n\n${searchContext}`
              : searchContext;
          }
        } catch (e) {
          console.warn(`[chataul] Web search failed:`, e);
        }
      }
    }

    const chatProvider = getProvider(provider as ChatProviderType);

    // Set up SSE streaming
    const encoder = new TextEncoder();
    let aborted = false;
    let upstreamAbort: AbortController | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        // Propagate client disconnects (Stop button / tab close) to the upstream
        // provider so we stop paying for tokens nobody will receive.
        upstreamAbort = new AbortController();
        request.signal.addEventListener("abort", () => upstreamAbort?.abort(), { once: true });
        // Send corrected baseURL as first event so the client can update settings
        if (urlCorrected) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ correctedBaseURL: resolvedBaseURL })}\n\n`),
          );
        }

        const onToken = (token: string) => {
          if (!aborted) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          }
        };

        const onComplete = () => {
          if (!aborted) {
            try {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch {
              // Stream already cancelled by the client — nothing to send.
            }
          }
        };

        const onUsage = (usage: { inputTokens: number; outputTokens: number }) => {
          if (!aborted) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ usage })}\n\n`),
            );
          }
        };

        const onError = (error: Error) => {
          if (!aborted) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`),
              );
              controller.close();
            } catch {
              // Stream already cancelled by the client — nothing to send.
            }
          }
        };

        try {
          await chatProvider.streamChat(inlinedMessages, {
            baseURL: resolvedBaseURL,
            apiKey,
            model,
            temperature: resolvedTemperature,
            maxTokens: resolvedMaxTokens,
            systemPrompt: resolvedSystemPrompt,
            numCtx: resolvedNumCtx,
            signal: upstreamAbort.signal,
            onToken,
            onComplete,
            onError,
            onUsage,
          });
        } catch (error) {
          // AbortError is expected when the client disconnected — don't report it.
          if ((error as Error).name !== "AbortError") {
            onError(error as Error);
          }
        }
      },
      cancel() {
        aborted = true;
        upstreamAbort?.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

import type { ChatProvider, ChatProviderConfig, StreamOptions, ChatMessage } from "./types";
import { createSSEParser } from "@/lib/sse";

function buildAnthropicMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
): {
  system?: string;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> }>;
} {
  const result: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>;
  }> = [];

  for (const msg of messages) {
    if (!msg.files || msg.files.length === 0) {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    const contentParts: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];
    contentParts.push({ type: "text", text: msg.content });

    for (const file of msg.files) {
      if (file.type.startsWith("image/") && file.data) {
        const base64Data = file.data.replace(/^data:image\/\w+;base64,/, "");
        contentParts.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.type,
            data: base64Data,
          },
        });
      }
    }

    result.push({ role: "user", content: contentParts });
  }

  return {
    system: systemPrompt || undefined,
    messages: result,
  };
}

export const anthropicProvider: ChatProvider = {
  async streamChat(messages: ChatMessage[], options: StreamOptions & ChatProviderConfig) {
    const { baseURL, apiKey, model, temperature, maxTokens, systemPrompt, signal, onToken, onComplete, onError, onUsage } = options;

    // Strip trailing slash to prevent double-slash in endpoint URL (e.g., //messages → 404)
    const normalizedBase = baseURL.trim().replace(/\/+$/, "");

    const { system, messages: anthropicMessages } = buildAnthropicMessages(messages, systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: maxTokens ?? 4096,
      temperature: temperature ?? 0.7,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    try {
      const response = await fetch(`${normalizedBase}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";
      let finished = false;

      // Anthropic streaming events:
      // - message_start  → message.usage.input_tokens (prompt tokens, arrives FIRST)
      // - content_block_delta → delta.text (the actual tokens)
      // - message_delta  → usage.output_tokens (final count, arrives near the end)
      // - message_stop   → end of stream
      const parser = createSSEParser((data) => {
        try {
          const parsed = JSON.parse(data);

          if (parsed.type === "content_block_delta") {
            const content = parsed.delta?.text;
            if (content) {
              fullText += content;
              onToken?.(content);
            }
          } else if (parsed.type === "message_start") {
            const usage = parsed.message?.usage;
            if (usage) {
              onUsage?.({
                inputTokens: usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
              });
            }
          } else if (parsed.type === "message_delta") {
            const usage = parsed.usage;
            if (usage) {
              onUsage?.({
                inputTokens: usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
              });
            }
          } else if (parsed.type === "message_stop") {
            finished = true;
            onComplete?.(fullText);
          } else if (parsed.type === "error") {
            throw new Error(parsed.error?.message || "Anthropic stream error");
          }
        } catch (e) {
          // Only propagate real errors — JSON parse failures of complete lines
          // shouldn't happen with the buffered parser
          if ((e as Error).message && !(e instanceof SyntaxError)) throw e;
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done || finished) break;
        parser.push(decoder.decode(value, { stream: true }));
      }

      parser.flush();
      if (!finished) onComplete?.(fullText);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        onComplete?.("");
        return;
      }
      onError?.(error as Error);
    }
  },
};

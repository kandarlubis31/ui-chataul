import type { ChatProvider, ChatProviderConfig, StreamOptions, ChatMessage } from "./types";
import { createSSEParser } from "@/lib/sse";

/** Check if a model is an o-series reasoning model */
function isReasoningModel(model: string): boolean {
  return /^o[134]/.test(model) || model.includes("o1-") || model.includes("o3-") || model.includes("o4-");
}

function buildMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
  model?: string,
): Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> {
  const result: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }> = [];

  if (systemPrompt) {
    // o-series models use "developer" role instead of "system"
    const role = model && isReasoningModel(model) ? "developer" : "system";
    result.push({ role, content: systemPrompt });
  }

  for (const msg of messages) {
    if (!msg.files || msg.files.length === 0) {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    contentParts.push({ type: "text", text: msg.content });

    for (const file of msg.files) {
      if (file.type.startsWith("image/") && file.data) {
        contentParts.push({
          type: "image_url",
          image_url: { url: file.data },
        });
      }
    }

    result.push({ role: "user", content: contentParts });
  }

  return result;
}

export const openaiProvider: ChatProvider = {
  async streamChat(messages: ChatMessage[], options: StreamOptions & ChatProviderConfig) {
    const { baseURL, apiKey, model, temperature, maxTokens, systemPrompt, numCtx, signal, onToken, onComplete, onError, onUsage } = options;

    // Strip trailing slash to prevent double-slash in endpoint URL (e.g., //chat/completions → 404)
    const normalizedBase = baseURL.trim().replace(/\/+$/, "");

    const reasoning = isReasoningModel(model);

    const body: Record<string, unknown> = {
      model,
      messages: buildMessages(messages, systemPrompt, model),
      stream: true,
    };

    // o-series models don't support temperature
    if (!reasoning) {
      body.temperature = temperature ?? 0.7;
    }

    // o-series models use max_completion_tokens instead of max_tokens
    if (reasoning) {
      body.max_completion_tokens = maxTokens ?? 4096;
    } else {
      body.max_tokens = maxTokens ?? 4096;
      // Include usage stats in stream for non-reasoning models.
      // Only send to native OpenAI — proxies (OpenRouter, Ollama, LM Studio, etc.) may reject it
      if (normalizedBase === "https://api.openai.com/v1") {
        body.stream_options = { include_usage: true };
      }
    }

    // Ollama-specific: pass num_ctx and repeat_penalty in options (ignored by OpenAI/Anthropic)
    if (numCtx) {
      body.options = { num_ctx: numCtx, repeat_penalty: 1.15 };
    }

    try {
      const response = await fetch(`${normalizedBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      const parser = createSSEParser((data) => {
        if (data === "[DONE]") {
          onComplete?.(fullText);
          finished = true;
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onToken?.(content);
          }
          // Capture usage from stream
          if (parsed.usage) {
            onUsage?.({
              inputTokens: parsed.usage.prompt_tokens ?? 0,
              outputTokens: parsed.usage.completion_tokens ?? 0,
            });
          }
        } catch {
          // skip malformed chunks (buffered parser guarantees complete JSON lines)
        }
      });

      let fullText = "";
      let finished = false;

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

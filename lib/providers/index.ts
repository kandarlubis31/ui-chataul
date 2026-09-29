import { ChatProvider, ChatProviderType } from "./types";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";

export function getProvider(type: ChatProviderType): ChatProvider {
  switch (type) {
    case "openai":
    case "ollama":
      return openaiProvider;
    case "anthropic":
      return anthropicProvider;
    default:
      return openaiProvider;
  }
}

export { type ChatProvider, type ChatProviderType, type ChatMessage, type UploadedFile, type StreamOptions, type ChatProviderConfig, type TokenUsage } from "./types";

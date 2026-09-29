export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  files?: UploadedFile[];
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64
  preview?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StreamOptions {
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
  onUsage?: (usage: TokenUsage) => void;
}

export interface ChatProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  numCtx?: number;
  useModelDefaults?: boolean;
  webSearchEnabled?: boolean;
}

export type ChatProviderType = "openai" | "anthropic" | "ollama";

export interface ChatProvider {
  streamChat(
    messages: ChatMessage[],
    options: StreamOptions & ChatProviderConfig,
  ): Promise<void>;
}

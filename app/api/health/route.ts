import { NextResponse } from "next/server";

interface HealthResponse {
  status: "ok" | "unconfigured";
  serverKeySet: boolean;
  keyPrefix: string | null;
  detectedProvider: "openrouter" | "openai" | "anthropic" | "ollama" | "unknown";
  suggestedBaseURL: string;
  provider: "openai" | "anthropic"; // default provider type
  timestamp: number;
}

export async function GET() {
  const serverKey = process.env.PROVIDER_API_KEY;

  const detectedProvider = detectProvider(serverKey);
  const suggestedBaseURL = getSuggestedBaseURL(detectedProvider);

  const response: HealthResponse = {
    status: serverKey ? "ok" : "unconfigured",
    serverKeySet: !!serverKey,
    keyPrefix: serverKey ? maskKey(serverKey) : null,
    detectedProvider,
    suggestedBaseURL,
    provider: "openai", // default for OpenAI-compatible APIs
    timestamp: Date.now(),
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function maskKey(key: string): string {
  if (key.length <= 15) return key.slice(0, 7) + "…";
  return key.slice(0, 12) + "…";
}

function detectProvider(
  key: string | undefined,
): "openrouter" | "openai" | "anthropic" | "ollama" | "unknown" {
  if (!key) return "unknown";
  if (/^sk-or-v1-/.test(key)) return "openrouter";
  if (/^sk-ant/.test(key)) return "anthropic";
  if (/^sk-/.test(key)) return "openai";
  return "unknown";
}

function getSuggestedBaseURL(
  provider: "openrouter" | "openai" | "anthropic" | "ollama" | "unknown",
): string {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "openai":
    default:
      return "https://api.openai.com/v1";
  }
}

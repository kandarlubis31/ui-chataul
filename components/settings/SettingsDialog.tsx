"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, EyeOff, Save, RefreshCw, ChevronDown, Search, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import type { ChatProviderType } from "@/lib/providers";
import { IS_LOCKED } from "@/lib/isLocked";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDERS: { value: ChatProviderType; label: string; defaultModel: string; defaultURL: string }[] = [
  {
    value: "openai",
    label: "OpenAI / Compatible",
    defaultModel: "gpt-4o",
    defaultURL: "https://api.openai.com/v1",
  },
  {
    value: "anthropic",
    label: "Anthropic Claude",
    defaultModel: "claude-3-5-sonnet-20241022",
    defaultURL: "https://api.anthropic.com/v1",
  },
  {
    value: "ollama",
    label: "Ollama (Local)",
    defaultModel: "llama3.2",
    defaultURL: "http://localhost:11434/v1",
  },
];

const FALLBACK_MODELS: Record<ChatProviderType, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-mini", "o1-preview"],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
  ],
  ollama: [
    "llama3.2",
    "llama3.1",
    "llama3",
    "mistral",
    "mixtral",
    "codellama",
    "deepseek-coder",
    "phi",
    "phi3",
    "qwen2",
    "qwen2.5",
    "gemma2",
    "nemotron-mini",
  ],
};

interface FetchedModel {
  id: string;
  name: string;
  context_length: number;
  pricing?: { prompt?: string; completion?: string };
  description?: string;
}

interface ServerHealth {
  status: "ok" | "unconfigured";
  serverKeySet: boolean;
  keyPrefix: string | null;
  detectedProvider: "openrouter" | "openai" | "anthropic" | "unknown";
  suggestedBaseURL: string;
  timestamp: number;
}

const OR_MODELS_CACHE_KEY = "openrouter-models-cache";
const OR_MODELS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const OLLAMA_MODELS_CACHE_KEY = "ollama-models-cache";
const OLLAMA_MODELS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const OPENAI_MODELS_CACHE_KEY = "openai-models-cache";
const OPENAI_MODELS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function loadCachedModels(cacheKey: string, ttl: number): FetchedModel[] | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const { models, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < ttl) return models;
    return null;
  } catch {
    return null;
  }
}

function cacheModels(cacheKey: string, models: FetchedModel[]) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ models, timestamp: Date.now() }));
  } catch {}
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const {
    provider,
    baseURL,
    apiKey,
    model,
    temperature,
    maxTokens,
    systemPrompt,
    numCtx,
    loaded,
    useServerKey,
    webSearchEnabled,
    useModelDefaults,
    setProvider,
    setBaseURL,
    setApiKey,
    setModel,
    setTemperature,
    setMaxTokens,
    setSystemPrompt,
    setUseServerKey,
    setNumCtx,
    setWebSearchEnabled,
    setUseModelDefaults,
  } = useSettingsStore();

  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(apiKey);

  // Server health check state
  const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Model dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState(model);
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>(() => {
    const p = useSettingsStore.getState().provider;
    if (p === "ollama") {
      return loadCachedModels(OLLAMA_MODELS_CACHE_KEY, OLLAMA_MODELS_CACHE_TTL) ?? [];
    }
    if (p === "openai") {
      return loadCachedModels(OPENAI_MODELS_CACHE_KEY, OPENAI_MODELS_CACHE_TTL) ?? [];
    }
    return loadCachedModels(OR_MODELS_CACHE_KEY, OR_MODELS_CACHE_TTL) ?? [];
  });
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Sync local key with store
  useEffect(() => {
    setLocalKey(apiKey);
  }, [apiKey]);

  // Fetch server health when dialog opens or useServerKey toggles on
  useEffect(() => {
    if (!open) return;
    if (useServerKey || IS_LOCKED) {
      fetchServerHealth();
    }
  }, [open, useServerKey]);

  const fetchServerHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const health: ServerHealth = await res.json();
        setServerHealth(health);
        // Auto-correct baseURL if server suggests a different one (only override defaults)
        if (health.serverKeySet && health.suggestedBaseURL !== baseURL && baseURL === "https://api.openai.com/v1") {
          setBaseURL(health.suggestedBaseURL);
        }
      } else {
        setServerHealth(null);
      }
    } catch {
      setServerHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, [baseURL, setBaseURL]);

  // Sync modelSearch when model changes externally
  useEffect(() => {
    setModelSearch(model);
  }, [model]);

  // Focus trap: save & restore focus
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      // Focus the first focusable element in the dialog
      const timer = setTimeout(() => {
        dialogRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button')?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap: Tab/Shift+Tab
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current || highlightIdx < 0) return;
    const items = listRef.current.children;
    if (items[highlightIdx]) {
      items[highlightIdx].scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx]);

  // Key prefix validation — requires actual characters after the prefix, not just the prefix itself
  const keyValidation = (() => {
    const key = localKey.trim();
    if (!key) return null;

    if (provider === "openai") {
      // OpenRouter: sk-or-v1- followed by actual key chars
      if (/^sk-or-v1-[A-Za-z0-9_-]{10,}$/.test(key)) return { valid: true, label: "OpenRouter", format: "sk-or-v1-..." };
      // OpenAI: sk-proj-... or sk-... followed by actual key chars
      if (/^sk-(proj-)?[A-Za-z0-9_-]{10,}$/.test(key)) return { valid: true, label: "OpenAI", format: "sk-... or sk-proj-..." };
      // Partial prefix: show as invalid only if they typed enough to look like a key
      if (key.length >= 4) return { valid: false, label: "Invalid", format: "Expected sk-... or sk-or-v1-..." };
      return null;
    }
    if (provider === "anthropic") {
      if (/^sk-ant(-api)?-[A-Za-z0-9_-]{10,}$/.test(key)) return { valid: true, label: "Anthropic", format: "sk-ant-..." };
      if (key.length >= 4) return { valid: false, label: "Invalid", format: "Expected sk-ant-..." };
      return null;
    }
    if (provider === "ollama") {
      // Ollama runs locally — no API key required by default
      if (!key) return { valid: true, label: "No key needed", format: "Local Ollama" };
      return { valid: true, label: "Custom", format: "Optional for Ollama" };
    }
    return null;
  })();

  // Auto-detect OpenRouter key when user types/pastes
  const handleKeyChange = useCallback(
    (value: string) => {
      setLocalKey(value);
      // Auto-detect OpenRouter key format: sk-or-v1-...
      if (/^sk-or-v1-/.test(value.trim()) && baseURL !== OPENROUTER_BASE && baseURL === "https://api.openai.com/v1") {
        setBaseURL(OPENROUTER_BASE);
      }
    },
    [baseURL, setBaseURL],
  );

  // Fetch models from OpenRouter
  const fetchOpenRouterModels = useCallback(async () => {
    const key = localKey || apiKey;
    if (!key) {
      setFetchError("Enter an API key first");
      return;
    }
    if (!key.startsWith("sk-or-v1-")) {
      setFetchError("OpenRouter key must start with sk-or-v1-");
      return;
    }

    setIsFetchingModels(true);
    setFetchError(null);

    try {
      const res = await fetch(`${OPENROUTER_BASE}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 120)}`);
      }
      const json = await res.json();
      const models: FetchedModel[] = (json.data ?? []).map((m: Record<string, unknown>) => ({
        id: String(m.id ?? ""),
        name: String(m.name ?? m.id ?? ""),
        context_length: Number(m.context_length ?? 0),
        pricing: m.pricing as FetchedModel["pricing"],
        description: String(m.description ?? ""),
      }));
      // Sort: free models first, then by context_length descending
      models.sort((a, b) => {
        const aFree = !a.pricing?.prompt || a.pricing.prompt === "0";
        const bFree = !b.pricing?.prompt || b.pricing.prompt === "0";
        if (aFree && !bFree) return -1;
        if (!aFree && bFree) return 1;
        return (b.context_length ?? 0) - (a.context_length ?? 0);
      });
      setFetchedModels(models);
      cacheModels(OR_MODELS_CACHE_KEY, models);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setIsFetchingModels(false);
    }
  }, [localKey, apiKey]);

  // Fetch models from Ollama
  const fetchOllamaModels = useCallback(async () => {
    const url = baseURL.replace(/\/+$/, "").replace(/\/v1$/, "");
    if (!url) {
      setFetchError("Set a Base URL first");
      return;
    }

    setIsFetchingModels(true);
    setFetchError(null);

    try {
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${err.slice(0, 120)}`);
      }
      const json = await res.json();
      const models: FetchedModel[] = (json.models ?? []).map((m: Record<string, unknown>) => {
        const details = m.details as Record<string, unknown> | undefined;
        const paramSize = String(details?.parameter_size ?? "");
        const quant = String(details?.quantization_level ?? "");
        const desc = [paramSize, quant].filter(Boolean).join(" · ");
        return {
          id: String(m.name ?? ""),
          name: String(m.name ?? ""),
          context_length: 0,
          description: desc || undefined,
        };
      });
      models.sort((a, b) => a.id.localeCompare(b.id));
      setFetchedModels(models);
      cacheModels(OLLAMA_MODELS_CACHE_KEY, models);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setIsFetchingModels(false);
    }
  }, [baseURL]);

  // Fetch models from any OpenAI-compatible endpoint (OpenAI native, LM Studio, vLLM, etc.)
  const fetchOpenAICompatibleModels = useCallback(async () => {
    const url = baseURL.replace(/\/+$/, "");
    if (!url) {
      setFetchError("Set a Base URL first");
      return;
    }

    setIsFetchingModels(true);
    setFetchError(null);

    try {
      const key = localKey || apiKey;
      const res = await fetch(`${url}/models`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 120)}`);
      }
      const json = await res.json();
      const models: FetchedModel[] = (json.data ?? []).map((m: Record<string, unknown>) => ({
        id: String(m.id ?? ""),
        name: String(m.name ?? m.id ?? ""),
        context_length: Number(m.context_length ?? 0),
        description: String(m.owned_by ?? ""),
      }));
      models.sort((a, b) => a.id.localeCompare(b.id));
      setFetchedModels(models);
      cacheModels(OPENAI_MODELS_CACHE_KEY, models);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setIsFetchingModels(false);
    }
  }, [baseURL, localKey, apiKey]);

  // Build combined model list for dropdown
  const getDropdownModels = useCallback((): { label: string; items: FetchedModel[] }[] => {
    const query = modelSearch.toLowerCase().trim();

    // If we have fetched models (OpenRouter), use them
    if (fetchedModels.length > 0 && baseURL.includes("openrouter.ai")) {
      const filtered = query
        ? fetchedModels.filter(
            (m) =>
              m.id.toLowerCase().includes(query) ||
              m.name.toLowerCase().includes(query),
          )
        : fetchedModels;
      return [{ label: "OpenRouter Models", items: filtered.slice(0, 100) }];
    }

    // If we have fetched models (OpenAI-compatible endpoint), use them
    if (fetchedModels.length > 0 && provider === "openai") {
      const filtered = query
        ? fetchedModels.filter(
            (m) =>
              m.id.toLowerCase().includes(query) ||
              m.name.toLowerCase().includes(query),
          )
        : fetchedModels;
      return [{ label: "Available Models", items: filtered }];
    }

    // If we have fetched models (Ollama), use them
    if (fetchedModels.length > 0 && provider === "ollama") {
      const filtered = query
        ? fetchedModels.filter((m) => m.id.toLowerCase().includes(query))
        : fetchedModels;
      return [{ label: "Ollama Models", items: filtered }];
    }

    // Fallback static suggestions
    const suggestions = FALLBACK_MODELS[provider] ?? [];
    const filtered = query
      ? suggestions.filter((s) => s.toLowerCase().includes(query))
      : suggestions;
    const items: FetchedModel[] = filtered.map((s) => ({ id: s, name: s, context_length: 0 }));
    return [{ label: `${PROVIDERS.find((p) => p.value === provider)?.label ?? "Provider"} Models`, items }];
  }, [modelSearch, fetchedModels, provider, baseURL]);

  // Keyboard navigation
  const handleModelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!dropdownOpen) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          setDropdownOpen(true);
          setHighlightIdx(0);
          e.preventDefault();
        }
        return;
      }

      const groups = getDropdownModels();
      const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIdx((prev) => (prev + 1) % Math.max(totalItems, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIdx((prev) => (prev - 1 + totalItems) % Math.max(totalItems, 1));
          break;
        case "Enter":
          e.preventDefault();
          if (highlightIdx >= 0) {
            let flatIdx = 0;
            for (const group of groups) {
              if (highlightIdx < flatIdx + group.items.length) {
                const selected = group.items[highlightIdx - flatIdx];
                setModel(selected.id);
                setModelSearch(selected.id);
                setDropdownOpen(false);
                setHighlightIdx(-1);
                return;
              }
              flatIdx += group.items.length;
            }
          }
          break;
        case "Escape":
          setDropdownOpen(false);
          setHighlightIdx(-1);
          break;
      }
    },
    [dropdownOpen, highlightIdx, getDropdownModels, setModel],
  );

  if (!loaded) return null;

  // ── Locked mode: simplified UI ──
  // Early return so all the heavy model-dropdown & API-key code below is never evaluated
  if (IS_LOCKED) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50"
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onKeyDown={handleDialogKeyDown}
            >
          <div
            ref={dialogRef}
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
              <h2 id="settings-title" className="text-lg font-semibold text-[var(--color-text)]">
                Preferences
              </h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Admin banner */}
              <div className="rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4 text-center">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                  🔒 Managed by Admin
                </h3>
                <p className="mt-1.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  The API key, provider, and model are configured by the admin.
                  You can adjust your personal preferences below.
                </p>
              </div>

              {/* Read-only model display */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                  Model
                </label>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 font-mono text-sm text-[var(--color-text)]">
                  {model || "gpt-4o"}
                </div>
              </div>

              {/* Temperature */}
              <div>
                <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-[var(--color-text)]">
                  <span>Temperature</span>
                  <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                    {temperature.toFixed(1)}
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--color-text-secondary)]">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>

              {/* Max Tokens */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min={256}
                  max={32768}
                  step={256}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 font-mono text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                  System Prompt
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  placeholder="You are a helpful assistant."
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--color-border)] px-6 py-4">
              <button
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
              >
                <Save className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    );
  }

  // ── Full settings UI (non-locked mode) ──
  const handleSave = () => {
    if (localKey !== apiKey) setApiKey(localKey);
    onClose();
  };

  const handleProviderChange = (p: ChatProviderType) => {
    setProvider(p);
    setFetchedModels([]);
    const def = PROVIDERS.find((pr) => pr.value === p);
    if (def) {
      // If we have a local key starting with sk-or-v1, keep OpenRouter base URL
      const key = localKey || apiKey;
      if (p === "openai" && /^sk-or-v1-/.test(key)) {
        setBaseURL(OPENROUTER_BASE);
        setModel(def.defaultModel);
      } else {
        setBaseURL(def.defaultURL);
        setModel(def.defaultModel);
      }
    }
  };

  const dropdownGroups = getDropdownModels();
  let flatIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onKeyDown={handleDialogKeyDown}
          >
            <div
              ref={dialogRef}
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
                <h2 id="settings-title" className="text-lg font-semibold text-[var(--color-text)]">Settings</h2>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {IS_LOCKED ? (
                  <div className="rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-5 text-center">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">Managed by Admin</h3>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      This chatbot is configured by the admin. The API key and provider settings
                      are managed server-side. You can adjust temperature, max tokens, and the
                      system prompt below.
                    </p>
                  </div>
                ) : null}

                <div className={`space-y-5 ${IS_LOCKED ? "mt-5" : ""}`}>
                  {/* Provider */}
                  {!IS_LOCKED && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                      Provider
                    </label>
                    <select
                      value={provider}
                      onChange={(e) => handleProviderChange(e.target.value as ChatProviderType)}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  )}

                  {/* Base URL */}
                  {!IS_LOCKED && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                      Base URL
                    </label>
                    <input
                      type="url"
                      value={baseURL}
                      onChange={(e) => setBaseURL(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 font-mono text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    />
                    {/sk-or-v1-/.test(localKey || apiKey) && baseURL !== OPENROUTER_BASE && (
                      <button
                        onClick={() => setBaseURL(OPENROUTER_BASE)}
                        className="mt-1 text-xs text-[var(--color-accent)] hover:underline"
                      >
                        Switch to OpenRouter ({OPENROUTER_BASE})
                      </button>
                    )}
                  </div>
                  )}

                  {/* Server Key Toggle */}
                  {!IS_LOCKED && (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-[var(--color-text)]">
                          Use Server API Key
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          Use the <code className="rounded bg-[var(--color-sidebar)] px-1 text-[11px]">PROVIDER_API_KEY</code> from server .env instead of a client-side key
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={useServerKey}
                        onClick={() => setUseServerKey(!useServerKey)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                          useServerKey ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
                            useServerKey ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Server health status badge */}
                    {useServerKey && serverHealth && (
                      <div
                        className={`mt-2 flex items-center gap-2 rounded-lg border p-2.5 text-xs ${
                          serverHealth.serverKeySet
                            ? "border-green-500/30 bg-green-500/5"
                            : "border-red-500/30 bg-red-500/5"
                        }`}
                      >
                        {serverHealth.serverKeySet ? (
                          <ShieldCheck className="h-4 w-4 shrink-0 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                        )}
                        <div className="flex-1">
                          {serverHealth.serverKeySet ? (
                            <>
                              <span className="font-medium text-green-600 dark:text-green-400">
                                Server key detected
                              </span>
                              <span className="ml-1.5 text-[var(--color-text-secondary)]">
                                · {serverHealth.keyPrefix} ·{" "}
                                {serverHealth.detectedProvider !== "unknown" && (
                                  <span className="font-medium capitalize">{serverHealth.detectedProvider}</span>
                                )}
                              </span>
                            </>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">
                              <strong>PROVIDER_API_KEY</strong> not found in server .env
                            </span>
                          )}
                        </div>
                        <button
                          onClick={fetchServerHealth}
                          disabled={healthLoading}
                          className="rounded p-0.5 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] disabled:opacity-50"
                          aria-label="Refresh server health"
                        >
                          <RefreshCw className={`h-3 w-3 ${healthLoading ? "animate-spin" : ""}`} />
                        </button>
                      </div>
                    )}

                    {useServerKey && healthLoading && !serverHealth && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] p-2.5 text-xs text-[var(--color-text-secondary)]">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Checking server key…
                      </div>
                    )}
                  </div>
                  )}

                  {/* API Key */}
                  {useServerKey ? (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✅ Using <code className="rounded bg-green-500/20 px-1 text-[11px]">PROVIDER_API_KEY</code> from{" "}
                        <code className="rounded bg-green-500/20 px-1 text-[11px]">.env</code>.{" "}
                        The API key is managed server-side and not sent from the browser.
                      </p>
                    </div>
                  ) : (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={localKey}
                        onChange={(e) => handleKeyChange(e.target.value)}
                        placeholder="sk-..."
                        className={`w-full rounded-lg border bg-[var(--color-sidebar)] px-3 py-2 pr-10 font-mono text-sm text-[var(--color-text)] outline-none ${
                          keyValidation && keyValidation.valid
                            ? "border-green-500/50 focus:border-green-500"
                            : keyValidation && !keyValidation.valid
                              ? "border-red-500/50 focus:border-red-500"
                              : "border-[var(--color-border)] focus:border-[var(--color-accent)]"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                        aria-label={showKey ? "Hide API key" : "Show API key"}
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {/* Key validation badge — below input, not overlapping */}
                    {keyValidation && (
                      <span
                        className={`mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          keyValidation.valid
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-red-500/15 text-red-600 dark:text-red-400"
                        }`}
                        title={keyValidation.format}
                      >
                        {keyValidation.valid ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {keyValidation.label}
                      </span>
                    )}
                    {localKey && (
                      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          <strong>Security note:</strong> Your API key is stored in your browser&apos;s
                          IndexedDB. Anyone with access to this device or through a cross-site
                          scripting (XSS) attack could potentially access it. For production
                          deployments, consider using the server-side{" "}
                          <code className="rounded bg-amber-500/20 px-1 text-[11px]">
                            PROVIDER_API_KEY
                          </code>{" "}
                          environment variable instead.
                        </p>
                      </div>
                    )}
                    {!localKey && !apiKey && provider === "ollama" && (
                      <p className="mt-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
                        ✅ No API key needed — Ollama runs locally on your machine.
                      </p>
                    )}
                    {!localKey && !apiKey && provider !== "ollama" && (
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        Sent via Authorization header. Not stored server-side.
                      </p>
                    )}
                  </div>
                  )}

                  {/* Web Search Toggle */}
                  {!IS_LOCKED && (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-[var(--color-text)]">
                          Web Search
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          Cari informasi real-time dari web sebelum menjawab (via DuckDuckGo)
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={webSearchEnabled}
                        onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                          webSearchEnabled ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
                            webSearchEnabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  )}

                  {/* Model — Searchable Dropdown */}
                  <div ref={dropdownRef}>
                    <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-[var(--color-text)]">
                      <span>Model</span>
                      <div className="flex items-center gap-2">
                        {baseURL.includes("openrouter.ai") && (
                          <button
                            onClick={fetchOpenRouterModels}
                            disabled={isFetchingModels}
                            className="group flex items-center gap-1 text-xs text-[var(--color-accent)] transition-all hover:underline disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3 w-3 transition-transform duration-300 ${
                                isFetchingModels ? "animate-spin" : "group-hover:rotate-180"
                              }`}
                            />
                            <span className={isFetchingModels ? "anim-pulse-soft" : ""}>
                              {isFetchingModels ? "Fetching..." : fetchedModels.length > 0 ? "Refresh" : "Fetch"}
                            </span>
                          </button>
                        )}
                        {provider === "openai" && !baseURL.includes("openrouter.ai") && (
                          <button
                            onClick={fetchOpenAICompatibleModels}
                            disabled={isFetchingModels}
                            className="group flex items-center gap-1 text-xs text-[var(--color-accent)] transition-all hover:underline disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3 w-3 transition-transform duration-300 ${
                                isFetchingModels ? "animate-spin" : "group-hover:rotate-180"
                              }`}
                            />
                            <span className={isFetchingModels ? "anim-pulse-soft" : ""}>
                              {isFetchingModels ? "Fetching..." : fetchedModels.length > 0 ? "Refresh" : "Fetch"}
                            </span>
                          </button>
                        )}
                        {provider === "ollama" && (
                          <button
                            onClick={fetchOllamaModels}
                            disabled={isFetchingModels}
                            className="group flex items-center gap-1 text-xs text-[var(--color-accent)] transition-all hover:underline disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3 w-3 transition-transform duration-300 ${
                                isFetchingModels ? "animate-spin" : "group-hover:rotate-180"
                              }`}
                            />
                            <span className={isFetchingModels ? "anim-pulse-soft" : ""}>
                              {isFetchingModels ? "Fetching..." : fetchedModels.length > 0 ? "Refresh" : "Fetch"}
                            </span>
                          </button>
                        )}
                      </div>
                    </label>

                    <div className="relative">
                      {/* Search input */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                        <input
                          ref={inputRef}
                          type="text"
                          value={modelSearch}
                          onChange={(e) => {
                            setModelSearch(e.target.value);
                            setModel(e.target.value); // allow free text too
                            setDropdownOpen(true);
                            setHighlightIdx(0);
                          }}
                          onFocus={() => setDropdownOpen(true)}
                          onKeyDown={handleModelKeyDown}
                          placeholder={fetchedModels.length > 0 ? "Search models..." : FALLBACK_MODELS[provider]?.[0] ?? "gpt-4o"}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] py-2 pl-9 pr-8 font-mono text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                          aria-label="Model"
                          autoComplete="off"
                          role="combobox"
                          aria-expanded={dropdownOpen}
                          aria-controls="model-listbox"
                          aria-autocomplete="list"
                        />
                        <button
                          onClick={() => setDropdownOpen(!dropdownOpen)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                          aria-label="Toggle model list"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>

                      {/* Dropdown */}
                      {dropdownOpen && (
                        <ul
                          ref={listRef}
                          id="model-listbox"
                          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl anim-slide-down"
                          role="listbox"
                        >
                          {isFetchingModels && (
                            <li className="px-3 py-3 space-y-2.5">
                              {/* Skeleton items */}
                              {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex items-center justify-between px-1">
                                  <div className="space-y-1.5 flex-1">
                                    <div className="h-3 w-3/5 rounded anim-shimmer" />
                                    <div className="h-2 w-2/5 rounded anim-shimmer" />
                                  </div>
                                  <div className="ml-2 h-3 w-12 rounded anim-shimmer" />
                                </div>
                              ))}
                            </li>
                          )}

                          {!isFetchingModels && fetchError && (
                            <li className="px-3 py-2 text-xs text-red-500 flex items-center gap-2">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {fetchError}
                            </li>
                          )}

                          {!isFetchingModels && dropdownGroups.map((group) => {
                            if (group.items.length === 0 && !fetchError) {
                              return (
                                <li
                                  key={group.label}
                                  className="px-3 py-6 text-center text-xs text-[var(--color-text-secondary)]"
                                >
                                  <Search className="mx-auto mb-1.5 h-4 w-4 opacity-40" />
                                  No models found
                                </li>
                              );
                            }

                            return (
                              <li key={group.label}>
                                <div className="sticky top-0 bg-[var(--color-sidebar)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                                  {group.label}
                                </div>
                                {group.items.map((m) => {
                                  const idx = flatIndex++;
                                  const isActive = m.id === model;
                                  const isHighlighted = idx === highlightIdx;
                                  const isFree =
                                    m.pricing && (!m.pricing.prompt || m.pricing.prompt === "0");

                                  return (
                                    <li
                                      key={m.id}
                                      role="option"
                                      aria-selected={isActive}
                                      onMouseEnter={() => setHighlightIdx(idx)}
                                      onClick={() => {
                                        setModel(m.id);
                                        setModelSearch(m.id);
                                        setDropdownOpen(false);
                                        setHighlightIdx(-1);
                                      }}
                                      className={`anim-stagger-item flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors ${
                                        isActive
                                          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                                          : isHighlighted
                                            ? "bg-[var(--color-sidebar)]"
                                            : "hover:bg-[var(--color-sidebar)]/50"
                                      }`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate font-mono text-xs">{m.id}</div>
                                        {m.description && (
                                          <div className="truncate text-[11px] text-[var(--color-text-secondary)]">
                                            {m.description}
                                          </div>
                                        )}
                                      </div>
                                      <div className="ml-2 flex shrink-0 items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                                        {m.context_length > 0 && (
                                          <span title={`${m.context_length.toLocaleString()} token context`}>
                                            {m.context_length >= 1000
                                              ? `${(m.context_length / 1000).toFixed(0)}k`
                                              : m.context_length}{" "}
                                            ctx
                                          </span>
                                        )}
                                        {isFree && (
                                          <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                                            FREE
                                          </span>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Gunakan Bawaan Modelfile — hanya untuk Ollama */}
                  {provider === "ollama" && (
                    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium text-[var(--color-text)]">
                            🧬 Gunakan Bawaan Modelfile
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            Abaikan System Prompt, Mode Respon, Konteks Memori &mdash; pakai SETTING dari Modelfile
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={useModelDefaults}
                          onClick={() => setUseModelDefaults(!useModelDefaults)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                            useModelDefaults ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
                              useModelDefaults ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Temperature / Mode */}
                  {provider === "ollama" ? (
                    <div className={useModelDefaults ? "opacity-40 pointer-events-none" : ""}>
                      <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                        Mode Respon
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { label: "Kreatif", temp: 1.2, desc: "Imajinatif & bebas", icon: "🎨" },
                          { label: "Pintar", temp: 0.7, desc: "Cerdas & seimbang", icon: "🧠" },
                          { label: "Tepat", temp: 0.2, desc: "To the point", icon: "🎯" },
                          { label: "Cepat", temp: 0.3, desc: "Respons kilat", icon: "⚡" },
                        ].map((mode) => {
                          const isActive = temperature === mode.temp;
                          return (
                            <button
                              key={mode.label}
                              onClick={() => setTemperature(mode.temp)}
                              className={`group relative flex flex-col items-center rounded-xl border px-3 py-3 text-center text-xs transition-all duration-200 ${
                                isActive
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 shadow-sm"
                                  : "border-[var(--color-border)] bg-[var(--color-sidebar)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/5"
                              }`}
                            >
                              <span className="mb-1 text-base">{mode.icon}</span>
                              <span
                                className={`font-semibold ${
                                  isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"
                                }`}
                              >
                                {mode.label}
                              </span>
                              <span className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">
                                {mode.desc}
                              </span>
                              {isActive && (
                                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[9px] text-white shadow">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 text-center text-[10px] text-[var(--color-text-tertiary)]">
                        Temperature: {temperature.toFixed(1)} / 2.0
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-[var(--color-text)]">
                        <span>Temperature</span>
                        <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                          {temperature.toFixed(1)}
                        </span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full accent-[var(--color-accent)]"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--color-text-secondary)]">
                        <span>Precise</span>
                        <span>Creative</span>
                      </div>
                    </div>
                  )}

                  {/* Max Tokens */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min={256}
                      max={32768}
                      step={256}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 font-mono text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>

                  {/* Konteks Memori — hanya untuk Ollama */}
                  {provider === "ollama" && (
                    <div className={useModelDefaults ? "opacity-40 pointer-events-none" : ""}>
                      <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                        Konteks Memori
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Pendek", value: 512, desc: "Hemat RAM", icon: "📄" },
                          { label: "Sedang", value: 2048, desc: "Default", icon: "📚" },
                          { label: "Panjang", value: 8192, desc: "Ingatan banyak", icon: "📖" },
                        ].map((opt) => {
                          const isActive = numCtx === opt.value;
                          return (
                            <button
                              key={opt.label}
                              onClick={() => setNumCtx(opt.value)}
                              className={`group relative flex flex-col items-center rounded-xl border px-2 py-2.5 text-center text-xs transition-all duration-200 ${
                                isActive
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 shadow-sm"
                                  : "border-[var(--color-border)] bg-[var(--color-sidebar)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/5"
                              }`}
                            >
                              <span className="mb-1 text-sm">{opt.icon}</span>
                              <span
                                className={`font-semibold ${
                                  isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"
                                }`}
                              >
                                {opt.label}
                              </span>
                              <span className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">
                                {opt.desc}
                              </span>
                              {isActive && (
                                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[9px] text-white shadow">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 text-center text-[10px] text-[var(--color-text-tertiary)]">
                        Semakin panjang semakin banyak ingatan, tapi butuh RAM lebih
                      </div>
                    </div>
                  )}

                  {/* System Prompt */}
                  <div className={useModelDefaults && provider === "ollama" ? "opacity-40 pointer-events-none" : ""}>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
                      System Prompt
                    </label>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      rows={3}
                      placeholder="You are a helpful assistant."
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    />
                    {provider === "ollama" && (
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          Akan <strong>override</strong> perintah <code className="rounded bg-amber-500/20 px-1 text-[10px]">SYSTEM</code> dari Modelfile Ollama. Kosongkan jika ingin menggunakan SYSTEM bawaan model.
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-[var(--color-border)] px-6 py-4">
                <button
                  onClick={handleSave}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
                >
                  <Save className="h-4 w-4" />
                  Save Settings
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

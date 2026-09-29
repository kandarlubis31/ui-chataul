import { create } from "zustand";
import { ChatProviderType, type ChatProviderConfig } from "@/lib/providers";
import {
  getSettings,
  saveSettings,
  type AppSettingsDB,
  DEFAULT_SETTINGS,
} from "@/lib/db/indexeddb";

interface SettingsStore extends AppSettingsDB {
  loaded: boolean;
  load: () => Promise<void>;
  setProvider: (provider: ChatProviderType) => void;
  setBaseURL: (url: string) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setSystemPrompt: (prompt: string) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setUseServerKey: (useServerKey: boolean) => void;
  setNumCtx: (numCtx: number) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setUseModelDefaults: (enabled: boolean) => void;
  getProviderConfig: () => ChatProviderConfig;
}

/** Extract only plain-data AppSettingsDB fields (no functions) for IndexedDB storage */
function pickSettings(state: SettingsStore): AppSettingsDB {
  return {
    provider: state.provider,
    baseURL: state.baseURL,
    apiKey: state.apiKey,
    model: state.model,
    temperature: state.temperature,
    maxTokens: state.maxTokens,
    systemPrompt: state.systemPrompt,
    theme: state.theme,
    useServerKey: state.useServerKey,
    numCtx: state.numCtx,
    webSearchEnabled: state.webSearchEnabled,
    useModelDefaults: state.useModelDefaults,
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const settings = await getSettings();
      set({ ...settings, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setProvider: async (provider) => {
    const state = get();
    const newState = { ...state, provider };
    if (provider === "anthropic") {
      newState.model = "claude-3-5-sonnet-20241022";
      newState.baseURL = "https://api.anthropic.com/v1";
    } else if (provider === "ollama") {
      newState.model = "llama3.2";
      newState.baseURL = "http://localhost:11434/v1";
      newState.apiKey = "";
    } else {
      newState.model = "gpt-4o";
      newState.baseURL = "https://api.openai.com/v1";
    }
    set(newState);
    await saveSettings(pickSettings(newState));
  },

  setBaseURL: async (baseURL) => {
    set({ baseURL });
    await saveSettings(pickSettings(get()));
  },

  setApiKey: async (apiKey) => {
    set({ apiKey });
    await saveSettings(pickSettings(get()));
  },

  setModel: async (model) => {
    set({ model });
    await saveSettings(pickSettings(get()));
  },

  setTemperature: async (temperature) => {
    set({ temperature });
    await saveSettings(pickSettings(get()));
  },

  setMaxTokens: async (maxTokens) => {
    set({ maxTokens });
    await saveSettings(pickSettings(get()));
  },

  setSystemPrompt: async (systemPrompt) => {
    set({ systemPrompt });
    await saveSettings(pickSettings(get()));
  },

  setTheme: async (theme) => {
    set({ theme });
    await saveSettings(pickSettings(get()));
    applyTheme(theme);
  },

  setUseServerKey: async (useServerKey) => {
    set({ useServerKey });
    await saveSettings(pickSettings(get()));
  },

  setNumCtx: async (numCtx) => {
    set({ numCtx });
    await saveSettings(pickSettings(get()));
  },

  setWebSearchEnabled: async (webSearchEnabled) => {
    set({ webSearchEnabled });
    await saveSettings(pickSettings(get()));
  },

  setUseModelDefaults: async (useModelDefaults) => {
    set({ useModelDefaults });
    await saveSettings(pickSettings(get()));
  },

  getProviderConfig: () => {
    const state = get();
    return {
      baseURL: state.baseURL,
      apiKey: state.apiKey,
      model: state.model,
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      systemPrompt: state.systemPrompt,
      numCtx: state.numCtx,
      webSearchEnabled: state.webSearchEnabled,
      useModelDefaults: state.useModelDefaults,
    };
  },
}));

function applyTheme(theme: "light" | "dark" | "system") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
    localStorage.setItem("theme", "light");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
    localStorage.setItem("theme", "system");
  }
}

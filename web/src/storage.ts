import type { ModelProfile, Settings, Thread } from './types';

const THREADS_KEY = 'pocket-agent.threads.v1';
const SETTINGS_KEY = 'pocket-agent.settings.v1';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveThreads(threads: Thread[]): void {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  } catch {
    // Storage full or unavailable; keep app usable in memory.
  }
}

export function defaultSettings(): Settings {
  const isNative = typeof window !== 'undefined' && Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);
  const profile: ModelProfile = {
    id: uid(),
    name: '默认',
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  };
  return {
    runMode: 'phone',
    serverUrl: isNative ? 'http://localhost:8787' : window.location.origin,
    token: '',
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    maxTurns: 10,
    useMock: false,
    assistantName: '口袋智能体',
    themeMode: 'system',
    accentColor: '#f26f45',
    searchProvider: 'auto',
    enableWebSearch: true,
    enablePhoneTools: true,
    enableTasks: true,
    worldBook: '',
    injections: '',
    quickPhrases: [],
    proxyUrl: '',
    mcpServers: [],
    ocrEnabled: true,
    ocrBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ocrApiKey: '',
    ocrModel: 'qwen-vl-max',
    ocrPrompt: '请识别这张图片中的所有文字，保持原文顺序，直接输出识别到的文字内容。',
    profiles: [profile],
    activeProfileId: profile.id
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...defaultSettings(), ...parsed };
    if (!Array.isArray(merged.profiles) || merged.profiles.length === 0) {
      merged.profiles = [
        {
          id: uid(),
          name: merged.model || '默认',
          apiKey: merged.apiKey || '',
          apiBaseUrl: merged.apiBaseUrl || 'https://api.openai.com/v1',
          model: merged.model || 'gpt-4o-mini'
        }
      ];
      merged.activeProfileId = merged.profiles[0].id;
    }
    if (!merged.profiles.some((profile) => profile.id === merged.activeProfileId)) {
      merged.activeProfileId = merged.profiles[0].id;
    }
    const active = merged.profiles.find((profile) => profile.id === merged.activeProfileId) || merged.profiles[0];
    merged.apiKey = active.apiKey;
    merged.apiBaseUrl = active.apiBaseUrl;
    merged.model = active.model;
    return merged;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
}

import type { FileAccessMode, ModelProfile, Settings, Thread } from './types';

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
    localOnly: false,
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    maxTurns: 10,
    useMock: false,
    assistantName: '灰风',
    themeMode: 'system',
    accentColor: '#f26f45',
    searchProvider: 'auto',
    enableWebSearch: true,
    enablePhoneTools: true,
    enableTasks: true,
    fileAccessMode: 'approval',
    allowDirectRead: true,
    requireWriteApproval: true,
    enablePhoneControl: true,
    worldBook: '',
    injections: '',
    quickPhrases: [],
    proxyUrl: '',
    mcpServers: [],
    ocrEnabled: true,
    ocrBaseUrl: '',
    ocrApiKey: '',
    ocrModel: '',
    ocrPrompt: '请详细描述这张图片的内容，包括：人物/物体/场景、布局、颜色、风格，以及图片中的文字内容。',
    imageGenEnabled: false,
    imageGenBaseUrl: '',
    imageGenApiKey: '',
    imageGenModel: '',
    imageGenSize: '1024x1024',
    profiles: [profile],
    activeProfileId: profile.id
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const defaults = defaultSettings();
    const merged = { ...defaults, ...parsed };
    const storedMode = parsed.fileAccessMode as FileAccessMode | undefined;
    const fileAccessMode: FileAccessMode =
      storedMode === 'approval' || storedMode === 'auto' || storedMode === 'full'
        ? storedMode
        : parsed.requireWriteApproval === false
          ? 'auto'
          : defaults.fileAccessMode;
    merged.fileAccessMode = fileAccessMode;
    // Keep the legacy field synchronized for older exports and installs.
    merged.requireWriteApproval = fileAccessMode === 'approval';
    // If “仅本地使用”被旧版自动写成 true，但模型地址不是本地/局域网，
    // 会自动关掉，避免用户没配置本地模型时无法使用。
    if (merged.localOnly) {
      let host = '';
      try {
        host = new URL(merged.apiBaseUrl || '').hostname.toLowerCase();
      } catch {
        host = '';
      }
      const localHost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      if (!localHost) merged.localOnly = false;
    }
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

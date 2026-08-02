export type Role = 'user' | 'assistant' | 'system';

export type ToolStatus = 'pending' | 'waiting' | 'running' | 'success' | 'error';

export type ThemeMode = 'system' | 'light' | 'dark';

export type SearchProvider = 'auto' | 'bing' | 'duckduckgo';

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown> | null;
  status: ToolStatus;
  output?: string;
  error?: string;
  durationMs?: number;
  approval?: {
    requestId: string;
    summary: string;
    detail?: string;
  };
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  toolCalls: ToolCallRecord[];
  createdAt: number;
  error?: string;
}

export type ThreadStatus = 'idle' | 'running' | 'error';

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: ThreadStatus;
  messages: Message[];
}

export interface Settings {
  runMode: 'phone' | 'server';
  serverUrl: string;
  token: string;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  maxTurns: number;
  useMock: boolean;
  assistantName: string;
  themeMode: ThemeMode;
  accentColor: string;
  searchProvider: SearchProvider;
  enableWebSearch: boolean;
  enablePhoneTools: boolean;
  enableTasks: boolean;
  worldBook: string;
  injections: string;
  quickPhrases: string[];
  proxyUrl: string;
  mcpServers: McpServer[];
  ocrEnabled: boolean;
  ocrBaseUrl: string;
  ocrApiKey: string;
  ocrModel: string;
  ocrPrompt: string;
  profiles: ModelProfile[];
  activeProfileId: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
}

export interface AgentTask {
  id: string;
  title: string;
  notes: string;
  status: 'todo' | 'in_progress' | 'done';
  createdAt: string;
  updatedAt: string;
}

export interface ServerConfig {
  model: string;
  baseUrl: string;
  workspace: string;
  allowShell: boolean;
  authRequired: boolean;
  mock: boolean;
}

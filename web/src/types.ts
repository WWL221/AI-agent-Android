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
  allowDirectRead: boolean;
  requireWriteApproval: boolean;
  enablePhoneControl: boolean;
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
  imageGenEnabled: boolean;
  imageGenBaseUrl: string;
  imageGenApiKey: string;
  imageGenModel: string;
  imageGenSize: string;
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

export type ScheduledActionType = 'open_app' | 'create_task' | 'send_message';

export type ScheduledActionMode = 'once' | 'daily';

export interface ScheduledAction {
  id: string;
  name: string;
  type: ScheduledActionType;
  /** 打开应用时填应用名/包名；创建任务时填任务标题；发送消息时填要发送的内容 */
  target: string;
  /** 打开应用时可选：解析后的包名 */
  packageName?: string;
  mode: ScheduledActionMode;
  /** 仅一次时使用，格式 YYYY-MM-DD */
  date: string;
  /** 格式 HH:mm */
  time: string;
  enabled: boolean;
  /** 是否已在系统层用 AlarmManager 注册（仅 open_app） */
  nativeScheduled?: boolean;
  lastRunAt?: string;
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

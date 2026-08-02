import type { AgentTask, ServerConfig, Settings } from './types';

function serverBase(settings: Settings): string {
  return settings.serverUrl.replace(/\/+$/, '');
}

async function request<T>(settings: Settings, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (settings.token) headers.set('Authorization', `Bearer ${settings.token}`);
  const response = await fetch(`${serverBase(settings)}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = (await response.text()) || message;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchHealth(settings: Settings): Promise<{ ok: boolean; version: string }> {
  return request(settings, '/api/health');
}

export async function fetchConfig(settings: Settings): Promise<ServerConfig> {
  return request(settings, '/api/config');
}

export async function fetchTasks(settings: Settings): Promise<AgentTask[]> {
  return request(settings, '/api/tasks');
}

export async function createTask(settings: Settings, input: { title: string; notes?: string }): Promise<AgentTask> {
  return request(settings, '/api/tasks', { method: 'POST', body: JSON.stringify(input) });
}

export async function patchTask(
  settings: Settings,
  id: string,
  patch: Partial<Pick<AgentTask, 'title' | 'notes' | 'status'>>
): Promise<AgentTask> {
  return request(settings, `/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteTask(settings: Settings, id: string): Promise<{ ok: boolean }> {
  return request(settings, `/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function approveRequest(
  settings: Settings,
  requestId: string,
  decision: 'allow' | 'deny',
  remember = false
): Promise<{ ok: boolean }> {
  return request(settings, '/api/approve', {
    method: 'POST',
    body: JSON.stringify({ requestId, decision, remember })
  });
}

export async function cancelRun(settings: Settings, runId: string): Promise<{ ok: boolean }> {
  return request(settings, '/api/cancel', {
    method: 'POST',
    body: JSON.stringify({ runId })
  });
}

export async function submitPhoneToolResult(
  settings: Settings,
  requestId: string,
  result: { status: 'ok'; output: string } | { status: 'error'; error: string }
): Promise<{ ok: boolean }> {
  return request(settings, '/api/phone-tool/result', {
    method: 'POST',
    body: JSON.stringify({ requestId, ...result })
  });
}

export interface ModelTestResult {
  ok: boolean;
  model?: string;
  reply?: string;
  error?: string;
}

export async function testModel(
  settings: Settings,
  input: { apiKey: string; baseUrl: string; model: string }
): Promise<ModelTestResult> {
  const response = await fetch(`${serverBase(settings)}/api/model/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {})
    },
    body: JSON.stringify(input)
  });
  const data = (await response.json().catch(() => ({}))) as ModelTestResult;
  if (!response.ok) {
    return { ok: false, error: data.error || `模型测试失败 (${response.status})` };
  }
  return data;
}

export interface ModelListResult {
  ok: boolean;
  models?: string[];
  count?: number;
  error?: string;
}

export async function listModels(
  settings: Settings,
  input: { apiKey: string; baseUrl: string }
): Promise<ModelListResult> {
  const response = await fetch(`${serverBase(settings)}/api/model/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {})
    },
    body: JSON.stringify(input)
  });
  const data = (await response.json().catch(() => ({}))) as ModelListResult;
  if (!response.ok) {
    return { ok: false, error: data.error || `读取模型列表失败 (${response.status})` };
  }
  return data;
}

export type AgentEvent = {
  type: string;
  [key: string]: unknown;
};

export async function runAgent(
  settings: Settings,
  messages: Array<{ role: string; content: string }>,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(`${serverBase(settings)}/api/agent/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {})
    },
    body: JSON.stringify({
      messages,
      model: settings.model,
      baseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey || undefined,
      maxTurns: settings.maxTurns,
      mock: settings.useMock
    }),
    signal
  });

  if (!response.ok) {
    let message = `Agent 服务返回 ${response.status}`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = (await response.text()) || message;
    }
    throw new Error(message);
  }

  if (!response.body) throw new Error('服务没有返回数据流');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        onEvent(JSON.parse(data));
      } catch {
        // Ignore malformed lines.
      }
    }
  }
}

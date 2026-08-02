import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { hasAllFilesAccess, listAllFiles, readAllFile } from './fileAccess';
import { getPhoneInfo, isNative, type PhoneFile } from './phone';
import { createLocalTask, deleteLocalTask, listLocalTasks, updateLocalTask } from './localTasks';
import { uid } from './storage';
import type { McpServer, Settings } from './types';

export interface PhoneFileRequest {
  requestId: string;
  toolId: string;
  name: string;
  summary: string;
}

export type PhoneFileResult = { status: 'ok'; output: string } | { status: 'error'; error: string };

export interface LocalApprovalRequest {
  requestId: string;
  toolId: string;
  name: string;
  summary: string;
  detail?: string;
}

export interface LocalAgentEvent {
  type: string;
  [key: string]: unknown;
}

interface ProxyHttpRequestOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  proxyUrl: string;
}

interface ProxyHttpResponse {
  status: number;
  data: unknown;
  text: string;
  headers: Record<string, string>;
}

const ProxyHttp = registerPlugin<{ request: (options: ProxyHttpRequestOptions) => Promise<ProxyHttpResponse> }>(
  'ProxyHttp'
);

const LOCAL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网并返回若干条网页标题、链接和摘要。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: '抓取一个网页并提取可读文本。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '完整 URL' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'phone_info',
      description: '读取手机设备信息，包括型号、系统、电量、存储等。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'phone_read_file',
      description: '让用户从手机选择一个文件并读取内容。',
      parameters: {
        type: 'object',
        properties: {
          hint: { type: 'string', description: '想读取什么文件以及用途' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ocr_image',
      description: '让用户选择一张图片，识别图片中的文字并返回 OCR 结果。',
      parameters: {
        type: 'object',
        properties: {
          hint: { type: 'string', description: '想识别哪张图片以及用途' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_phone_files',
      description: '列出手机 App 私有工作区 Documents 目录下的文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对路径，空为根目录' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_phone_file',
      description: '读取手机 App 私有工作区 Documents 目录下的文本文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对路径' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_phone_file',
      description: '在手机 App 私有工作区 Documents 目录写入一个文本文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '在手机本地创建任务。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: '列出手机本地的任务。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '更新手机本地任务。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
          title: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '删除手机本地任务。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }
];

function emitSafe(emit: (event: LocalAgentEvent) => void, event: LocalAgentEvent): void {
  try {
    emit(event);
  } catch {
    // Ignore closed listeners.
  }
}

function truncate(text: string, max = 8000): string {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}\n...（已截断）` : value;
}

function decodeEntities(input: string): string {
  return String(input)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

function htmlToText(html: string): string {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

async function fileDataToText(data: string | Blob): Promise<string> {
  return typeof data === 'string' ? data : await data.text();
}

function buildSystem(settings: Settings): string {
  const now = new Date().toLocaleString('zh-CN');
  const assistantName = settings.assistantName || '口袋智能体';
  const parts = [
    `你是“${assistantName}”，一个完全运行在安卓手机上的 AI Agent。`,
    '你直接在手机内完成对话、搜索、文件读取和任务管理，不依赖电脑。',
    '行为准则：',
    '1. 先简短说明意图，再调用工具；',
    '2. 使用真实工具结果，不编造搜索结果或文件内容；',
    '3. 读取手机文件前必须请用户选择文件；',
    '4. 写入文件时写入手机 App 私有 Documents 工作区；',
    '5. 回答使用中文，结论先行，任务完成时给出总结。',
    '',
    `当前时间：${now}`,
    `模型：${settings.model}`
  ];
  if (settings.worldBook?.trim()) {
    parts.push('', '长期记忆 / 世界书：', settings.worldBook.trim());
  }
  if (settings.injections?.trim()) {
    parts.push('', '附加指令：', settings.injections.trim());
  }
  return parts.join('\n');
}

async function nativeRequest(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  body?: unknown,
  signal?: AbortSignal,
  proxyUrl = ''
): Promise<{ ok: boolean; status: number; data: unknown; text: string; headers?: Record<string, string> }> {
  if (isNative()) {
    if (proxyUrl) {
      const response = await ProxyHttp.request({
        method,
        url,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        proxyUrl
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
        text: response.text,
        headers: response.headers || {}
      };
    }
    const options = { url, headers, ...(body !== undefined ? { data: body } : {}) };
    const response = method === 'POST' ? await CapacitorHttp.post(options) : await CapacitorHttp.get(options);
    const data = response.data as unknown;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      data,
      text,
      headers: (response.headers as Record<string, string>) || {}
    };
  }
  if (proxyUrl) throw new Error('网络代理仅支持安卓应用内使用');
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal
  });
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const data = contentType.includes('json') ? JSON.parse(text || '{}') : text;
  return { ok: response.ok, status: response.status, data, text, headers: Object.fromEntries(response.headers.entries()) };
}

interface McpSession {
  server: McpServer;
  sessionId?: string;
}

interface McpDiscoveredTool {
  serverId: string;
  toolName: string;
  fullName: string;
  definition: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
}

const mcpSessions = new Map<string, McpSession>();
const mcpToolIndex = new Map<string, { serverId: string; toolName: string }>();

function sanitizeMcpName(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseMcpJsonOrSse(text: string): Record<string, unknown> {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Fall through to SSE parsing.
  }
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  for (let index = dataLines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(dataLines[index]) as Record<string, unknown>;
    } catch {
      // Try the previous data frame.
    }
  }
  return { text };
}

async function mcpRequest(
  server: McpServer,
  payload: Record<string, unknown>,
  proxyUrl: string,
  sessionId?: string
): Promise<{ data: { result?: unknown; error?: { message?: string } }; sessionId?: string }> {
  const url = server.url.trim().replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const response = await nativeRequest('POST', url, headers, payload, undefined, proxyUrl);
  const data = (typeof response.data === 'string' ? parseMcpJsonOrSse(response.data) : response.data || {}) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (!response.ok) {
    const detail = data?.error?.message || response.text.slice(0, 400);
    throw new Error(`MCP 接口返回 ${response.status}: ${detail}`);
  }
  return {
    data,
    sessionId:
      response.headers?.['mcp-session-id'] || response.headers?.['Mcp-Session-Id'] || sessionId
  };
}

async function initializeMcp(server: McpServer, proxyUrl: string): Promise<McpSession> {
  const response = await mcpRequest(
    server,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'PocketAgent', version: '1.0' }
      }
    },
    proxyUrl
  );
  const session: McpSession = { server, sessionId: response.sessionId };
  if (session.sessionId) {
    try {
      await mcpRequest(server, { jsonrpc: '2.0', method: 'notifications/initialized' }, proxyUrl, session.sessionId);
    } catch {
      // Initialized notification is optional for some servers.
    }
  }
  return session;
}

async function discoverMcpTools(settings: Settings): Promise<{ tools: McpDiscoveredTool[]; warnings: string[] }> {
  const tools: McpDiscoveredTool[] = [];
  const warnings: string[] = [];
  const servers = (settings.mcpServers || []).filter((server) => server.enabled && server.url?.trim());
  for (const server of servers) {
    try {
      const session = await initializeMcp(server, settings.proxyUrl);
      mcpSessions.set(server.id, session);
      const list = await mcpRequest(
        server,
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        settings.proxyUrl,
        session.sessionId
      );
      const result = list.data?.result as { tools?: Array<{ name?: string; description?: string; inputSchema?: Record<string, unknown> }> };
      const serverTools = result?.tools || [];
      for (const tool of serverTools) {
        if (!tool?.name) continue;
        const toolName = sanitizeMcpName(tool.name);
        const fullName = `mcp_${sanitizeMcpName(server.id)}_${toolName}`;
        mcpToolIndex.set(fullName, { serverId: server.id, toolName: tool.name });
        const parameters =
          tool.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : { type: 'object', properties: {} };
        tools.push({
          serverId: server.id,
          toolName: tool.name,
          fullName,
          definition: {
            type: 'function',
            function: {
              name: fullName,
              description: tool.description || `MCP ${server.name} 工具`,
              parameters
            }
          }
        });
      }
      if (!serverTools.length) warnings.push(`${server.name} 没有可用工具`);
    } catch (error) {
      warnings.push(`${server.name}: ${error instanceof Error ? error.message : '连接失败'}`);
    }
  }
  return { tools, warnings };
}

async function executeMcpTool(settings: Settings, serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  const server = (settings.mcpServers || []).find((item) => item.id === serverId);
  if (!server) throw new Error('MCP 服务不存在');
  let session = mcpSessions.get(serverId);
  if (!session) session = await initializeMcp(server, settings.proxyUrl);
  const response = await mcpRequest(
    server,
    {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args || {} }
    },
    settings.proxyUrl,
    session.sessionId
  );
  const result = response.data?.result as {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  if (result?.isError) {
    throw new Error(
      (result.content || [])
        .map((block) => block.text || '')
        .filter(Boolean)
        .join('\n') || 'MCP 工具执行失败'
    );
  }
  const output = (result?.content || [])
    .map((block) => (block.type === 'text' ? block.text : JSON.stringify(block)))
    .filter(Boolean)
    .join('\n');
  return output || '(空结果)';
}

async function chatOnce(
  settings: Settings,
  messages: Array<Record<string, unknown>>,
  signal?: AbortSignal,
  extraTools: McpDiscoveredTool['definition'][] = []
) {
  const baseUrl = settings.apiBaseUrl.trim().replace(/\/+$/, '');
  const response = await nativeRequest(
    'POST',
    `${baseUrl}/chat/completions`,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    {
      model: settings.model,
      messages,
      tools: [...LOCAL_TOOLS, ...extraTools],
      tool_choice: 'auto',
      temperature: 0.3,
      stream: false
    },
    signal,
    settings.proxyUrl
  );
  if (!response.ok) {
    const detail = (response.data as { error?: { message?: string } })?.error?.message || response.text.slice(0, 400);
    throw new Error(`模型接口返回 ${response.status}: ${detail}`);
  }
  const data = response.data as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  return {
    content: data.choices?.[0]?.message?.content || '',
    tool_calls: data.choices?.[0]?.message?.tool_calls || []
  };
}

export interface ProviderModelListResult {
  ok: boolean;
  models?: string[];
  count?: number;
  error?: string;
}

export interface ProviderModelTestResult {
  ok: boolean;
  model?: string;
  reply?: string;
  error?: string;
}

export async function listProviderModels(settings: Settings): Promise<ProviderModelListResult> {
  const baseUrl = settings.apiBaseUrl.trim().replace(/\/+$/, '');
  if (!settings.apiKey) return { ok: false, error: '未填写 API Key' };
  try {
    const response = await nativeRequest(
      'GET',
      `${baseUrl}/models`,
      {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      },
      undefined,
      undefined,
      settings.proxyUrl
    );
    const data = response.data as {
      data?: Array<string | { id?: string }>;
      models?: Array<string | { id?: string }>;
      error?: { message?: string } | string;
    };
    if (!response.ok) {
      const detail =
        (typeof data?.error === 'object' && data.error?.message) ||
        (typeof data?.error === 'string' && data.error) ||
        response.text.slice(0, 400);
      return { ok: false, error: `模型列表接口返回 ${response.status}: ${detail}` };
    }
    const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const models = raw
      .map((item) => (typeof item === 'string' ? item : item?.id))
      .filter((id): id is string => typeof id === 'string' && Boolean(id))
      .sort((a, b) => a.localeCompare(b));
    if (!models.length) return { ok: false, error: '接口没有返回可用模型列表' };
    return { ok: true, models, count: models.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '读取模型列表失败' };
  }
}

export async function testProviderModel(
  settings: Settings,
  input: { apiKey: string; baseUrl: string; model: string }
): Promise<ProviderModelTestResult> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  if (!input.apiKey) return { ok: false, error: '未填写 API Key' };
  try {
    const response = await nativeRequest(
      'POST',
      `${baseUrl}/chat/completions`,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`
      },
      {
        model: input.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        stream: false
      },
      undefined,
      settings.proxyUrl
    );
    const data = response.data as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string } | string;
    };
    if (!response.ok) {
      const detail =
        (typeof data?.error === 'object' && data.error?.message) ||
        (typeof data?.error === 'string' && data.error) ||
        response.text.slice(0, 400);
      return { ok: false, error: `模型接口返回 ${response.status}: ${detail}` };
    }
    return {
      ok: true,
      model: data.model || input.model,
      reply: data.choices?.[0]?.message?.content || ''
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '模型连接失败' };
  }
}

export async function recognizeImage(settings: Settings, image: PhoneFile): Promise<string> {
  if (!image.dataUrl) throw new Error('图片数据缺失');
  const baseUrl = (settings.ocrBaseUrl || settings.apiBaseUrl).trim().replace(/\/+$/, '');
  const apiKey = settings.ocrApiKey || settings.apiKey;
  const model = settings.ocrModel || settings.model;
  const prompt =
    settings.ocrPrompt?.trim() ||
    '请识别这张图片中的所有文字，保持原文顺序，直接输出识别到的文字内容。';
  if (!apiKey) throw new Error('未填写 API Key，无法使用 OCR');
  const response = await nativeRequest(
    'POST',
    `${baseUrl}/chat/completions`,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image.dataUrl } }
          ]
        }
      ],
      max_tokens: 1200,
      stream: false
    },
    undefined,
    settings.proxyUrl
  );
  if (!response.ok) {
    const detail =
      ((response.data as { error?: { message?: string } })?.error?.message) ||
      response.text.slice(0, 400);
    throw new Error(`OCR 接口返回 ${response.status}: ${detail}`);
  }
  const data = response.data as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('模型没有返回 OCR 内容');
  return text.trim();
}

async function searchBing(query: string, proxyUrl = ''): Promise<string> {
  const response = await nativeRequest(
    'GET',
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans`,
    {
      'User-Agent': 'Mozilla/5.0 (Linux; Android) PocketAgent/0.2',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    undefined,
    undefined,
    proxyUrl
  );
  const html = typeof response.data === 'string' ? response.data : response.text;
  const patterns = [
    /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?(?:<p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>)?/gi,
    /<li class="b_algo"[\s\S]*?<div class="b_algoheader"><a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2><\/a><\/div>[\s\S]*?<div class="b_caption"><p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/gi
  ];
  let blocks: Array<{ title: string; url: string; snippet: string }> = [];
  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)].slice(0, 6);
    blocks = matches.map((match) => ({
      title: htmlToText(match[2]),
      url: decodeEntities(match[1]),
      snippet: htmlToText(match[3] || '')
    }));
    if (blocks.length) break;
  }
  blocks = blocks.filter((item) => !/^https?:\/\/www\.bing\.com\//i.test(item.url));
  if (!blocks.length) throw new Error('Bing 没有返回结果');
  return blocks.map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`).join('\n\n');
}

async function searchDuckDuckGo(query: string, proxyUrl = ''): Promise<string> {
  const response = await nativeRequest(
    'GET',
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      'User-Agent': 'Mozilla/5.0 (Linux; Android) PocketAgent/0.2',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    undefined,
    undefined,
    proxyUrl
  );
  const html = typeof response.data === 'string' ? response.data : response.text;
  const blocks = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, 6)
    .map((match) => ({
      title: htmlToText(match[2]),
      url: decodeEntities(match[1]),
      snippet: htmlToText(match[3])
    }));
  if (!blocks.length) throw new Error('DuckDuckGo 没有返回结果');
  return blocks.map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`).join('\n\n');
}

async function webSearch(query: string, settings: Settings): Promise<string> {
  const mode = settings.searchProvider || 'auto';
  const engines =
    mode === 'bing' ? [searchBing] : mode === 'duckduckgo' ? [searchDuckDuckGo] : [searchBing, searchDuckDuckGo];
  const errors: string[] = [];
  for (const search of engines) {
    try {
      return await search(query, settings.proxyUrl);
    } catch (error) {
      errors.push(`${search === searchBing ? 'Bing' : 'DuckDuckGo'}: ${error instanceof Error ? error.message : '失败'}`);
    }
  }
  throw new Error(`搜索失败：${errors.join('；')}`);
}

async function fetchUrl(url: string, proxyUrl = ''): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error('只支持 http/https 链接');
  const response = await nativeRequest(
    'GET',
    url,
    { 'User-Agent': 'Mozilla/5.0 (Linux; Android) PocketAgent/0.2' },
    undefined,
    undefined,
    proxyUrl
  );
  const html = typeof response.data === 'string' ? response.data : response.text;
  return truncate(htmlToText(html), 12000);
}

async function listPhoneFiles(path = '', direct = false): Promise<string> {
  if (direct) {
    const entries = await listAllFiles(path || '/storage/emulated/0');
    if (!entries.length) return '（空目录）';
    return entries.map((entry) => `${entry.name}${entry.isDirectory ? '/' : ''}`).join('\n');
  }
  const result = await Filesystem.readdir({ path: String(path || ''), directory: Directory.Documents });
  const lines = (result.files || []).map((file) => `${file.name}${file.type === 'directory' ? '/' : ''}`);
  return lines.length ? lines.join('\n') : '（空目录）';
}

async function readPhoneFile(path: string, direct = false): Promise<string> {
  if (direct) {
    return truncate(await readAllFile(String(path)), 100000);
  }
  const result = await Filesystem.readFile({
    path: String(path || ''),
    directory: Directory.Documents,
    encoding: Encoding.UTF8
  });
  return truncate(await fileDataToText(result.data), 100000);
}

async function writePhoneFile(path: string, content: string): Promise<string> {
  await Filesystem.writeFile({
    path: String(path || ''),
    data: String(content ?? ''),
    directory: Directory.Documents,
    recursive: true
  });
  return `已写入手机 Documents/${path}`;
}

async function executeLocalTool(name: string, args: Record<string, unknown>, settings: Settings): Promise<string> {
  const webEnabled = settings.enableWebSearch !== false;
  const phoneEnabled = settings.enablePhoneTools !== false;
  const tasksEnabled = settings.enableTasks !== false;
  switch (name) {
    case 'web_search':
      if (!webEnabled) throw new Error('联网搜索已在设置中关闭');
      return webSearch(String(args.query || ''), settings);
    case 'fetch_url':
      if (!webEnabled) throw new Error('联网搜索已在设置中关闭');
      return fetchUrl(String(args.url || ''), settings.proxyUrl);
    case 'phone_info':
      if (!phoneEnabled) throw new Error('手机能力已在设置中关闭');
      return JSON.stringify(await getPhoneInfo(), null, 2);
    case 'list_phone_files':
      if (!phoneEnabled) throw new Error('手机能力已在设置中关闭');
      const directList = settings.allowDirectRead !== false && (await hasAllFilesAccess());
      return listPhoneFiles(String(args.path || ''), directList);
    case 'read_phone_file':
      if (!phoneEnabled) throw new Error('手机能力已在设置中关闭');
      const directRead = settings.allowDirectRead !== false && (await hasAllFilesAccess());
      return readPhoneFile(String(args.path || ''), directRead);
    case 'write_phone_file': {
      if (!phoneEnabled) throw new Error('手机能力已在设置中关闭');
      const output = await writePhoneFile(String(args.path || ''), String(args.content || ''));
      return output;
    }
    case 'create_task': {
      if (!tasksEnabled) throw new Error('本地任务已在设置中关闭');
      const task = createLocalTask({ title: String(args.title || ''), notes: String(args.notes || '') });
      return `已创建任务 ${task.id}: ${task.title}`;
    }
    case 'list_tasks': {
      if (!tasksEnabled) throw new Error('本地任务已在设置中关闭');
      const tasks = listLocalTasks();
      if (!tasks.length) return '任务列表为空';
      return tasks.map((task) => `[${task.status}] ${task.title} (${task.id})${task.notes ? ` - ${task.notes}` : ''}`).join('\n');
    }
    case 'update_task': {
      if (!tasksEnabled) throw new Error('本地任务已在设置中关闭');
      const task = updateLocalTask(String(args.id || ''), {
        title: args.title !== undefined ? String(args.title) : undefined,
        notes: args.notes !== undefined ? String(args.notes) : undefined,
        status: args.status as 'todo' | 'in_progress' | 'done' | undefined
      });
      return `任务已更新为 [${task.status}] ${task.title}`;
    }
    case 'delete_task':
      if (!tasksEnabled) throw new Error('本地任务已在设置中关闭');
      deleteLocalTask(String(args.id || ''));
      return '任务已删除';
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

export async function runLocalAgent(options: {
  settings: Settings;
  messages: Array<{ role: string; content: string }>;
  onEvent: (event: LocalAgentEvent) => void;
  signal: AbortSignal;
  requestPhoneFile: (request: PhoneFileRequest) => Promise<PhoneFileResult>;
  requestApproval: (request: LocalApprovalRequest) => Promise<'allow' | 'deny'>;
}): Promise<void> {
  const { settings, messages, onEvent, signal, requestPhoneFile, requestApproval } = options;
  const emit = (event: LocalAgentEvent) => emitSafe(onEvent, event);
  if (!settings.apiKey) {
    emit({ type: 'error', message: '请在设置里填写 API Key，或开启演示模式' });
    return;
  }

  let mcpTools: McpDiscoveredTool[] = [];
  let mcpWarnings: string[] = [];
  try {
    const mcp = await discoverMcpTools(settings);
    mcpTools = mcp.tools;
    mcpWarnings = mcp.warnings;
  } catch (error) {
    mcpWarnings = [error instanceof Error ? error.message : 'MCP 服务连接失败'];
  }

  const systemPrompt = mcpWarnings.length
    ? `${buildSystem(settings)}\n\nMCP 服务状态：\n${mcpWarnings.join('\n')}`
    : buildSystem(settings);

  const conversation: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
    ...messages.map((message) => ({ role: message.role, content: message.content }))
  ];
  const maxTurns = Math.min(Math.max(Number(settings.maxTurns) || 10, 1), 20);

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    if (signal.aborted) {
      emit({ type: 'error', message: '运行已取消' });
      return;
    }
    emit({ type: 'turn', turn });
    let result;
    try {
      emit({ type: 'assistant-start', turn });
      result = await chatOnce(
        settings,
        conversation,
        signal,
        mcpTools.map((tool) => tool.definition)
      );
      if (result.content) emit({ type: 'delta', content: result.content });
      emit({ type: 'assistant-end', content: result.content, toolCalls: result.tool_calls.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型调用失败';
      emit({ type: 'error', message });
      return;
    }

    conversation.push({
      role: 'assistant',
      content: result.content || null,
      ...(result.tool_calls.length ? { tool_calls: result.tool_calls } : {})
    });
    if (!result.tool_calls.length) {
      emit({ type: 'done', reason: 'complete' });
      return;
    }

    for (const call of result.tool_calls) {
      const id = call.id || `call_${uid()}`;
      const name = call.function?.name || '';
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || '{}');
      } catch {
        args = {};
      }
      emit({ type: 'tool-call', id, name, arguments: args });
      const startedAt = Date.now();
      try {
        let output: string;
        if (name.startsWith('mcp_')) {
          const entry = mcpToolIndex.get(name);
          if (!entry) throw new Error(`MCP 工具不存在: ${name}`);
          output = await executeMcpTool(settings, entry.serverId, entry.toolName, args);
        } else if (name === 'ocr_image') {
          if (settings.ocrEnabled === false) throw new Error('OCR 识图已在设置中关闭');
          const requestId = uid();
          const summary = `识别图片文字：${args.hint || '请选择一张图片'}`;
          emit({
            type: 'phone-tool-request',
            requestId,
            id,
            name,
            arguments: args,
            summary
          });
          const phoneResult = await requestPhoneFile({ requestId, toolId: id, name, summary });
          if (phoneResult.status !== 'ok') throw new Error(phoneResult.error || '用户取消了图片选择');
          output = phoneResult.output;
        } else if (name === 'phone_read_file') {
          if (settings.enablePhoneTools === false) throw new Error('手机能力已在设置中关闭');
          const requestId = uid();
          const summary = `读取手机文件：${args.hint || '请选择文件'}`;
          emit({
            type: 'phone-tool-request',
            requestId,
            id,
            name,
            arguments: args,
            summary
          });
          const phoneResult = await requestPhoneFile({ requestId, toolId: id, name, summary });
          if (phoneResult.status !== 'ok') throw new Error(phoneResult.error || '用户取消了文件选择');
          output = phoneResult.output;
        } else if (name === 'write_phone_file') {
          if (settings.enablePhoneTools === false) throw new Error('手机能力已在设置中关闭');
          if (settings.requireWriteApproval !== false) {
            const requestId = uid();
            const summary = `写入文件：${String(args.path || '')}`;
            const detail = `内容：${String(args.content || '').slice(0, 200)}`;
            const decision = await requestApproval({ requestId, toolId: id, name, summary, detail });
            if (decision !== 'allow') throw new Error('用户拒绝了文件写入');
          }
          output = await executeLocalTool(name, args, settings);
        } else {
          output = await executeLocalTool(name, args, settings);
        }
        emit({ type: 'tool-result', id, status: 'success', output, durationMs: Date.now() - startedAt });
        conversation.push({ role: 'tool', tool_call_id: id, content: String(output).slice(0, 20000) });
      } catch (error) {
        const message = error instanceof Error ? error.message : '工具执行失败';
        emit({ type: 'tool-result', id, status: 'error', error: message, durationMs: Date.now() - startedAt });
        conversation.push({ role: 'tool', tool_call_id: id, content: `错误：${message}` });
      }
    }
  }
  emit({ type: 'done', reason: 'max-turns' });
}

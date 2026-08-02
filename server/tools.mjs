import { exec } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { addTask, listTasks, patchTask } from './store.mjs';

const execAsync = promisify(exec);

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网并返回若干条网页标题、链接和摘要。适合查事实、新闻、资料和最新信息。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，中文或英文均可' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: '抓取一个网页并提取可读文本，用于阅读文章或检查页面内容。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '以 http:// 或 https:// 开头的完整 URL' },
          max_chars: { type: 'number', description: '最多返回多少字符，默认 8000' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出 Agent 工作区内某个目录下的文件和子目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '工作区相对路径，空字符串表示根目录' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取工作区内的文本文件内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '工作区相对路径' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '在工作区内新建或覆盖一个文本文件。此操作需要用户在手机上批准。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '工作区相对路径' },
          content: { type: 'string', description: '完整文件内容' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: '在 Agent 服务所在电脑上执行一条 shell 命令。始终需要用户在手机上批准。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '可选，工作区相对路径作为工作目录' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '在应用的任务列表里创建一个待办任务。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          notes: { type: 'string', description: '补充说明' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: '列出当前应用任务列表中的所有任务。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '更新任务的状态、标题或备注。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 ID' },
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
      name: 'phone_info',
      description: '获取手机设备信息，包括型号、系统版本、电量、剩余存储、可用内存等。由手机端实时提供。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'phone_read_file',
      description: '让用户在手机上选择一个文件并读取内容。适合让 Agent 处理手机里的文本、笔记、配置、日志等文件。需要用户手动选择文件。',
      parameters: {
        type: 'object',
        properties: {
          hint: { type: 'string', description: '告诉用户想读取什么文件以及用途' }
        }
      }
    }
  }
];

export const PHONE_TOOLS = new Set(['phone_info', 'phone_read_file']);

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function truncate(text, max = 6000) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}\n...（已截断）` : value;
}

function decodeEntities(input) {
  return String(input)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

async function duckDuckGoSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PocketAgent/0.1',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`搜索服务返回 ${response.status}`);
  const html = await response.text();
  const blocks = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, 6)
    .map((match) => ({
      title: htmlToText(match[2]),
      url: decodeEntities(match[1]),
      snippet: htmlToText(match[3])
    }));
  if (blocks.length === 0) throw new Error('没有搜索到结果');
  return blocks;
}

async function bingSearch(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PocketAgent/0.1',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`搜索服务返回 ${response.status}`);
  const html = await response.text();
  const patterns = [
    /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?(?:<p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>)?/gi,
    /<li class="b_algo"[\s\S]*?<div class="b_algoheader"><a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2><\/a><\/div>[\s\S]*?<div class="b_caption"><p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/gi
  ];
  let blocks = [];
  for (const pattern of patterns) {
    blocks = [...html.matchAll(pattern)]
      .slice(0, 6)
      .map((match) => ({
        title: htmlToText(match[2]),
        url: decodeEntities(match[1]),
        snippet: htmlToText(match[3] || '')
      }));
    if (blocks.length) break;
  }
  blocks = blocks.filter((item) => !/^https?:\/\/www\.bing\.com\//i.test(item.url));
  if (blocks.length === 0) throw new Error('Bing 没有返回结果');
  return blocks;
}

async function runWebSearch(args) {
  const query = String(args.query || '').trim();
  if (!query) throw new Error('搜索关键词不能为空');
  const errors = [];
  let results;
  try {
    results = await bingSearch(query);
  } catch (error) {
    errors.push(`Bing: ${error.message}`);
  }
  if (!results) {
    try {
      results = await duckDuckGoSearch(query);
    } catch (error) {
      errors.push(`DuckDuckGo: ${error.message}`);
    }
  }
  if (!results) throw new Error(`搜索失败：${errors.join('；')}`);
  return results.map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`).join('\n\n');
}

async function runFetchUrl(args) {
  const url = String(args.url || '').trim();
  const maxChars = Math.min(Number(args.max_chars) || 8000, 30000);
  if (!/^https?:\/\//i.test(url)) throw new Error('只允许抓取 http/https 链接');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PocketAgent/0.1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`页面返回 ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const text = contentType.includes('json')
    ? JSON.stringify(await response.json(), null, 2)
    : htmlToText(await response.text());
  return truncate(text, maxChars);
}

function workspaceRoot() {
  return path.resolve(process.cwd(), process.env.AGENT_WORKSPACE || './server/workspace');
}

function resolveInWorkspace(relativePath = '') {
  const root = workspaceRoot();
  const target = path.resolve(root, String(relativePath || ''));
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new Error('路径必须位于 Agent 工作区内');
  }
  return target;
}

async function runListFiles(args) {
  const target = resolveInWorkspace(args.path);
  const entries = await readdir(target, { withFileTypes: true });
  const lines = entries.map((entry) => {
    const suffix = entry.isDirectory() ? '/' : '';
    return `${entry.name}${suffix}`;
  });
  return lines.length ? lines.join('\n') : '（空目录）';
}

async function runReadFile(args) {
  const target = resolveInWorkspace(args.path);
  const content = await readFile(target, 'utf8');
  return truncate(content, 100000);
}

async function runWriteFile(args) {
  const target = resolveInWorkspace(args.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, String(args.content ?? ''), 'utf8');
  return `已写入 ${path.relative(workspaceRoot(), target) || path.basename(target)}`;
}

async function runShell(args) {
  const root = workspaceRoot();
  const cwd = args.cwd ? resolveInWorkspace(args.cwd) : root;
  const { stdout, stderr } = await execAsync(String(args.command || ''), {
    cwd,
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true
  });
  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return output || '命令执行完成，没有输出';
}

export async function runTool(name, rawArgs) {
  const args = safeJson(rawArgs);
  switch (name) {
    case 'web_search':
      return runWebSearch(args);
    case 'fetch_url':
      return runFetchUrl(args);
    case 'list_files':
      return runListFiles(args);
    case 'read_file':
      return runReadFile(args);
    case 'write_file':
      return runWriteFile(args);
    case 'run_shell':
      return runShell(args);
    case 'create_task': {
      const task = await addTask({ title: args.title, notes: args.notes });
      return `已创建任务 ${task.id}: ${task.title}`;
    }
    case 'list_tasks': {
      const tasks = await listTasks();
      if (!tasks.length) return '任务列表为空';
      return tasks.map((task) => `[${task.status}] ${task.title} (${task.id})${task.notes ? ` - ${task.notes}` : ''}`).join('\n');
    }
    case 'update_task': {
      const task = await patchTask(args.id, { title: args.title, notes: args.notes, status: args.status });
      return `任务已更新为 [${task.status}] ${task.title}`;
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

export function approvalFor(name, rawArgs, settings) {
  const args = safeJson(rawArgs);
  if (name === 'run_shell') {
    if (!settings.allowShell) return null;
    return {
      summary: `在电脑上执行命令：\n${args.command}`,
      detail: `工作目录：${args.cwd || './server/workspace'}\n命令会直接在本机运行，请确认内容可信。`
    };
  }
  if (name === 'write_file') {
    return {
      summary: `写入文件：${args.path}`,
      detail: `目标位于 Agent 工作区，内容将由 AI 生成。`
    };
  }
  return null;
}

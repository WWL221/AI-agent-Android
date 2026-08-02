import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runAgent } from './agent.mjs';
import { addTask, listTasks, patchTask, removeTask } from './store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const publicDir = path.join(projectRoot, 'server', 'public');

function loadEnv() {
  const envFile = path.join(projectRoot, '.env');
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const config = {
  port: Number(process.env.PORT) || 8787,
  apiKey: process.env.OPENAI_API_KEY || '',
  baseUrl: process.env.AGENT_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.AGENT_MODEL || 'gpt-4o-mini',
  workspace: path.resolve(projectRoot, process.env.AGENT_WORKSPACE || './server/workspace'),
  authToken: process.env.AGENT_AUTH_TOKEN || '',
  mock: String(process.env.AGENT_MOCK).toLowerCase() === 'true',
  allowShell: String(process.env.AGENT_ALLOW_SHELL).toLowerCase() !== 'false'
};

await mkdir(config.workspace, { recursive: true });

const runs = new Map();
const pendingApprovals = new Map();
const pendingPhoneTools = new Map();
const rememberedApprovals = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!config.authToken) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${config.authToken}` || req.headers['x-auth-token'] === config.authToken;
}

function routeMatch(url, pattern) {
  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (parts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i += 1) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(parts[i]);
    } else if (patternParts[i] !== parts[i]) {
      return null;
    }
  }
  return params;
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(publicDir, pathname);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.normalize(publicDir))) {
    sendJson(res, 403, { error: '禁止访问' });
    return;
  }
  if (existsSync(normalized) && statSync(normalized).isFile()) {
    const ext = path.extname(normalized).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    createReadStream(normalized).pipe(res);
    return;
  }
  const indexFile = path.join(publicDir, 'index.html');
  if (existsSync(indexFile)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    createReadStream(indexFile).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('口袋智能体服务已启动，但前端尚未构建。请先运行 npm run build。');
}

async function handleTasks(req, res, method, url) {
  if (method === 'GET' && url.pathname === '/api/tasks') {
    return sendJson(res, 200, await listTasks());
  }
  if (method === 'POST' && url.pathname === '/api/tasks') {
    const body = await readBody(req);
    try {
      return sendJson(res, 201, await addTask(body));
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }
  const patchMatch = routeMatch(url, 'api/tasks/:id');
  if (method === 'PATCH' && patchMatch) {
    const body = await readBody(req);
    try {
      return sendJson(res, 200, await patchTask(patchMatch.id, body));
    } catch (error) {
      return sendJson(res, 404, { error: error.message });
    }
  }
  const deleteMatch = routeMatch(url, 'api/tasks/:id');
  if (method === 'DELETE' && deleteMatch) {
    try {
      return sendJson(res, 200, await removeTask(deleteMatch.id));
    } catch (error) {
      return sendJson(res, 404, { error: error.message });
    }
  }
  return sendJson(res, 404, { error: '接口不存在' });
}

function approvalKey(summary) {
  return String(summary || '').trim();
}

function requestApproval(info, signal) {
  return new Promise((resolve) => {
    const key = approvalKey(info.summary);
    if (rememberedApprovals.has(key)) {
      resolve('allow');
      return;
    }
    if (signal?.aborted) {
      resolve('deny');
      return;
    }
    const requestId = info.requestId || randomUUID();
    let timer = setTimeout(() => {
      pendingApprovals.delete(requestId);
      resolve('deny');
    }, 180000);
    const onAbort = () => {
      clearTimeout(timer);
      pendingApprovals.delete(requestId);
      resolve('deny');
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    pendingApprovals.set(requestId, {
      info: { ...info, requestId },
      resolve: (decision, remember) => {
        clearTimeout(timer);
        pendingApprovals.delete(requestId);
        if (remember) rememberedApprovals.add(key);
        resolve(decision);
      }
    });
  });
}

function requestPhoneToolResult(info, signal) {
  return new Promise((resolve) => {
    const requestId = info.requestId || randomUUID();
    if (signal?.aborted) {
      resolve({ status: 'error', error: '运行已取消' });
      return;
    }
    const timer = setTimeout(() => {
      pendingPhoneTools.delete(requestId);
      resolve({ status: 'error', error: '手机端未响应，已超时' });
    }, 300000);
    const onAbort = () => {
      clearTimeout(timer);
      pendingPhoneTools.delete(requestId);
      resolve({ status: 'error', error: '运行已取消' });
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    pendingPhoneTools.set(requestId, {
      resolve: (result) => {
        clearTimeout(timer);
        pendingPhoneTools.delete(requestId);
        resolve(result);
      }
    });
  });
}

async function handleAgentRun(req, res, body) {
  const runId = body.runId || randomUUID();
  const controller = new AbortController();
  const settings = {
    model: body.model || config.model,
    baseUrl: body.baseUrl || config.baseUrl,
    apiKey: body.apiKey || config.apiKey,
    mock: Boolean(body.mock) || config.mock,
    allowShell: config.allowShell,
    workspace: config.workspace,
    maxTurns: body.maxTurns,
    signal: controller.signal
  };
  const messages = Array.isArray(body.messages) ? body.messages : [];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });
  res.write(`data: ${JSON.stringify({ type: 'started', runId })}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
    }
  }, 15000);

  const emit = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  runs.set(runId, controller);
  req.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    await runAgent({ messages, settings, emit, requestApproval, requestPhoneToolResult });
  } catch (error) {
    emit({ type: 'error', message: error?.message || 'Agent 运行失败' });
  } finally {
    clearInterval(ping);
    runs.delete(runId);
    if (!res.writableEnded) res.end();
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-auth-token',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true, name: 'pocket-agent', version: '0.1.0', time: new Date().toISOString() });
  }

  if (url.pathname.startsWith('/api/') && !isAuthorized(req)) {
    return sendJson(res, 401, { error: '未授权：请在手机设置中填写与 AGENT_AUTH_TOKEN 相同的访问令牌' });
  }

  if (url.pathname === '/api/config' && method === 'GET') {
    return sendJson(res, 200, {
      model: config.model,
      baseUrl: config.baseUrl,
      workspace: config.workspace,
      allowShell: config.allowShell,
      authRequired: Boolean(config.authToken),
      mock: config.mock
    });
  }

  if (url.pathname === '/api/model/test' && method === 'POST') {
    const body = await readBody(req);
    const model = body.model || config.model;
    const baseUrl = String(body.baseUrl || config.baseUrl).replace(/\/+$/, '');
    const apiKey = body.apiKey || config.apiKey;
    if (!apiKey) return sendJson(res, 400, { ok: false, error: '未填写 API Key' });
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
          stream: false
        }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.error?.message || data?.error || JSON.stringify(data).slice(0, 300);
        return sendJson(res, 502, { ok: false, error: `模型接口返回 ${response.status}: ${detail}` });
      }
      return sendJson(res, 200, {
        ok: true,
        model: data.model || model,
        reply: data.choices?.[0]?.message?.content || ''
      });
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error?.message || '模型连接失败' });
    }
  }

  if (url.pathname === '/api/model/list' && method === 'POST') {
    const body = await readBody(req);
    const baseUrl = String(body.baseUrl || config.baseUrl).replace(/\/+$/, '');
    const apiKey = body.apiKey || config.apiKey;
    if (!apiKey) return sendJson(res, 400, { ok: false, error: '未填写 API Key' });
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(30000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.error?.message || data?.error || JSON.stringify(data).slice(0, 300);
        return sendJson(res, 502, { ok: false, error: `模型列表接口返回 ${response.status}: ${detail}` });
      }
      const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
      const models = raw
        .map((item) => (typeof item === 'string' ? item : item?.id))
        .filter((id) => typeof id === 'string' && id)
        .sort((a, b) => String(a).localeCompare(String(b)));
      if (!models.length) return sendJson(res, 502, { ok: false, error: '接口没有返回可用模型列表' });
      return sendJson(res, 200, { ok: true, models, count: models.length });
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error?.message || '读取模型列表失败' });
    }
  }

  if (url.pathname.startsWith('/api/tasks')) {
    return handleTasks(req, res, method, url);
  }

  if (url.pathname === '/api/agent/run' && method === 'POST') {
    try {
      const body = await readBody(req);
      return await handleAgentRun(req, res, body);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/approve' && method === 'POST') {
    const body = await readBody(req);
    const pending = pendingApprovals.get(body.requestId);
    if (!pending) return sendJson(res, 404, { error: '审批请求不存在或已超时' });
    pending.resolve(body.decision === 'allow' ? 'allow' : 'deny', Boolean(body.remember));
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/phone-tool/result' && method === 'POST') {
    const body = await readBody(req);
    const pending = pendingPhoneTools.get(body.requestId);
    if (!pending) return sendJson(res, 404, { error: '手机工具请求不存在或已超时' });
    pending.resolve({
      status: body.status === 'ok' ? 'ok' : 'error',
      output: body.output,
      error: body.error
    });
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/cancel' && method === 'POST') {
    const body = await readBody(req);
    const controller = runs.get(body.runId);
    if (controller) controller.abort();
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: '接口不存在' });
  }

  return serveStatic(req, res, url);
});

server.listen(config.port, () => {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) addresses.push(item.address);
    }
  }
  console.log('口袋智能体已启动');
  console.log(`  本机: http://localhost:${config.port}`);
  for (const address of addresses) {
    console.log(`  手机访问: http://${address}:${config.port}`);
  }
  console.log(`  工作区: ${config.workspace}`);
  console.log(config.mock ? '  模式: 演示模式（无需 API Key）' : '  模式: 真实模型');
});

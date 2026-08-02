import { randomUUID } from 'node:crypto';
import { approvalFor, PHONE_TOOLS, runTool, TOOL_SCHEMAS } from './tools.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildSystem(settings) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  return [
    '你是“口袋智能体”，一个运行在安卓手机上的 AI Agent，类似 Codex。',
    '你通过手机聊天界面与用户交互，并通过工具在 Agent 服务所在电脑上执行任务。',
    '',
    '行为准则：',
    '1. 先简短说明意图，再调用工具；',
    '2. 使用真实工具结果回答，不编造搜索结果、文件内容或命令输出；',
    '3. 写文件、运行 shell 命令前必须等待用户批准；',
    '4. 文件只能操作 Agent 工作区内的路径；',
    '5. 回答使用中文，结论先行，给可执行建议；',
    '6. 任务完成时用 2-5 句话总结，并指出用户下一步可以做什么。',
    '',
    `当前时间：${now}`,
    `模型：${settings.model}`,
    `工作区：${settings.workspace}`,
    settings.allowShell ? 'shell 工具已启用，但每次执行都需要用户批准。' : 'shell 工具当前未启用。'
  ].join('\n');
}

function emitSafe(emit, event) {
  try {
    emit(event);
  } catch {
    // Client connection may already be gone.
  }
}

function normalizeBaseUrl(value) {
  return String(value || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

function parseToolArgs(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return { _raw: String(value || '') };
  }
}

async function chatOnce(messages, settings, emit) {
  const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: 'auto',
      temperature: 0.3,
      stream: true,
      stream_options: { include_usage: true }
    }),
    signal: settings.signal
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`模型接口返回 ${response.status}: ${text.slice(0, 500)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const contentParts = [];
  const toolCalls = new Map();

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
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (typeof delta.content === 'string' && delta.content) {
          contentParts.push(delta.content);
          emitSafe(emit, { type: 'delta', content: delta.content });
        }
        for (const part of delta.tool_calls || []) {
          const current = toolCalls.get(part.index) || {
            id: '',
            function: { name: '', arguments: '' }
          };
          if (part.id) current.id = part.id;
          if (part.function?.name) current.function.name += part.function.name;
          if (part.function?.arguments) current.function.arguments += part.function.arguments;
          toolCalls.set(part.index, current);
        }
      } catch {
        // Ignore malformed keep-alive or partial JSON lines.
      }
    }
  }

  const calls = [...toolCalls.values()].map((call, index) => ({
    id: call.id || `call_${index}_${randomUUID().slice(0, 8)}`,
    type: 'function',
    function: {
      name: call.function.name || '',
      arguments: call.function.arguments || '{}'
    }
  }));

  return {
    role: 'assistant',
    content: contentParts.join('') || null,
    ...(calls.length ? { tool_calls: calls } : {})
  };
}

async function runMockAgent({ messages, settings, emit, requestApproval, requestPhoneToolResult }) {
  const lastUser = [...messages].reverse().find((item) => item.role === 'user');
  const subject = String(lastUser?.content || '这个请求').replace(/\s+/g, ' ').slice(0, 60);
  emitSafe(emit, { type: 'assistant-start' });
  const intro = `好的，我先处理「${subject}」。我会先搜索相关资料，再把结果整理成行动清单。`;
  emitSafe(emit, { type: 'delta', content: intro });

  const searchId = 'mock_search_1';
  emitSafe(emit, {
    type: 'tool-call',
    id: searchId,
    name: 'web_search',
    arguments: { query: `${subject} 最新实践` }
  });
  await sleep(600);
  emitSafe(emit, { type: 'tool-status', id: searchId, status: 'running' });
  await sleep(1200);
  emitSafe(emit, {
    type: 'tool-result',
    id: searchId,
    status: 'success',
    output: '1. 口袋智能体：把手机变成个人 AI 工作台\n   https://example.com/pocket-agent\n   支持对话、任务、网页搜索和文件工具。\n\n2. AI Agent 工具调用最佳实践\n   https://example.com/agent-tools\n   建议先验证工具结果，再写入文件或执行命令。',
    durationMs: 1800
  });

  const phoneId = 'mock_phone_info';
  const phoneRequestId = randomUUID();
  emitSafe(emit, {
    type: 'tool-call',
    id: phoneId,
    name: 'phone_info',
    arguments: {}
  });
  emitSafe(emit, {
    type: 'phone-tool-request',
    requestId: phoneRequestId,
    id: phoneId,
    name: 'phone_info',
    arguments: {},
    summary: '读取手机设备信息'
  });
  const phoneResult = await requestPhoneToolResult({ requestId: phoneRequestId, name: 'phone_info', arguments: {} }, settings.signal);
  const phoneOutput = phoneResult?.status === 'ok' ? phoneResult.output : phoneResult?.error || '手机信息读取失败';
  emitSafe(emit, {
    type: 'tool-result',
    id: phoneId,
    status: phoneResult?.status === 'ok' ? 'success' : 'error',
    output: phoneResult?.status === 'ok' ? phoneOutput : undefined,
    error: phoneResult?.status === 'ok' ? undefined : phoneOutput,
    durationMs: 300
  });

  const taskId = 'mock_task_1';
  emitSafe(emit, {
    type: 'tool-call',
    id: taskId,
    name: 'create_task',
    arguments: { title: `整理「${subject}」的行动清单`, notes: '由演示模式自动创建' }
  });
  await sleep(300);
  emitSafe(emit, { type: 'tool-status', id: taskId, status: 'running' });
  await sleep(500);
  const createdTask = await runTool('create_task', JSON.stringify({ title: `整理「${subject}」的行动清单`, notes: '由演示模式自动创建' }));
  emitSafe(emit, {
    type: 'tool-result',
    id: taskId,
    status: 'success',
    output: createdTask,
    durationMs: 800
  });

  const writeId = 'mock_write_1';
  const summary = `# ${subject}\n\n- 完成网络搜索\n- 创建行动清单\n- 等待用户确认后写入笔记`;
  emitSafe(emit, {
    type: 'tool-call',
    id: writeId,
    name: 'write_file',
    arguments: { path: 'demo-notes.md', content: summary }
  });
  const approval = approvalFor('write_file', JSON.stringify({ path: 'demo-notes.md', content: summary }), settings);
  if (approval) {
    const requestId = randomUUID();
    emitSafe(emit, {
      type: 'approval-required',
      requestId,
      id: writeId,
      name: 'write_file',
      arguments: { path: 'demo-notes.md' },
      summary: approval.summary,
      detail: approval.detail
    });
    const decision = await requestApproval({ requestId, ...approval }, settings.signal);
    if (decision === 'deny') {
      emitSafe(emit, {
        type: 'tool-result',
        id: writeId,
        status: 'error',
        error: '用户拒绝了写入操作',
        durationMs: 0
      });
    } else {
      emitSafe(emit, { type: 'tool-status', id: writeId, status: 'running' });
      await sleep(800);
      const written = await runTool('write_file', JSON.stringify({ path: 'demo-notes.md', content: summary }));
      emitSafe(emit, {
        type: 'tool-result',
        id: writeId,
        status: 'success',
        output: written,
        durationMs: 800
      });
    }
  }

  const closing = '\n\n我已经完成一轮演示：搜索了相关资料，创建了任务，并在你批准后把笔记写进工作区。现在可以打开“任务”页查看，或直接继续输入真实需求。';
  emitSafe(emit, { type: 'delta', content: closing });
  emitSafe(emit, {
    type: 'assistant-end',
    content: intro + closing,
    toolCalls: 3
  });
  emitSafe(emit, { type: 'done', reason: 'mock-complete' });
}

export async function runAgent({ messages, settings, emit, requestApproval, requestPhoneToolResult }) {
  if (settings.mock) {
    await runMockAgent({ messages, settings, emit, requestApproval, requestPhoneToolResult });
    return;
  }
  if (!settings.apiKey) {
    emitSafe(emit, { type: 'error', message: '服务端未配置 OPENAI_API_KEY，也没有启用演示模式。请在手机端“设置”里填写 API Key，或启动服务时设置 OPENAI_API_KEY/AGENT_MOCK=true。' });
    return;
  }

  const conversation = [
    { role: 'system', content: buildSystem(settings) },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {})
    }))
  ];

  const maxTurns = Math.min(Math.max(Number(settings.maxTurns) || 10, 1), 20);

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    emitSafe(emit, { type: 'turn', turn });
    let assistant;
    try {
      emitSafe(emit, { type: 'assistant-start', turn });
      assistant = await chatOnce(conversation, settings, emit);
      emitSafe(emit, { type: 'assistant-end', content: assistant.content || '', toolCalls: assistant.tool_calls?.length || 0 });
    } catch (error) {
      const message = error?.name === 'AbortError' ? '运行已取消' : error?.message || '模型调用失败';
      emitSafe(emit, { type: 'error', message });
      return;
    }

    conversation.push(assistant);
    if (!assistant.tool_calls?.length) {
      emitSafe(emit, { type: 'done', reason: 'complete' });
      return;
    }

    for (const call of assistant.tool_calls) {
      const name = call.function?.name || '';
      const rawArgs = call.function?.arguments || '{}';
      const args = parseToolArgs(rawArgs);
      const id = call.id || randomUUID();
      emitSafe(emit, { type: 'tool-call', id, name, arguments: args });

      if (name === 'run_shell' && !settings.allowShell) {
        emitSafe(emit, { type: 'tool-result', id, status: 'error', error: 'shell 工具未在服务端启用', durationMs: 0 });
        conversation.push({ role: 'tool', tool_call_id: id, content: '错误：shell 工具未启用' });
        continue;
      }

      const approval = approvalFor(name, rawArgs, settings);
      if (approval) {
        const requestId = randomUUID();
        emitSafe(emit, {
          type: 'approval-required',
          requestId,
          id,
          name,
          arguments: args,
          summary: approval.summary,
          detail: approval.detail
        });
        let decision = 'deny';
        try {
          decision = await requestApproval({ requestId, ...approval }, settings.signal);
        } catch (error) {
          decision = error?.name === 'AbortError' ? 'deny' : 'deny';
        }
        if (decision === 'deny') {
          const denied = `用户拒绝了操作：${approval.summary}`;
          emitSafe(emit, { type: 'tool-result', id, status: 'error', error: denied, durationMs: 0 });
          conversation.push({ role: 'tool', tool_call_id: id, content: denied });
          continue;
        }
      }

      const startedAt = Date.now();
      if (PHONE_TOOLS.has(name)) {
        const requestId = randomUUID();
        const summary = name === 'phone_info' ? '读取手机设备信息' : `读取手机文件：${args.hint || '请选择文件'}`;
        emitSafe(emit, {
          type: 'phone-tool-request',
          requestId,
          id,
          name,
          arguments: args,
          summary
        });
        let result;
        try {
          result = await requestPhoneToolResult({ requestId, name, args }, settings.signal);
        } catch {
          result = { status: 'error', error: '手机端未响应' };
        }
        const output = result?.status === 'ok' ? result.output : result?.error || '手机端未返回结果';
        emitSafe(emit, {
          type: 'tool-result',
          id,
          status: result?.status === 'ok' ? 'success' : 'error',
          output: result?.status === 'ok' ? output : undefined,
          error: result?.status === 'ok' ? undefined : output,
          durationMs: Date.now() - startedAt
        });
        conversation.push({ role: 'tool', tool_call_id: id, content: String(output).slice(0, 20000) });
        continue;
      }
      emitSafe(emit, { type: 'tool-status', id, status: 'running' });
      try {
        const output = await runTool(name, rawArgs);
        emitSafe(emit, {
          type: 'tool-result',
          id,
          status: 'success',
          output,
          durationMs: Date.now() - startedAt
        });
        conversation.push({ role: 'tool', tool_call_id: id, content: String(output).slice(0, 20000) });
      } catch (error) {
        const message = error?.message || '工具执行失败';
        emitSafe(emit, {
          type: 'tool-result',
          id,
          status: 'error',
          error: message,
          durationMs: Date.now() - startedAt
        });
        conversation.push({ role: 'tool', tool_call_id: id, content: `错误：${message}` });
      }
    }
  }

  emitSafe(emit, { type: 'done', reason: 'max-turns' });
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListTodo, MessageSquare, Plus, Settings as SettingsIcon } from 'lucide-react';
import {
  approveRequest,
  cancelRun,
  fetchTasks,
  runAgent,
  submitPhoneToolResult,
  type AgentEvent
} from './api';
import { loadSettings, loadThreads, saveSettings, saveThreads, uid } from './storage';
import { getPhoneInfo, pickPhoneFile, pickPhoneImage } from './phone';
import { recognizeImage, runLocalAgent, type PhoneFileRequest, type PhoneFileResult } from './localAgent';
import { createLocalTask, listLocalTasks } from './localTasks';
import { getDueScheduledActions, markScheduledActionRun } from './scheduledActions';
import { openPhoneApp, resolvePhoneAppPackage } from './phoneControl';
import { applyTheme } from './theme';
import type { AgentTask, Message, Settings, Thread, ToolCallRecord } from './types';
import ChatScreen from './components/ChatScreen';
import TaskScreen from './components/TaskScreen';
import SettingsScreen from './components/SettingsScreen';
import ModelScreen from './components/ModelScreen';
import ApprovalSheet from './components/ApprovalSheet';
import PhoneToolSheet, { type PhoneToolRequest } from './components/PhoneToolSheet';

type Tab = 'chat' | 'tasks' | 'settings' | 'models';

interface ApprovalState {
  requestId: string;
  toolId: string;
  name: string;
  summary: string;
  detail?: string;
}

function makeThread(title = '新对话'): Thread {
  const now = Date.now();
  return {
    id: uid(),
    title,
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    messages: []
  };
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [threads, setThreads] = useState<Thread[]>(() =>
    loadThreads().map((thread) => (thread.status === 'running' ? { ...thread, status: 'idle' } : thread))
  );
  const [activeId, setActiveId] = useState<string | null>(() => threads[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>('chat');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalState | null>(null);
  const [phoneToolRequest, setPhoneToolRequest] = useState<PhoneToolRequest | null>(null);
  const [phoneToolBusy, setPhoneToolBusy] = useState(false);
  const [tasksError, setTasksError] = useState('');

  const activeIdRef = useRef(activeId);
  const runRef = useRef<{ controller: AbortController; runId: string; targetId: string } | null>(null);
  const localPhoneResolvers = useRef(new Map<string, (result: PhoneFileResult) => void>());
  const localApprovalResolvers = useRef(new Map<string, (decision: 'allow' | 'deny') => void>());

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    applyTheme(settings);
  }, [tab, settings]);

  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  const refreshTasks = useCallback(async () => {
    try {
      const next = settings.runMode === 'phone' ? listLocalTasks() : await fetchTasks(settings);
      setTasks(next);
      setTasksError('');
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : '无法连接任务服务');
    }
  }, [settings]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const patchActiveThread = useCallback((updater: (thread: Thread) => Thread) => {
    const id = activeIdRef.current;
    if (!id) return;
    setThreads((prev) => prev.map((thread) => (thread.id === id ? updater(thread) : thread)));
  }, []);

  const patchThread = useCallback((id: string, updater: (thread: Thread) => Thread) => {
    setThreads((prev) => prev.map((thread) => (thread.id === id ? updater(thread) : thread)));
  }, []);

  const patchAssistant = useCallback(
    (messageId: string, updater: (message: Message) => Message) => {
      patchActiveThread((thread) => ({
        ...thread,
        updatedAt: Date.now(),
        messages: thread.messages.map((message) => (message.id === messageId ? updater(message) : message))
      }));
    },
    [patchActiveThread]
  );

  const patchTool = useCallback(
    (messageId: string, toolId: string, updater: (tool: ToolCallRecord) => ToolCallRecord) => {
      patchAssistant(messageId, (message) => ({
        ...message,
        toolCalls: message.toolCalls.map((tool) => (tool.id === toolId ? updater(tool) : tool))
      }));
    },
    [patchAssistant]
  );

  const sendMessage = useCallback(
    async (text: string, deep: boolean) => {
      const trimmed = text.trim();
      if (!trimmed || runRef.current) return;

      const now = Date.now();
      let threadId = activeIdRef.current;
      let threadTitle = '';

      if (!threadId) {
        threadId = uid();
        threadTitle = trimmed.slice(0, 26);
        const thread: Thread = {
          id: threadId,
          title: threadTitle,
          createdAt: now,
          updatedAt: now,
          status: 'running',
          messages: []
        };
        setThreads((prev) => [thread, ...prev]);
        setActiveId(threadId);
        activeIdRef.current = threadId;
      } else {
        const current = threads.find((item) => item.id === threadId);
        threadTitle = current?.title === '新对话' ? trimmed.slice(0, 26) : current?.title || '新对话';
      }
      const targetId = threadId;

      const userMessage: Message = {
        id: uid(),
        role: 'user',
        content: trimmed,
        toolCalls: [],
        createdAt: now
      };
      const assistantMessage: Message = {
        id: uid(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        createdAt: now
      };

      setThreads((prev) => {
        const exists = prev.some((item) => item.id === targetId);
        const base = exists
          ? prev.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    title: threadTitle,
                    status: 'running' as const,
                    updatedAt: now,
                    messages: [...item.messages, userMessage, assistantMessage]
                  }
                : item
            )
          : prev;
        if (!exists) {
          const thread: Thread = {
            id: targetId,
            title: threadTitle,
            createdAt: now,
            updatedAt: now,
            status: 'running',
            messages: [userMessage, assistantMessage]
          };
          return [thread, ...base];
        }
        return base;
      });

      setTab('chat');
      const controller = new AbortController();
      runRef.current = { controller, runId: '', targetId };

      const patchRunThread = (updater: (thread: Thread) => Thread) => patchThread(targetId, updater);
      const patchRunAssistant = (messageId: string, updater: (message: Message) => Message) =>
        patchRunThread((thread) => ({
          ...thread,
          updatedAt: Date.now(),
          messages: thread.messages.map((message) => (message.id === messageId ? updater(message) : message))
        }));
      const patchRunTool = (messageId: string, toolId: string, updater: (tool: ToolCallRecord) => ToolCallRecord) =>
        patchRunAssistant(messageId, (message) => ({
          ...message,
          toolCalls: message.toolCalls.map((tool) => (tool.id === toolId ? updater(tool) : tool))
        }));

      const runMessages = threads
        .find((item) => item.id === targetId)
        ?.messages.concat(userMessage)
        .map((message) => ({ role: message.role, content: message.content })) ?? [{ role: 'user', content: trimmed }];

      const handleEvent = (event: AgentEvent) => {
        if (event.type === 'started') {
          if (runRef.current) runRef.current.runId = String(event.runId || '');
          return;
        }
        if (event.type === 'delta') {
          patchRunAssistant(assistantMessage.id, (message) => ({
            ...message,
            content: `${message.content}${String(event.content || '')}`
          }));
          return;
        }
        if (event.type === 'tool-call') {
          const toolId = String(event.id || uid());
          const name = String(event.name || '');
          patchRunAssistant(assistantMessage.id, (message) => {
            if (message.toolCalls.some((tool) => tool.id === toolId)) return message;
            return {
              ...message,
              toolCalls: [
                ...message.toolCalls,
                {
                  id: toolId,
                  name,
                  arguments: (event.arguments as Record<string, unknown>) || null,
                  status: 'pending'
                }
              ]
            };
          });
          return;
        }
        if (event.type === 'tool-status') {
          patchRunTool(assistantMessage.id, String(event.id), (tool) => ({
            ...tool,
            status: event.status === 'running' ? 'running' : tool.status
          }));
          return;
        }
        if (event.type === 'tool-result') {
          patchRunTool(assistantMessage.id, String(event.id), (tool) => ({
            ...tool,
            status: event.status === 'success' ? 'success' : 'error',
            output: event.output ? String(event.output) : tool.output,
            error: event.error ? String(event.error) : tool.error,
            durationMs: event.durationMs ? Number(event.durationMs) : tool.durationMs
          }));
          return;
        }
        if (event.type === 'approval-required') {
          const toolId = String(event.id || '');
          setPendingApproval({
            requestId: String(event.requestId || ''),
            toolId,
            name: String(event.name || ''),
            summary: String(event.summary || '需要批准'),
            detail: event.detail ? String(event.detail) : undefined
          });
          patchRunTool(assistantMessage.id, toolId, (tool) => ({
            ...tool,
            status: 'waiting',
            approval: {
              requestId: String(event.requestId || ''),
              summary: String(event.summary || '需要批准'),
              detail: event.detail ? String(event.detail) : undefined
            }
          }));
          return;
        }
        if (event.type === 'phone-tool-request') {
          const requestId = String(event.requestId || '');
          const toolId = String(event.id || '');
          const request: PhoneToolRequest = {
            requestId,
            toolId,
            name: String(event.name || ''),
            summary: String(event.summary || '手机端操作')
          };
          setPhoneToolRequest(request);
          patchRunTool(assistantMessage.id, toolId, (tool) => ({
            ...tool,
            status: 'waiting'
          }));
          if (request.name === 'phone_info') {
            void (async () => {
              try {
                const info = await getPhoneInfo();
                await submitPhoneToolResult(settings, requestId, {
                  status: 'ok',
                  output: JSON.stringify(info, null, 2)
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : '读取手机信息失败';
                try {
                  await submitPhoneToolResult(settings, requestId, { status: 'error', error: message });
                } catch {
                  // Server may already be gone.
                }
              } finally {
                setPhoneToolRequest((current) => (current?.requestId === requestId ? null : current));
              }
            })();
          }
          return;
        }
        if (event.type === 'assistant-end') {
          // Deltas already streamed the text; this marker only closes the model turn.
          return;
        }
        if (event.type === 'error') {
          const message = String(event.message || '运行失败');
          patchRunAssistant(assistantMessage.id, (messageItem) => ({
            ...messageItem,
            error: message
          }));
          patchRunThread((thread) => ({ ...thread, status: 'error', updatedAt: Date.now() }));
          return;
        }
        if (event.type === 'done') {
          patchRunThread((thread) => ({ ...thread, status: 'idle', updatedAt: Date.now() }));
          refreshTasks();
        }
      };

      try {
        const runSettings = {
          ...settings,
          maxTurns: deep ? Math.max(settings.maxTurns, 14) : settings.maxTurns
        };
        if (runSettings.runMode === 'phone') {
          await runLocalAgent({
            settings: runSettings,
            messages: runMessages,
            onEvent: handleEvent,
            signal: controller.signal,
            requestPhoneFile,
            requestApproval: (request) =>
              new Promise<'allow' | 'deny'>((resolve) => {
                localApprovalResolvers.current.set(request.requestId, resolve);
                setPendingApproval({
                  requestId: request.requestId,
                  toolId: request.toolId,
                  name: request.name,
                  summary: request.summary,
                  detail: request.detail
                });
                patchRunTool(assistantMessage.id, request.toolId, (tool) => ({
                  ...tool,
                  status: 'waiting',
                  approval: {
                    requestId: request.requestId,
                    summary: request.summary,
                    detail: request.detail
                  }
                }));
              })
          });
        } else {
          await runAgent(runSettings, runMessages, handleEvent, controller.signal);
        }
        if (runRef.current) {
          patchRunThread((thread) => ({ ...thread, status: 'idle', updatedAt: Date.now() }));
        }
      } catch (error) {
        const message = error instanceof Error && error.name === 'AbortError' ? '运行已取消' : error instanceof Error ? error.message : '无法连接 Agent 服务';
        patchRunAssistant(assistantMessage.id, (item) => ({ ...item, error: message }));
        patchRunThread((thread) => ({ ...thread, status: 'error', updatedAt: Date.now() }));
      } finally {
        runRef.current = null;
        localPhoneResolvers.current.clear();
        localApprovalResolvers.current.clear();
        setPendingApproval(null);
        setPhoneToolRequest(null);
        setPhoneToolBusy(false);
      }
    },
    [patchThread, refreshTasks, settings, threads]
  );

    useEffect(() => {
      const timer = setInterval(() => {
        const due = getDueScheduledActions();
        for (const action of due) {
          if (action.type === 'open_app' && action.nativeScheduled) continue;
          void (async () => {
            try {
              if (action.type === 'open_app') {
                const pkg = action.packageName || (await resolvePhoneAppPackage(action.target));
                if (!pkg) return;
                await openPhoneApp(pkg);
              } else if (action.type === 'create_task') {
                createLocalTask({ title: action.target });
                refreshTasks();
              } else if (action.type === 'send_message') {
                sendMessage(action.target, false);
              }
              markScheduledActionRun(action.id);
            } catch {
              // 定时执行失败时保留记录，等待下一次检查。
            }
          })();
        }
      }, 10000);
      return () => clearInterval(timer);
    }, [refreshTasks, sendMessage]);


  const handleDecision = useCallback(
    async (decision: 'allow' | 'deny', remember: boolean) => {
      if (!pendingApproval) return;
      const requestId = pendingApproval.requestId;
      setPendingApproval(null);
      const localResolver = localApprovalResolvers.current.get(requestId);
      if (localResolver) {
        localApprovalResolvers.current.delete(requestId);
        localResolver(decision);
        return;
      }
      try {
        await approveRequest(settings, requestId, decision, remember);
      } catch (error) {
        patchActiveThread((thread) => ({
          ...thread,
          status: 'error',
          updatedAt: Date.now()
        }));
      }
    },
    [pendingApproval, patchActiveThread, settings]
  );

  const handleCancel = useCallback(async () => {
    const run = runRef.current;
    if (!run) return;
    if (run.runId) {
      try {
        await cancelRun(settings, run.runId);
      } catch {
        // Server may already be gone.
      }
    }
    run.controller.abort();
    for (const resolve of localPhoneResolvers.current.values()) {
      resolve({ status: 'error', error: '运行已取消' });
    }
    localPhoneResolvers.current.clear();
    for (const resolve of localApprovalResolvers.current.values()) {
      resolve('deny');
    }
    localApprovalResolvers.current.clear();
    patchThread(run.targetId, (thread) => ({ ...thread, status: 'idle', updatedAt: Date.now() }));
    runRef.current = null;
  }, [patchThread, settings]);

  const requestPhoneFile = useCallback((request: PhoneFileRequest): Promise<PhoneFileResult> => {
    return new Promise((resolve) => {
      localPhoneResolvers.current.set(request.requestId, resolve);
      setPhoneToolRequest(request);
    });
  }, []);

  const handlePhonePick = useCallback(
    async (requestId: string) => {
      const request = phoneToolRequest;
      if (!request || request.requestId !== requestId) return;
      setPhoneToolBusy(true);
      try {
        let output: string;
        if (request.name === 'ocr_image') {
          const file = await pickPhoneImage();
          const ocrText = await recognizeImage(settings, file);
          output = `图片 OCR 识别结果：\n${ocrText}`;
        } else {
          const file = await pickPhoneFile();
          output = `文件名：${file.name}\n大小：${file.size} 字节\n\n${file.content}`;
        }
        const resolver = localPhoneResolvers.current.get(requestId);
        if (resolver) {
          resolver({ status: 'ok', output });
          localPhoneResolvers.current.delete(requestId);
        } else {
          await submitPhoneToolResult(settings, requestId, { status: 'ok', output });
        }
        setPhoneToolRequest(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : '读取文件失败';
        const resolver = localPhoneResolvers.current.get(requestId);
        if (resolver) {
          resolver({ status: 'error', error: message });
          localPhoneResolvers.current.delete(requestId);
        } else {
          try {
            await submitPhoneToolResult(settings, requestId, { status: 'error', error: message });
          } catch {
            // Server may already be gone.
          }
        }
        setPhoneToolRequest(null);
      } finally {
        setPhoneToolBusy(false);
      }
    },
    [phoneToolRequest, settings]
  );

  const handlePhoneCancel = useCallback(
    async (requestId: string) => {
      const resolver = localPhoneResolvers.current.get(requestId);
      if (resolver) {
        resolver({ status: 'error', error: '用户取消了文件选择' });
        localPhoneResolvers.current.delete(requestId);
      } else {
        try {
          await submitPhoneToolResult(settings, requestId, { status: 'error', error: '用户取消了文件选择' });
        } catch {
          // Server may already be gone.
        }
      }
      setPhoneToolRequest(null);
    },
    [settings]
  );

  const handleNewThread = useCallback(() => {
    const thread = makeThread();
    setThreads((prev) => [thread, ...prev]);
    setActiveId(thread.id);
    activeIdRef.current = thread.id;
    setTab('chat');
  }, []);

  const handleSelectThread = useCallback((id: string) => {
    setActiveId(id);
    activeIdRef.current = id;
    setTab('chat');
  }, []);

  const handleDeleteThread = useCallback(
    (id: string) => {
      if (runRef.current) return;
      const next = threads.filter((thread) => thread.id !== id);
      if (!next.length) {
        setThreads([]);
        setActiveId(null);
        activeIdRef.current = null;
      } else {
        setThreads(next);
        if (activeId === id) {
          const fallback = next[0].id;
          setActiveId(fallback);
          activeIdRef.current = fallback;
        }
      }
      setTab('chat');
    },
    [activeId, threads]
  );

  const handleRunTask = useCallback(
    (task: AgentTask) => {
      if (runRef.current) return;
      const text = `执行任务：${task.title}${task.notes ? `\n补充说明：${task.notes}` : ''}`;
      activeIdRef.current = null;
      setActiveId(null);
      setTab('chat');
      setTimeout(() => {
        void sendMessage(text, true);
      }, 30);
    },
    [sendMessage]
  );

  const handleClearThreads = useCallback(() => {
    setThreads([]);
    setActiveId(null);
    activeIdRef.current = null;
    setTab('chat');
  }, []);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeId) || threads[0],
    [activeId, threads]
  );
  const running = activeThread?.status === 'running';

  return (
    <div className="app-shell">
      <aside className="thread-rail" aria-label="对话列表">
        <div className="rail-brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-caret">›</span>
          </span>
          <div>
            <strong>灰风</strong>
            <small>Agent on Android</small>
          </div>
        </div>
        <button className="rail-new" onClick={handleNewThread} disabled={Boolean(runRef.current)}>
          <Plus size={18} /> 新对话
        </button>
        <div className="rail-list">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={`rail-item ${thread.id === activeId ? 'active' : ''}`}
              onClick={() => handleSelectThread(thread.id)}
              disabled={Boolean(runRef.current)}
            >
              <span className="rail-status" data-status={thread.status} />
              <span className="rail-title">{thread.title}</span>
              <time>{new Date(thread.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-panel">
        {tab === 'chat' && (
          <ChatScreen
            thread={activeThread ?? null}
            threads={threads}
            activeId={activeId || ''}
            running={running}
            quickPhrases={settings.quickPhrases}
            settings={settings}
            onSend={sendMessage}
            onCancel={handleCancel}
            onNew={handleNewThread}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
          />
        )}
        {tab === 'tasks' && (
          <TaskScreen
            settings={settings}
            tasks={tasks}
            setTasks={setTasks}
            error={tasksError}
            running={running}
            onCancel={handleCancel}
            onRefresh={refreshTasks}
            onRunTask={handleRunTask}
              onSendMessage={(text) => {
                void sendMessage(text, false);
              }}
          />
        )}
        {tab === 'settings' && (
          <SettingsScreen
            settings={settings}
            setSettings={setSettings}
            threads={threads}
            onClearThreads={handleClearThreads}
            onSaved={() => refreshTasks()}
            onOpenModels={() => setTab('models')}
          />
        )}
        {tab === 'models' && (
          <ModelScreen settings={settings} setSettings={setSettings} onBack={() => setTab('settings')} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
          <MessageSquare />
          对话
        </button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          <ListTodo />
          任务
        </button>
        <button className={tab === 'settings' || tab === 'models' ? 'active' : ''} onClick={() => setTab('settings')}>
          <SettingsIcon />
          设置
        </button>
      </nav>

      <ApprovalSheet approval={pendingApproval} onDecision={handleDecision} />
      <PhoneToolSheet request={phoneToolRequest} busy={phoneToolBusy} onPick={handlePhonePick} onCancel={handlePhoneCancel} />
    </div>
  );
}

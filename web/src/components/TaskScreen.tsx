import { useEffect, useRef, useState } from 'react';
import { AlarmClock, CalendarClock, Check, Circle, CircleStop, ListTodo, Play, Plus, Power, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { createTask, deleteTask, patchTask } from '../api';
import { createLocalTask, deleteLocalTask, updateLocalTask } from '../localTasks';
import {
  cancelNativeScheduledAction,
  listPhoneApps,
  openPhoneApp,
  resolvePhoneAppPackage,
  scheduleNativeOpenApp,
  type PhoneAppInfo
} from '../phoneControl';
import {
  createScheduledAction,
  deleteScheduledAction,
  listScheduledActions,
  markScheduledActionRun,
  nextRunTime,
  updateScheduledAction
} from '../scheduledActions';
import type { AgentTask, ScheduledAction, ScheduledActionMode, ScheduledActionType, Settings } from '../types';

interface Props {
  settings: Settings;
  tasks: AgentTask[];
  setTasks: (tasks: AgentTask[]) => void;
  error: string;
  running: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  onRunTask: (task: AgentTask) => void;
  onSendMessage: (text: string) => void;
}

const ACTION_TYPE_LABELS: Record<ScheduledActionType, string> = {
  open_app: '打开应用',
  create_task: '创建任务',
  send_message: '发送消息'
};

export default function TaskScreen({ settings, tasks, setTasks, error, running, onCancel, onRefresh, onRunTask, onSendMessage }: Props) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const [actions, setActions] = useState<ScheduledAction[]>(() => listScheduledActions());
  const [showAddAction, setShowAddAction] = useState(false);
  const [actionName, setActionName] = useState('');
  const [actionType, setActionType] = useState<ScheduledActionType>('open_app');
  const [actionTarget, setActionTarget] = useState('');
  const [actionMode, setActionMode] = useState<ScheduledActionMode>('daily');
  const [actionDate, setActionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actionTime, setActionTime] = useState('08:00');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
    const [actionPackageName, setActionPackageName] = useState('');
    const [appPickerOpen, setAppPickerOpen] = useState(false);
    const [appList, setAppList] = useState<PhoneAppInfo[]>([]);
    const [appSearch, setAppSearch] = useState('');
    const [appLoading, setAppLoading] = useState(false);
    const [appError, setAppError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(onRefresh, 5000);
    return () => clearInterval(timer);
  }, [onRefresh]);

  useEffect(() => {
    setActions(listScheduledActions());
  }, []);

  const add = async () => {
    const value = title.trim();
    if (!value) {
      setLocalError('请输入任务标题');
      titleRef.current?.focus();
      return;
    }
    if (busy) return;
    setBusy(true);
    setLocalError('');
    try {
      if (settings.runMode === 'phone') {
        createLocalTask({ title: value, notes: notes.trim() });
      } else {
        await createTask(settings, { title: value, notes: notes.trim() });
      }
      setTitle('');
      setNotes('');
      onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task: AgentTask) => {
    try {
      if (settings.runMode === 'phone') {
        updateLocalTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
      } else {
        await patchTask(settings, task.id, { status: task.status === 'done' ? 'todo' : 'done' });
      }
      onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const remove = async (task: AgentTask) => {
    try {
      if (settings.runMode === 'phone') {
        deleteLocalTask(task.id);
      } else {
        await deleteTask(settings, task.id);
      }
      onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const syncNativeAction = async (action: ScheduledAction, enabled: boolean) => {
    try {
      if (action.type !== 'open_app') {
        await cancelNativeScheduledAction(action.id);
        updateScheduledAction(action.id, { nativeScheduled: false });
        return;
      }
      if (!enabled) {
        await cancelNativeScheduledAction(action.id);
        updateScheduledAction(action.id, { nativeScheduled: false });
        return;
      }
      const runAt = nextRunTime(action);
      if (!runAt) return;
      const pkg = action.packageName || (await resolvePhoneAppPackage(action.target));
      if (!pkg) return;
      const ok = await scheduleNativeOpenApp({
        id: action.id,
        triggerAt: runAt.getTime(),
        packageName: pkg,
        appName: action.target,
        repeatDaily: action.mode === 'daily'
      });
      updateScheduledAction(action.id, { packageName: pkg, nativeScheduled: ok });
    } catch {
      updateScheduledAction(action.id, { nativeScheduled: false });
    }
  };

  const openAppPicker = async () => {
    setAppPickerOpen(true);
    setAppSearch('');
    setAppLoading(true);
    setAppError('');
    try {
      const apps = await listPhoneApps();
      setAppList([...apps].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')));
    } catch (err) {
      setAppError(err instanceof Error ? err.message : '无法读取应用列表');
      setAppList([]);
    } finally {
      setAppLoading(false);
    }
  };

  const chooseApp = (app: PhoneAppInfo) => {
    setActionTarget(app.name);
    setActionPackageName(app.packageName);
    setAppPickerOpen(false);
  };

  const addAction = async () => {
    const target = actionTarget.trim();
    if (!target) {
      setActionError('请填写目标（应用名/包名、任务标题或消息内容）');
      return;
    }
    if (actionMode === 'once' && !actionDate) {
      setActionError('请选择日期');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      const created = createScheduledAction({
        name: actionName.trim(),
        type: actionType,
        target,
          packageName: actionPackageName || undefined,
        mode: actionMode,
        date: actionMode === 'once' ? actionDate : '',
        time: actionTime || '08:00',
        enabled: true,
        nativeScheduled: false
      });
      await syncNativeAction(created, true);
      setActions(listScheduledActions());
      setShowAddAction(false);
      setActionName('');
      setActionTarget('');
        setActionPackageName('');
      setActionMode('daily');
      setActionTime('08:00');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '创建定时行动失败');
    } finally {
      setActionBusy(false);
    }
  };

  const toggleAction = async (action: ScheduledAction) => {
    const enabled = !action.enabled;
    updateScheduledAction(action.id, { enabled });
    await syncNativeAction({ ...action, enabled }, enabled);
    setActions(listScheduledActions());
  };

  const removeAction = async (action: ScheduledAction) => {
    await cancelNativeScheduledAction(action.id);
    deleteScheduledAction(action.id);
    setActions(listScheduledActions());
  };

  const runActionNow = async (action: ScheduledAction) => {
    setActionError('');
    try {
      if (action.type === 'open_app') {
        const pkg = action.packageName || (await resolvePhoneAppPackage(action.target));
        if (!pkg) throw new Error('未找到应用');
        const ok = await openPhoneApp(pkg);
        if (!ok) throw new Error('打开应用失败');
      } else if (action.type === 'create_task') {
        createLocalTask({ title: action.target });
      } else if (action.type === 'send_message') {
        onSendMessage(action.target);
      }
      markScheduledActionRun(action.id);
      setActions(listScheduledActions());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '执行定时行动失败');
    }
  };

  const visibleTasks = tasks.filter((task) => task.title.trim());
  const doneCount = visibleTasks.filter((task) => task.status === 'done').length;
  const normalizedAppSearch = appSearch.trim().toLowerCase();
  const filteredApps = normalizedAppSearch
    ? appList.filter((app) => app.name.toLowerCase().includes(normalizedAppSearch) || app.packageName.toLowerCase().includes(normalizedAppSearch))
    : appList;

  return (
    <section className="task-screen">
      <header className="topbar">
        <div className="topbar-title">
          <span className="live-dot active" aria-hidden="true" />
          <div>
            <h1>任务</h1>
            <p>{visibleTasks.length ? `${doneCount} / ${visibleTasks.length} 已完成` : 'Agent 也可以帮你建任务'}</p>
          </div>
        </div>
        <button className="icon-button" onClick={onRefresh} aria-label="刷新任务" title="刷新任务">
          <RefreshCw size={19} />
        </button>
      </header>

      <div className="task-body">
        {running && (
          <div className="task-running">
            <span>Agent 正在执行任务</span>
            <button className="danger-button compact" onClick={onCancel}>
              <CircleStop size={16} />
              停止
            </button>
          </div>
        )}

        <div className="task-compose">
          <div className="task-input-row">
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && add()}
              placeholder="新任务"
              aria-label="新任务标题"
            />
            <button className="add-task-button" onClick={add} disabled={busy} aria-label="添加任务">
              <Plus size={20} />
            </button>
          </div>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="补充说明（可选）"
            aria-label="任务补充说明"
          />
        </div>

        {(error || localError) && <div className="task-error">{error || localError}</div>}

        <div className="task-list">
          {visibleTasks.length === 0 ? (
            <div className="empty-list">
              <ListTodo size={32} />
              <p>还没有任务。直接让 Agent 建一个，或在这里手动添加。</p>
            </div>
          ) : (
            visibleTasks.map((task) => (
              <article className={`task-item ${task.status === 'done' ? 'done' : ''}`} key={task.id}>
                <button className="task-check" onClick={() => toggle(task)} aria-label={task.status === 'done' ? '标记为未完成' : '标记为完成'}>
                  {task.status === 'done' ? <Check size={18} /> : <Circle size={18} />}
                </button>
                <div className="task-copy">
                  <h3>{task.title}</h3>
                  {task.notes ? <p>{task.notes}</p> : null}
                  <span className="task-status" data-status={task.status}>
                    {task.status === 'done' ? '已完成' : task.status === 'in_progress' ? '进行中' : '待办'}
                  </span>
                </div>
                <button
                  className="task-run"
                  onClick={() => onRunTask(task)}
                  disabled={running}
                  aria-label="让 AI 执行"
                  title="让 AI 执行"
                >
                  <Play size={16} />
                </button>
                <button className="task-delete" onClick={() => remove(task)} aria-label="删除任务" title="删除任务">
                  <Trash2 size={17} />
                </button>
              </article>
            ))
          )}
        </div>

        <div className="schedule-section">
          <div className="schedule-head">
            <div className="schedule-title">
              <AlarmClock size={18} />
              <h2>定时行动</h2>
            </div>
            <button className="icon-button" onClick={() => setShowAddAction((value) => !value)} aria-label="添加定时行动" title="添加定时行动">
              <Plus size={19} />
            </button>
          </div>

          {showAddAction && (
            <div className="schedule-compose">
              <input
                value={actionName}
                onChange={(event) => setActionName(event.target.value)}
                placeholder="名称（可选）"
                aria-label="定时行动名称"
              />
              <select
                value={actionType}
                onChange={(event) => setActionType(event.target.value as ScheduledActionType)}
                aria-label="行动类型"
              >
                <option value="open_app">打开应用</option>
                <option value="create_task">创建任务</option>
                <option value="send_message">发送消息</option>
              </select>
                {actionType === 'open_app' ? (
                  <div className="app-pick-field">
                    <button type="button" className="app-pick-button" onClick={openAppPicker} aria-label="选择应用">
                      {actionTarget ? `${actionTarget}${actionPackageName ? ` (${actionPackageName})` : ''}` : '选择要打开的应用…'}
                    </button>
                    {actionTarget && (
                      <button type="button" className="app-pick-clear" onClick={() => { setActionTarget(''); setActionPackageName(''); }} aria-label="清除选择">
                        清除
                      </button>
                    )}
                  </div>
                ) : (
                  <input
                    value={actionTarget}
                    onChange={(event) => setActionTarget(event.target.value)}
                    placeholder={actionType === 'create_task' ? '要创建的任务标题' : '要发送给 Agent 的消息'}
                    aria-label="行动目标"
                  />
                )}
              <select
                value={actionMode}
                onChange={(event) => setActionMode(event.target.value as ScheduledActionMode)}
                aria-label="重复方式"
              >
                <option value="daily">每天</option>
                <option value="once">仅一次</option>
              </select>
              {actionMode === 'once' && (
                <input
                  type="date"
                  value={actionDate}
                  onChange={(event) => setActionDate(event.target.value)}
                  aria-label="执行日期"
                />
              )}
              <input
                type="time"
                value={actionTime}
                onChange={(event) => setActionTime(event.target.value)}
                aria-label="执行时间"
              />
              <button className="add-task-button" onClick={addAction} disabled={actionBusy} aria-label="保存定时行动">
                <Plus size={20} />
              </button>
            </div>
          )}

          {actionError && <div className="task-error">{actionError}</div>}

          <div className="schedule-list">
            {actions.length === 0 ? (
              <div className="empty-list">
                <CalendarClock size={28} />
                <p>还没有定时行动。可以设置每天定时打开某个 App、创建任务或发送消息。</p>
              </div>
            ) : (
              actions.map((action) => (
                <article className="schedule-item" key={action.id}>
                  <div className="schedule-copy">
                    <h3>{action.name || ACTION_TYPE_LABELS[action.type]}</h3>
                    <p>
                      {ACTION_TYPE_LABELS[action.type]} · {action.mode === 'daily' ? `每天 ${action.time}` : `${action.date} ${action.time}`}
                      {action.type === 'open_app' && action.packageName ? ` · ${action.packageName}` : ''}
                    </p>
                    {action.nativeScheduled ? <span className="schedule-badge">系统定时</span> : null}
                  </div>
                  <button
                    className="schedule-toggle"
                    onClick={() => toggleAction(action)}
                    aria-label={action.enabled ? '停用定时行动' : '启用定时行动'}
                    title={action.enabled ? '停用' : '启用'}
                  >
                    <Power size={16} className={action.enabled ? 'on' : ''} />
                  </button>
                  <button className="task-run" onClick={() => runActionNow(action)} aria-label="立即执行" title="立即执行">
                    <Play size={16} />
                  </button>
                  <button className="task-delete" onClick={() => removeAction(action)} aria-label="删除定时行动" title="删除定时行动">
                    <Trash2 size={17} />
                  </button>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
      {appPickerOpen && (
        <div className="sheet-backdrop" onClick={() => setAppPickerOpen(false)}>
          <div className="app-picker-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-picker-head">
              <div className="app-picker-title">
                <Search size={18} />
                <h3>选择要打开的应用</h3>
              </div>
              <button className="icon-button" onClick={() => setAppPickerOpen(false)} aria-label="关闭选择器">
                <X size={18} />
              </button>
            </div>
            <input
              className="app-picker-search"
              value={appSearch}
              onChange={(event) => setAppSearch(event.target.value)}
              placeholder="搜索应用名称或包名…"
              autoFocus
            />
            {appLoading ? (
              <div className="app-picker-empty">正在读取应用列表…</div>
            ) : appError ? (
              <div className="app-picker-empty app-picker-error">{appError}</div>
            ) : filteredApps.length === 0 ? (
              <div className="app-picker-empty">没有找到应用</div>
            ) : (
              <div className="app-picker-list">
                {filteredApps.map((app) => (
                  <button key={app.packageName} className="app-picker-item" onClick={() => chooseApp(app)}>
                    <span className="app-picker-name">{app.name}</span>
                    <small>{app.packageName}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

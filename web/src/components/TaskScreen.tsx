import { useEffect, useRef, useState } from 'react';
import { Check, Circle, CircleStop, ListTodo, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { createTask, deleteTask, patchTask } from '../api';
import { createLocalTask, deleteLocalTask, updateLocalTask } from '../localTasks';
import type { AgentTask, Settings } from '../types';

interface Props {
  settings: Settings;
  tasks: AgentTask[];
  setTasks: (tasks: AgentTask[]) => void;
  error: string;
  running: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  onRunTask: (task: AgentTask) => void;
}

export default function TaskScreen({ settings, tasks, setTasks, error, running, onCancel, onRefresh, onRunTask }: Props) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(onRefresh, 5000);
    return () => clearInterval(timer);
  }, [onRefresh]);

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

  const visibleTasks = tasks.filter((task) => task.title.trim());
  const doneCount = visibleTasks.filter((task) => task.status === 'done').length;

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
      </div>
    </section>
  );
}

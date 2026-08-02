import { uid } from './storage';
import type { AgentTask } from './types';

const KEY = 'pocket-agent.local-tasks.v1';

function read(): AgentTask[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(tasks: AgentTask[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    // Keep tasks in memory if storage is unavailable.
  }
}

export function listLocalTasks(): AgentTask[] {
  return read().sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function createLocalTask(input: { title: string; notes?: string; status?: AgentTask['status'] }): AgentTask {
  const tasks = read();
  const now = new Date().toISOString();
  const task: AgentTask = {
    id: uid(),
    title: String(input.title || '').trim(),
    notes: String(input.notes || ''),
    status: input.status || 'todo',
    createdAt: now,
    updatedAt: now
  };
  if (!task.title) throw new Error('任务标题不能为空');
  tasks.push(task);
  write(tasks);
  return task;
}

export function updateLocalTask(
  id: string,
  patch: Partial<Pick<AgentTask, 'title' | 'notes' | 'status'>>
): AgentTask {
  const tasks = read();
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error('任务不存在');
  if (patch.title !== undefined) task.title = String(patch.title).trim();
  if (patch.notes !== undefined) task.notes = String(patch.notes);
  if (patch.status !== undefined) task.status = patch.status;
  task.updatedAt = new Date().toISOString();
  write(tasks);
  return task;
}

export function deleteLocalTask(id: string): void {
  write(read().filter((task) => task.id !== id));
}

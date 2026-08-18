import { uid } from './storage';
import type { ScheduledAction } from './types';

const KEY = 'pocket-agent.scheduled-actions.v1';

function read(): ScheduledAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(actions: ScheduledAction[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(actions));
  } catch {
    // Keep actions in memory if storage is unavailable.
  }
}

export function listScheduledActions(): ScheduledAction[] {
  return read().sort((a, b) => {
    const ta = nextRunTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = nextRunTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

function parseTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = String(time || '08:00').split(':').map(Number);
  return { hour: Number.isFinite(hour) ? hour : 8, minute: Number.isFinite(minute) ? minute : 0 };
}

export function nextRunTime(action: ScheduledAction, from = new Date()): Date | null {
  const { hour, minute } = parseTime(action.time);
  if (action.mode === 'once') {
    const date = String(action.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const value = new Date(`${date}T${String(action.time || '08:00')}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function hasRunForCurrentOccurrence(action: ScheduledAction, now: Date): boolean {
  if (!action.lastRunAt) return false;
  if (action.mode === 'once') return true;
  const last = new Date(action.lastRunAt);
  return last.toDateString() === now.toDateString();
}

export function getDueScheduledActions(now = new Date()): ScheduledAction[] {
  return read().filter((action) => {
    if (!action.enabled) return false;
    if (hasRunForCurrentOccurrence(action, now)) return false;
    const runAt = nextRunTime(action, now);
    return runAt !== null && runAt.getTime() <= now.getTime();
  });
}

export function createScheduledAction(
  input: Omit<ScheduledAction, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt'>
): ScheduledAction {
  const actions = read();
  const now = new Date().toISOString();
  const action: ScheduledAction = {
    ...input,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    lastRunAt: undefined
  };
  if (!action.name) action.name = action.type === 'open_app' ? `打开 ${action.target}` : action.type === 'create_task' ? `创建任务 ${action.target}` : `发送 ${action.target}`;
  actions.push(action);
  write(actions);
  return action;
}

export function updateScheduledAction(
  id: string,
  patch: Partial<Pick<ScheduledAction, 'name' | 'type' | 'target' | 'packageName' | 'mode' | 'date' | 'time' | 'enabled' | 'nativeScheduled' | 'lastRunAt'>>
): ScheduledAction {
  const actions = read();
  const action = actions.find((item) => item.id === id);
  if (!action) throw new Error('定时行动不存在');
  Object.assign(action, patch, { updatedAt: new Date().toISOString() });
  write(actions);
  return action;
}

export function deleteScheduledAction(id: string): void {
  write(read().filter((action) => action.id !== id));
}

export function markScheduledActionRun(id: string, at = new Date()): void {
  updateScheduledAction(id, { lastRunAt: at.toISOString() });
}

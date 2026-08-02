import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');
const tasksFile = path.join(dataDir, 'tasks.json');

let cache = null;

export async function getTasks() {
  if (cache) return cache;
  try {
    const raw = await readFile(tasksFile, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    cache = [];
  }
  if (!Array.isArray(cache)) cache = [];
  return cache;
}

async function persist(tasks) {
  cache = tasks;
  await mkdir(dataDir, { recursive: true });
  await writeFile(tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
}

export async function listTasks() {
  const tasks = await getTasks();
  return tasks.sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

export async function addTask({ title, notes = '', status = 'todo' }) {
  const tasks = await getTasks();
  const now = new Date().toISOString();
  const task = {
    id: randomUUID(),
    title: String(title || '').trim(),
    notes: String(notes || ''),
    status: ['todo', 'in_progress', 'done'].includes(status) ? status : 'todo',
    createdAt: now,
    updatedAt: now
  };
  if (!task.title) throw new Error('任务标题不能为空');
  tasks.push(task);
  await persist(tasks);
  return task;
}

export async function patchTask(id, patch) {
  const tasks = await getTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error('任务不存在');
  const allowed = ['title', 'notes', 'status'];
  for (const key of allowed) {
    if (patch[key] !== undefined) task[key] = patch[key];
  }
  if (!['todo', 'in_progress', 'done'].includes(task.status)) task.status = 'todo';
  task.updatedAt = new Date().toISOString();
  await persist(tasks);
  return task;
}

export async function removeTask(id) {
  const tasks = await getTasks();
  const next = tasks.filter((item) => item.id !== id);
  await persist(next);
  return { ok: true };
}

import { registerPlugin } from '@capacitor/core';
import { isNative } from './phone';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

interface FileAccessPlugin {
  isAllFilesAccess: () => Promise<{ granted: boolean; supported: boolean }>;
  openSettings: () => Promise<void>;
  list: (options: { path: string }) => Promise<{ entries: FileEntry[] }>;
  read: (options: { path: string }) => Promise<{ content: string; size: number }>;
  saveImage: (options: { path: string; base64: string }) => Promise<{ path: string; size: number }>;
}

const FileAccess = registerPlugin<FileAccessPlugin>('FileAccess');

export async function hasAllFilesAccess(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const result = await FileAccess.isAllFilesAccess();
    return Boolean(result.granted);
  } catch {
    return false;
  }
}

export async function openAllFilesSettings(): Promise<void> {
  if (!isNative()) throw new Error('仅支持安卓原生模式');
  await FileAccess.openSettings();
}

export async function listAllFiles(path = '/storage/emulated/0'): Promise<FileEntry[]> {
  if (!isNative()) throw new Error('仅支持安卓原生模式');
  const result = await FileAccess.list({ path: String(path || '/storage/emulated/0') });
  return Array.isArray(result.entries) ? result.entries : [];
}

export async function readAllFile(path: string): Promise<string> {
  if (!isNative()) throw new Error('仅支持安卓原生模式');
  const result = await FileAccess.read({ path: String(path) });
  return result.content || '';
}

export async function saveBase64Image(path: string, base64: string): Promise<{ path: string; size: number }> {
  if (!isNative()) throw new Error('仅支持安卓原生模式');
  return FileAccess.saveImage({ path: String(path), base64: String(base64) });
}

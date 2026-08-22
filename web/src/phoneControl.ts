import { registerPlugin } from '@capacitor/core';
import { isNative } from './phone';

export interface UiNode {
  text?: string;
  contentDescription?: string;
  className?: string;
  packageName?: string;
  clickable?: boolean;
  scrollable?: boolean;
  editable?: boolean;
  bounds?: number[];
  children?: UiNode[];
}

export interface PhoneAppInfo {
  name: string;
  packageName: string;
}

interface AccessibilityControlPlugin {
  isEnabled: () => Promise<{ enabled: boolean }>;
  openSettings: () => Promise<void>;
  disable: () => Promise<{ ok: boolean }>;
  status: () => Promise<{ enabled: boolean; foregroundPackage: string }>;
  getUiTree: () => Promise<{ root?: UiNode | null; packageName?: string }>;
  click: (options: { text?: string; x?: number; y?: number }) => Promise<{ ok: boolean }>;
  scroll: (options: { direction: string }) => Promise<{ ok: boolean }>;
  key: (options: { action: string }) => Promise<{ ok: boolean }>;
  openApp: (options: { packageName: string }) => Promise<{ ok: boolean }>;
  listApps: () => Promise<{ apps: PhoneAppInfo[] }>;
  typeText: (options: { text: string }) => Promise<{ ok: boolean }>;
}

const AccessibilityControl = registerPlugin<AccessibilityControlPlugin>('AccessibilityControl');

function requireNative(): void {
  if (!isNative()) throw new Error('手机控制仅支持安卓原生模式');
}

export async function isPhoneControlEnabled(): Promise<boolean> {
  requireNative();
  try {
    const result = await AccessibilityControl.isEnabled();
    return Boolean(result.enabled);
  } catch {
    return false;
  }
}

export async function openPhoneControlSettings(): Promise<void> {
  requireNative();
  await AccessibilityControl.openSettings();
}

export async function disablePhoneControlService(): Promise<void> {
  requireNative();
  await AccessibilityControl.disable();
}

export async function getPhoneControlStatus(): Promise<{ enabled: boolean; foregroundPackage: string }> {
  requireNative();
  return AccessibilityControl.status();
}

export async function getPhoneUiTree(): Promise<UiNode | null> {
  requireNative();
  const result = await AccessibilityControl.getUiTree();
  return result.root || null;
}

export async function clickPhone(options: { text?: string; x?: number; y?: number }): Promise<boolean> {
  requireNative();
  const result = await AccessibilityControl.click(options);
  if (result.ok || !options.text) return Boolean(result.ok);

  // Some Android apps expose the label on a non-clickable child while the
  // clickable action belongs to its parent. Tap the label bounds as a last
  // resort after the native parent lookup has failed.
  const root = await getPhoneUiTree();
  const bounds = findLabelBounds(root, options.text);
  if (!bounds) return false;
  const [left, top, right, bottom] = bounds;
  const fallback = await AccessibilityControl.click({
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2)
  });
  return Boolean(fallback.ok);
}

function normalizeUiLabel(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '').trim();
}

function findLabelBounds(node: UiNode | null, target: string): number[] | null {
  if (!node) return null;
  const wanted = normalizeUiLabel(target);
  const labels = [node.text, node.contentDescription].filter(Boolean).map((value) => normalizeUiLabel(value as string));
  const matches = labels.some(
    (value) => value === wanted || value.includes(wanted) || wanted.includes(value) || (isNextTarget(wanted) && isNextLabel(value))
  );
  if (matches && Array.isArray(node.bounds) && node.bounds.length === 4) return node.bounds;
  for (const child of node.children || []) {
    const bounds = findLabelBounds(child, target);
    if (bounds) return bounds;
  }
  return null;
}

function isNextTarget(value: string): boolean {
  return value === '下一步' || value === 'next' || value === 'continue' || value.includes('下一步');
}

function isNextLabel(value: string): boolean {
  return value === '下一步' || value === '继续' || value === 'next' || value === 'continue'
    || value.startsWith('下一步') || value.startsWith('next') || value.startsWith('continue');
}

export async function scrollPhone(direction: 'forward' | 'backward' | 'up' | 'down' | 'left' | 'right'): Promise<boolean> {
  requireNative();
  const result = await AccessibilityControl.scroll({ direction });
  return Boolean(result.ok);
}

export async function phoneKey(action: 'back' | 'home' | 'recents'): Promise<boolean> {
  requireNative();
  const result = await AccessibilityControl.key({ action });
  return Boolean(result.ok);
}

export async function openPhoneApp(packageName: string): Promise<boolean> {
  requireNative();
  const result = await AccessibilityControl.openApp({ packageName });
  return Boolean(result.ok);
}

export async function listPhoneApps(): Promise<PhoneAppInfo[]> {
  requireNative();
  const result = await AccessibilityControl.listApps();
  return Array.isArray(result.apps) ? result.apps : [];
}

export async function typePhoneText(text: string): Promise<boolean> {
  requireNative();
  const result = await AccessibilityControl.typeText({ text });
  return Boolean(result.ok);
}

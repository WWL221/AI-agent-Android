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
  return Boolean(result.ok);
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

export async function typePhoneText(text: string): Promise<boolean> {
  requireNative();
  const result = await AccessibilityControl.typeText({ text });
  return Boolean(result.ok);
}

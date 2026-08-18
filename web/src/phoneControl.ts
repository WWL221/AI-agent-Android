import { registerPlugin } from '@capacitor/core';
import { isNative } from './phone';

const APP_ALIASES: Record<string, string> = {
  '微信': 'com.tencent.mm',
  'wechat': 'com.tencent.mm',
  'weixin': 'com.tencent.mm',
  'qq': 'com.tencent.mobileqq',
  '腾讯qq': 'com.tencent.mobileqq',
  '支付宝': 'com.eg.android.AlipayGphone',
  'alipay': 'com.eg.android.AlipayGphone',
  '淘宝': 'com.taobao.taobao',
  'taobao': 'com.taobao.taobao',
  '抖音': 'com.ss.android.ugc.aweme',
  'tiktok': 'com.ss.android.ugc.aweme',
  '哔哩哔哩': 'tv.danmaku.bili',
  'bilibili': 'tv.danmaku.bili',
  'b站': 'tv.danmaku.bili',
  '美团': 'com.sankuai.meituan',
  'meituan': 'com.sankuai.meituan',
  '高德地图': 'com.autonavi.minimap',
  'amap': 'com.autonavi.minimap',
  '百度地图': 'com.baidu.BaiduMap',
  'chrome': 'com.android.chrome',
  '浏览器': 'com.android.chrome',
  'youtube': 'com.google.android.youtube',
  'gmail': 'com.google.android.gm',
  'spotify': 'com.spotify.music',
  'steam': 'com.valvesoftware.steamlink',
  'telegram': 'org.telegram.messenger',
  '拼多多': 'com.xunmeng.pinduoduo',
  'pinduoduo': 'com.xunmeng.pinduoduo',
  '闲鱼': 'com.taobao.idlefish',
  'idlefish': 'com.taobao.idlefish',
  '设置': 'com.android.settings',
  'settings': 'com.android.settings'
};


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

interface ScheduledActionPlugin {
  scheduleOpenApp: (options: {
    id: string;
    triggerAt: number;
    packageName: string;
    appName: string;
    repeatDaily: boolean;
  }) => Promise<{ ok: boolean }>;
  cancel: (options: { id: string }) => Promise<{ ok: boolean }>;
}


const AccessibilityControl = registerPlugin<AccessibilityControlPlugin>('AccessibilityControl');

const ScheduledAction = registerPlugin<ScheduledActionPlugin>('ScheduledAction');


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

export async function listPhoneApps(): Promise<PhoneAppInfo[]> {
  requireNative();
  const result = await AccessibilityControl.listApps();
  return Array.isArray(result.apps) ? result.apps : [];
}

export function normalizeAppName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s·•()（）_\-—]/g, '');
}

export async function resolvePhoneAppPackage(nameOrPackage: string): Promise<string> {
  const raw = String(nameOrPackage || '').trim();
  if (!raw) return '';
  if (raw.includes('.')) return raw;
  const normalized = normalizeAppName(raw);
  const alias = APP_ALIASES[raw.toLowerCase()] || APP_ALIASES[normalized];
  if (alias) return alias;
  try {
    const apps = await listPhoneApps();
    const found =
      apps.find((app) => app.packageName.toLowerCase() === raw.toLowerCase()) ||
      apps.find((app) => normalizeAppName(app.name) === normalized) ||
      apps.find((app) => normalized.length >= 2 && normalizeAppName(app.name).includes(normalized)) ||
      apps.find((app) => app.packageName.toLowerCase().includes(normalized));
    return found?.packageName || '';
  } catch {
    return '';
  }
}

export async function scheduleNativeOpenApp(options: {
  id: string;
  triggerAt: number;
  packageName: string;
  appName: string;
  repeatDaily: boolean;
}): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const result = await ScheduledAction.scheduleOpenApp(options);
    return Boolean(result.ok);
  } catch {
    return false;
  }
}

export async function cancelNativeScheduledAction(id: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const result = await ScheduledAction.cancel({ id });
    return Boolean(result.ok);
  } catch {
    return false;
  }
}


export async function typePhoneText(text: string): Promise<boolean> {
  requireNative();
  const result = await AccessibilityControl.typeText({ text });
  return Boolean(result.ok);
}

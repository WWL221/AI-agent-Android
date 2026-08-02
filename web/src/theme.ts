import type { Settings } from './types';

export function hexToRgb(hex: string): string {
  const value = String(hex || '#f26f45').replace('#', '');
  const full = value.length === 3 ? value.split('').map((char) => `${char}${char}`).join('') : value;
  const parsed = parseInt(full.padEnd(6, '0'), 16);
  if (Number.isNaN(parsed)) return '242, 111, 69';
  return `${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}`;
}

export function accentSoft(hex: string): string {
  return `rgba(${hexToRgb(hex)}, 0.16)`;
}

export function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.themeMode = settings.themeMode || 'system';
  const accent = settings.accentColor || '#f26f45';
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', hexToRgb(accent));
  root.style.setProperty('--accent-soft', accentSoft(accent));
}

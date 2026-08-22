import { Device } from '@capacitor/device';
import { parseDocumentContent } from './fileParser';

export interface PhoneFile {
  name: string;
  size: number;
  content: string;
  kind: 'text' | 'image' | 'document';
  mimeType?: string;
  dataUrl?: string;
  contentError?: string;
}

export function isNative(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

export async function getPhoneInfo(): Promise<Record<string, unknown>> {
  const browserInfo = {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    online: navigator.onLine
  };
  if (!isNative()) return browserInfo;
  try {
    const [info, battery, language] = await Promise.all([
      Device.getInfo(),
      Device.getBatteryInfo(),
      Device.getLanguageCode()
    ]);
    return {
      ...info,
      batteryLevel: battery.batteryLevel,
      batteryCharging: battery.isCharging,
      languageCode: language.value,
      ...browserInfo
    };
  } catch {
    return browserInfo;
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export function pickPhoneFile(kind: 'text' | 'image' | 'any' = 'text'): Promise<PhoneFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    const textAccept = 'text/*,.txt,.md,.json,.csv,.log,.js,.ts,.jsx,.tsx,.py,.html,.css,.xml,.yaml,.yml,.ini,.toml,.sql,.env,.sh,.bat,.ps1';
    const imageAccept = 'image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif';
    const documentAccept = [
      'application/pdf',
      'application/rtf',
      'application/msword',
      'application/vnd.ms-powerpoint',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pdf,.rtf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp'
    ].join(',');
    input.accept = kind === 'image' ? imageAccept : `${textAccept},${documentAccept},${kind === 'any' ? imageAccept : ''}`;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const finishResolve = (file: PhoneFile) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };
    input.oncancel = () => finishReject(new Error('未选择文件'));
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        finishReject(new Error('未选择文件'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        finishReject(new Error('文件超过 5MB，暂不支持'));
        return;
      }
      try {
        const isImage =
          file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
        if (kind === 'image' && !isImage) {
          finishReject(new Error('请选择图片文件'));
          return;
        }
        if (isImage) {
          const dataUrl = await readFileAsDataURL(file);
          finishResolve({
            name: file.name,
            size: file.size,
            content: '[图片附件]',
            kind: 'image',
            mimeType: file.type,
            dataUrl
          });
          return;
        }
        const isText = file.type.startsWith('text/') || /\.(txt|md|json|csv|log|js|ts|jsx|tsx|py|html|css|xml|ya?ml|ini|toml|sql|env|sh|bat|ps1)$/i.test(file.name);
        if (!isText) {
          const parsed = await parseDocumentContent(file.name, file.type, await file.arrayBuffer());
          finishResolve({
            name: file.name,
            size: file.size,
            content: parsed.content,
            kind: 'document',
            mimeType: file.type || 'application/octet-stream',
            contentError: parsed.error
          });
          return;
        }
        const content = await file.text();
        finishResolve({ name: file.name, size: file.size, content, kind: 'text', mimeType: file.type || 'text/plain' });
      } catch {
        finishReject(new Error('无法读取该文件，可能不是文本文件'));
      }
    };
    input.click();
  });
}

export function pickPhoneImage(): Promise<PhoneFile> {
  return pickPhoneFile('image');
}

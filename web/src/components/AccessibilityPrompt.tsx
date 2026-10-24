import { useEffect, useState } from 'react';
import { Accessibility, RefreshCw } from 'lucide-react';
import { isPhoneControlEnabled, openPhoneControlSettings } from '../phoneControl';

interface Props {
  open: boolean;
  onDefer: () => void;
  onEnabled: () => void;
}

// 启动时的无障碍授权引导：Android 不允许应用静默开启无障碍服务，
// 只能引导用户到系统设置手动允许，返回后自动复查状态。
export default function AccessibilityPrompt({ open, onDefer, onEnabled }: Props) {
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!open) return;
    const recheck = () => {
      isPhoneControlEnabled()
        .then((enabled) => {
          if (enabled) onEnabled();
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [open, onEnabled]);

  if (!open) return null;

  const enable = async () => {
    setHint('');
    try {
      await openPhoneControlSettings();
      setHint('在系统无障碍设置里找到「灰风」并允许，返回本应用后会自动检查。');
    } catch (error) {
      setHint(error instanceof Error ? error.message : '无法打开系统设置');
    }
  };

  const recheckNow = async () => {
    setChecking(true);
    try {
      if (await isPhoneControlEnabled()) {
        onEnabled();
        return;
      }
      setHint('仍未开启：请在系统无障碍设置里允许「灰风」。');
    } catch (error) {
      setHint(error instanceof Error ? error.message : '无法检查无障碍服务');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="sheet-backdrop">
      <div className="approval-sheet" role="dialog" aria-modal="true" aria-labelledby="a11y-title">
        <div className="approval-head">
          <span className="approval-shield">
            <Accessibility size={22} />
          </span>
          <div>
            <h2 id="a11y-title">开启无障碍权限</h2>
            <p>灰风需要无障碍权限才能操作手机屏幕</p>
          </div>
        </div>
        <div className="approval-body">
          <p>
            开启后 Agent 可以按你的指令读取屏幕并点击、滚动、输入，用来操作其他 App。
            授权只能在系统设置里手动完成，灰风不会静默获取；之后想关掉，去「设置 → 手机控制」即可。
          </p>
          {hint ? <p>{hint}</p> : null}
          <button className="sheet-hint a11y-recheck" onClick={recheckNow} disabled={checking}>
            <RefreshCw size={14} />
            {checking ? '正在检查…' : '我已在系统设置里开启，重新检查'}
          </button>
        </div>
        <div className="approval-actions">
          <button className="deny-button" onClick={onDefer}>
            暂不
          </button>
          <button className="allow-button" onClick={enable}>
            <Accessibility size={18} />
            去开启
          </button>
        </div>
      </div>
    </div>
  );
}

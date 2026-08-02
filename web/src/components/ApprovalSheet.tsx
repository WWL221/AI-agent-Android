import { useState } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';

export interface ApprovalInfo {
  requestId: string;
  toolId: string;
  name: string;
  summary: string;
  detail?: string;
}

interface Props {
  approval: ApprovalInfo | null;
  onDecision: (decision: 'allow' | 'deny', remember: boolean) => void;
}

export default function ApprovalSheet({ approval, onDecision }: Props) {
  const [remember, setRemember] = useState(false);
  if (!approval) return null;

  return (
    <div className="sheet-backdrop">
      <div className="approval-sheet" role="dialog" aria-modal="true" aria-labelledby="approval-title">
        <div className="approval-head">
          <span className="approval-shield">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2 id="approval-title">需要你批准</h2>
            <p>Agent 想在你的电脑上执行这个操作</p>
          </div>
        </div>
        <div className="approval-body">
          <pre>{approval.summary}</pre>
          {approval.detail ? <p>{approval.detail}</p> : null}
        </div>
        <label className="remember-row">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          本次会话记住，同类操作不再询问
        </label>
        <div className="approval-actions">
          <button className="deny-button" onClick={() => onDecision('deny', remember)}>
            <ShieldX size={18} />
            拒绝
          </button>
          <button className="allow-button" onClick={() => onDecision('allow', remember)}>
            <ShieldCheck size={18} />
            允许
          </button>
        </div>
      </div>
    </div>
  );
}

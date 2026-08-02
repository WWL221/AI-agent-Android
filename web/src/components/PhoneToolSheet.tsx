import { FileUp, ShieldAlert, X } from 'lucide-react';

export interface PhoneToolRequest {
  requestId: string;
  toolId: string;
  name: string;
  summary: string;
}

interface Props {
  request: PhoneToolRequest | null;
  busy: boolean;
  onPick: (requestId: string) => void;
  onCancel: (requestId: string) => void;
}

export default function PhoneToolSheet({ request, busy, onPick, onCancel }: Props) {
  if (!request || (request.name !== 'phone_read_file' && request.name !== 'ocr_image')) return null;
  const isOcr = request.name === 'ocr_image';
  return (
    <div className="sheet-backdrop">
      <div className="approval-sheet" role="dialog" aria-modal="true" aria-labelledby="phone-tool-title">
        <div className="approval-head">
          <span className="approval-shield phone-shield">
            <ShieldAlert size={22} />
          </span>
          <div>
            <h2 id="phone-tool-title">{isOcr ? '选择图片识别' : '选择手机文件'}</h2>
            <p>{isOcr ? 'Agent 想识别你手机里的一张图片' : 'Agent 想读取你手机里的一个文件'}</p>
          </div>
        </div>
        <div className="approval-body">
          <pre>{request.summary}</pre>
          <p>内容只会发送给当前配置的模型服务，由你手动选择。</p>
        </div>
        <div className="approval-actions">
          <button className="deny-button" onClick={() => onCancel(request.requestId)} disabled={busy}>
            <X size={18} />
            取消
          </button>
          <button className="allow-button" onClick={() => onPick(request.requestId)} disabled={busy}>
            <FileUp size={18} />
            选择文件
          </button>
        </div>
      </div>
    </div>
  );
}

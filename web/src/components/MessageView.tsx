import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  FilePen,
  File,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  ListChecks,
  LoaderCircle,
  Image as ImageIcon,
  Presentation,
  Search,
  ShieldAlert,
  Terminal
} from 'lucide-react';
import type { Message, MessageAttachment, ToolCallRecord } from '../types';

const TOOL_ICONS: Record<string, typeof Search> = {
  web_search: Search,
  fetch_url: Globe,
  list_files: FolderOpen,
  read_file: FileText,
  write_file: FilePen,
  run_shell: Terminal,
  create_task: ListChecks,
  list_tasks: ListChecks,
  update_task: ListChecks
};

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    web_search: '网络搜索',
    fetch_url: '抓取网页',
    list_files: '列出文件',
    read_file: '读取文件',
    write_file: '写入文件',
    run_shell: '执行命令',
    create_task: '创建任务',
    list_tasks: '查看任务',
    update_task: '更新任务'
  };
  return labels[name] || name;
}

function attachmentIcon(attachment: MessageAttachment) {
  if (attachment.kind === 'image') return ImageIcon;
  if (/\.(pptx?|odp)$/i.test(attachment.name)) return Presentation;
  if (/\.(xlsx?|ods|csv)$/i.test(attachment.name)) return FileSpreadsheet;
  if (attachment.kind === 'text') return FileText;
  return File;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentCard({ attachment }: { attachment: MessageAttachment }) {
  const Icon = attachmentIcon(attachment);
  const kindLabel = attachment.kind === 'image' ? '图片' : attachment.kind === 'text' ? '文本文件' : '文档';
  return (
    <div className="message-attachment" role="group" aria-label={`附件：${attachment.name}`}>
      <span className="message-attachment-icon"><Icon size={20} /></span>
      <span className="message-attachment-copy">
        <strong>{attachment.name}</strong>
        <small>{kindLabel} · {formatBytes(attachment.size)}</small>
      </span>
    </div>
  );
}

function legacyAttachmentView(content: string): { text: string; attachment: MessageAttachment } | null {
  const marker = /\[手机附件：([^\n（]+?)（(\d+) 字节）\]\n\n/;
  const match = marker.exec(content);
  if (!match || match.index === undefined) return null;
  const prefix = content.slice(0, match.index).trim();
  const text = prefix === '请处理这个手机文件：' ? '' : prefix;
  return {
    text,
    attachment: {
      name: match[1].trim(),
      size: Number(match[2]),
      kind: 'text',
      mimeType: 'text/plain'
    }
  };
}

function ToolStep({ tool }: { tool: ToolCallRecord }) {
  const Icon = TOOL_ICONS[tool.name] || FileText;
  const argsText = tool.arguments ? JSON.stringify(tool.arguments) : '';
  const preview = argsText.length > 150 ? `${argsText.slice(0, 150)}…` : argsText;
  const result = tool.error || tool.output || '';
  const resultPreview = result.length > 260 ? `${result.slice(0, 260)}…` : result;

  return (
    <div className="tool-step" data-status={tool.status}>
      <div className="tool-head">
        <span className="tool-icon">
          <Icon size={15} />
        </span>
        <span className="tool-name">{toolLabel(tool.name)}</span>
        <span className="tool-status">
          {tool.status === 'pending' && <Clock3 size={14} />}
          {tool.status === 'waiting' && <ShieldAlert size={14} />}
          {tool.status === 'running' && <LoaderCircle className="spin" size={14} />}
          {tool.status === 'success' && <CheckCircle2 size={14} />}
          {tool.status === 'error' && <CircleAlert size={14} />}
          {tool.status === 'running' ? '执行中' : tool.status === 'waiting' ? '等待批准' : tool.status === 'success' ? '完成' : tool.status === 'error' ? '失败' : '排队中'}
        </span>
        {tool.durationMs ? <time className="tool-duration">{(tool.durationMs / 1000).toFixed(1)}s</time> : null}
      </div>
      {preview ? <code className="tool-args">{preview}</code> : null}
      {resultPreview ? (
        <pre className="tool-result">
          {tool.status === 'error' ? '拒绝/失败：' : ''}
          {resultPreview}
        </pre>
      ) : null}
    </div>
  );
}

export default function MessageView({ message }: { message: Message }) {
  if (message.role === 'user') {
    const legacy = !message.attachment ? legacyAttachmentView(message.content) : null;
    const attachment = message.attachment || legacy?.attachment;
    const content = message.attachment ? message.content : legacy?.text || message.content;
    return (
      <div className="message user-message">
        <div className={`bubble ${attachment ? 'user-attachment-bubble' : ''}`}>
          {attachment ? <AttachmentCard attachment={attachment} /> : null}
          {content ? <div>{content}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="message agent-message">
      {message.toolCalls.length > 0 && (
        <div className="tool-timeline" aria-label="工具调用">
          {message.toolCalls.map((tool) => (
            <ToolStep key={tool.id} tool={tool} />
          ))}
        </div>
      )}
      {message.content ? (
        <div className="bubble markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      ) : null}
      {message.error ? <div className="run-error">{message.error}</div> : null}
      {!message.content && !message.toolCalls.length && !message.error ? (
        <div className="thinking-line">
          <span className="think-dot" />
          <span className="think-dot" />
          <span className="think-dot" />
        </div>
      ) : null}
    </div>
  );
}

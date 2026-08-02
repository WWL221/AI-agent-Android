import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleStop, List, MessageSquarePlus, Paperclip, Send, Sparkles, Trash2, X } from 'lucide-react';
import { recognizeImage } from '../localAgent';
import type { Settings, Thread } from '../types';
import { pickPhoneFile, type PhoneFile } from '../phone';
import MessageView from './MessageView';

const SUGGESTIONS = [
  '查一下明天上海天气，并给我出行建议',
  '把下面这段文字整理成三条待办任务',
  '搜索最近一周 AI Agent 的行业动态',
  '帮我写一份周末学习计划的 Markdown 笔记'
];

interface Props {
  thread: Thread | null;
  threads: Thread[];
  activeId: string;
  running: boolean;
  quickPhrases: string[];
  settings: Settings;
  onSend: (text: string, deep: boolean) => void;
  onCancel: () => void;
  onNew: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
}

export default function ChatScreen({
  thread,
  threads,
  activeId,
  running,
  quickPhrases,
  settings,
  onSend,
  onCancel,
  onNew,
  onSelectThread,
  onDeleteThread
}: Props) {
  const [text, setText] = useState('');
  const [deep, setDeep] = useState(false);
  const [attachment, setAttachment] = useState<PhoneFile | null>(null);
  const [attachError, setAttachError] = useState('');
  const [showThreads, setShowThreads] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const visibleMessages = useMemo(
    () => (thread ? thread.messages.filter((message) => message.content || message.toolCalls.length) : []),
    [thread]
  );
  const suggestions = useMemo(() => {
    const custom = (quickPhrases || []).map((phrase) => phrase.trim()).filter(Boolean);
    return custom.length ? custom : SUGGESTIONS;
  }, [quickPhrases]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
  }, [thread?.messages, running]);

  const handleMessagesScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 90;
  };

  const submit = async () => {
    const value = text.trim();
    if ((!value && !attachment) || running) return;
    let finalText: string;
    if (attachment?.kind === 'image') {
      try {
        if (settings.ocrEnabled === false) throw new Error('请在设置里开启 OCR 识图');
        const ocrText = await recognizeImage(settings, attachment);
        finalText = value
          ? `${value}\n\n[图片 OCR 结果]\n${ocrText}`
          : `请处理这张图片，OCR 结果如下：\n${ocrText}`;
      } catch (error) {
        setAttachError(error instanceof Error ? error.message : 'OCR 识别失败');
        return;
      }
    } else {
      const filePart = attachment
        ? `\n\n[手机附件：${attachment.name}（${attachment.size} 字节）]\n\n${attachment.content}`
        : '';
      finalText = value ? `${value}${filePart}` : `请处理这个手机文件：${filePart}`;
    }
    onSend(finalText, deep);
    setText('');
    setAttachment(null);
    setAttachError('');
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const pickFile = async () => {
    setAttachError('');
    try {
      const file = await pickPhoneFile('any');
      setAttachment(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取文件失败';
      if (message !== '未选择文件') setAttachError(message);
    }
  };

  return (
    <section className="chat-screen">
      <header className="topbar">
        <div className="topbar-title">
          <span className={`live-dot ${running ? 'active' : ''}`} aria-hidden="true" />
          <div>
            <h1>{thread?.title || '新对话'}</h1>
            <p>{running ? 'Agent 正在执行' : '待命'}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            onClick={() => setShowThreads(true)}
            disabled={running}
            aria-label="切换对话"
            title="切换对话"
          >
            <List size={20} />
          </button>
          <button className="icon-button" onClick={onNew} disabled={running} aria-label="新建对话" title="新建对话">
            <MessageSquarePlus size={20} />
          </button>
        </div>
      </header>

      <div className="messages" ref={scrollRef} onScroll={handleMessagesScroll}>
        {visibleMessages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-sigil" aria-hidden="true">
              <span className="sigil-caret">›</span>
              <span className="sigil-cursor" />
            </div>
            <h2>把任务交给手机里的 Agent</h2>
            <p>它会搜索资料、管理任务、读写工作区文件，危险操作会先征求你的批准。</p>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onSend(suggestion, false)}
                  disabled={running}
                  className="suggestion-chip"
                >
                  <Sparkles size={15} />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          visibleMessages.map((message) => <MessageView key={message.id} message={message} />)
        )}
      </div>

      <div className="composer-wrap">
        {attachment && (
          <div className="attachment-chip">
            <span className="attachment-name">{attachment.name}</span>
            <span className="attachment-size">{(attachment.size / 1024).toFixed(1)} KB</span>
            <button onClick={() => setAttachment(null)} aria-label="移除附件" title="移除附件">
              <X size={16} />
            </button>
          </div>
        )}
        {attachError && <div className="attach-error">{attachError}</div>}
        <div className="mode-row">
          <button className={`mode-segment ${!deep ? 'active' : ''}`} onClick={() => setDeep(false)}>
            快速
          </button>
          <button className={`mode-segment ${deep ? 'active' : ''}`} onClick={() => setDeep(true)}>
            深度
          </button>
        </div>
        <div className="composer">
          <button
            className="attach-button"
            onClick={pickFile}
            disabled={running}
            aria-label="发送文件"
            title="发送文件"
          >
            <Paperclip size={20} />
          </button>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={running ? 'Agent 正在执行…' : '输入任务…'}
            rows={1}
            aria-label="任务输入"
          />
          {running ? (
            <button className="send-button stop" onClick={onCancel} aria-label="停止运行" title="停止运行">
              <CircleStop size={21} />
            </button>
          ) : (
            <button className="send-button" onClick={submit} aria-label="发送" title="发送" disabled={!text.trim() && !attachment}>
              <Send size={19} />
            </button>
          )}
        </div>
      </div>

      {showThreads && (
        <div className="sheet-backdrop" onClick={() => setShowThreads(false)}>
          <div className="thread-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="thread-sheet-head">
              <h3>切换对话</h3>
              <button className="icon-button" onClick={() => setShowThreads(false)} aria-label="关闭" title="关闭">
                <X size={20} />
              </button>
            </div>
            <div className="thread-sheet-list">
              {threads.length === 0 && (
                <div className="thread-sheet-empty">暂无对话</div>
              )}
              {threads.map((item) => {
                const active = item.id === activeId;
                return (
                  <div className={`thread-sheet-row ${active ? 'active' : ''}`} key={item.id}>
                    <button
                      className="thread-sheet-main"
                      onClick={() => {
                        onSelectThread(item.id);
                        setShowThreads(false);
                        setConfirmDeleteId(null);
                      }}
                      disabled={running}
                    >
                      <span className="thread-sheet-status" data-status={item.status} />
                      <span className="thread-sheet-copy">
                        <strong>{item.title}</strong>
                        <small>
                          {new Date(item.updatedAt).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </small>
                      </span>
                    </button>
                    {confirmDeleteId === item.id ? (
                      <button
                        className="thread-delete-confirm"
                        onClick={() => {
                          onDeleteThread(item.id);
                          setConfirmDeleteId(null);
                          setShowThreads(false);
                        }}
                        disabled={running}
                      >
                        确认
                      </button>
                    ) : (
                      <button
                        className="thread-delete"
                        onClick={() => setConfirmDeleteId(item.id)}
                        disabled={running}
                        aria-label="删除对话"
                        title="删除对话"
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="primary-button kelivo-save" onClick={onNew} disabled={running}>
              <MessageSquarePlus size={17} />
              新建对话
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

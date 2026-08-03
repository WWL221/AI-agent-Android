import { useEffect, useState, type ReactNode } from 'react';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  Download,
  Info,
  Image as ImageIcon,
  Keyboard,
  MessageSquare,
  MousePointerClick,
  Network,
  Palette,
  Plus,
  Plug,
  Save,
  ScanText,
  Search,
  Server,
  Settings2,
  Sparkles,
  Trash2,
  Webhook,
  X
} from 'lucide-react';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { fetchConfig, fetchHealth } from '../api';
import { hasAllFilesAccess, openAllFilesSettings } from '../fileAccess';
import { disablePhoneControlService, isPhoneControlEnabled, openPhoneControlSettings } from '../phoneControl';
import { uid } from '../storage';
import { applyTheme } from '../theme';
import { APP_VERSION, RELEASE_NOTES } from '../version';
import type { McpServer, SearchProvider, ServerConfig, Settings, ThemeMode, Thread } from '../types';

interface Props {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  threads: Thread[];
  onClearThreads: () => void;
  onSaved: () => void;
  onOpenModels: () => void;
}

const THEME_COLORS = ['#f26f45', '#43c6a2', '#4f8cff', '#9b7bff', '#e55a52', '#e3b64f'];

const THEME_LABELS: Record<ThemeMode, string> = {
  system: '跟随系统',
  dark: '深色',
  light: '浅色'
};

const SEARCH_LABELS: Record<SearchProvider, string> = {
  auto: '自动',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo'
};

type SheetId =
  | 'theme-mode'
  | 'theme-color'
  | 'preferences'
  | 'assistant'
  | 'phonecontrol'
  | 'search'
  | 'ocr'
  | 'imagegen'
  | 'mcp'
  | 'worldbook'
  | 'quickphrases'
  | 'injections'
  | 'proxy'
  | 'storage'
  | 'about'
  | null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SettingsSheet({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="settings-sheet-head">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} aria-label="关闭" title="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="settings-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export default function SettingsScreen({
  settings,
  setSettings,
  threads,
  onClearThreads,
  onSaved,
  onOpenModels
}: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [status, setStatus] = useState('');
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [fileAccessGranted, setFileAccessGranted] = useState<boolean | null>(null);
  const [phoneControlGranted, setPhoneControlGranted] = useState<boolean | null>(null);

  useEffect(() => {
    applyTheme(draft);
  }, [draft.themeMode, draft.accentColor]);

  const save = () => {
    const next = {
      ...draft,
      serverUrl: draft.serverUrl.trim().replace(/\/+$/, ''),
      maxTurns: Math.min(Math.max(Number(draft.maxTurns) || 10, 1), 20)
    };
    setDraft(next);
    setSettings(next);
    onSaved();
    setStatus('设置已保存');
    setSheet(null);
  };

  const testConnection = async () => {
    setStatus('正在连接…');
    try {
      await fetchHealth(draft);
      const config = await fetchConfig(draft);
      setServerConfig(config);
      setStatus('连接成功，服务可用');
    } catch (error) {
      setServerConfig(null);
      setStatus(error instanceof Error ? error.message : '连接失败');
    }
  };

  const checkFileAccess = async () => {
    setStatus('正在检查文件访问权限…');
    try {
      const granted = await hasAllFilesAccess();
      setFileAccessGranted(granted);
      setStatus(granted ? '已获得“所有文件访问”权限' : '尚未获得“所有文件访问”权限');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法检查文件权限');
    }
  };

  const requestFileAccess = async () => {
    try {
      await openAllFilesSettings();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法打开系统授权页');
    }
  };

  const checkPhoneControl = async () => {
    setStatus('正在检查无障碍服务…');
    try {
      const enabled = await isPhoneControlEnabled();
      setPhoneControlGranted(enabled);
      setStatus(enabled ? '无障碍服务已开启' : '无障碍服务未开启');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法检查无障碍服务');
    }
  };

  const requestPhoneControl = async () => {
    try {
      await openPhoneControlSettings();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法打开无障碍设置');
    }
  };

  const togglePhoneControl = async (checked: boolean) => {
    setDraft({ ...draft, enablePhoneControl: checked });
    if (!checked) {
      try {
        await disablePhoneControlService();
      } catch {
        // Service may already be disconnected.
      }
      setPhoneControlGranted(false);
      setStatus('无障碍授权已关闭');
    } else {
      setPhoneControlGranted(null);
      await requestPhoneControl();
    }
  };

  const exportBackup = async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `PocketAgentBackup-${stamp}.json`;
    const backup = {
      app: 'pocket-agent',
      exportedAt: new Date().toISOString(),
      settings: draft,
      threads
    };
    try {
      await Filesystem.writeFile({
        path: fileName,
        data: JSON.stringify(backup, null, 2),
        directory: Directory.Documents,
        recursive: true
      });
      setStatus(`已备份到 Documents/${fileName}`);
    } catch (error) {
      setStatus(error instanceof Error ? `备份失败：${error.message}` : '备份失败');
    }
  };

  const providerName = (() => {
    const known = [
      ['api.openai.com', 'OpenAI'],
      ['api.deepseek.com', 'DeepSeek'],
      ['api.moonshot.cn', 'Kimi'],
      ['open.bigmodel.cn', '智谱 AI'],
      ['dashscope.aliyuncs.com', '通义千问'],
      ['ark.cn-beijing.volces.com', '火山方舟'],
      ['api.siliconflow.cn', '硅基流动'],
      ['openrouter.ai', 'OpenRouter'],
      ['generativelanguage.googleapis.com', 'Gemini'],
      ['api.x.ai', 'xAI'],
      ['api.stepfun.com', '阶跃星辰'],
      ['api.groq.com', 'Groq'],
      ['api.mistral.ai', 'Mistral'],
      ['api.hunyuan.cloud.tencent.com', '腾讯混元'],
      ['qianfan.baidubce.com', '百度千帆'],
      ['localhost:11434', 'Ollama 本地'],
      ['localhost:1234', 'LM Studio 本地'],
      ['localhost:8000', 'vLLM 本地']
    ];
    const found = known.find(([url]) => draft.apiBaseUrl.includes(url));
    return found ? found[1] : '自定义服务商';
  })();

  const storageLabel = `${threads.length} 个文件 · ${formatBytes(JSON.stringify(threads).length)}`;
  const mcpEnabledCount = (draft.mcpServers || []).filter((server) => server.enabled && server.url?.trim()).length;
  const quickPhraseCount = (draft.quickPhrases || []).filter((phrase) => phrase.trim()).length;

  const renderSheet = () => {
    if (!sheet) return null;
    if (sheet === 'theme-mode') {
      return (
        <SettingsSheet title="颜色模式" onClose={() => setSheet(null)}>
          {(['system', 'dark', 'light'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              className={`sheet-option ${draft.themeMode === mode ? 'active' : ''}`}
              onClick={() => setDraft({ ...draft, themeMode: mode })}
            >
              <span>
                <strong>{THEME_LABELS[mode]}</strong>
                <small>{mode === 'system' ? '跟随手机系统切换' : '固定使用该配色'}</small>
              </span>
              {draft.themeMode === mode && <CheckCircle2 size={19} />}
            </button>
          ))}
        </SettingsSheet>
      );
    }
    if (sheet === 'theme-color') {
      return (
        <SettingsSheet title="主题色" onClose={() => setSheet(null)}>
          <div className="sheet-swatches">
            {THEME_COLORS.map((color) => (
              <button
                key={color}
                className={`theme-swatch ${draft.accentColor === color ? 'active' : ''}`}
                style={{ background: color }}
                onClick={() => setDraft({ ...draft, accentColor: color })}
                aria-label={`主题色 ${color}`}
              />
            ))}
            <label
              className={`theme-swatch ${!THEME_COLORS.includes(draft.accentColor) ? 'active' : ''}`}
              style={{ background: draft.accentColor }}
              title="自定义主题色"
            >
              <input
                type="color"
                value={draft.accentColor}
                onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })}
                aria-label="自定义主题色"
              />
            </label>
          </div>
          <p className="sheet-hint">选择后会立即预览，点击下方保存后生效。</p>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'preferences') {
      return (
        <SettingsSheet title="偏好设置" onClose={() => setSheet(null)}>
          <div className="sheet-field">
            <span>运行模式</span>
            <div className="segmented">
              <button
                className={draft.runMode === 'phone' ? 'active' : ''}
                onClick={() => setDraft({ ...draft, runMode: 'phone' })}
              >
                手机独立
              </button>
              <button
                className={draft.runMode === 'server' ? 'active' : ''}
                onClick={() => setDraft({ ...draft, runMode: 'server' })}
              >
                电脑服务
              </button>
            </div>
          </div>
          <label className="sheet-field">
            <span>服务器地址</span>
            <input
              value={draft.serverUrl}
              onChange={(event) => setDraft({ ...draft, serverUrl: event.target.value })}
              placeholder="http://192.168.1.5:8787"
              inputMode="url"
            />
            <small>电脑服务模式时填写电脑的局域网地址。</small>
          </label>
          <label className="sheet-field">
            <span>访问令牌</span>
            <input
              value={draft.token}
              onChange={(event) => setDraft({ ...draft, token: event.target.value })}
              placeholder="服务端设置了 AGENT_AUTH_TOKEN 时填写"
              autoComplete="off"
            />
          </label>
          <button className="secondary-button sheet-button" onClick={testConnection}>
            <Plug size={16} />
            测试连接
          </button>
          <label className="sheet-toggle">
            <span>
              <strong>联网搜索</strong>
              <small>允许 Agent 使用联网搜索与网页抓取</small>
            </span>
            <input
              type="checkbox"
              checked={draft.enableWebSearch}
              onChange={(event) => setDraft({ ...draft, enableWebSearch: event.target.checked })}
            />
          </label>
          <label className="sheet-toggle">
            <span>
              <strong>手机能力</strong>
              <small>允许读取手机信息、文件和写入 Documents</small>
            </span>
            <input
              type="checkbox"
              checked={draft.enablePhoneTools}
              onChange={(event) => setDraft({ ...draft, enablePhoneTools: event.target.checked })}
            />
          </label>
          <label className="sheet-toggle">
            <span>
              <strong>直接读取全部文件</strong>
              <small>需要系统“所有文件访问”权限，读取不再逐个选文件</small>
            </span>
            <input
              type="checkbox"
              checked={draft.allowDirectRead}
              onChange={(event) => setDraft({ ...draft, allowDirectRead: event.target.checked })}
            />
          </label>
          <div className="permission-row">
            <button className="secondary-button sheet-button" onClick={checkFileAccess}>
              检查权限
            </button>
            <button className="secondary-button sheet-button" onClick={requestFileAccess}>
              前往授权
            </button>
          </div>
          {fileAccessGranted !== null && (
            <p className="sheet-hint">{fileAccessGranted ? '权限已开启，可直接读取手机文件。' : '未开启，点“前往授权”到系统设置允许。'}</p>
          )}
          <label className="sheet-toggle">
            <span>
              <strong>写入文件需要审批</strong>
              <small>Agent 写入文件前必须经过你确认</small>
            </span>
            <input
              type="checkbox"
              checked={draft.requireWriteApproval}
              onChange={(event) => setDraft({ ...draft, requireWriteApproval: event.target.checked })}
            />
          </label>
          <label className="sheet-toggle">
            <span>
              <strong>本地任务</strong>
              <small>允许创建、更新和删除手机上的任务</small>
            </span>
            <input
              type="checkbox"
              checked={draft.enableTasks}
              onChange={(event) => setDraft({ ...draft, enableTasks: event.target.checked })}
            />
          </label>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'assistant') {
      return (
        <SettingsSheet title="助手" onClose={() => setSheet(null)}>
          <label className="sheet-field">
            <span>助手名称</span>
            <input
              value={draft.assistantName}
              onChange={(event) => setDraft({ ...draft, assistantName: event.target.value })}
              placeholder="口袋智能体"
            />
            <small>会显示在系统提示中，也用于对话里的自我称呼。</small>
          </label>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'phonecontrol') {
      return (
        <SettingsSheet title="手机控制" onClose={() => setSheet(null)}>
          <label className="sheet-toggle">
            <span>
              <strong>无障碍授权与手机控制</strong>
              <small>开启时跳转系统授权；关闭时会真正停用无障碍服务</small>
            </span>
            <input
              type="checkbox"
              checked={draft.enablePhoneControl}
              onChange={(event) => togglePhoneControl(event.target.checked)}
            />
          </label>
          <div className="permission-row">
            <button className="secondary-button sheet-button" onClick={checkPhoneControl}>
              检查服务
            </button>
            <button className="secondary-button sheet-button" onClick={requestPhoneControl}>
              开启无障碍
            </button>
          </div>
          {phoneControlGranted !== null && (
            <p className="sheet-hint">
              {phoneControlGranted ? '无障碍服务已开启，Agent 可以操作当前屏幕。' : '未开启，点“开启无障碍”到系统设置中允许。'}
            </p>
          )}
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'search') {
      return (
        <SettingsSheet title="搜索服务" onClose={() => setSheet(null)}>
          {(['auto', 'bing', 'duckduckgo'] as SearchProvider[]).map((provider) => (
            <button
              key={provider}
              className={`sheet-option ${draft.searchProvider === provider ? 'active' : ''}`}
              onClick={() => setDraft({ ...draft, searchProvider: provider })}
            >
              <span>
                <strong>{SEARCH_LABELS[provider]}</strong>
                <small>
                  {provider === 'auto' ? 'Bing 优先，失败后换 DuckDuckGo' : `只使用 ${SEARCH_LABELS[provider]}`}
                </small>
              </span>
              {draft.searchProvider === provider && <CheckCircle2 size={19} />}
            </button>
          ))}
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'ocr') {
      return (
        <SettingsSheet title="OCR 识图" onClose={() => setSheet(null)}>
          <label className="sheet-toggle">
            <span>
              <strong>启用 OCR 识图</strong>
              <small>允许 Agent 识别图片文字，也支持直接发送图片附件</small>
            </span>
            <input
              type="checkbox"
              checked={draft.ocrEnabled}
              onChange={(event) => setDraft({ ...draft, ocrEnabled: event.target.checked })}
            />
          </label>
          <label className="sheet-field">
            <span>API 基础地址</span>
            <input
              value={draft.ocrBaseUrl}
              onChange={(event) => setDraft({ ...draft, ocrBaseUrl: event.target.value })}
              placeholder="留空则使用当前模型服务商"
              inputMode="url"
            />
          </label>
          <label className="sheet-field">
            <span>API Key</span>
            <input
              value={draft.ocrApiKey}
              onChange={(event) => setDraft({ ...draft, ocrApiKey: event.target.value })}
              placeholder="留空则使用当前 API Key"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="sheet-field">
            <span>视觉模型</span>
            <input
              value={draft.ocrModel}
              onChange={(event) => setDraft({ ...draft, ocrModel: event.target.value })}
              placeholder={`留空则使用 ${draft.model}`}
            />
          </label>
          <label className="sheet-field">
            <span>识别提示词</span>
            <textarea
              className="sheet-textarea"
              value={draft.ocrPrompt}
              onChange={(event) => setDraft({ ...draft, ocrPrompt: event.target.value })}
              rows={4}
            />
          </label>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'imagegen') {
      return (
        <SettingsSheet title="画图工具" onClose={() => setSheet(null)}>
          <label className="sheet-toggle">
            <span>
              <strong>启用画图工具</strong>
              <small>允许 Agent 根据描述生成图片并保存到手机</small>
            </span>
            <input
              type="checkbox"
              checked={draft.imageGenEnabled}
              onChange={(event) => setDraft({ ...draft, imageGenEnabled: event.target.checked })}
            />
          </label>
          <label className="sheet-field">
            <span>API 基础地址</span>
            <input
              value={draft.imageGenBaseUrl}
              onChange={(event) => setDraft({ ...draft, imageGenBaseUrl: event.target.value })}
              placeholder="留空则使用当前模型服务商"
              inputMode="url"
            />
          </label>
          <label className="sheet-field">
            <span>API Key</span>
            <input
              value={draft.imageGenApiKey}
              onChange={(event) => setDraft({ ...draft, imageGenApiKey: event.target.value })}
              placeholder="留空则使用当前 API Key"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="sheet-field">
            <span>生成模型</span>
            <input
              value={draft.imageGenModel}
              onChange={(event) => setDraft({ ...draft, imageGenModel: event.target.value })}
              placeholder="例如 gpt-image-1、cogview-4"
            />
          </label>
          <label className="sheet-field">
            <span>图片尺寸</span>
            <select
              className="sheet-select"
              value={draft.imageGenSize}
              onChange={(event) => setDraft({ ...draft, imageGenSize: event.target.value })}
            >
              {['1024x1024', '1024x1792', '1792x1024', '768x768', '512x512'].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'mcp') {
      const servers: McpServer[] = Array.isArray(draft.mcpServers) ? draft.mcpServers : [];
      const updateServer = (id: string, patch: Partial<McpServer>) =>
        setDraft({ ...draft, mcpServers: servers.map((server) => (server.id === id ? { ...server, ...patch } : server)) });
      const addServer = () =>
        setDraft({
          ...draft,
          mcpServers: [...servers, { id: uid(), name: '', url: '', enabled: true }]
        });
      const removeServer = (id: string) =>
        setDraft({ ...draft, mcpServers: servers.filter((server) => server.id !== id) });
      return (
        <SettingsSheet title="MCP" onClose={() => setSheet(null)}>
          <p className="sheet-hint">支持 Streamable HTTP / JSON-RPC 的 MCP 服务，工具会自动加载给 Agent。</p>
          {servers.map((server) => (
            <div className="mcp-card" key={server.id}>
              <div className="mcp-row">
                <input
                  value={server.name}
                  onChange={(event) => updateServer(server.id, { name: event.target.value })}
                  placeholder="服务名称"
                />
                <label className="mcp-toggle" title="启用">
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    onChange={(event) => updateServer(server.id, { enabled: event.target.checked })}
                  />
                </label>
                <button
                  className="icon-button"
                  onClick={() => removeServer(server.id)}
                  aria-label="删除 MCP 服务"
                  title="删除 MCP 服务"
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <input
                value={server.url}
                onChange={(event) => updateServer(server.id, { url: event.target.value })}
                placeholder="https://example.com/mcp"
                inputMode="url"
              />
            </div>
          ))}
          <button className="secondary-button sheet-button" onClick={addServer}>
            <Plus size={16} />
            添加 MCP 服务
          </button>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'worldbook') {
      return (
        <SettingsSheet title="世界书" onClose={() => setSheet(null)}>
          <label className="sheet-field">
            <span>长期记忆与世界观</span>
            <textarea
              className="sheet-textarea"
              value={draft.worldBook}
              onChange={(event) => setDraft({ ...draft, worldBook: event.target.value })}
              placeholder="例如：用户叫小林，常用语言是中文，正在做一个安卓 AI Agent 项目。"
              rows={6}
            />
            <small>会作为长期记忆注入每次对话的系统提示。</small>
          </label>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'injections') {
      return (
        <SettingsSheet title="指令注入" onClose={() => setSheet(null)}>
          <label className="sheet-field">
            <span>附加系统指令</span>
            <textarea
              className="sheet-textarea"
              value={draft.injections}
              onChange={(event) => setDraft({ ...draft, injections: event.target.value })}
              placeholder="例如：回答时先给结论，再给步骤；遇到不确定的信息要明确说明。"
              rows={6}
            />
            <small>这些规则会附加在 Agent 的系统提示中。</small>
          </label>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'proxy') {
      return (
        <SettingsSheet title="网络代理" onClose={() => setSheet(null)}>
          <label className="sheet-field">
            <span>代理地址</span>
            <input
              value={draft.proxyUrl}
              onChange={(event) => setDraft({ ...draft, proxyUrl: event.target.value })}
              placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
              inputMode="url"
            />
            <small>手机端模型请求、搜索、抓网页和 MCP 请求都会走该代理，留空表示直连。</small>
          </label>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'quickphrases') {
      const phrases = Array.isArray(draft.quickPhrases) ? draft.quickPhrases : [];
      const setPhrase = (index: number, value: string) => {
        const next = [...phrases];
        next[index] = value;
        setDraft({ ...draft, quickPhrases: next });
      };
      const addPhrase = () => setDraft({ ...draft, quickPhrases: [...phrases, ''] });
      const removePhrase = (index: number) =>
        setDraft({ ...draft, quickPhrases: phrases.filter((_, itemIndex) => itemIndex !== index) });
      return (
        <SettingsSheet title="快捷短语" onClose={() => setSheet(null)}>
          <p className="sheet-hint">设置后会显示在新对话的快捷建议里。</p>
          {phrases.map((phrase, index) => (
            <div className="phrase-row" key={index}>
              <input
                value={phrase}
                onChange={(event) => setPhrase(index, event.target.value)}
                placeholder={`快捷短语 ${index + 1}`}
              />
              <button
                className="icon-button"
                onClick={() => removePhrase(index)}
                aria-label="删除快捷短语"
                title="删除快捷短语"
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          <button className="secondary-button sheet-button" onClick={addPhrase}>
            <Plus size={16} />
            添加快捷短语
          </button>
          <button className="primary-button kelivo-save" onClick={save}>
            <Save size={17} />
            保存设置
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'storage') {
      return (
        <SettingsSheet title="聊天记录存储" onClose={() => setSheet(null)}>
          <div className="sheet-storage">
            <Cloud size={22} />
            <strong>{storageLabel}</strong>
            <small>对话保存在手机本机，不会自动上传。</small>
          </div>
          <button className="danger-button sheet-button" onClick={onClearThreads}>
            <Trash2 size={16} />
            清空本地对话
          </button>
        </SettingsSheet>
      );
    }
    if (sheet === 'about') {
      return (
        <SettingsSheet title="版本与更新说明" onClose={() => setSheet(null)}>
          <div className="about-version">
            <strong>PocketAgent v{APP_VERSION}</strong>
            <small>安卓手机上的 AI Agent</small>
          </div>
          <div className="about-notes">
            {RELEASE_NOTES.map((note) => (
              <div className="about-note" key={note.version}>
                <div className="about-note-head">
                  <strong>v{note.version}</strong>
                  <small>{note.date}</small>
                </div>
                <ul>
                  {note.notes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SettingsSheet>
      );
    }
    return null;
  };

  return (
    <section className="settings-screen kelivo-screen">
      <header className="topbar">
        <div className="topbar-title">
          <h1>设置</h1>
        </div>
      </header>

      <div className="settings-body kelivo-body">
        <section className="kelivo-group">
          <h2 className="kelivo-group-title">通用设置</h2>
          <div className="kelivo-list">
            <button className="kelivo-row" onClick={() => setSheet('theme-mode')}>
              <span className="kelivo-row-icon">
                <Palette size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>颜色模式</strong>
                <small>跟随系统、深色或浅色</small>
              </span>
              <span className="kelivo-row-value">{THEME_LABELS[draft.themeMode]}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('theme-color')}>
              <span className="kelivo-row-icon">
                <Sparkles size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>主题色</strong>
                <small>按钮、高亮和强调色</small>
              </span>
              <span className="kelivo-row-value theme-row-value">
                <i style={{ background: draft.accentColor }} />
                {draft.accentColor.toUpperCase()}
              </span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('preferences')}>
              <span className="kelivo-row-icon">
                <Settings2 size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>偏好设置</strong>
                <small>运行模式、工具开关与连接</small>
              </span>
              <span className="kelivo-row-value">默认</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('assistant')}>
              <span className="kelivo-row-icon">
                <Bot size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>助手</strong>
                <small>助手名称与系统提示</small>
              </span>
              <span className="kelivo-row-value">{draft.assistantName}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('phonecontrol')}>
              <span className="kelivo-row-icon">
                <MousePointerClick size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>手机控制</strong>
                <small>无障碍操作其他 App</small>
              </span>
              <span className="kelivo-row-value">{draft.enablePhoneControl ? '已启用' : '未启用'}</span>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>

        <section className="kelivo-group">
          <h2 className="kelivo-group-title">模型与服务</h2>
          <div className="kelivo-list">
            <button className="kelivo-row" onClick={onOpenModels}>
              <span className="kelivo-row-icon">
                <Cpu size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>默认模型</strong>
                <small>选择当前使用的模型</small>
              </span>
              <span className="kelivo-row-value">{draft.model}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={onOpenModels}>
              <span className="kelivo-row-icon">
                <Server size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>供应商</strong>
                <small>选择或自定义模型服务商</small>
              </span>
              <span className="kelivo-row-value">{providerName}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('search')}>
              <span className="kelivo-row-icon">
                <Search size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>搜索服务</strong>
                <small>联网搜索使用的搜索引擎</small>
              </span>
              <span className="kelivo-row-value">{SEARCH_LABELS[draft.searchProvider]}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('ocr')}>
              <span className="kelivo-row-icon">
                <ScanText size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>OCR 识图</strong>
                <small>识别图片中的文字</small>
              </span>
              <span className="kelivo-row-value">{draft.ocrEnabled ? (draft.ocrModel || draft.model) : '未启用'}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('imagegen')}>
              <span className="kelivo-row-icon">
                <ImageIcon size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>画图工具</strong>
                <small>AI 生成图片并保存到手机</small>
              </span>
              <span className="kelivo-row-value">{draft.imageGenEnabled ? (draft.imageGenModel || '已启用') : '未启用'}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('mcp')}>
              <span className="kelivo-row-icon">
                <Webhook size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>MCP</strong>
                <small>连接外部工具服务</small>
              </span>
              <span className="kelivo-row-value">{mcpEnabledCount ? `${mcpEnabledCount} 个服务` : '未配置'}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('worldbook')}>
              <span className="kelivo-row-icon">
                <BookOpen size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>世界书</strong>
                <small>长期记忆与世界观设定</small>
              </span>
              <span className="kelivo-row-value">{draft.worldBook?.trim() ? '已配置' : '未配置'}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('quickphrases')}>
              <span className="kelivo-row-icon">
                <MessageSquare size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>快捷短语</strong>
                <small>快速发送常用内容</small>
              </span>
              <span className="kelivo-row-value">{quickPhraseCount ? `${quickPhraseCount} 条` : '未配置'}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('injections')}>
              <span className="kelivo-row-icon">
                <Keyboard size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>指令注入</strong>
                <small>附加系统指令与规则</small>
              </span>
              <span className="kelivo-row-value">{draft.injections?.trim() ? '已配置' : '未配置'}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('proxy')}>
              <span className="kelivo-row-icon">
                <Network size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>网络代理</strong>
                <small>配置 HTTP 与 SOCKS 代理</small>
              </span>
              <span className="kelivo-row-value">{draft.proxyUrl || '未配置'}</span>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>

        <section className="kelivo-group">
          <h2 className="kelivo-group-title">数据设置</h2>
          <div className="kelivo-list">
            <button className="kelivo-row" onClick={exportBackup}>
              <span className="kelivo-row-icon">
                <Database size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>数据备份</strong>
                <small>导出设置与聊天记录到手机</small>
              </span>
              <span className="kelivo-row-value">导出 JSON</span>
              <Download size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('storage')}>
              <span className="kelivo-row-icon">
                <Cloud size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>聊天记录存储</strong>
                <small>对话保存在手机本地</small>
              </span>
              <span className="kelivo-row-value">{storageLabel}</span>
              <ChevronRight size={17} />
            </button>
            <button className="kelivo-row" onClick={() => setSheet('about')}>
              <span className="kelivo-row-icon">
                <Info size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>版本与更新说明</strong>
                <small>查看当前版本和更新记录</small>
              </span>
              <span className="kelivo-row-value">v{APP_VERSION}</span>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>

        {status && <p className="settings-status kelivo-status-bottom">{status}</p>}
        {serverConfig && (
          <div className="server-card">
            <CheckCircle2 size={16} />
            <span>模型：{serverConfig.model}</span>
            <span>工作区：{serverConfig.workspace}</span>
            <span>Shell 审批：{serverConfig.allowShell ? '已启用' : '未启用'}</span>
            <span>服务端密钥：{serverConfig.authRequired ? '需要' : '未设置'}</span>
          </div>
        )}

        <button className="primary-button kelivo-save" onClick={save}>
          <Save size={17} />
          保存设置
        </button>
      </div>

      {renderSheet()}
    </section>
  );
}

import { useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cpu,
  KeyRound,
  RefreshCw,
  Save,
  Trash2,
  UserPlus
} from 'lucide-react';
import { listProviderModels, testProviderModel } from '../localAgent';
import { uid } from '../storage';
import type { ModelProfile, Settings } from '../types';

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  keyUrl: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'kimi',
    name: 'Kimi 开放平台',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'kimi-k2-0711-preview'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
  },
  {
    id: 'qwen',
    name: '通义千问 / 百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1'
  },
  {
    id: 'ark',
    name: '火山方舟 / 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-seed-1-6-250615', 'doubao-seed-code'],
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey'
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openrouter/auto'],
    keyUrl: 'https://openrouter.ai/settings/keys'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    keyUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'xai',
    name: 'xAI / Grok',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-3', 'grok-3-mini'],
    keyUrl: 'https://console.x.ai/'
  },
  {
    id: 'stepfun',
    name: '阶跃星辰 StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    models: ['step-2-16k', 'step-1-8k'],
    keyUrl: 'https://platform.stepfun.com/'
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    keyUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'mistral-small-latest'],
    keyUrl: 'https://console.mistral.ai/api-keys/'
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: ['hunyuan-turbo', 'hunyuan-pro'],
    keyUrl: 'https://console.cloud.tencent.com/hunyuan'
  },
  {
    id: 'qianfan',
    name: '百度千帆',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: ['ernie-4.0-8k', 'ernie-3.5-8k'],
    keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application'
  },
  {
    id: 'ollama',
    name: 'Ollama 本地',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'qwen2.5'],
    keyUrl: 'http://localhost:11434/'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio 本地',
    baseUrl: 'http://localhost:1234/v1',
    models: ['local-model'],
    keyUrl: 'http://localhost:1234/'
  },
  {
    id: 'vllm',
    name: 'vLLM 本地',
    baseUrl: 'http://localhost:8000/v1',
    models: ['qwen2.5-72b-instruct'],
    keyUrl: 'http://localhost:8000/'
  }
];

interface Props {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  onBack: () => void;
}

function maskKey(key: string): string {
  if (!key) return '未填写';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export default function ModelScreen({ settings, setSettings, onBack }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [modelStatus, setModelStatus] = useState('');
  const [modelOk, setModelOk] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelListStatus, setModelListStatus] = useState('');
  const [modelListOk, setModelListOk] = useState<boolean | null>(null);
  const modelSectionRef = useRef<HTMLElement>(null);
  const apiSectionRef = useRef<HTMLElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const scrollToModel = () => {
    setTimeout(() => {
      modelSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 90);
  };

  const scrollToApi = () => {
    setTimeout(() => {
      apiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 90);
  };

  const syncActiveProfile = (current: Settings): Settings => {
    const baseUrl = normalizeBase(current.apiBaseUrl);
    let profiles = current.profiles;
    let activeProfileId = current.activeProfileId;
    if (!profiles.some((profile) => profile.id === activeProfileId)) {
      const profile: ModelProfile = {
        id: uid(),
        name: current.model || '默认',
        apiKey: current.apiKey,
        apiBaseUrl: baseUrl,
        model: current.model
      };
      profiles = [profile, ...profiles];
      activeProfileId = profile.id;
    } else {
      profiles = profiles.map((profile) =>
        profile.id === activeProfileId
          ? {
              ...profile,
              name: current.model || profile.name,
              apiKey: current.apiKey,
              apiBaseUrl: baseUrl,
              model: current.model
            }
          : profile
      );
    }
    return {
      ...current,
      apiBaseUrl: baseUrl,
      profiles,
      activeProfileId
    };
  };

  const save = () => {
    const next = syncActiveProfile({
      ...draft,
      maxTurns: Math.min(Math.max(Number(draft.maxTurns) || 10, 1), 20)
    });
    setDraft(next);
    setSettings(next);
    setModelStatus('模型配置已保存');
    setModelOk(true);
  };

  const saveAsNewProfile = () => {
    const profile: ModelProfile = {
      id: uid(),
      name: draft.model || '模型配置',
      apiKey: draft.apiKey,
      apiBaseUrl: normalizeBase(draft.apiBaseUrl),
      model: draft.model
    };
    const next = {
      ...draft,
      profiles: [...draft.profiles, profile],
      activeProfileId: profile.id
    };
    setDraft(next);
    setSettings(next);
    setModelStatus('已保存为新配置');
    setModelOk(true);
  };

  const activateProfile = (profile: ModelProfile) => {
    const next = {
      ...draft,
      activeProfileId: profile.id,
      apiKey: profile.apiKey,
      apiBaseUrl: profile.apiBaseUrl,
      model: profile.model
    };
    setDraft(next);
    setSettings(next);
    setModelStatus('');
    setModelOk(null);
    setModels(null);
    setModelListStatus('');
    setModelListOk(null);
  };

  const removeProfile = (id: string) => {
    const profiles = draft.profiles.filter((profile) => profile.id !== id);
    let next: Settings;
    if (profiles.length === 0) {
      const profile: ModelProfile = {
        id: uid(),
        name: '默认',
        apiKey: '',
        apiBaseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini'
      };
      next = {
        ...draft,
        profiles: [profile],
        activeProfileId: profile.id,
        apiKey: '',
        apiBaseUrl: profile.apiBaseUrl,
        model: profile.model
      };
    } else {
      const activeProfileId = draft.activeProfileId === id ? profiles[0].id : draft.activeProfileId;
      const active = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];
      next = {
        ...draft,
        profiles,
        activeProfileId,
        apiKey: active.apiKey,
        apiBaseUrl: active.apiBaseUrl,
        model: active.model
      };
    }
    setDraft(next);
    setSettings(next);
    setModelStatus('');
    setModelOk(null);
  };

  const testModelConnection = async () => {
    setModelStatus('正在测试模型…');
    setModelOk(null);
    const result = await testProviderModel(draft, {
      apiKey: draft.apiKey,
      baseUrl: draft.apiBaseUrl,
      model: draft.model
    });
    if (result.ok) {
      setModelOk(true);
      setModelStatus(`模型可用：${result.model}${result.reply ? `，回复：${result.reply.slice(0, 40)}` : ''}`);
    } else {
      setModelOk(false);
      setModelStatus(result.error || '模型连接失败');
    }
  };

  const loadModels = async () => {
    setModelListStatus('正在读取模型列表…');
    setModelListOk(null);
    const result = await listProviderModels(draft);
    if (result.ok && result.models?.length) {
      setModels(result.models);
      setModelListOk(true);
      setModelListStatus(`已读取 ${result.models.length} 个模型`);
      if (!result.models.includes(draft.model)) {
        setDraft((current) => ({ ...current, model: result.models![0] }));
      }
      setTimeout(() => {
        modelPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 220);
    } else {
      setModels(null);
      setModelListOk(false);
      setModelListStatus(result.error || '读取模型列表失败');
    }
  };

  const applyProvider = (provider: Provider) => {
    setDraft((current) => {
      const same = normalizeBase(current.apiBaseUrl) === normalizeBase(provider.baseUrl);
      return {
        ...current,
        apiBaseUrl: provider.baseUrl,
        model: same ? current.model : provider.models[0],
        apiKey: same ? current.apiKey : ''
      };
    });
    setModelStatus('');
    setModelOk(null);
    setModels(null);
    setModelListStatus('');
    setModelListOk(null);
    scrollToModel();
  };

  const activeProfile = draft.profiles.find((profile) => profile.id === draft.activeProfileId);

  return (
    <section className="settings-screen kelivo-screen">
      <header className="topbar">
        <button className="icon-button" onClick={onBack} aria-label="返回设置" title="返回设置">
          <ArrowLeft size={21} />
        </button>
        <div className="topbar-title">
          <h1>模型与服务</h1>
        </div>
      </header>

      <div className="settings-body kelivo-body">
        <section className="kelivo-group">
          <h2 className="kelivo-group-title">供应商</h2>
          <div className="kelivo-list">
            {PROVIDERS.map((provider) => {
              const active = draft.apiBaseUrl === provider.baseUrl;
              return (
                <button
                  key={provider.id}
                  className={`kelivo-row ${active ? 'active' : ''}`}
                  onClick={() => applyProvider(provider)}
                >
                  <span className="kelivo-row-icon">
                    <Cpu size={18} />
                  </span>
                  <span className="kelivo-row-copy">
                    <strong>{provider.name}</strong>
                    <small>{provider.baseUrl}</small>
                  </span>
                  <span className="kelivo-row-value">{active ? '已选' : '未选'}</span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
            <button
              className="kelivo-row"
              onClick={() => {
                setDraft((current) => ({ ...current, apiKey: '' }));
                scrollToApi();
              }}
            >
              <span className="kelivo-row-icon">
                <UserPlus size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>自定义服务商</strong>
                <small>清空 Key 并填写任意 OpenAI 兼容地址</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>

        <section className="kelivo-group" ref={modelSectionRef}>
          <h2 className="kelivo-group-title">默认模型</h2>
          <div className="kelivo-list">
            <div className="kelivo-row model-picker" ref={modelPickerRef}>
              <span className="kelivo-row-icon">
                <RefreshCw size={18} />
              </span>
              <div className="kelivo-row-copy">
                <div className="model-picker-head">
                  <strong>当前模型</strong>
                  <button className="secondary-button compact" onClick={loadModels}>
                    <RefreshCw size={15} />
                    读取模型列表
                  </button>
                </div>
                {models ? (
                  <select
                    className="model-select"
                    value={draft.model}
                    onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                    aria-label="选择模型"
                  >
                    {!models.includes(draft.model) && <option value={draft.model}>{draft.model}（自定义）</option>}
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={draft.model}
                    onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                )}
                {modelListStatus && (
                  <p className={`settings-status ${modelListOk === false ? 'error' : ''}`}>{modelListStatus}</p>
                )}
              </div>
            </div>
          </div>
          <button className="secondary-button kelivo-action" onClick={testModelConnection}>
            <Cpu size={17} />
            测试模型连接
          </button>
          {modelStatus && <p className={`settings-status ${modelOk === false ? 'error' : ''}`}>{modelStatus}</p>}
        </section>

        <section className="kelivo-group" ref={apiSectionRef}>
          <h2 className="kelivo-group-title">API 配置</h2>
          <div className="kelivo-list">
            <label className="kelivo-field">
              <span>
                <KeyRound size={14} />
                API Key
              </span>
              <input
                value={draft.apiKey}
                onChange={(event) => {
                  setDraft({ ...draft, apiKey: event.target.value });
                  setModels(null);
                  setModelListStatus('');
                  setModelListOk(null);
                }}
                placeholder="仅保存在本机"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <small>{activeProfile ? maskKey(activeProfile.apiKey) : maskKey(draft.apiKey)}</small>
            </label>
            <label className="kelivo-field">
              <span>API 基础地址</span>
              <input
                value={draft.apiBaseUrl}
                onChange={(event) => {
                  setDraft({ ...draft, apiBaseUrl: event.target.value });
                  setModels(null);
                  setModelListStatus('');
                  setModelListOk(null);
                }}
                placeholder="https://api.openai.com/v1"
                inputMode="url"
              />
              <small>支持 OpenAI 兼容接口的自定义地址。</small>
            </label>
          </div>
        </section>

        <section className="kelivo-group">
          <h2 className="kelivo-group-title">多配置</h2>
          <div className="kelivo-list">
            {draft.profiles.map((profile) => {
              const active = profile.id === draft.activeProfileId;
              return (
                <div className={`kelivo-row profile-row ${active ? 'active' : ''}`} key={profile.id}>
                  <button
                    className="kelivo-row-icon profile-radio"
                    onClick={() => activateProfile(profile)}
                    aria-label={`切换配置 ${profile.name}`}
                    title="切换到此配置"
                  >
                    {active ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                  </button>
                  <button className="kelivo-row-copy profile-copy" onClick={() => activateProfile(profile)}>
                    <strong>{profile.name}</strong>
                    <small>{profile.model} · {profile.apiBaseUrl}</small>
                    <small>{maskKey(profile.apiKey)}</small>
                  </button>
                  <button
                    className="profile-delete"
                    onClick={() => removeProfile(profile.id)}
                    aria-label="删除配置"
                    title="删除配置"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
            <button className="kelivo-row" onClick={saveAsNewProfile}>
              <span className="kelivo-row-icon">
                <UserPlus size={18} />
              </span>
              <span className="kelivo-row-copy">
                <strong>保存为新配置</strong>
                <small>用当前 API 设置新增一条</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>

        <section className="kelivo-group">
          <h2 className="kelivo-group-title">高级</h2>
          <div className="kelivo-list">
            <label className="kelivo-field">
              <span>最大工具轮次</span>
              <input
                value={draft.maxTurns}
                onChange={(event) => setDraft({ ...draft, maxTurns: Number(event.target.value) })}
                type="number"
                min={1}
                max={20}
              />
              <small>每轮最多让模型连续调用工具的次数。</small>
            </label>
            <label className="kelivo-toggle">
              <span>
                <strong>演示模式</strong>
                <small>服务端启用 AGENT_MOCK 时可免 API Key 体验完整流程</small>
              </span>
              <input
                type="checkbox"
                checked={draft.useMock}
                onChange={(event) => setDraft({ ...draft, useMock: event.target.checked })}
              />
            </label>
          </div>
        </section>

        <button className="primary-button kelivo-save" onClick={save}>
          <Save size={17} />
          保存模型配置
        </button>
      </div>
    </section>
  );
}

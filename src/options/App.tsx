import { useEffect, useState, type FormEvent } from 'react';
import { sendExtensionMessage } from '../services/message';
import { normalizeHostname } from '../services/siteRules';
import {
  clearTranslationCache,
  getTranslationCacheSize,
} from '../services/translationCache';
import { MESSAGE_TYPES } from '../types/message';
import type {
  AppSettings,
  DeepSeekApiSettings,
  DisplayMode,
  TranslationStyle,
} from '../types/settings';

type Feedback =
  | { kind: 'success' | 'error' | 'info'; text: string }
  | null;

const DISPLAY_MODES: Array<{ value: DisplayMode; label: string }> = [
  { value: 'bilingual', label: '双语' },
  { value: 'translation-only', label: '仅译文' },
  { value: 'original-only', label: '仅原文' },
];

const TRANSLATION_STYLES: Array<{ value: TranslationStyle; label: string }> = [
  { value: 'general', label: '通用' },
  { value: 'natural', label: '自然' },
  { value: 'academic', label: '学术' },
  { value: 'literal', label: '直译' },
  { value: 'professional', label: '专业' },
];

const TARGET_LANGUAGES = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁体中文'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['ru', 'Русский'],
] as const;

function validateSettings(settings: AppSettings): string | null {
  const { api, batching, floatingBall } = settings;
  if (!settings.targetLanguage.trim()) return '请选择目标语言';
  if (!api.apiKey.trim()) return '请先填写 DeepSeek API Key';
  if (!api.baseUrl.trim()) return '请填写 API Base URL';
  try {
    const url = new URL(api.baseUrl);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      return 'API Base URL 必须是有效的 HTTP 或 HTTPS 地址';
    }
  } catch {
    return 'API Base URL 格式不正确';
  }
  if (!api.model.trim()) return '请填写 Model';
  if (!Number.isFinite(api.temperature) || api.temperature < 0 || api.temperature > 2) {
    return 'Temperature 必须在 0 到 2 之间';
  }
  if (!Number.isInteger(api.timeout) || api.timeout <= 0 || api.timeout > 300_000) {
    return 'Timeout 必须是 1 到 300000 之间的整数';
  }
  if (!Number.isInteger(api.concurrency) || api.concurrency < 1 || api.concurrency > 10) {
    return '最大并发请求数必须是 1 到 10 之间的整数';
  }
  if (
    !Number.isInteger(batching.maxCharacters) ||
    batching.maxCharacters < 100 ||
    batching.maxCharacters > 20_000
  ) {
    return '每批最大字符数必须是 100 到 20000 之间的整数';
  }
  if (!Number.isInteger(batching.maxItems) || batching.maxItems < 1 || batching.maxItems > 100) {
    return '每批最大项目数必须是 1 到 100 之间的整数';
  }
  if (!Number.isFinite(floatingBall.size) || floatingBall.size < 32 || floatingBall.size > 96) {
    return '悬浮球大小必须在 32 到 96 之间';
  }
  if (!Number.isFinite(floatingBall.opacity) || floatingBall.opacity < 0.2 || floatingBall.opacity > 1) {
    return '悬浮球透明度必须在 0.2 到 1 之间';
  }
  return null;
}

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [cacheSize, setCacheSize] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      sendExtensionMessage<AppSettings>({ type: MESSAGE_TYPES.GET_SETTINGS }),
      getTranslationCacheSize().catch(() => 0),
    ]).then(([response, size]) => {
      if (!active) return;
      setCacheSize(size);
      if (response.ok) setSettings(response.data);
      else setFeedback({ kind: 'error', text: response.error });
    });
    return () => {
      active = false;
    };
  }, []);

  const update = <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key],
  ): void => {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const updateApi = <Key extends keyof DeepSeekApiSettings>(
    key: Key,
    value: DeepSeekApiSettings[Key],
  ): void => {
    setSettings((current) => current
      ? { ...current, api: { ...current.api, [key]: value } }
      : current);
  };

  const saveSettings = async (showSuccess: boolean): Promise<boolean> => {
    if (!settings) {
      setFeedback({ kind: 'error', text: '设置尚未加载完成' });
      return false;
    }
    const error = validateSettings(settings);
    if (error) {
      setFeedback({ kind: 'error', text: error });
      return false;
    }
    const normalized: AppSettings = {
      ...settings,
      api: {
        ...settings.api,
        apiKey: settings.api.apiKey.trim(),
        baseUrl: settings.api.baseUrl.trim().replace(/\/+$/u, ''),
        model: settings.api.model.trim(),
      },
      customPrompt: settings.customPrompt?.trim() || undefined,
    };
    setIsSaving(true);
    try {
      const response = await sendExtensionMessage<AppSettings>({
        type: MESSAGE_TYPES.UPDATE_SETTINGS,
        payload: normalized,
      });
      if (!response.ok) {
        setFeedback({ kind: 'error', text: response.error });
        return false;
      }
      setSettings(response.data);
      if (showSuccess) setFeedback({ kind: 'success', text: '设置已保存' });
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void saveSettings(true);
  };

  const handleTest = async (): Promise<void> => {
    setFeedback({ kind: 'info', text: '正在测试连接…' });
    if (!(await saveSettings(false))) return;
    setIsTesting(true);
    try {
      const response = await sendExtensionMessage<null>({ type: MESSAGE_TYPES.TEST_API });
      setFeedback(response.ok
        ? { kind: 'success', text: '连接成功' }
        : { kind: 'error', text: response.error });
    } finally {
      setIsTesting(false);
    }
  };

  const addDomain = (kind: 'auto' | 'excluded'): void => {
    if (!settings) return;
    const hostname = normalizeHostname(domainInput);
    if (!hostname) {
      setFeedback({ kind: 'error', text: '请输入有效域名' });
      return;
    }
    setSettings((current) => current ? {
      ...current,
      autoTranslateSites: kind === 'auto'
        ? [...new Set([...current.autoTranslateSites, hostname])]
        : current.autoTranslateSites.filter((site) => site !== hostname),
      excludedSites: kind === 'excluded'
        ? [...new Set([...current.excludedSites, hostname])]
        : current.excludedSites.filter((site) => site !== hostname),
    } : current);
    setDomainInput('');
    setFeedback({ kind: 'info', text: '网站规则已修改，请保存设置' });
  };

  const handleClearCache = async (): Promise<void> => {
    if (!window.confirm('确定清空所有翻译缓存？此操作不可恢复。')) return;
    try {
      await clearTranslationCache();
      setCacheSize(0);
      setFeedback({ kind: 'success', text: '翻译缓存已清空' });
    } catch {
      setFeedback({ kind: 'error', text: '清空缓存失败，请稍后重试' });
    }
  };

  if (!settings) {
    return <main className="options"><p className="options__loading">正在读取本地设置…</p></main>;
  }

  return (
    <main className="options">
      <header className="options__header">
        <span className="options__badge">MVP · v0.1.0</span>
        <h1>DeepSeek Immersive Translator</h1>
        <p>网页文本会发送至 DeepSeek API；API Key 与翻译缓存保存在浏览器本地扩展存储中。</p>
      </header>

      <nav className="options__tabs" aria-label="设置分类">
        <a href="#general">常规</a><a href="#translation">翻译</a>
        <a href="#api">DeepSeek API</a><a href="#prompt">Prompt</a>
        <a href="#advanced">高级</a><a href="#sites">缓存 / 网站规则</a>
      </nav>

      <form onSubmit={handleSave}>
        <section className="options__card" id="general">
          <SectionTitle title="常规" description="控制网页内入口和选中文本翻译。" />
          <div className="options__fields">
            <CheckField label="启用悬浮球" checked={settings.floatingBall.enabled} onChange={(checked) => update('floatingBall', { ...settings.floatingBall, enabled: checked })} />
            <CheckField label="显示选中文本“译”按钮" checked={settings.selectionTranslation} onChange={(checked) => update('selectionTranslation', checked)} />
            <CheckField label="启用右键翻译" checked={settings.contextMenuTranslation} onChange={(checked) => update('contextMenuTranslation', checked)} />
            <NumberField label="悬浮球大小（px）" min={32} max={96} value={settings.floatingBall.size} onChange={(value) => update('floatingBall', { ...settings.floatingBall, size: value })} />
            <NumberField label="悬浮球透明度" min={0.2} max={1} step={0.05} value={settings.floatingBall.opacity} onChange={(value) => update('floatingBall', { ...settings.floatingBall, opacity: value })} />
          </div>
        </section>

        <section className="options__card" id="translation">
          <SectionTitle title="翻译" description="设置目标语言、显示方式和翻译风格。" />
          <div className="options__fields">
            <label className="options__field"><span>目标语言</span><select value={settings.targetLanguage} onChange={(event) => update('targetLanguage', event.target.value)}>{TARGET_LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="options__field"><span>默认显示模式</span><select value={settings.displayMode} onChange={(event) => update('displayMode', event.target.value as DisplayMode)}>{DISPLAY_MODES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="options__field"><span>翻译风格</span><select value={settings.translationStyle} onChange={(event) => update('translationStyle', event.target.value as TranslationStyle)}>{TRANSLATION_STYLES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
            <CheckField label="学术翻译模式" checked={settings.academicMode} onChange={(checked) => update('academicMode', checked)} />
            <CheckField label="保留重要英文术语" checked={settings.preserveEnglishTerms} onChange={(checked) => update('preserveEnglishTerms', checked)} />
          </div>
        </section>

        <section className="options__card" id="api">
          <SectionTitle title="DeepSeek API" description="请求只由扩展 Background Service Worker 发出。" />
          <div className="options__fields">
            <label className="options__field options__field--wide"><span>API Key</span><span className="options__secret-input"><input type={showApiKey ? 'text' : 'password'} value={settings.api.apiKey} onChange={(event) => updateApi('apiKey', event.target.value)} placeholder="sk-xxxxxxxx" autoComplete="new-password" spellCheck={false} /><button className="options__visibility-button" type="button" onClick={() => setShowApiKey((value) => !value)}>{showApiKey ? '隐藏' : '显示'}</button></span></label>
            <label className="options__field options__field--wide"><span>API Base URL</span><input type="url" value={settings.api.baseUrl} onChange={(event) => updateApi('baseUrl', event.target.value)} spellCheck={false} /><small>Manifest 当前仅预授权 DeepSeek 官方 API 域名。</small></label>
            <label className="options__field options__field--wide"><span>Model</span><input type="text" value={settings.api.model} onChange={(event) => updateApi('model', event.target.value)} spellCheck={false} /></label>
            <NumberField label="Temperature" min={0} max={2} step={0.1} value={settings.api.temperature} onChange={(value) => updateApi('temperature', value)} />
          </div>
        </section>

        <section className="options__card" id="prompt">
          <SectionTitle title="Prompt" description="可选偏好会附加到内置安全翻译指令，不替换 JSON 与 ID 映射约束。" />
          <label className="options__field options__field--wide"><span>自定义翻译偏好</span><textarea rows={5} value={settings.customPrompt ?? ''} onChange={(event) => update('customPrompt', event.target.value)} placeholder="例如：术语首次出现时保留英文。" maxLength={4000} /></label>
        </section>

        <section className="options__card" id="advanced">
          <SectionTitle title="高级" description="更高并发可能增加 API 限流与费用风险。" />
          <div className="options__fields">
            <NumberField label="Timeout（毫秒）" min={1} max={300_000} value={settings.api.timeout} onChange={(value) => updateApi('timeout', value)} />
            <NumberField label="最大并发请求数" min={1} max={10} value={settings.api.concurrency} onChange={(value) => updateApi('concurrency', value)} />
            <NumberField label="每批最大字符数" min={100} max={20_000} value={settings.batching.maxCharacters} onChange={(value) => update('batching', { ...settings.batching, maxCharacters: value })} />
            <NumberField label="每批最大项目数" min={1} max={100} value={settings.batching.maxItems} onChange={(value) => update('batching', { ...settings.batching, maxItems: value })} />
            <CheckField label="自动翻译动态内容" checked={settings.autoTranslateDynamicContent} onChange={(checked) => update('autoTranslateDynamicContent', checked)} hint="开启后，新加载的正文文本可能自动发送至 DeepSeek。" />
          </div>
        </section>

        <section className="options__card" id="sites">
          <SectionTitle title="缓存 / 网站规则" description="排除网站不会自动翻译；用户仍可手动翻译。" />
          <div className="options__fields">
            <CheckField label={`启用翻译缓存（${cacheSize} 条）`} checked={settings.translationCacheEnabled} onChange={(checked) => update('translationCacheEnabled', checked)} />
            <button className="options__button options__button--secondary" type="button" onClick={() => void handleClearCache()}>清空翻译缓存</button>
          </div>
          <div className="options__site-input"><input type="text" value={domainInput} placeholder="nature.com 或完整 URL" onChange={(event) => setDomainInput(event.target.value)} /><button type="button" onClick={() => addDomain('auto')}>添加到自动翻译</button><button type="button" onClick={() => addDomain('excluded')}>添加到排除</button></div>
          <div className="options__site-lists">
            <SiteList title="自动翻译网站" sites={settings.autoTranslateSites} onRemove={(site) => update('autoTranslateSites', settings.autoTranslateSites.filter((item) => item !== site))} />
            <SiteList title="排除网站" sites={settings.excludedSites} onRemove={(site) => update('excludedSites', settings.excludedSites.filter((item) => item !== site))} />
          </div>
        </section>

        {feedback && <div className={`options__feedback options__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</div>}
        <div className="options__actions">
          <button className="options__button options__button--secondary" type="button" disabled={isSaving || isTesting} onClick={() => void handleTest()}>{isTesting ? '测试中…' : '测试连接'}</button>
          <button className="options__button options__button--primary" type="submit" disabled={isSaving || isTesting}>{isSaving ? '保存中…' : '保存设置'}</button>
        </div>
      </form>
    </main>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div className="options__section-heading"><div><h2>{title}</h2><p>{description}</p></div></div>;
}

function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  return <label className="options__field"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{hint && <small>{hint}</small>}</label>;
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="options__field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SiteList({ title, sites, onRemove }: { title: string; sites: string[]; onRemove: (site: string) => void }) {
  return <div><strong>{title}</strong>{sites.length === 0 && <small>暂无</small>}{sites.map((site) => <span key={site}>{site}<button type="button" onClick={() => onRemove(site)}>删除</button></span>)}</div>;
}

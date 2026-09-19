import { useEffect, useState } from 'react';
import { sendExtensionMessage } from '../services/message';
import { MESSAGE_TYPES, type TranslationRuntimeConfig } from '../types/message';

export function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void sendExtensionMessage<TranslationRuntimeConfig>({
      type: MESSAGE_TYPES.GET_TRANSLATION_CONFIG,
    }).then((response) => {
      if (active) {
        setConfigured(response.ok ? response.data.apiConfigured : false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const openOptions = (): void => {
    void chrome.runtime.openOptionsPage().catch(() => undefined);
  };

  return (
    <main className="popup">
      <span className={`popup__status ${configured ? 'is-ready' : ''}`}>
        {configured === null
          ? '正在检查配置…'
          : configured
            ? 'API 已配置'
            : '需要配置 API Key'}
      </span>
      <h1>DeepSeek Immersive Translator</h1>
      <p>在普通网页右侧点击悬浮球，即可翻译当前页面、切换显示模式或管理本站规则。</p>
      {!configured && configured !== null && (
        <p className="popup__notice">首次使用请先在设置中填写并测试 DeepSeek API Key。</p>
      )}
      <button type="button" onClick={openOptions}>打开设置</button>
    </main>
  );
}

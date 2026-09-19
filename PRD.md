# DeepSeek 沉浸式网页翻译器 PRD

## 1. 项目名称

暂定名称：

**DeepSeek Immersive Translator**

中文名称可暂定为：

**DeepSeek 沉浸式翻译**

本项目是一个运行于 Chrome / Edge 浏览器中的扩展程序，通过 DeepSeek API 对网页内容进行翻译。

核心体验参考“沉浸式翻译”类插件，但本项目第一阶段仅使用 DeepSeek 作为翻译引擎。

---

## 2. 项目目标

开发一个浏览器扩展，实现：

1. 在网页右侧显示可拖动的悬浮球。
2. 点击悬浮球可以快速翻译当前网页。
3. 自动识别网页正文中的文本节点。
4. 将文本批量发送给 DeepSeek API。
5. 将翻译结果插入原文下方。
6. 支持“原文 + 译文”双语显示。
7. 支持只显示原文 / 双语 / 只显示译文。
8. 支持选中文本后快速翻译。
9. 用户自行填写 DeepSeek API Key。
10. API Key 保存在浏览器本地，不依赖开发者服务器。
11. 支持设置目标语言。
12. 支持自定义翻译 Prompt。
13. 支持常见网页、博客、论文、新闻页面。
14. 尽量保持原网页排版和样式不被破坏。
15. 翻译过程支持进度、停止、重试和错误提示。

第一阶段优先保证：

**稳定性 > 翻译覆盖率 > UI 美观 > 高级功能。**

---

## 3. 技术范围

### 3.1 浏览器

第一阶段支持：

- Google Chrome
- Microsoft Edge
- Chromium 系浏览器

暂不考虑：

- Firefox
- Safari

扩展必须使用：

**Chrome Extension Manifest V3**

---

## 4. 第一阶段技术架构

整体数据流：

```text
当前网页
   ↓
Content Script
   ↓
识别需要翻译的 DOM 文本
   ↓
文本过滤
   ↓
文本分组 / 批处理
   ↓
Background Service Worker
   ↓
DeepSeek API
   ↓
返回结构化翻译
   ↓
Content Script
   ↓
将译文插入对应原文节点下方
```

项目第一版：

```text
浏览器插件
    ↓
DeepSeek API
```

不开发独立服务器。

DeepSeek API Key 由用户自行提供。

---

## 5. 技术栈

优先使用：

```text
TypeScript
React
Vite
Chrome Extension Manifest V3
CSS Modules 或普通 CSS
Chrome Storage API
Fetch API
```

推荐：

```text
React + TypeScript + Vite
```

不建议第一版引入过多第三方 UI 框架。

如果需要 UI 组件，可以使用轻量组件库，但应优先保证：

- 打包体积小
- 样式隔离
- 不污染网页 CSS
- 不与目标网页冲突

悬浮球及插件面板推荐使用：

**Shadow DOM**

避免目标网页 CSS 影响插件 UI。

---

## 6. 项目目录结构

建议创建如下目录：

```text
deepseek-immersive-translator/

├── public/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│
├── src/
│
│   ├── background/
│   │   ├── index.ts
│   │   ├── deepseek.ts
│   │   ├── messageHandler.ts
│   │   └── rateLimiter.ts
│
│   ├── content/
│   │   ├── index.ts
│   │   ├── translator.ts
│   │   ├── domScanner.ts
│   │   ├── domFilter.ts
│   │   ├── textBatcher.ts
│   │   ├── renderer.ts
│   │   ├── observer.ts
│   │   └── selectionTranslator.ts
│
│   ├── floatingBall/
│   │   ├── FloatingBall.tsx
│   │   ├── FloatingMenu.tsx
│   │   └── floatingBall.css
│
│   ├── popup/
│   │   ├── App.tsx
│   │   └── popup.css
│
│   ├── options/
│   │   ├── App.tsx
│   │   ├── GeneralSettings.tsx
│   │   ├── ApiSettings.tsx
│   │   ├── TranslationSettings.tsx
│   │   ├── PromptSettings.tsx
│   │   └── options.css
│
│   ├── components/
│   │   ├── Toggle.tsx
│   │   ├── Select.tsx
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── ProgressBar.tsx
│
│   ├── services/
│   │   ├── storage.ts
│   │   ├── message.ts
│   │   └── config.ts
│
│   ├── types/
│   │   ├── translation.ts
│   │   ├── settings.ts
│   │   └── message.ts
│
│   └── utils/
│       ├── language.ts
│       ├── text.ts
│       ├── debounce.ts
│       └── logger.ts
│
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── .gitignore
```

---

## 7. 核心功能模块

### 7.1 悬浮球

网页加载完成后，在网页右侧显示悬浮球。

默认位置：

```text
right: 20px
top: 50%
```

悬浮球要求：

- 圆形
- 约 48px × 48px
- 始终位于网页内容之上
- `position: fixed`
- 高 z-index
- 支持拖动
- 拖动结束后保存位置
- 下次访问网站时恢复位置
- 不影响网页正常点击
- 支持隐藏

点击悬浮球后展开菜单。

菜单功能：

```text
翻译当前网页
暂停翻译
停止翻译
恢复原文
显示模式
选中文本翻译
设置
```

显示模式：

```text
双语
仅译文
仅原文
```

建议图标：

```text
文 / A
```

或者：

```text
译
```

---

### 7.2 当前网页翻译

点击：

```text
翻译当前网页
```

后执行以下流程：

```text
扫描 DOM
↓
过滤无效节点
↓
提取文本
↓
生成节点 ID
↓
批量发送 DeepSeek
↓
获取翻译
↓
按 ID 对应
↓
插入译文
```

翻译过程中悬浮球需要显示状态。

例如：

```text
准备中
翻译中 23%
翻译中 61%
完成
```

---

## 8. DOM 文本识别

这是整个项目最核心的模块之一。

实现：

```text
domScanner.ts
```

需要遍历：

```text
document.body
```

找到适合翻译的文本。

重点关注：

```html
<p>
<h1>
<h2>
<h3>
<h4>
<h5>
<h6>
<li>
<blockquote>
<td>
<th>
<figcaption>
<div>
<span>
```

但不能简单翻译所有 `div` 和 `span`。

必须根据文本长度和 DOM 层级判断。

---

## 9. 必须排除的 DOM

不翻译：

```html
<script>
<style>
<code>
<pre>
<textarea>
<input>
<select>
<option>
<button>
<svg>
<canvas>
<math>
<noscript>
```

另外排除：

```text
导航菜单
网页按钮
URL
纯数字
时间
代码
文件名
邮箱地址
非常短的字符
```

默认文本最小长度：

```text
2 个字符
```

英文建议：

```text
至少包含 2 个字母
```

避免翻译：

```text
2026
https://...
user@example.com
Ctrl+C
```

---

## 10. 文本节点模型

内部统一使用：

```ts
interface TranslationNode {
  id: string;
  element: HTMLElement;
  originalText: string;
  translatedText?: string;
  status: 'pending' | 'translating' | 'translated' | 'failed';
}
```

不能依赖数组顺序匹配翻译。

必须使用唯一 ID。

例如：

```text
ds-node-000001
ds-node-000002
ds-node-000003
```

---

## 11. 批量翻译策略

严禁：

```text
一个段落 = 一个 API 请求
```

否则：

- 请求过多
- API 成本增加
- 翻译速度慢
- 容易触发限流

需要开发：

```text
textBatcher.ts
```

将多个段落合并为一个请求。

推荐每批：

```text
10–30 个文本节点
```

同时限制：

```text
最大字符数
最大 token 估算
```

推荐初始值：

```text
MAX_BATCH_CHARACTERS = 6000
MAX_BATCH_ITEMS = 20
```

必须可配置。

---

## 12. DeepSeek 返回格式

禁止让模型自由返回 Markdown。

要求 DeepSeek 返回 JSON。

发送：

```json
{
  "items": [
    {
      "id": "ds-node-000001",
      "text": "..."
    },
    {
      "id": "ds-node-000002",
      "text": "..."
    }
  ]
}
```

Prompt 要求返回：

```json
{
  "translations": [
    {
      "id": "ds-node-000001",
      "translation": "..."
    },
    {
      "id": "ds-node-000002",
      "translation": "..."
    }
  ]
}
```

使用 ID 进行映射。

如果 JSON 解析失败：

自动重试一次。

---

## 13. DeepSeek API 模块

创建：

```text
deepseek.ts
```

统一封装 API 调用。

示例接口：

```ts
interface DeepSeekRequest {
  apiKey: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  texts: TranslationRequestItem[];
  prompt?: string;
}
```

不得在多个文件中重复写 API 请求代码。

统一由：

```text
background service worker
```

调用 DeepSeek API。

Content Script 不直接管理 API Key。

---

## 14. API Key 管理

设置页面包含：

```text
DeepSeek API Key
```

输入框：

```text
sk-xxxxxxxx
```

默认使用 password 类型。

提供：

```text
显示 / 隐藏
```

按钮。

保存到：

```text
chrome.storage.local
```

禁止：

- 写死在源码
- 上传 Git
- 打印到 console
- 放到 URL
- 放进 DOM

---

## 15. API 测试

设置页面增加：

```text
测试连接
```

点击后：

发送极小测试请求。

成功显示：

```text
连接成功
```

失败显示具体错误：

```text
API Key 无效
网络错误
请求超时
余额不足
接口响应异常
```

---

## 16. 翻译 Prompt

默认 Prompt：

```text
You are a professional translation engine.

Translate the provided text into {{targetLanguage}}.

Requirements:

1. Preserve the original meaning accurately.
2. Do not summarize.
3. Do not explain.
4. Preserve technical terminology.
5. Preserve numbers, units, references and symbols.
6. For academic text, use professional academic terminology.
7. Do not translate URLs, code, formulas or citation numbers.
8. Return valid JSON only.
9. Do not add Markdown formatting.
10. Keep each translation associated with its original id.
```

用户可以在设置中：

```text
恢复默认 Prompt
编辑 Prompt
```

---

## 17. 翻译风格

设置：

```text
通用
自然
学术
直译
专业
```

第一版可以通过不同 Prompt 实现。

---

## 18. 学术翻译模式

考虑到该插件的重要使用场景包括论文阅读，增加：

```text
学术翻译模式
```

启用后 Prompt 要求：

```text
保留专业术语
保持学术表达
不得主动简化概念
不得删除限定词
保留缩写
首次出现的专业名词可以保留英文
```

例如：

```text
phosphorus limitation
```

翻译：

```text
磷限制（phosphorus limitation）
```

该选项允许用户控制：

```text
保留英文术语：开启 / 关闭
```

---

## 19. 翻译显示方式

支持三种模式。

### 模式 1：双语

```text
Original paragraph.

翻译后的中文内容。
```

### 模式 2：仅译文

隐藏原文。

### 模式 3：仅原文

隐藏译文。

---

## 20. 译文样式

默认：

```css
.ds-translation {
  margin-top: 6px;
  opacity: 0.88;
  line-height: 1.6;
}
```

不要强制：

```text
字号
字体
背景色
```

尽量继承网页原有风格。

允许设置：

```text
译文字号
译文透明度
译文颜色
译文间距
```

---

## 21. 防止重复翻译

已经翻译的节点添加：

```html
data-deepseek-translated="true"
```

对应译文：

```html
<div
  class="ds-translation"
  data-ds-source-id="ds-node-000001"
>
```

再次点击：

```text
翻译网页
```

时不得重复翻译。

---

## 22. 恢复原文

点击：

```text
恢复原文
```

行为：

```text
删除全部 .ds-translation
恢复被隐藏的原文
清除翻译状态
```

不得：

```text
刷新网页
```

---

## 23. 动态网页支持

很多网页是：

```text
React
Vue
Next.js
无限滚动
```

因此需要：

```text
MutationObserver
```

监听 DOM 新增内容。

开发：

```text
observer.ts
```

当开启：

```text
自动翻译动态内容
```

时：

```text
新出现文本
↓
检测
↓
过滤
↓
加入翻译队列
↓
DeepSeek
↓
显示译文
```

必须防抖。

推荐：

```text
500–1000 ms
```

避免 DOM 每次变化都触发翻译。

---

## 24. 选中文本翻译

用户鼠标选中网页文字后：

在选中文本附近显示小按钮：

```text
译
```

点击后显示浮动翻译窗口。

内容：

```text
原文

────────

译文
```

提供：

```text
复制译文
关闭
```

不要修改网页 DOM 正文。

---

## 25. 右键菜单

Chrome contextMenus 增加：

```text
使用 DeepSeek 翻译
```

用户选中文字后：

```text
右键
→ 使用 DeepSeek 翻译
```

调用相同的选中文本翻译模块。

---

## 26. 自动语言识别

设置：

```text
源语言：自动检测
```

目标语言默认：

```text
简体中文
```

支持：

```text
简体中文
繁体中文
English
日本語
한국어
Deutsch
Français
Español
Português
Русский
```

语言配置必须可扩展。

---

## 27. Popup 页面

点击浏览器工具栏扩展图标后显示 Popup。

建议尺寸：

```text
320 × 420
```

内容：

```text
DeepSeek Translator

当前网站：
example.com

[翻译当前网页]

翻译状态：
未翻译 / 翻译中 / 已完成

显示模式：
○ 双语
○ 译文
○ 原文

目标语言：
简体中文

自动翻译本站：
开 / 关

────────

⚙ 设置
```

---

## 28. 设置页面

Options Page 分为：

```text
常规
翻译
DeepSeek API
Prompt
高级
```

---

## 29. 常规设置

包括：

```text
启用悬浮球
悬浮球大小
悬浮球透明度
悬浮球位置
启用选中文字翻译
启用右键翻译
```

---

## 30. 翻译设置

包括：

```text
目标语言
默认翻译模式
翻译风格
学术翻译
保留专业英文术语
自动翻译动态内容
```

---

## 31. DeepSeek 设置

包括：

```text
API Key
API Base URL
Model
Temperature
Timeout
最大并发请求数
每批最大字符数
```

默认：

```text
Temperature = 0.2
Timeout = 60000ms
Concurrency = 2
```

Model 不要在业务代码中写死。

应该定义为：

```text
可配置字段
```

方便未来 DeepSeek 模型变化。

---

## 32. 自定义 API Base URL

允许设置：

```text
API Base URL
```

这样未来可以：

```text
DeepSeek 官方
兼容代理
本地 API
```

默认填写 DeepSeek 官方接口地址。

所有请求必须通过配置读取，不要硬编码在多个地方。

---

## 33. 网站级设置

允许：

```text
永不翻译此网站
自动翻译此网站
```

保存 domain。

例如：

```json
{
  "autoTranslateSites": [
    "nature.com",
    "sciencedirect.com"
  ],
  "excludedSites": [
    "github.com"
  ]
}
```

---

## 34. 翻译状态管理

定义：

```ts
type TranslationStatus =
  | 'idle'
  | 'scanning'
  | 'translating'
  | 'paused'
  | 'completed'
  | 'error';
```

需要记录：

```text
总段落
已完成
失败数量
当前进度
```

进度：

```text
completed / total
```

---

## 35. 暂停功能

点击：

```text
暂停
```

要求：

已经发送的请求可以完成。

但是：

```text
不要发送新的翻译请求
```

状态：

```text
paused
```

点击：

```text
继续
```

恢复队列。

---

## 36. 停止功能

点击：

```text
停止
```

需要：

```text
取消剩余队列
停止新请求
AbortController 取消可取消请求
```

已生成译文保留。

---

## 37. 错误重试

请求失败：

第一次：

```text
1 秒后重试
```

第二次：

```text
3 秒
```

第三次：

```text
停止重试
```

单个 batch 最大：

```text
3 次
```

采用简单指数退避。

---

## 38. 请求限流

开发：

```text
rateLimiter.ts
```

支持：

```text
最大并发请求数
请求间隔
```

默认：

```text
CONCURRENCY = 2
```

不得一次发送几十个 API 请求。

---

## 39. 缓存

第一版建议加入简单缓存。

Key：

```text
hash(originalText + targetLanguage + translationStyle)
```

Value：

```text
translation
```

优先存：

```text
chrome.storage.local
```

限制缓存条目数量。

例如：

```text
最多 5000 条
```

采用：

```text
LRU 或简单时间淘汰
```

这样同一文本无需重复消耗 API。

---

## 40. 消息通信

Content Script 不直接调用所有后台逻辑。

使用：

```text
chrome.runtime.sendMessage()
```

消息类型：

```ts
TRANSLATE_BATCH
TEST_API
GET_SETTINGS
UPDATE_SETTINGS
TRANSLATION_PROGRESS
STOP_TRANSLATION
```

定义统一类型。

不要在代码中大量使用魔法字符串。

---

## 41. 安全要求

### API Key

不得：

```text
console.log(apiKey)
```

不得：

```text
写入 DOM
```

不得：

```text
拼接到 URL
```

### XSS

DeepSeek 返回文本不得使用：

```ts
innerHTML = translation
```

必须使用：

```ts
textContent
```

或者安全 React rendering。

---

## 42. Content Security Policy

Manifest V3 遵循 CSP。

不要：

```text
eval()
new Function()
远程执行 JS
```

---

## 43. 性能要求

网页：

```text
1000+ 文本节点
```

时不能直接同步处理所有 DOM。

DOM 扫描应避免明显卡顿。

必要时：

```text
分批处理
requestIdleCallback
```

或者：

```text
setTimeout chunk
```

---

## 44. 长页面处理

例如：

```text
论文
Wikipedia
新闻专题
```

可能有大量文本。

不要一次把整个网页发送给 DeepSeek。

必须：

```text
扫描
↓
分批
↓
队列
↓
逐批翻译
```

---

## 45. 可视区域优先

第二阶段前即可考虑：

优先翻译：

```text
当前 viewport
```

然后：

```text
上下附近
```

最后：

```text
网页剩余部分
```

推荐使用：

```text
IntersectionObserver
```

第一版如果复杂，可以暂不实现。

但代码架构需要允许未来添加。

---

## 46. 页面内链接和按钮处理

不能翻译：

```text
纯菜单按钮
工具栏图标
输入框 placeholder
```

第一版不翻译：

```text
placeholder
title
alt
aria-label
```

后期再加入 UI 文本翻译。

---

## 47. Markdown 和代码

如果网页中出现：

```text
代码
JSON
Python
JavaScript
SQL
Shell
```

不要翻译。

判断方式：

```html
<code>
<pre>
```

以及常见代码编辑器 class。

---

## 48. 公式

MathJax / KaTeX：

不得翻译公式内容。

排除：

```text
mjx-container
.katex
.MathJax
```

---

## 49. PDF

第一版本：

**不要求支持浏览器原生 PDF 阅读器。**

README 中注明：

```text
PDF 翻译将在后续版本实现。
```

第二阶段考虑：

```text
PDF.js
```

---

## 50. iframe

第一版：

不强制处理跨域 iframe。

同源 iframe 可以尝试处理。

避免因为 iframe 导致扩展报错。

---

## 51. 翻译结果准确映射

这是强制要求。

禁止：

```text
根据数组顺序盲目对应
```

必须：

```text
ID → Translation
```

即使 DeepSeek 少返回一项，也不能错位。

---

## 52. JSON 修复

DeepSeek 可能偶尔返回带 Markdown fence 的 JSON。

需要：

```text
清除 Markdown fence
```

再尝试解析。

但不要设计复杂的 AI JSON 修复器。

解析失败：

```text
重试请求
```

---

## 53. 通知系统

使用 Toast。

例如：

```text
开始翻译
翻译完成
API Key 未配置
API 请求失败
已暂停
已停止
```

Toast 自动消失：

```text
2–4 秒
```

重大错误持续显示。

---

## 54. 日志系统

开发环境：

```text
debug
info
warn
error
```

生产环境：

避免输出敏感信息。

禁止记录：

```text
API Key
完整请求 Authorization Header
```

---

## 55. 设置数据结构

建议：

```ts
interface AppSettings {
  enabled: boolean;

  targetLanguage: string;

  displayMode:
    | 'bilingual'
    | 'translation-only'
    | 'original-only';

  translationStyle:
    | 'general'
    | 'natural'
    | 'academic'
    | 'literal'
    | 'professional';

  academicMode: boolean;

  preserveEnglishTerms: boolean;

  api: {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    timeout: number;
    concurrency: number;
  };

  batching: {
    maxCharacters: number;
    maxItems: number;
  };

  floatingBall: {
    enabled: boolean;
    size: number;
    opacity: number;
    x?: number;
    y?: number;
  };

  selectionTranslation: boolean;

  autoTranslateDynamicContent: boolean;

  autoTranslateSites: string[];

  excludedSites: string[];

  customPrompt?: string;
}
```

---

## 56. 默认设置

建议：

```text
enabled = true

targetLanguage = zh-CN

displayMode = bilingual

translationStyle = general

academicMode = false

preserveEnglishTerms = false

floatingBall.enabled = true

selectionTranslation = true

autoTranslateDynamicContent = false

maxItems = 20

maxCharacters = 6000

concurrency = 2

temperature = 0.2
```

---

## 57. manifest.json 权限

遵循最小权限原则。

预计需要：

```json
{
  "permissions": [
    "storage",
    "contextMenus"
  ]
}
```

以及必要的：

```text
host_permissions
```

DeepSeek API 域名。

Content Script：

```text
http://*/*
https://*/*
```

如果 Chrome Web Store 发布前需要减少权限，应进一步优化。

---

## 58. 页面生命周期

进入页面：

```text
content script 初始化
↓
读取设置
↓
检查 excludedSites
↓
初始化悬浮球
↓
初始化 selection listener
↓
如果网站设置 autoTranslate
↓
自动翻译
```

---

## 59. 翻译流程

完整流程：

```text
用户点击翻译

↓

检查 API Key

↓

扫描 DOM

↓

过滤 DOM

↓

生成 TranslationNode

↓

检查缓存

↓

缓存存在
→ 直接显示

缓存不存在
→ 加入待翻译队列

↓

批处理

↓

DeepSeek API

↓

验证 JSON

↓

ID 映射

↓

写入缓存

↓

插入 DOM

↓

更新进度

↓

完成
```

---

## 60. UI 风格

整体风格：

```text
简洁
现代
轻量
接近浏览器原生工具
```

不要设计成复杂 SaaS Dashboard。

推荐：

```text
圆角：10–14px
阴影：轻量
动画：150–200ms
```

支持：

```text
Light
Dark
Auto
```

如果第一版开发量较大：

Dark Mode 可放到第二阶段。

---

## 61. 悬浮菜单设计

点击悬浮球：

```text
┌─────────────────────┐
│ DeepSeek 翻译       │
├─────────────────────┤
│ ▶ 翻译当前页面      │
│ ⏸ 暂停              │
│ ⏹ 停止              │
│ ↻ 恢复原文          │
├─────────────────────┤
│ 显示：双语          │
│ 目标：简体中文      │
├─────────────────────┤
│ ⚙ 设置              │
└─────────────────────┘
```

---

## 62. 首次使用

用户第一次安装：

打开欢迎页。

显示：

```text
欢迎使用 DeepSeek Translator

本插件使用您自己的 DeepSeek API Key 进行翻译。

您的 API Key 仅保存在浏览器本地。

[配置 API Key]
```

如果 API Key 为空：

用户点击翻译时：

```text
尚未配置 DeepSeek API Key
```

按钮：

```text
立即设置
```

---

## 63. Git 和环境变量

项目必须包含：

```text
.gitignore
```

禁止提交：

```text
.env
API Key
dist/
node_modules/
```

但由于 API Key 由用户输入：

项目源码不应该依赖开发者 `.env` API Key。

---

## 64. 开发脚本

package.json 至少包括：

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
```

如果加入测试：

```bash
npm run test
```

---

## 65. Build 输出

构建：

```text
dist/
```

该目录可以直接：

```text
Chrome
→ 扩展程序
→ 开发者模式
→ 加载已解压的扩展程序
→ dist
```

---

## 66. README

必须写完整 README。

至少包括：

```text
项目介绍
功能
截图位置
安装方法
本地开发
构建
如何获取 DeepSeek API Key
如何配置 API
项目结构
权限说明
隐私说明
常见问题
```

---

## 67. 第一阶段 MVP 功能

第一阶段必须完成：

- Manifest V3
- Chrome / Edge
- DeepSeek API
- API Key 设置
- API 测试
- 悬浮球
- 悬浮菜单
- 当前网页翻译
- DOM 文本识别
- DOM 文本过滤
- 批量翻译
- 双语模式
- 仅译文
- 仅原文
- 恢复原文
- 翻译进度
- 暂停
- 停止
- 错误重试
- 选中文本翻译
- 右键翻译
- 目标语言选择
- 学术翻译模式
- 自定义 Prompt
- 基础翻译缓存
- 网站排除
- 自动翻译指定网站
- README

---

## 68. 第二阶段功能

暂不实现，但代码架构需要保留扩展空间：

```text
PDF 翻译
字幕翻译
YouTube 字幕翻译
输入框翻译
鼠标悬停翻译
术语表
用户自定义词典
按网站保存 Prompt
OpenAI / Claude / Gemini 等其他翻译引擎
OCR 图片翻译
截图翻译
导出双语网页
翻译历史
翻译统计
API Token 使用统计
网页正文智能识别
可视区域优先翻译
快捷键
多 API Key
```

本项目当前要求：

**翻译引擎只实现 DeepSeek。**

不要提前开发其他模型。

---

## 69. 测试网站

至少在以下类型网站测试：

### 普通文章

```text
Wikipedia
Medium 类博客
```

### 新闻

```text
BBC 类页面
Reuters 类页面
```

### 学术

```text
Nature
ScienceDirect
PubMed
PMC
```

### 技术文档

```text
GitHub README
MDN
```

注意：

GitHub 代码块不得翻译。

---

## 70. 测试项目

### DOM

- 是否翻译正文
- 是否跳过代码
- 是否跳过公式
- 是否重复翻译
- 动态加载是否正常

### API

- 正常 Key
- 错误 Key
- 无 Key
- 网络断开
- 超时
- JSON 异常
- API 429
- API 500

### UI

- 悬浮球拖动
- 页面缩放
- 全屏
- 长页面
- 深色网页
- 高 z-index 网页

---

## 71. 验收标准

一个英文网页打开后：

点击：

```text
悬浮球
→ 翻译当前页面
```

必须达到：

1. 网页正文能够被识别。
2. 不翻译代码。
3. 不翻译公式。
4. 多个段落批量调用 API。
5. 翻译结果正确插入对应原文下方。
6. 不出现段落译文错位。
7. 页面排版基本不被破坏。
8. 能看到翻译进度。
9. 可以暂停。
10. 可以停止。
11. 可以恢复原文。
12. 可以切换双语 / 译文 / 原文。
13. API Key 不暴露在页面。
14. 刷新网页后插件可正常重新运行。
15. 浏览器重新启动后设置仍然存在。

---

## 72. 性能验收

普通文章：

```text
100 段
```

不能产生：

```text
100 个 API 请求
```

应该批处理。

例如：

```text
100 段
≈ 5–10 个 API 请求
```

具体数量视文本长度决定。

---

## 73. 稳定性验收

API 某一批翻译失败：

不得导致：

```text
整个网页翻译崩溃
```

应该：

```text
记录该批失败
继续其他 batch
```

最终提示：

```text
翻译完成

成功：93
失败：7

[重试失败内容]
```

---

## 74. Codex 开发执行顺序

请严格按以下阶段开发。

### Phase 1

项目骨架：

```text
Vite
React
TypeScript
Manifest V3
Popup
Options
Content Script
Background
```

确保扩展可以正常安装。

### Phase 2

实现：

```text
Chrome Storage
Settings
API Key
API Test
DeepSeek Client
```

### Phase 3

实现：

```text
DOM Scanner
DOM Filter
TranslationNode
TextBatcher
```

先在 console 验证节点提取。

### Phase 4

实现：

```text
Translation Queue
DeepSeek Request
JSON Parsing
ID Mapping
```

### Phase 5

实现：

```text
Translation Renderer
Bilingual Mode
Translation Only
Original Only
Restore
```

### Phase 6

实现：

```text
Floating Ball
Floating Menu
Progress
Pause
Stop
```

### Phase 7

实现：

```text
Selection Translation
Context Menu
```

### Phase 8

实现：

```text
Cache
Site Settings
Dynamic DOM Observer
```

### Phase 9

进行：

```text
错误处理
性能优化
安全检查
UI 优化
README
```

---

## 75. Codex 开发约束

开发过程中遵循：

1. 不要一次写完整项目然后才测试。
2. 每个 Phase 完成后确保可以运行。
3. 保持 TypeScript 类型完整。
4. 尽量避免 `any`。
5. 不允许 API Key 写死。
6. 不允许使用 innerHTML 插入 DeepSeek 内容。
7. 不允许一个文本节点发送一次请求。
8. 不允许依赖 DeepSeek 返回数组顺序。
9. 所有节点必须通过 ID 映射。
10. 所有错误必须捕获。
11. 所有网络请求必须支持 timeout。
12. 翻译任务必须允许停止。
13. 页面 DOM 操作必须尽量低侵入。
14. 插件 CSS 不得污染宿主网页。
15. 优先使用 Shadow DOM 隔离插件 UI。

---

## 76. Codex 每阶段输出要求

每完成一个 Phase：

先说明：

```text
本阶段完成内容
修改文件
核心实现
如何测试
仍存在的问题
下一阶段计划
```

然后再进入下一 Phase。

如果发现原架构存在问题：

可以调整架构。

但必须说明调整原因。

---

## 77. 第一版暂不实现

Codex 不要擅自增加：

```text
登录系统
会员系统
支付
服务器
数据库
云同步
团队协作
其他 AI 模型
OCR
PDF Parser
复杂用户账户系统
```

保持 MVP 简洁。

---

## 78. 最终交付标准

最终项目必须能够：

```bash
git clone ...
npm install
npm run build
```

然后：

```text
Chrome
→ chrome://extensions
→ 开发者模式
→ 加载已解压扩展
→ dist
```

完成安装。

配置 DeepSeek API Key 后：

能够在英文网页上实现：

```text
一键双语翻译。
```

---

## 79. 最终用户体验

最终希望实现的操作：

```text
打开英文论文
       ↓
点击右侧 DeepSeek 悬浮球
       ↓
点击“翻译当前网页”
       ↓
插件自动识别正文
       ↓
分批调用 DeepSeek
       ↓
英文下方出现中文
       ↓
继续滚动阅读
```

目标不是把网页完全重写。

而是在尽量保留网页原始结构的情况下：

**为原网页增加一层流畅、稳定、低干扰的 DeepSeek 双语翻译能力。**

---

## 80. 给 Codex 的启动指令

请先完整阅读本 PRD，不要一次性实现全部功能。

从 **Phase 1** 开始执行。每完成一个 Phase 后：

1. 自行运行构建。
2. 执行类型检查。
3. 修复当前阶段出现的错误。
4. 说明本阶段完成内容和修改文件。
5. 说明如何测试。
6. 记录仍存在的问题。
7. 再继续下一阶段。

如果实际开发过程中发现本 PRD 中的架构存在明显问题，可以调整，但需要：

- 说明调整原因；
- 保持 MVP 范围不膨胀；
- 不引入不必要的后端服务；
- 不加入 DeepSeek 之外的翻译引擎；
- 优先保证网页翻译核心链路稳定可用。

核心链路优先级最高：

```text
DOM 识别
→ 文本过滤
→ 文本批处理
→ DeepSeek API
→ ID 映射
→ 双语 DOM 插入
```

# DeepSeek Immersive Translator

DeepSeek Immersive Translator 是一个基于 DeepSeek API 的 Chrome / Edge Manifest V3 网页翻译扩展。它识别网页正文、批量请求翻译，并尽量在不破坏原页面结构的前提下插入译文。用户提供自己的 API Key；项目不包含开发者后端、账号系统或数据库。

当前版本：`0.1.0`（MVP）

本项目采用 [MIT License](LICENSE)，允许使用、修改及商业分发，请保留版权和许可声明。这是非官方社区项目，与 DeepSeek、Chrome 或 Microsoft Edge 无隶属或背书关系。

[安装与更新说明](docs/INSTALL.md) · [隐私说明](PRIVACY.md) · [安全报告](SECURITY.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

## 核心功能

- 网页双语、仅译文、仅原文显示，以及不刷新页面的恢复原文
- Shadow DOM 隔离的可拖动悬浮球、进度、暂停、继续和停止
- 选中文本按钮翻译、复制译文和右键菜单翻译
- 基于节点 ID 的 JSON 响应映射，避免译文按数组位置错配
- 文本批处理、有限并发、超时、有限重试和 429/5xx 退避
- 本地翻译缓存、LRU 淘汰、缓存清理
- 网站自动翻译、网站排除规则、动态内容增量翻译和基础 SPA 导航适配
- 通用、自然、学术、直译、专业风格，以及学术模式和自定义 Prompt

## 截图

截图尚未随仓库提供。建议在正式发布前补充悬浮菜单、双语网页和设置页截图。

## 技术栈

- React 19、TypeScript（strict）、Vite 7
- Chrome Extension Manifest V3
- Chrome Storage、Runtime Messaging、Context Menus
- Fetch + AbortController
- Node test runner + happy-dom、ESLint

## Windows 安装与构建

需要 Node.js 22.18 或更高版本及 npm。

```powershell
npm ci
npm run build
```

构建结果在 `dist/`，该目录可直接作为“已解压的扩展程序”加载。`package-lock.json` 已纳入项目，用于可复现安装。

### Chrome

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择本项目的 `dist/` 目录。

### Microsoft Edge

1. 打开 `edge://extensions`。
2. 开启“开发人员模式”。
3. 选择“加载解压缩的扩展”。
4. 选择本项目的 `dist/` 目录。

修改代码后重新运行 `npm run build`，再在扩展管理页点击“重新加载”。旧页面通常也需要刷新，才能使用新的 Content Script。

## 本地开发

```powershell
npm run dev
npm run build
npm run typecheck
npm run lint
npm run test
```

`npm run build:debug` 可生成开发调试构建到 `dist-debug/`。生产构建未启用 source map。`npm run icons` 可重新生成 16/32/48/128 像素的 MVP 占位图标。

## 配置 DeepSeek API

1. 自行从 DeepSeek 官方渠道申请 API Key。
2. 点击扩展图标并打开设置。
3. 填写 API Key、API Base URL 和 Model。
4. 点击“测试连接”；看到“连接成功”后保存设置。

默认 Base URL 为 `https://api.deepseek.com`，默认模型为 `deepseek-flash`。模型名称是设置项，不散落在业务代码中。示例 Key 只能写成 `sk-xxxxxxxx`，不要把真实 Key 放进源码、日志或问题报告。

翻译请求会明确关闭 DeepSeek Flash 的思考模式，避免推理 token 挤占结构化译文输出，并让 Temperature 设置按非思考模式生效。

Manifest 和客户端均只允许 `https://api.deepseek.com` 官方 API，拒绝 HTTP、其他域名、URL 内凭据及重定向。Base URL 可配置官方域名下的路径，不支持代理或本地 API。

## 使用方法

```text
安装扩展 → 配置并测试 API Key → 打开普通网页
→ 点击右侧悬浮球 → 翻译当前网页
```

悬浮菜单可暂停、继续、停止、恢复原文、切换显示模式，以及设置当前网站为默认、自动翻译或排除。排除规则仅阻止自动翻译，用户仍可手动翻译。

选中文本后点击附近的“译”按钮，或在选区上使用“使用 DeepSeek 翻译”右键菜单。停止整页翻译不会禁用选中文本翻译。

## 设置说明

- 常规：悬浮球、选中文本入口、右键菜单
- 翻译：目标语言、显示模式、风格、学术模式、英文术语保留
- DeepSeek API：Key、Base URL、Model、Temperature
- Prompt：附加用户偏好；内置 JSON 和 ID 安全约束始终保留
- 高级：Timeout、并发、批大小、动态内容翻译
- 缓存 / 网站规则：缓存开关与清理、自动翻译和排除域名

动态内容翻译默认关闭。开启后，无限滚动或 SPA 后续加载的正文可能自动发送到 DeepSeek，并可能产生额外 API 费用。

## 缓存

缓存存放在 `chrome.storage.local` 的独立 `translationCache` 命名空间。Key 包含原文、目标语言、翻译风格、学术模式、英文术语选项、默认 Prompt 版本及自定义 Prompt，且不包含 API Key。

缓存最多保留 5000 条；超出后按 `lastAccessedAt` 一次淘汰一批较旧条目。单条超长文本不会缓存。缓存读写失败只会降低复用率，不应阻断当前译文显示。“清空翻译缓存”只删除缓存，不删除 API Key、设置、网站规则或悬浮球位置。

## 权限说明

- `storage`：保存用户设置、API Key、悬浮球位置、网站规则和翻译缓存。
- `contextMenus`：为选中文本添加 DeepSeek 翻译菜单。
- `https://api.deepseek.com/*`：由 Background Service Worker 调用 DeepSeek API。
- `http://*/*`、`https://*/*` Content Script 匹配：在普通网页识别正文并显示悬浮 UI/译文。

扩展未申请 `tabs`、`history`、`downloads`、`bookmarks`、`cookies` 或 `webRequest` 权限。

## 隐私与安全

- 需要翻译的网页正文或选中文本会发送给用户配置的 DeepSeek API。
- API Key 保存在浏览器扩展自己的 `chrome.storage.local` 中，并只由 Options Page 经扩展消息保存、由 Background Service Worker 发起请求时使用。
- API Key 不会加入缓存 Key、请求 URL、网页 Content Script 配置、译文 DOM 或日志。
- 翻译缓存保存在浏览器本地；项目当前没有开发者后端、数据库、账号或云同步。
- DeepSeek 返回内容通过 `textContent` 或 React 普通文本渲染，不作为 HTML 执行。
- Chrome Storage 是本地扩展存储，不等同于硬件密钥库；请保护浏览器账户和设备，不要声称其“绝对安全”。
- 本地存储仅限扩展可信上下文；网页内容脚本的缓存请求经后台处理，更新网页显示设置的响应不包含 API Key。完整设置和 API 测试仅允许扩展设置页调用。
- 缓存可能包含敏感原文和译文；关闭缓存不会删除旧条目，需要另行清空。详细数据流、费用、删除方式见 [隐私说明](PRIVACY.md)。

## 项目结构

```text
public/manifest.json       Manifest V3、Content Script 与权限
public/icons/              16/32/48/128 图标
src/background/            DeepSeek Client、消息处理、右键菜单、JSON 解析
src/content/               Scanner、Filter、Batcher、Queue、Controller、Renderer、Observer
src/floatingBall/          Shadow DOM 悬浮球与选区 UI
src/options/               完整设置页面
src/popup/                 工具栏 Popup
src/services/              设置存储、缓存、网站规则、消息封装
src/types/                 Settings、Message、Translation 类型
tests/                     单元、集成、安全、兼容性与性能回归测试
scripts/generate-icons.mjs 可复现图标生成脚本
docs/FINAL_REPORT.md       Phase 9 最终开发与验收报告
```

## 常见问题

### 点击翻译后提示配置 API Key

打开设置，填写 API Key 并先运行“测试连接”。自动翻译站点缺少 Key 时，每个页面会提示一次，不会循环请求。

### 401 / 403、429 或超时

- 401 / 403：检查 Key 是否有效及是否有权限。
- 429：降低并发、稍后重试，并检查配额。
- 超时：检查网络，或适度提高 Timeout。
- 5xx：DeepSeek 服务可能暂时不可用。

### 为什么某些内容没有翻译

代码、公式、导航、按钮、URL、数字、输入控件、过短文本和扩展自身 UI 会被过滤。复杂交互节点在“仅译文”模式下可能仍保留原文，以避免破坏网页。

### 为什么 Chrome 内置页没有悬浮球

浏览器禁止扩展向 `chrome://`、`edge://` 和部分商店/受保护页面注入 Content Script，这是预期行为。右键菜单在无法显示结果时会安全停止，不发送翻译请求。

## 已知限制

- 浏览器原生 PDF、OCR、图片翻译和视频/YouTube 字幕暂不支持。
- Chrome/Edge 内置页面和商店页面无法注入。
- 跨域 iframe 支持有限；MVP 只在顶层页面初始化。
- 高度复杂或频繁重绘的 Web App 可能存在正文识别、节点替换或布局兼容差异。
- SPA 仅做基础的 `pushState`、`replaceState`、`popstate` 和 `hashchange` 适配。
- 自定义 API Base URL 仅支持官方 DeepSeek HTTPS 域名下的路径。
- 当前图标是项目内生成的 MVP 占位设计，正式商店发布前建议进行品牌设计。

## 路线图（不属于当前 MVP）

后续版本可评估 PDF、OCR、图片翻译、视频字幕、术语表、翻译历史、可视区域优先、快捷键及更多兼容性优化。当前版本不包含云同步、用户账户、支付、后端服务器、数据库或其他 AI 提供商。

## 验收报告

本地自动化、性能、安全审计、浏览器手工验证边界和已知问题见 [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md)。

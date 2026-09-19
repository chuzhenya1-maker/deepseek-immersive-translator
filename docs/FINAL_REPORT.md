# Phase 9 Final MVP Report

日期：2026-09-18  
版本：0.1.0  
项目：DeepSeek Immersive Translator

## 结论

Phase 9 的代码收尾、自动化回归、安全静态检查、性能夹具、依赖审计、可复现安装、发布产物和文档均已完成。自动化范围达到发布候选状态；按照 PRD 的严格 Definition of Done，仍需开发者在真实 Chrome/Edge 中加载 `dist/`，使用自己的有效 DeepSeek API Key 完成联网和目标网站手工验收。因此本报告不会把不可执行的浏览器/真实 API 项目写成 PASS。

## 本阶段修复

### Critical

未发现已泄漏的真实 API Key、可执行 HTML 注入、动态代码执行、无限重试、译文按数组位置映射或构建阻断等 Critical 问题。

### High

- 修复 DOM 可见性缓存把隐藏子节点状态错误传播给祖先、进而漏扫可见兄弟正文的问题。
- 修复受限页面右键菜单无法显示结果时仍可能调用 DeepSeek 的无效请求与费用风险。
- 自动翻译站点缺少 API Key 时改为当前 URL 只触发一次明确提示。
- Content Script 在 `pagehide` 时解绑 Runtime 消息监听、停止 Observer/Selection/Navigation，并卸载 React Shadow Root。
- Settings 深度迁移增加枚举、数值范围、数组和坐标损坏恢复。
- Options 补齐目标语言、显示模式、翻译风格、学术模式、英文术语、自定义 Prompt、Timeout、并发和批大小等 MVP 设置入口。
- Popup 移除 Phase 1 占位文案并统一产品名称与 API 配置提示。
- 补齐 Manifest 和构建产物中的 16/32/48/128 图标。
- Prompt 明确网页正文只能作为待翻译内容，不能作为指令，也不得泄漏凭据或系统信息。
- ESLint 9 升级到受支持的 ESLint 10；生成并验证 `package-lock.json`。

## 架构与稳定性

- 翻译链路：Scanner → Filter → Batcher → Queue → Background DeepSeek Client → JSON Parser → ID Mapping → Renderer。
- Queue 保持单任务启动、有限并发、最多 3 次尝试、1s/3s 退避、Pause/Resume/Stop 幂等保护和 taskId/batchId 隔离。
- 401/403 与无效配置属于 fatal，不做无意义重试；429、Timeout、Network、5xx、非法响应可有限重试。
- Renderer 只按节点 ID 映射，使用 `textContent` 写译文；重复 render、显示模式切换和 restore 均有回归测试。
- MutationObserver 只在设置开启时工作，监听 `childList/subtree`，750ms 防抖，增量扫描 added roots，每周期软限制 200 个节点；无轮询。
- SPA Observer 监听 history push/replace、popstate、hashchange，并在导航时停止旧任务、清理旧译文与会话，不重复挂载悬浮球。

## 缓存与网站规则

- 缓存位于 `chrome.storage.local.translationCache`，与 Settings 分离。
- SHA-256 Key 包含：cache version、prompt version、原文、目标语言、风格、学术模式、英文术语开关和自定义 Prompt；不包含 API Key。
- 最多 5000 条；超限后按 `lastAccessedAt` 淘汰到 4500 条，避免每次只删一条。
- 只缓存成功且非空、原文和译文均不超过 20000 字符的结果；缓存 IO 失败不阻断译文。
- 缓存命中先渲染，只有 miss 进入 Queue；全命中不创建 DeepSeek Queue。
- 自动/排除域名标准化并互斥，排除优先；排除只阻止自动翻译，仍允许用户手动翻译。

## 安全审计

- API Key：只在 Settings 类型/Options 输入、本地 Storage、Background 内存和 Authorization Header 中使用；未加入 URL、缓存 Key、Content Script Runtime Config、译文 DOM或日志。
- 工作区扫描未发现真实 `sk-...` Key；测试只使用明确的假值。
- XSS：生产源码无 `innerHTML =`、`outerHTML =`、`insertAdjacentHTML` 或 `dangerouslySetInnerHTML`；恶意 `<script>`/`<img onerror>` 载荷作为文本显示。
- CSP：`script-src 'self'; object-src 'self'`；生产源码无 `eval` 或 `new Function`。
- Manifest 权限：仅 `storage`、`contextMenus` 和 `https://api.deepseek.com/*`；未申请 tabs/history/downloads/bookmarks/cookies/webRequest。
- Content Script 在普通 `http/https` 顶层网页运行；浏览器内置/商店等受限页面安全失败。
- Prompt injection：网页文本位于 user JSON，System Prompt 明确不执行正文指令；API Key 不进入任何 Prompt。
- `npm audit --audit-level=low`：0 vulnerabilities。
- 当前目录不是 Git 仓库，无法审查 Git 历史；若任何真实 Key 曾在其他仓库历史提交，必须撤销并重新创建。

## 自动化测试结果

最终测试总计 102 项，全部通过：

- Queue：重复 start、并发、Pause/Resume、Stop、旧结果隔离、批次失败隔离、401 fatal、429/5xx/Timeout/Network 重试策略。
- Parser/Mapping：正常 JSON、Markdown fence、非法 JSON、重复 ID、多余 ID、缺失/篡改 ID、乱序 ID。
- Renderer：重复插入、双语/仅译文/仅原文、复杂交互节点保护、表格/列表结构、restore、XSS payload。
- Scanner/Filter：正文顺序、父子去重、代码/公式/导航/隐藏内容/扩展 UI 排除、可见性缓存修复。
- Cache：确定性 Key、语言/风格/Prompt 隔离、hit/miss、批量写、损坏恢复、LRU、独立 clear、全命中跳过 Queue。
- Site Rules：标准化、default/auto/excluded、去重与冲突互斥。
- Dynamic/SPA：单次启动、100 次 mutation 合并为一次周期、扩展译文忽略、导航事件去重与恢复。
- Selection/Context Menu：过滤、定位、缓存、并发请求最新结果、关闭竞态、复制失败、右键菜单幂等、受限页面不请求 API。
- Settings：旧字段迁移、损坏字段回退。
- Security/Release：危险 DOM API、动态执行、敏感日志、Manifest 权限/CSP、版本与 PNG 图标尺寸。

## 性能结果

以下为 Node + happy-dom 自动化夹具，不等同于 Chrome DevTools 真机 profile：

- 1000 个正文段落：最终回归约 0.29 秒扫描；默认 20 items/batch，最多 50 批，不会产生 1000 个请求。
- 5000 个正文段落：最终回归约 1.67 秒扫描，10 秒上限内完成。
- 100 次连续 DOM mutation：750ms 防抖后合并为 1 个处理周期。
- 页面静止时没有 `setInterval` 或轮询扫描。

真实 Chrome 的主线程长任务、内存和不同站点样式仍应使用 DevTools 手工分析。

## 网站兼容性结果

- Wikipedia-like fixture：PASS（标题、段落、列表、图注、显示模式、恢复）。
- GitHub README-like fixture：PASS（深色颜色继承、链接保持、代码块跳过）。
- PMC-like fixture：PASS（标题、摘要、图注、TH/TD 合法结构）。
- 无限滚动：PASS（本地 100 次 mutation 模拟、防抖、增量扫描、无自身译文循环）。
- Wikipedia、GitHub、PubMed/PMC、Nature、ScienceDirect、现代新闻站与博客的真实在线页面：本环境未安装/操控真实浏览器，未验证。

## API 与故障测试

- Network Offline：PASS（mock，转换为“无法连接 DeepSeek API”）。
- Invalid API Key：PASS（mock 401/403，立即停止，不无限重试）。
- Timeout：PASS（mock AbortController；与用户 Stop 的 CANCELLED 明确区分）。
- 429：PASS（mock，标为可重试并应用有限退避）。
- 500/503：PASS（mock，标为服务不可用并有限重试）。
- Malformed JSON：PASS（重试后安全失败，不错位）。
- Missing Translation：PASS（缺失 ID 失败，不按数组位置补位）。
- 有效 DeepSeek API Key 与真实联网调用：未提供真实 Key，未验证，未伪造通过结果。

## 构建、安装与产物

- 使用 npm 11.6.0 根据 `package-lock.json` 执行 `npm ci --ignore-scripts`：PASS，222 packages，0 vulnerabilities。
- 隔离临时目录曾完成 clean `npm ci`、build、typecheck、lint、test 全链路：PASS；临时目录已删除。
- Manifest、package 版本一致：0.1.0。
- `dist/` 包含 manifest、background、content、popup、options、assets、content.css 与四种图标。
- 生产 Vite 配置未启用 source map；构建产物未发现 `.map` 文件或源码绝对路径。

## 浏览器与持久化验证边界

- Chrome clean load：未验证（当前执行环境无法打开真实 Chrome 扩展会话）。
- Edge clean load：未验证。
- Browser restart persistence：未验证真实重启；Storage Service 使用 `chrome.storage.local`，且旧设置迁移自动测试通过。
- Popup、Options、Floating Ball、右键菜单与 Service Worker 控制台的真实浏览器交互：需要手工验收。

## 已知问题

1. 自定义 Base URL 受 Manifest 仅授权 DeepSeek 官方域名限制。
2. 原生 PDF、跨域 iframe、Chrome/Edge 内置页与商店页不支持或受限。
3. 复杂 Web App、虚拟列表和高频节点替换可能存在站点差异。
4. 5000 节点同步扫描在 happy-dom 中约 2.2 秒；真实超长页面仍可能出现长任务，未来可引入分片/idle 调度。
5. 缓存以整个对象读写；多标签页同时写入时理论上存在最后写入覆盖并行更新的窗口，但不会影响当前译文显示。
6. 当前图标为代码生成的 MVP 占位图标。
7. 当前工作区没有 `.git` 仓库元数据，无法执行有效的 `git status`、`git diff` 或历史密钥审计。

## 手工验收清单

1. 在 Chrome 和 Edge 分别加载干净的 `dist/`。
2. 清除扩展本地 Storage，确认首次 Key 提示、Options 默认值和悬浮球。
3. 使用自己的有效 Key 测试连接，并在 Wikipedia、GitHub、PubMed/PMC、新闻和博客页面跑完整流程。
4. 检查 Service Worker/Content Script Console 无持续错误或敏感 Header。
5. 验证浏览器重启后 API Key、Settings、悬浮位置、Site Rules 与 Cache 仍存在。
6. 对自动站点、排除站点、无限滚动和 SPA 内部导航执行手工回归。

## 下一版本建议

优先处理真实站点兼容性反馈、超长页面分片扫描、缓存并发写协调、品牌图标与 Chrome Web Store 发布材料。PDF、OCR、视频字幕、云同步、账户系统、其他 AI 模型等仍属于未来范围，不在 v0.1.0 MVP 中。

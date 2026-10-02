# 公开发布前检查

检查日期：2026-10-02。

## 历史与远端暴露面

- 同步远端后，原始历史只有提交 `412d4cd`，共 93 个唯一文件对象。
- 使用 `node scripts/audit-history.mjs` 对所有本地引用可达的历史对象扫描：长格式 API Token、GitHub Token、私钥头、AWS Access Key、含凭据 URL 及敏感文件名；原始历史无命中。
- 提交作者使用 GitHub noreply 邮箱。项目设置中默认 API Key 为空，测试使用虚构值。
- 通过 GitHub API 核查：仅 main 分支，无标签、Release、Issue / PR、Actions 运行或 artifact。
- `.gitignore` 排除 node_modules、dist、调试产物、环境变量文件、日志及缓存目录。

扫描不等于所有形式秘密的完整检测，不能证明未知格式凭据、未拉取引用、第三方副本或平台内部保留对象不存在。没有访问用户浏览器配置文件或读取真实 API Key。

## 密钥路径与修复

1. 设置页编辑 Key，经内部消息存入 `chrome.storage.local`；请求由后台 DeepSeek Client 发起。
2. 发现原消息处理器向内容脚本的设置更新请求返回了包含 Key 的完整设置；已改为只向精确匹配的本扩展 options.html 返回完整设置，其余上下文只返回脱敏运行配置。
3. 原 local 存储默认允许内容脚本访问；现使用 `TRUSTED_CONTEXTS` 限制，初始化失败时拒绝处理翻译消息。整页翻译缓存改由后台消息代理读写。
4. 内容脚本不能读取完整设置、测试 API 或修改 API 配置；允许的更新只涉及显示模式、悬浮球及站点规则。
5. 客户端和设置页只接受官方 HTTPS API 域名；拒绝带用户名密码的 URL；禁用重定向和 Cookie 携带，Key 只用于 Authorization 头。
6. 错误响应不回传服务端原始错误体，译文以文本渲染；缓存 Key 不包含 API Key。缓存保存原文和译文，不是加密数据仓库。

这些发现是扩展上下文之间的权限隔离不足，不表示任意网页脚本已能直接取得 Key，也不是已发生泄露的证据。

## 验证

- npm run build：通过。
- npm run typecheck：通过。
- npm run lint：通过。
- npm run test：106 项通过，0 失败。
- npm audit --omit=dev：0 个已知漏洞；该结果仅覆盖当次运行时依赖审计，不包含开发依赖。
- 新增真实后台消息入口的模拟测试：限制存储访问、拒绝网页上下文读取 Key / 修改 API 配置、脱敏设置更新、保持缓存命中和节点 ID 映射。
- 新增请求测试：非官方域名、HTTP 和带凭据 URL 在 fetch 前被拒绝。
- 构建产物自动附带 MIT、隐私说明、第三方说明和 React / React DOM 许可原文。

本次没有使用真实 Key 请求 DeepSeek，也没有完成真实 Chrome / Edge 交互回归；浏览器权限限制由官方 API 行为和模拟回归测试支持。用户更新后仍应重新加载扩展并刷新网页，验证保存设置、整页 / 选区翻译、缓存、悬浮球和站点规则。

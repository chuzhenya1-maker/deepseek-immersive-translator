# 安装与更新

官方源码仓库：https://github.com/chuzhenya1-maker/deepseek-immersive-translator

当前为 MVP，以源码构建后加载的方式安装。GitHub “Download ZIP” 下载的是源码，不是可以直接加载的扩展安装包。不要使用来源不明的二次打包版本。

## 从源码构建

安装 Node.js 22.18 或更高版本（包含 npm）。在项目根目录运行：

```sh
npm ci
npm run build
```

产物为 `dist/`；确认其根目录包含 `manifest.json`。请将此目录放在稳定位置，加载后不要删除或移动。也可将构建后的 `dist/` 压缩给其他用户，对方解压后加载包含 `manifest.json` 的目录，无需安装 Node.js。构建会自动附上 LICENSE、PRIVACY.md、THIRD_PARTY_NOTICES.md 及 React / React DOM 的许可原文；分发时保留这些文件。

## Chrome / Edge 加载

1. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
2. 开启“开发者模式”或“开发人员模式”。
3. 点击“加载已解压的扩展程序”或“加载解压缩的扩展”。
4. 选择 `dist/`，不要选择源码根目录，也不要选择 ZIP 文件。
5. 打开扩展设置，填写自己的 DeepSeek API Key，保存并测试连接。API 使用费用由你自己的账户承担。
6. 刷新已打开的普通网页，再点击右侧悬浮球翻译；单段翻译可选中文本后点“译”或右键翻译。

Base URL 只接受 `https://api.deepseek.com` 官方域名，支持其路径配置（例如 `/v1`）。Model 可配置，必须填写你的 API 账户可用的模型标识。先阅读 [隐私说明](../PRIVACY.md)，不要将他人的 Key 或敏感资料用于测试。

## 更新

获取新版源码后重新执行 `npm ci` 和 `npm run build`，在扩展管理页点“重新加载”，然后刷新目标网页。使用同一个扩展目录重新加载通常保留设置；卸载再安装会清除本地数据。此安装方式不会自动从 GitHub 更新。

## 没有悬浮球 / 无法翻译

- 确认扩展已启用、设置中悬浮球开启，并允许访问当前站点。
- 安装或更新后刷新目标网页；已打开的旧页面可能仍使用旧脚本。
- `chrome://`、`edge://`、扩展商店、浏览器 PDF 等受限页面不支持注入。先在普通 HTTPS 文章页面测试。
- 本地 `file://` 文件不在当前扩展匹配范围；仅开启“允许访问文件网址”不能使它受支持。
- API 报认证错误时检查 Key；余额不足或配额问题需在服务商账户处理。

卸载：进入扩展管理页点击“移除”。这会删除本地扩展数据，但不会撤销服务商的 API Key。

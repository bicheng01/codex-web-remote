# 架构

`plugin/cli.mjs` 和 `plugin/mcp.mjs` 都调用 `plugin/control.mjs`。控制层管理启动锁、服务状态、配对码和停止逻辑。`plugin/supervisor.mjs` 托管 LAN 服务或 `public-launcher.mjs`，后者管理 cloudflared 与 Web 服务进程。

`server.mjs` 提供静态页面、配对接口和经过 Bearer 认证的控制 API。管理接口仅允许本机回环请求，并拒绝转发到公网的管理认证。配对码位于 URL fragment，页面取得后从地址栏移除。

`desktop.mjs` 通过本机 Unix Socket 与 Desktop 会话 owner 建立 IPC：订阅快照和 patch，发送新轮次/补充/停止指令，更新下一轮模型、批准策略、sandbox 和审批方式。该协议是内部实现，版本可变，不是稳定公开 API。

`catalog.py` 只读本地 SQLite 与配置，返回工作区列表和可展示历史消息。不会将开发者提示词或完整 Desktop 配置发送到浏览器。`models.mjs` 启动短生命周期 codex app-server，读取真实模型目录，缓存五分钟。

`live.mjs` 提供认证 WebSocket、请求结果和状态增量。手机端断线重连，并使用 HTTP 回退。`public/app.js` 维护移动端界面；Markdown 渲染通过 DOMPurify 清理。前端的权限模式组合在 `public/permission-modes.mjs` 定义，并由 Desktop 最终校验可用性。

`npm run build` 生成内容哈希 JS/CSS 与预压缩文件。`static-assets.mjs` 根据 Accept-Encoding 选择 gzip/Brotli，只有静态资源长期缓存，API 和入口 HTML 为 no-store。

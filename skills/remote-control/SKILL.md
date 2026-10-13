---
name: remote-control
description: 开启或管理本机 Codex Desktop 的扫码手机遥控服务；支持 MCP 和 codex-remote CLI，不用于远程 SSH 构建。
---

可用 MCP 工具为 start_remote、remote_status、refresh_qr、stop_remote；CLI 为 codex-remote start、status、qr、stop，提供 --json。

开启遥控直接调用 start_remote，内部会复用服务，不预先查状态。首次需要当前 Desktop 聊天 ID，从可信聊天上下文或本机 codex-remote threads --json 获取，不猜测 ID；不擅自选择其他聊天。延续用户已选择的网络方式。首次未指定时，确认使用局域网还是 Cloudflare 公网隧道；公网方式会经过 Cloudflare，手机流量可使用。

加载技能或安装插件本身不启动服务。终端方式直接执行，无需模型生成二维码。start/qr 默认输出可扫描终端二维码；--json 返回 imagePath 和有效期，不含管理地址、配对链接或 base64。

开启或刷新后，直接用返回的 imagePath 在最终回复里嵌入二维码图片，不仅放在工具结果中。用户要求出码时，只调用一次对应工具，不重复生成、另读管理接口或先做公网探测；出错再诊断。除非用户明确要求，否则不打开浏览器。

停止遥控调用 stop_remote 或 codex-remote stop：撤销手机连接并停止此安装拥有的后台服务，电脑任务继续运行。不要代替为任务中断，不自动发送测试消息。

MCP 管理服务为本机 stdio，不能把管理地址或运行日志分享给第三方。二维码、服务凭证和手机会话凭证也不可公开。没有发现 MCP 工具时使用 CLI，或说明需重新加载客户端/开启新聊天；不要声称当前客户端已发现工具。

# 安装与故障处理

## 环境检查

```sh
node --version          # 24 或以上
python3 --version
codex --version
cloudflared --version   # 仅公网模式需要
```

请先在 macOS 上启动并登录 Codex Desktop，打开目标聊天。此项目依赖本机 IPC，远端 Linux 机器不能替代桌面运行环境。

## 安装源码、CLI、MCP

参见根 README 的快速安装和 MCP 小节。`npm ci` 使用锁定依赖；`npm run build` 更新图标、合并脚本和压缩资源；`npm link` 安装两个终端命令。

如果只在终端操作，不必安装 MCP 或 Codex 插件：

```sh
node plugin/cli.mjs threads
node plugin/cli.mjs start --thread <thread-id> --mode public
node plugin/cli.mjs status --json
```

如果 Agent 支持 Shell 而不支持 MCP，可以让它使用 CLI `--json`。若需在聊天内出码，用 `start --json` 或 `qr --json` 返回的 `imagePath`；不需要调用模型生成二维码。

## 配置

| 变量/选项 | 说明 |
| --- | --- |
| `CODEX_HOME` | Codex 数据目录，默认 `~/.codex` |
| `REMOTE_RUNTIME_DIR` / `--runtime` | 服务状态、日志、二维码和 CLI 会话记忆目录 |
| `DESKTOP_SOCKET` | 覆盖默认 `$CODEX_HOME/ipc/ipc.sock` |
| `CODEX_CLI_PATH` | 可覆盖读取模型目录所用的 codex 可执行文件 |
| `PYTHON` | Python 可执行文件，默认 `python3` |
| `LAN_IP` | 局域网模式需公布的电脑 IPv4 地址 |
| `--port` | 首次启动端口，默认 43127 |

直接调用 `node server.mjs` 需要 `THREAD_ID`；通常应使用 CLI/MCP，由控制层管理后台服务。默认数据库读取的是 `$CODEX_HOME/state_5.sqlite`，旧版或未来新版 Desktop 如改变 schema，需要适配 `catalog.py`。

## 常见问题

### 命令不存在

检查 `npm prefix -g` 和 PATH；运行 `npm link` 后打开新终端。GUI 客户端可使用 Node 和 MCP 脚本的绝对路径注册，避免依赖 GUI 的 PATH。

### 手机流量打不开

使用 `--mode public`，且本机 `cloudflared` 能访问 Cloudflare。局域网模式要求手机和电脑处于可互通网络。`codex-remote status` 仅反映本机服务，不证明公网隧道可达。

### 临时域名失效

先 `codex-remote stop`，等待服务退出，再 `codex-remote start --mode public`，最后扫描新码。重启不会保持随机域名；旧码也不能再次配对。

### 扫码后提示失效

配对码约 5 分钟有效、使用一次即失效。执行 `codex-remote qr`。已配对的设备通常无需重新扫码，除非会话过期或服务被停止。

### Desktop 未连接 / 只读历史

确认目标聊天已经在 Desktop 打开、IPC Socket 存在、`CODEX_HOME` 和 `DESKTOP_SOCKET` 指向同一个运行环境。Desktop 更新可能改变协议。只读历史不支持发消息或更改设置。

### 模型列表提供方不一致

用于列出模型的 CLI 配置与 Desktop 聊天提供方必须一致；否则请在 Desktop 选择模型。工具不会自动覆盖 API Key 或切换提供方。

### 停止遥控与停止任务

`codex-remote stop` 撤销手机授权并停止遥控服务；电脑任务继续运行。手机页面的停止按钮只停止当前任务，两者不同。

### 卸载

```sh
codex-remote stop
npm unlink -g codex-web-remote
# 如果使用独立 MCP
codex mcp remove web_remote
# 如果安装了插件
codex plugin remove codex-web-remote@codex-web-remote
```

单独复制过 skill 时，可自行删除 `~/.codex/skills/codex-web-remote`。源码和运行目录不会自动删除，清理前确认不再需要本地日志。不要对自定义 `--runtime` 目录盲目执行递归删除。

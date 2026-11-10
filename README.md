# RemNote Tag Actions

协作开发、Agent 提交与合并规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。


RemNote 原生插件：标签生成和右侧助手均通过既有 WakeWire 的独立工作流接口建立 ChatGPT 桌面端中的 Codex 可见 Thread，使用保存的 Project 的 local 环境。原生 `thread/start` 和 `turn/start` 直接执行用户请求，不通过另一个 chat 转发，不调用 Codex exec。

## 使用方式

- 光标放在节点文字上或选中节点，按 `Ctrl+Shift+G` 或点击窗格右上角的标签按钮。手动添加 `Generating` 也会触发。
- 后台读取原节点和上下文，建立可见 Thread；内容独立回读通过后才把 `Generating` 替换成 `AI Generated`。失败或缺少资料时保留待处理状态，可以在同一个对话补充。
- 另一个对话图标打开原生右侧栏。输入指令可操作当前知识库；后续消息延续同一个 Thread。支持多行输入、中文输入法、图片上传/粘贴、已有会话恢复、原生分叉和未发送草稿恢复。
- 图片保存在本机，通过原生 `localImage` 输入随用户消息发送。支持 PNG/JPEG/WebP，每张最多 8 MB，每次最多 8 张。
- 分叉保留当前原生历史，不能选择某个历史回合分叉。当前宿主的新分叉在首次发送前可能尚未进入原生历史列表；侧栏保留其原生 ID，不重复新建。
- 插件可以通过原生 `turn/interrupt` 停止自己正在执行的回合，回读 `interrupted` 后才显示已停止。其他窗口接管的回合在对应窗口停止；插件不会终止其他工作流进程。
- 本插件会话按用户授权使用完整访问：`approvalPolicy=never`、`danger-full-access`、RemNote MCP 默认 `approve`。正常 RemNote 操作无需再次审批。补充问题及其他原生请求会显示在侧栏；用户答复只发送给所属 Thread，不代答。需要设备验证等专用流程时明确提示限制。

## 结构

- `src/wakewire.mjs`：复用现有 `codex-session` 认证 WebSocket 协议，原样转发原生 JSON-RPC。WakeWire 管理此连接的 App Server 生命周期；不配置跨 chat 路由，不建立额外消息队列。
- `src/native.mjs`：调用官方原生协议创建、读取、续聊、分叉和停止；所有消息历史归原生 Thread 所有。回合结束释放执行连接，允许桌面端后续接管。本地只存请求身份、业务快照和恢复信息。
- `src/runtime.mjs`：通用规则分发、范围和状态管理。标签 ID、规则、快捷键、Project 和工作目录来自外部配置。
- `src/generation.mjs`：首个生成处理器。内容回执不是完成依据本身；后台还要回读节点、检查原文/层级/引用/图片和实际变更，最后才换标签。
- `plugin/`：RemNote 原生 PaneHeader、RightSidebar 和快捷命令。直接复用 RemNote Chat 的消息组件、样式与侧栏注册，移植 Claudian 的草稿函数。来源、固定提交与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

增加其他标签行为时，在外部配置增加规则，注册对应 `prepare/verify` 处理器。通用服务不判断某个规则名或标签文本。不得给 KnowledgeClipper 或已有 Todo 路由增加本插件逻辑。

## 本机运行

配置样例见 `config.example.json`。真实配置在 `D:/AppData/RemNoteTagActions/config.json`；填入原生 `project/list` 返回的 Project ID、对应工作目录，以及 WakeWire `sessions.codexPaths` 已允许的 Codex 运行时绝对路径。没有拥有者 Thread 配置。继承已有本机 Codex 登录和模型配置，完整访问策略只覆盖本插件的会话，不修改全局设置；服务启动会回读配置核验权限，WakeWire 不可用时保留待处理状态。

```powershell
npm ci
npm test
npm run test:browser
npm run build
pwsh -NoProfile -File scripts/start-service.ps1 -InstallStartup
```

本机服务仅监听 `127.0.0.1:43171` 与 `[::1]:43171`。`/health` 用于检查状态；其他 API 需要本机随机 Token。Token 仅注入受 RemNote frame-ancestors 限制的插件 iframe，不写入公共 JS 文件。源码不携带任何个人内容、配置或凭据。

构建目录：`D:/Artifacts/RemNoteTagActions/plugin`。在 RemNote 的本地插件开发入口使用 `http://localhost:43171` 安装。此代码版本已完成构建、后台实测与隔离 SDK 交互测试；尚未在 RemNote 中安装或完成真实点击验收。

`node src/cli.mjs check` 核验依赖，`status` 读取状态。`scan` 仅供服务未运行时执行；进程租约阻止两个写入进程并行启动。创建回执丢失时保留待核对状态；拿到 Thread ID 后先持久化，再开始执行。发送回执丢失时只回读原生历史，不自动重复创建、发送或分叉。

## 验证范围

隔离测试覆盖选区/光标、重复提交、未知创建/发送结果恢复、拒绝委派输出冒充用户消息、原生图片输入与停止、内容回读及认证边界。浏览器 fixture 在独立无头 Edge 中验证输入法、失败草稿、同请求重试、续聊、重载恢复、分叉/停止入口、窄屏深色布局、快捷键与侧栏 SDK 注册；不接触 RemNote 网页或用户浏览器 profile。

0.2.0 的个人主页及质数节点内容回读有效，但对话来源验收不合格：该版本通过另一个 chat 委派创建，不能作为本版本的来源证据。其路由已禁用，既有内容与对话保留。0.3.0 使用独立原生会话重新验收；证据位于本机 `native-session-canary`。验收必须同时核对桌面端原生列表、`originator`、空 `parentThreadId`、原生 `userMessage`，以及业务内容和标签。旧 exec 原型在 Git 提交 `7449dbe` 中保留，当前源码已移除其活动入口。

生产依赖审计已清零。RemNote SDK 0.0.46 的传递依赖 Zod 3 仍有上游集合验证 DoS 告警；未强制跨主版本替换以免破坏 SDK。插件请求体/图片有大小限制，服务不用该 SDK 处理外部请求；安装后的 SDK 行为仍须实际验收。

源码位于 `D:/Projects/RemNoteTagActions`；配置、上传图片、请求、生成快照和运行状态位于 `D:/AppData/RemNoteTagActions`；构建与验收证据位于 `D:/Artifacts/RemNoteTagActions`。真实资料不进入 Git。

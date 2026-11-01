# RemNote Tag Actions

RemNote 原生插件：标签生成和右侧助手均通过既有 WakeWire 建立 ChatGPT 桌面端中的 Codex 可见 Thread，使用保存的 Project 的 local 环境。没有 Codex exec 或独立 App Server 执行路径。

## 使用方式

- 光标放在节点文字上或选中节点，按 `Ctrl+Shift+G` 或点击窗格右上角的标签按钮。手动添加 `Generating` 也会触发。
- 后台读取原节点和上下文，建立可见 Thread；内容独立回读通过后才把 `Generating` 替换成 `AI Generated`。失败或缺少资料时保留待处理状态，可以在同一个对话补充。
- 另一个对话图标打开原生右侧栏。输入指令可操作当前知识库；后续消息延续同一个 Thread。支持多行输入、中文输入法、图片上传/粘贴、已有会话恢复、原生分叉和未发送草稿恢复。
- 图片保存在本机，由可见 Thread 调用 `view_image` 查看；当前原生工具没有附件参数，因此不是原生附件消息。支持 PNG/JPEG/WebP，每张最多 8 MB，每次最多 8 张。
- 分叉保留当前原生历史，不能选择某个历史回合分叉。当前宿主的新分叉在首次发送前可能尚未进入原生历史列表；侧栏保留其原生 ID，不重复新建。
- **停止在 ChatGPT 桌面端中的 Codex 操作。** 当前官方 Thread 工具没有停止入口，插件不伪造取消成功。

## 结构

- `src/wakewire.mjs`：调用现有守护进程的认证 HTTP API，使用固定投递 ID 防重；只增加本插件自己的路由。
- `src/native.mjs`：复用 WakeWire 的官方 app-tools 连接方式，读取、续聊、分叉；所有消息历史归原生 Thread 所有。本地只存请求/投递身份、业务快照和恢复信息。
- `src/runtime.mjs`：通用规则分发、范围和状态管理。标签 ID、规则、快捷键、Project 和工作目录来自外部配置。
- `src/generation.mjs`：首个生成处理器。内容回执不是完成依据本身；后台还要回读节点、检查原文/层级/引用/图片和实际变更，最后才换标签。
- `plugin/`：RemNote 原生 PaneHeader、RightSidebar 和快捷命令。直接复用 RemNote Chat 的消息组件、样式与侧栏注册，移植 Claudian 的草稿函数。来源、固定提交与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

增加其他标签行为时，在外部配置增加规则，注册对应 `prepare/verify` 处理器。通用服务不判断某个规则名或标签文本。不得给 KnowledgeClipper 或已有 Todo 路由增加本插件逻辑。

## 本机运行

配置样例见 `config.example.json`。真实配置在 `D:/AppData/RemNoteTagActions/config.json`；将原生 `list_projects` 的 local Project ID 和当前拥有者 Thread ID 填入配置。RemNote 和 ChatGPT 桌面端中的 Codex 运行后，后台会连接；暂时不可用时保留服务并继续重试。

```powershell
npm ci
npm test
npm run test:browser
npm run build
pwsh -NoProfile -File scripts/start-service.ps1 -InstallStartup
```

本机服务仅监听 `127.0.0.1:43171` 与 `[::1]:43171`。`/health` 用于检查状态；其他 API 需要本机随机 Token。Token 仅注入受 RemNote frame-ancestors 限制的插件 iframe，不写入公共 JS 文件。源码不携带任何个人内容、配置或凭据。

构建目录：`D:/Artifacts/RemNoteTagActions/plugin`。在 RemNote 的本地插件开发入口使用 `http://localhost:43171` 安装。此代码版本已完成构建、后台实测与隔离 SDK 交互测试；尚未在 RemNote 中安装或完成真实点击验收。

`node src/cli.mjs check` 核验依赖，`status` 读取状态。`scan` 仅供服务未运行时执行；进程租约阻止两个写入进程并行启动。收到未知投递结果时只恢复同一个请求，不自动重复原生变更调用。

## 验证范围

隔离测试覆盖选区/光标、重复提交、未知发送结果恢复、原生委派消息解析、内容回读、来源与认证边界。浏览器 fixture 在独立无头 Edge 中验证输入法、失败草稿、同请求重试、续聊、重载恢复、分叉入口、窄屏深色布局、快捷键与侧栏 SDK 注册；不接触 RemNote 网页或用户浏览器 profile。

真实 WakeWire 验收已完成个人主页节点及独立质数节点的内容/标签闭环；图片识别、同 Thread 第二轮、原生分叉续聊与服务重启恢复的证据保留在本机 artifacts。旧 exec 原型在 Git 提交 `7449dbe` 中保留，当前源码已移除其活动入口。

生产依赖审计已清零。RemNote SDK 0.0.46 的传递依赖 Zod 3 仍有上游集合验证 DoS 告警；未强制跨主版本替换以免破坏 SDK。插件请求体/图片有大小限制，服务不用该 SDK 处理外部请求；安装后的 SDK 行为仍须实际验收。

源码位于 `D:/Projects/RemNoteTagActions`；配置、上传图片、请求、生成快照和运行状态位于 `D:/AppData/RemNoteTagActions`；构建与验收证据位于 `D:/Artifacts/RemNoteTagActions`。真实资料不进入 Git。

# RemNote Tag Actions

本仓库正在按用户的新要求重新设计：标签生成与右侧栏指令均通过 WakeWire 创建 ChatGPT 桌面端中的 Codex 可见 Thread，使用「新建文件夹」Project 的 local 环境。

当前代码是已停止的 Codex exec 实验草稿，不是新方案的实现。后台服务和登录启动项已停用，未安装到 RemNote；不要运行旧的 start、scan、run 或 retry 命令。旧草稿和独立验收证据暂存用于回溯。新侧栏先完成开源复用调研，再开始实现。

新方案保留 Generating → 处理并回读 → AI Generated 的业务语义，以及光标/选中节点的快捷入口；增加图标打开原生右侧栏、输入指令作用于知识库的入口。具体复用范围见本机 D:/Artifacts/RemNoteTagActions/reuse-review.md。

源码位于 D:/Projects/RemNoteTagActions；配置与运行状态位于 D:/AppData/RemNoteTagActions；构建、生成结果和恢复证据位于 D:/Artifacts/RemNoteTagActions。私人资料、凭据与真实笔记不进入 Git。

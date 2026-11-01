# RemNote Tag Actions

可扩展的 RemNote 标签处理工作流与独立插件。每条规则绑定触发标签、处理器和完成标签；首个处理器使用后台 Codex exec，根据节点及子节点的要求补充内容。

先验证后台处理和标签回写，再实现快捷键与窗格右上角入口。后台 Codex exec 在用户指定的工作区运行，源码、私人配置、原始笔记与运行产物分别存放。生成结果经过并发修改检查和逐步回读后才变更完成标签。

源码位于 D:/Projects/RemNoteTagActions；配置与运行状态位于 D:/AppData/RemNoteTagActions；构建、生成结果和恢复证据位于 D:/Artifacts/RemNoteTagActions。私人资料、凭据与真实笔记不进入 Git。

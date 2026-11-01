# RemNote Tag Actions

- Own this independent plugin and backend only. Preserve peers and the legacy workspace.
- All RemNote content access uses the existing local MCP endpoint. No browser access to notes.
- Both workflows use WakeWire's independent codex-session transport and official native thread/start and turn/start in the saved local Project at D:/Workspaces/新建文件夹. Do not use an owner Thread, app-tools create_thread/send_message_to_thread, codex_delegation, Codex exec, or a direct-Codex fallback. UI visibility alone is insufficient: verify raw userMessage input and independent origin. Runtime reads native history; release acceptance also checks the desktop's official list_threads/read_thread tools.
- Research and interaction decisions are complete. Implement the native right sidebar using reviewed open-source UI code with attribution. Visible Threads are mandatory; same-Thread follow-ups, recovery and native forks are in scope. Images and stop must only be advertised when the actual native route supports them.
- KnowledgeClipper is outside this task. Do not modify its code or runtime.
- Rule IDs, exact tag IDs, provider settings and workspace belong in external configuration. Shared runtime must not special-case a generation rule.
- Preserve exact target boundaries, original nodes and readback verification. A native turn finishing is not proof of the requested note edits; completion tagging requires business-result verification.
- Do not delete nodes permanently. Archive only explicitly consumed unprotected instruction leaves into the root trash; preserve recovery information.
- Real notes, model prompts/results, credentials, local configuration and evidence stay outside Git under D:/AppData or D:/Artifacts.
- Fix the general workflow and rerun the original input when a canary fails. Never hand-edit a generated candidate to make it pass.
- Use synthetic regression fixtures plus independent live canaries. Separate SDK, installed-plugin and human-click verification.
- Legacy code remains for comparison only. Do not change global Codex configuration or build a second Thread history/control store.
- The user explicitly authorized full access for this plugin's WakeWire sessions: approvalPolicy never, danger-full-access, and RemNote MCP default_tools_approval_mode approve. Apply and verify these settings on each owned session, including resume/fork. Do not restore routine RemNote approval prompts or change other workflows' global settings.

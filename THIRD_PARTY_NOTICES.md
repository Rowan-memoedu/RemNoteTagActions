# Third-party code

## remnote-chat

Source: https://github.com/baobao700508/remnote-chat/tree/8ab2c4fe020b9a674b496cdeeb15c9765c6fdd60

The upstream frontend package and root pyproject declare MIT. Upstream has no separate root LICENSE file in this snapshot. Original author attribution: baobao700508 / ChenKing.

Copied/adapted: src/widgets/chat_widget.tsx (CodeBlock, TypingIndicator, icons, message/sidebar layout), src/index.css (the full base stylesheet), src/widgets/index.tsx (native RightSidebar registration). Destination: plugin/upstream/chat-components.tsx, plugin/upstream/chat.css, plugin/sidebar.jsx, plugin/index.jsx. Transport and state ownership have been replaced with native Thread reads and WakeWire delivery. No upstream private chat server or single-slot command mailbox is used.

## Claudian

Source: https://github.com/YishenTu/claudian/tree/571e140a25a23b0f3a346407bb0a010f8b8cd5e9

Copied: appendRawDraftSuffix from src/features/chat/composer/ComposerDraftController.ts to plugin/upstream/draft.ts. IME composition guards are adapted to the simpler textarea input. No Obsidian runtime or provider code is included.

MIT License

Copyright (c) 2025 Yishen Tu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## WakeWire

Source: https://github.com/Rowan-memoedu/WakeWire (local commit 5f2ff8a).

Adapted official app-tools MCP connection setup from src/workflows/native-project.ts into src/native.mjs. New Thread creation remains owned by the existing WakeWire daemon and its native adapter. No fork of the daemon is included.

MIT License

Copyright (c) 2026 wakewire contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

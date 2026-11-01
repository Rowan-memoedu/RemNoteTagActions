// Adapted from baobao700508/remnote-chat, commit 8ab2c4fe020b9a674b496cdeeb15c9765c6fdd60.
// MIT declared by upstream remnote-plugin/package.json; see THIRD_PARTY_NOTICES.md.
import React from 'react';
export function CodeBlock({ inline, className, children, ...props }: any) {
  if (inline) {
    return <code {...props}>{children}</code>;
  }
  const lang = className?.replace('language-', '') || '';
  return (
    <pre>
      {lang && <div className="chat-code-lang">{lang}</div>}
      <code className={className} {...props}>
        {children}
      </code>
    </pre>
  );
}

// ── 打字指示器 ──

export function TypingIndicator() {
  return (
    <div className="chat-typing">
      <div className="chat-typing-dot" />
      <div className="chat-typing-dot" />
      <div className="chat-typing-dot" />
    </div>
  );
}

// ── 图标组件 ──

export function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function EditIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

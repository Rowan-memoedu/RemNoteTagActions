// MIT, Copyright (c) 2025 YishenTu. Claudian commit 571e140; see THIRD_PARTY_NOTICES.md.
/**
 * Appends a raw unsent suffix to a restored draft prefix, keeping the suffix bytes intact.
 * Admission and prefix separators match appendMarkdownSnippet (2LF none, 1LF one, else 2LF).
 */
export function appendRawDraftSuffix(prefix: string, suffix: string): string {
  if (!suffix.trim()) return prefix;
  if (!prefix.trim()) return suffix;
  const separator = prefix.endsWith('\n\n') ? '' : prefix.endsWith('\n') ? '\n' : '\n\n';
  return prefix + separator + suffix;
}

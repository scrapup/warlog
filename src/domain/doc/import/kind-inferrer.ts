/**
 * The kind of a document from its file name (WL-57): `spec.md`, `plan.md`, `tasks.md`,
 * `single-tasks.md`, `design.md`, `adr.md` / `adr-*.md`; anything else is `other`.
 */
import type { DocKind } from '../doc.schema.ts';

/** File names that name their kind exactly. */
const BY_NAME: Readonly<Record<string, DocKind>> = {
  'spec.md': 'spec',
  'plan.md': 'plan',
  'tasks.md': 'tasks',
  'single-tasks.md': 'single-tasks',
  'design.md': 'design',
  'adr.md': 'adr',
};

/**
 * Infers the kind of a Markdown file.
 * @param fileName - File name (no folders).
 * @returns The kind.
 */
export function inferKind(fileName: string): DocKind {
  const lower = fileName.toLowerCase();
  return BY_NAME[lower] ?? (lower.startsWith('adr-') && lower.endsWith('.md') ? 'adr' : 'other');
}

/**
 * Tells whether a file is a Markdown document.
 * @param fileName - File name.
 * @returns `true` for `.md` files.
 */
export function isMarkdownName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.md') && fileName.length > '.md'.length;
}

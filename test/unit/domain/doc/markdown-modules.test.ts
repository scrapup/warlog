import { describe, expect, it } from '@jest/globals';
import { checkSddStructure } from '../../../../src/domain/doc/import/sdd-structure-checker.ts';
import { inferKind, isMarkdownName } from '../../../../src/domain/doc/import/kind-inferrer.ts';
import { applyReplacements, encodeDestination, storedDestination } from '../../../../src/domain/doc/import/link-rewriter.ts';
import { scanMarkdown } from '../../../../src/domain/doc/markdown-scanner.ts';
import { PAGE_BYTES, splitPages } from '../../../../src/domain/doc/page-splitter.ts';
import { anchorOf, buildToc } from '../../../../src/domain/doc/section-index.ts';

describe('scanMarkdown', () => {
  it('[WL-66] finds ATX headings, ignoring closing hashes, deep indents, fences and non-headings', () => {
    const text = ['# One #', '#NoSpace', '####### seven', '    # indented code', '```', '# in fence', '```', '~~~~', '# in tilde', '~~~~', '## Two ##  ', '   ### Three', '#\tTab'].join('\n');
    expect(scanMarkdown(text).headings.map((h) => [h.level, h.title])).toEqual([[1, 'One'], [2, 'Two'], [3, 'Three'], [1, 'Tab']]);
  });

  it('[WL-66] a fence closes only with the same character and at least its length', () => {
    const text = ['````', '```', '# still code', '````', '# real', '``` js with `tick', '# also real'].join('\n');
    expect(scanMarkdown(text).headings.map((h) => h.title)).toEqual(['real', 'also real']);
  });

  it('[WL-62] finds inline images with titles, angle destinations and parentheses, skipping code and escapes', () => {
    const text = ['![a](one.png "T")', '![b](<two words.png>)', '![c](dir/(x).png)', '`![d](code.png)`', '\\![e](esc.png)', '![f](bad.png', '![g] (space.png)', '![h](<unclosed.png)', '![i](x.png "unterminated)', '![j](y.png (t))', '![k[n]](nested.png)', '![](empty-alt.png)'].join('\r\n');
    const scan = scanMarkdown(text);
    expect(scan.images.map((i) => i.dest)).toEqual(['one.png', 'two words.png', 'dir/(x).png', 'y.png', 'nested.png', 'empty-alt.png']);
    expect(scan.images[0]).toMatchObject({ alt: 'a', line: 1 });
    expect(text.slice(scan.images[1]?.destStart, scan.images[1]?.destEnd)).toBe('two words.png');
  });

  it('[WL-62] counts inline HTML images without validating them', () => {
    expect(scanMarkdown('<img src="x.png">\n```\n<img src="y.png">\n```').htmlImages).toBe(1);
  });

  it('[WL-48] stays linear on pathological input', () => {
    const started = Date.now();
    scanMarkdown(`${'![['.repeat(20_000)}\n${'`'.repeat(50_000)}\n${'(('.repeat(50_000)}`);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it.each(['![[', '![a](<', '![a](b (', '![a](![a](', '![a](((', '![a](<x>', '![a](b "', '`a``b```c````d'])('[WL-48] a 2 MB line of %p is scanned in well under a second', (unit) => {
    const text = unit.repeat(Math.floor(2_000_000 / unit.length));
    const started = Date.now();
    const scan = scanMarkdown(text);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(scan.images.length + scan.unscannedLines.length).toBeGreaterThanOrEqual(unit.startsWith('`') ? 0 : 1);
  });

  it('[WL-62] a line whose image links cannot be scanned in bounded work is reported, never silently skipped', () => {
    expect(scanMarkdown(`${'![a](<'.repeat(50_000)}\nok ![b](c.png)\n`)).toMatchObject({ unscannedLines: [1], images: [{ dest: 'c.png', line: 2 }] });
    expect(scanMarkdown('![a](b.png) and ![c](d.png)').unscannedLines).toEqual([]);
  });

  it('[WL-66] the section index of a document with hundreds of thousands of headings is built in linear time', () => {
    const text = Array.from({ length: 200_000 }, (_, i) => `## h${i}`).join('\n');
    const started = Date.now();
    const toc = buildToc(text, scanMarkdown(text).headings);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(toc).toHaveLength(200_000);
    expect(toc.at(-1)?.byte_end).toBe(Buffer.byteLength(text));
  });

  it('[WL-66] sections end at the next heading of the same or a higher level', () => {
    const text = '# A\n## B\n### C\n## D\n# E\n';
    const toc = buildToc(text, scanMarkdown(text).headings);
    expect(toc.map((t) => [t.title, text.slice(t.byte_start, t.byte_end)])).toEqual([
      ['A', '# A\n## B\n### C\n## D\n'],
      ['B', '## B\n### C\n'],
      ['C', '### C\n'],
      ['D', '## D\n'],
      ['E', '# E\n'],
    ]);
  });
});

describe('section index', () => {
  it('[WL-66] anchors are lower-case, unique and keep letters of any script', () => {
    expect(anchorOf('Visão Geral: 1.2 (A_b-c)')).toBe('visão-geral-12-a_b-c');
    expect(anchorOf('日本語、概要 «x» ✓')).toBe('日本語概要-x-');
    const text = '# A\n\n## Same\n\n## Same\n\n## 日本語\n';
    const toc = buildToc(text, scanMarkdown(text).headings);
    expect(toc.map((t) => t.anchor)).toEqual(['a', 'same', 'same-1', '日本語']);
    expect(toc[0]?.byte_end).toBe(Buffer.byteLength(text));
    expect(toc[1]?.byte_end).toBe(toc[2]?.byte_start);
  });
});

describe('page splitter', () => {
  it('[WL-66] groups whole sections up to a page and splits an oversized section at paragraphs, lines, then characters', () => {
    const small = `# A\n${'a'.repeat(60 * 1024)}\n## B\n${'b'.repeat(60 * 1024)}\n`;
    const bytes = Buffer.from(small);
    const pages = splitPages(bytes, buildToc(small, scanMarkdown(small).headings));
    expect(pages.length).toBe(2);
    expect(pages[0]?.byte_start).toBe(0);
    expect(pages.at(-1)?.byte_end).toBe(bytes.length);
    const paragraphs = Buffer.from(`# P\n${`${'p'.repeat(1000)}\n\n`.repeat(250)}`);
    const para = splitPages(paragraphs, []);
    expect(para.every((p) => p.byte_end - p.byte_start <= PAGE_BYTES)).toBe(true);
    const lines = Buffer.from(`# L\n${`${'l'.repeat(1000)}\n`.repeat(250)}`);
    expect(splitPages(lines, []).length).toBeGreaterThan(1);
    const solid = Buffer.from(`${'é'.repeat(PAGE_BYTES)}`);
    const chars = splitPages(solid, []);
    expect(chars.length).toBeGreaterThan(1);
    expect(chars.every((p, i) => i === 0 || p.byte_start === chars[i - 1]?.byte_end)).toBe(true);
    expect(chars.every((p) => (solid[p.byte_start] ?? 0) >> 6 !== 2)).toBe(true);
  });

  it('[WL-66] splits a sub-range', () => {
    const bytes = Buffer.from('x'.repeat(250 * 1024));
    const pages = splitPages(bytes, [], 1000, 150_000);
    expect(pages[0]?.byte_start).toBe(1000);
    expect(pages.at(-1)?.byte_end).toBe(150_000);
  });
});

describe('kind inference and link rewriting', () => {
  it('[WL-57] infers the kind from the file name', () => {
    expect(['spec.md', 'PLAN.md', 'tasks.md', 'single-tasks.md', 'design.md', 'adr.md', 'adr-001-x.md', 'notes.md'].map(inferKind)).toEqual(['spec', 'plan', 'tasks', 'single-tasks', 'design', 'adr', 'adr', 'other']);
    expect([isMarkdownName('a.md'), isMarkdownName('.md'), isMarkdownName('a.txt')]).toEqual([true, false, false]);
  });

  it('[WL-61] rewrites only image destinations and encodes the stored path', () => {
    expect(encodeDestination('a b/ç.png')).toBe('a%20b/%C3%A7.png');
    expect(storedDestination('spec', 'd/x y.png')).toBe('assets/spec/d/x%20y.png');
    expect(applyReplacements('![a](x.png) and ![b](y.png)', [{ start: 21, end: 26, text: 'B' }, { start: 5, end: 10, text: 'A' }])).toBe('![a](A) and ![b](B)');
  });
});

describe('SDD structure', () => {
  it('[WL-62] spec and plan need sections 1 to 6; other kinds are unchecked', () => {
    const headings = scanMarkdown('# T\n## 1. A\n## 2. B\n').headings;
    expect(checkSddStructure('spec', headings).length).toBe(4);
    expect(checkSddStructure('plan', headings).length).toBe(4);
    expect(checkSddStructure('design', headings)).toEqual([]);
  });

  it('[WL-62] backlogs need user stories and tasks of the matching story; single-tasks holds at most five', () => {
    const ok = scanMarkdown('## US-1: A\n#### TF-1-1: x\n#### TF-1-2: y\n').headings;
    expect(checkSddStructure('tasks', ok)).toEqual([]);
    expect(checkSddStructure('tasks', scanMarkdown('## US-1: A\n#### TF-2-1: x\n').headings)[0]).toContain('does not belong to US-1');
    expect(checkSddStructure('tasks', scanMarkdown('#### TF-1-1: x\n').headings)).toEqual(expect.arrayContaining([expect.stringContaining('"## US-n" heading'), expect.stringContaining('no "## US-<n>"')]));
    expect(checkSddStructure('tasks', scanMarkdown('# Nothing\n').headings)).toHaveLength(2);
    const six = scanMarkdown(`## US-1: A\n${[1, 2, 3, 4, 5, 6].map((n) => `#### TF-1-${n}: t\n`).join('')}`).headings;
    expect(checkSddStructure('single-tasks', six)).toEqual(['single-tasks holds 6 tasks; the limit is 5']);
    expect(checkSddStructure('tasks', six)).toEqual([]);
    expect(checkSddStructure('tasks', scanMarkdown('## US-x\n#### TF-1\n#### TF-a-1\n').headings)).toHaveLength(2);
  });
});

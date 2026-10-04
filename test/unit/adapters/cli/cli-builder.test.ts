import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { runCli } from '../../../../src/adapters/cli/cli-builder.ts';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';
import type { OperationDefinition } from '../../../../src/core/mediator/operation-definition.ts';
import { fixtureDeps } from '../../../support/fixture-deps.ts';
import { fixtureOperation } from '../../../support/fixture-operations.ts';
import { MemoryCliIo } from '../../../support/memory-cli-io.ts';

/**
 * Runs the command line over the fixture registry.
 * @param argv - Arguments.
 * @param prepare - Sets files or stdin before the run.
 * @returns Exit code, streams and fakes.
 */
async function run(argv: string[], prepare: (io: MemoryCliIo) => void = () => undefined) {
  const io = new MemoryCliIo();
  prepare(io);
  const deps = fixtureDeps();
  let mcpStarted = false;
  const code = await runCli(argv, {
    ...deps,
    io,
    version: '1.2.3',
    startMcp: async () => {
      mcpStarted = true;
    },
  });
  return { code, out: io.out, err: io.err, deps, mcpStarted };
}

describe('command line: flags and output', () => {
  it('[WL-35] runs an operation from kebab-case flags', async () => {
    const { code, out } = await run(['fixture', 'echo', '--text', 'hi', '--count', '2']);
    expect(code).toBe(0);
    expect(out).toBe('text: hi\ncount: 2\n');
  });

  it('[WL-38] renders lists as tables and accepts --format and --fields', async () => {
    expect((await run(['fixture', 'list', '--limit', '1'])).out).toContain('| A ');
    const json = await run(['fixture', 'list', '--format', 'json', '--fields', 'id']);
    expect(JSON.parse(json.out)).toEqual({ rows: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] });
  });

  it('converts boolean flags with or without value and repeated or comma-separated arrays', async () => {
    expect((await run(['fixture', 'list', '--done', '--format', 'json'])).out).not.toContain('"B"');
    expect((await run(['fixture', 'list', '--done', 'false', '--format', 'json'])).out).toContain('"B"');
    const note = await run(['fixture', 'note-create', '--title', 'T', '--tags', 'a,b', '--tags', 'c', '--format', 'json']);
    expect(JSON.parse(note.out).tags).toEqual(['a', 'b', 'c']);
  });

  it('[WL-39] prints scalar values raw', async () => {
    expect((await run(['fixture', 'value', '--name', 'flag'])).out).toBe('false\n');
  });

  it('reports warnings on standard error', async () => {
    const warn: OperationDefinition = {
      ...fixtureOperation('fixture_echo'),
      name: 'fixture_warn',
      action: 'warn',
      handler: {
        handle: async (_input, context) => {
          context.warnings.push('W1');
          return { kind: 'scalar', value: 'ok' };
        },
      },
    };
    const io = new MemoryCliIo();
    const code = await runCli(['fixture', 'warn', '--text', 'x'], { ...fixtureDeps([warn]), io, version: '0', startMcp: async () => undefined });
    expect(code).toBe(0);
    expect(io.err).toBe('warnings: W1\n');
  });
});

describe('command line: file input', () => {
  it('[WL-36] reads YAML, JSON and Markdown files; flags override file fields', async () => {
    const yaml = await run(['fixture', 'echo', '--file', 'in.yaml', '--count', '5'], (io) => io.files.set('in.yaml', 'text: from-file\ncount: 1\n'));
    expect(yaml.out).toBe('text: from-file\ncount: 5\n');
    const json = await run(['fixture', 'echo', '--file', 'in.json'], (io) => io.files.set('in.json', '{"text":"j"}'));
    expect(json.out).toBe('text: j\ncount: 1\n');
    const md = await run(['fixture', 'note-create', '--file', 'n.md', '--format', 'json'], (io) => io.files.set('n.md', '---\ntitle: Note\nmeta:\n  k: 1\n---\nBody text\n'));
    expect(JSON.parse(md.out)).toMatchObject({ title: 'Note', meta: { k: 1 }, body: 'Body text\n' });
  });

  it('[WL-36] reads standard input with --file - and merges --json-input', async () => {
    const { out } = await run(['fixture', 'echo', '--file', '-', '--json-input', '{"count":7}'], (io) => {
      io.stdin = 'text: piped\n';
    });
    expect(out).toBe('text: piped\ncount: 7\n');
  });

  it('[WL-36] reports file, line, column and field of invalid file fields, and writes nothing', async () => {
    const { code, err, deps } = await run(['fixture', 'note-create', '--file', 'n.yaml'], (io) => io.files.set('n.yaml', 'title: ok\ntags:\n  - a\n  - 3\nextra: x\n'));
    expect(code).toBe(3);
    expect(err).toContain('n.yaml:4:5 tags.1: Invalid input: expected string, received number');
    expect(err).toContain('n.yaml:5:8 extra: unknown field');
    expect(deps.store.fs.files.size).toBe(0);
  });

  it('[WL-36] does not locate fields that flags override', async () => {
    const { code, err } = await run(['fixture', 'echo', '--file', 'e.yaml', '--count', '-1'], (io) => io.files.set('e.yaml', 'text: a\ncount: 2\n'));
    expect(code).toBe(3);
    expect(err).not.toContain('locations');
  });

  it('[WL-36] reports malformed files with their position', async () => {
    const { code, err } = await run(['fixture', 'echo', '--file', 'bad.yaml'], (io) => io.files.set('bad.yaml', 'text: a\ntext: b\n'));
    expect(code).toBe(3);
    expect(err).toMatch(/^VALIDATION: bad\.yaml:2:1 DUPLICATE_KEY/);
  });

  it('exits 1 with the path when the input file is unreadable', async () => {
    const { code, err } = await run(['fixture', 'echo', '--file', 'missing.yaml']);
    expect(code).toBe(1);
    expect(err).toContain('INVALID_FILE: cannot read input file missing.yaml');
  });

  it.each([['not json'], ['[1]']])('[WL-39] rejects --json-input %s with exit 3', async (json) => {
    expect((await run(['fixture', 'echo', '--json-input', json])).code).toBe(3);
  });

  it('[WL-36] --validate checks the input and writes nothing', async () => {
    const ok = await run(['fixture', 'note-create', '--title', 'T', '--validate']);
    expect(ok).toMatchObject({ code: 0, out: 'valid\n' });
    expect(ok.deps.store.fs.files.size).toBe(0);
    expect((await run(['fixture', 'note-create', '--validate'])).code).toBe(3);
  });
});

describe('command line: exit codes and errors', () => {
  it.each([
    ['NOT_FOUND', 2],
    ['VALIDATION', 3],
    ['CONFLICT', 4],
    ['INVALID_FILE', 1],
    ['NO_REPO_CONTEXT', 1],
    ['UNEXPECTED', 1],
  ])('[WL-39] [WL-40] maps %s to exit code %i with the stable error on stderr', async (errorCode, exit) => {
    const { code, err, out } = await run(['fixture', 'fail', '--code', errorCode]);
    expect(code).toBe(exit);
    expect(out).toBe('');
    expect(err).toMatch(errorCode === 'UNEXPECTED' ? /^INTERNAL: / : new RegExp(`^${errorCode}: fixture ${errorCode}`));
  });

  it('[WL-39] exits 3 on an unknown flag, an unknown command or an extra argument', async () => {
    expect((await run(['fixture', 'echo', '--bogus'])).code).toBe(3);
    expect((await run(['nope'])).code).toBe(3);
    expect((await run(['fixture', 'echo', 'extra'])).code).toBe(3);
  });

  it('rejects a field that reuses a reserved flag', async () => {
    const bad: OperationDefinition = { ...fixtureOperation('fixture_echo'), input: z.object({ format: z.string() }), examples: [{ format: 'x' }] };
    const io = new MemoryCliIo();
    await expect(runCli(['--help'], { ...fixtureDeps([bad]), io, version: '0', startMcp: async () => undefined })).rejects.toThrow(WarlogError);
  });
});

describe('command line: help, version and mcp', () => {
  it('[WL-37] shows help at root, group and operation level', async () => {
    const root = await run(['--help']);
    expect(root.code).toBe(0);
    expect(root.out).toContain('fixture');
    expect(root.out).toContain('mcp');
    const group = await run(['fixture', '--help']);
    expect(group.out).toContain('note-create');
    const op = await run(['fixture', 'note-create', '--help']);
    expect(op.code).toBe(0);
    expect(op.out).toMatchSnapshot();
  });

  it('[WL-37] exits 1 with help when a group is called without an operation', async () => {
    const { code, err } = await run(['fixture']);
    expect(code).toBe(1);
    expect(err).toContain('Usage: warlog fixture');
  });

  it('prints the version', async () => {
    expect(await run(['--version'])).toMatchObject({ code: 0, out: '1.2.3\n' });
  });

  it('starts the MCP server', async () => {
    expect(await run(['mcp'])).toMatchObject({ code: 0, mcpStarted: true });
  });
});

import { describe, expect, it } from '@jest/globals';
import { runCli } from '../../../../src/adapters/cli/cli-builder.ts';
import type { OperationDefinition } from '../../../../src/core/mediator/operation-definition.ts';
import { fixtureDeps } from '../../../support/fixture-deps.ts';
import { fixtureOperation } from '../../../support/fixture-operations.ts';
import { MemoryCliIo } from '../../../support/fakes/memory-cli-io.ts';

/**
 * Runs the command line over the fixture registry.
 * @param argv - Arguments.
 * @param prepare - Sets files or stdin before the run.
 * @returns Exit code, streams and fakes.
 */
async function run(argv: string[], prepare: (io: MemoryCliIo) => void = () => undefined, operations?: readonly OperationDefinition[]) {
  const io = new MemoryCliIo();
  prepare(io);
  const deps = fixtureDeps(operations);
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
    const done = await run(['fixture', 'list', '--done', '--format', 'json']);
    expect(done.code).toBe(0);
    expect(JSON.parse(done.out).rows.map((r: { id: string }) => r.id)).toEqual(['A', 'C']);
    const open = await run(['fixture', 'list', '--done', 'false', '--format', 'json']);
    expect(JSON.parse(open.out).rows.map((r: { id: string }) => r.id)).toEqual(['B']);
    const note = await run(['fixture', 'note-create', '--title', 'T', '--tags', 'a,b', '--tags', 'c', '--format', 'json']);
    expect(JSON.parse(note.out).tags).toEqual(['a', 'b', 'c']);
  });

  it('[WL-38] keeps a successful command when its output options cannot be applied, with a warning', async () => {
    const { code, out, err, deps } = await run(['fixture', 'note-create', '--title', 'T', '--fields', 'bogus']);
    expect(code).toBe(0);
    expect(out).toContain('title: T');
    expect(err).toBe('warnings: output.options_ignored\n');
    expect(deps.store.fs.files.size).toBeGreaterThan(0);
  });

  it('[WL-38] keeps a successful command when --format table does not fit its result, with a warning', async () => {
    const { code, out, err } = await run(['fixture', 'note-create', '--title', 'T', '--format', 'table']);
    expect(code).toBe(0);
    expect(out).toContain('title: T');
    expect(err).toBe('warnings: output.options_ignored\n');
  });

  it('[WL-38] rejects invalid output options of a query with exit 3', async () => {
    const { code, err } = await run(['fixture', 'echo', '--text', 'x', '--fields', 'bogus']);
    expect(code).toBe(3);
    expect(err).toMatch(/^VALIDATION: unknown field\(s\): bogus/);
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
    const { code, err } = await run(['fixture', 'warn', '--text', 'x'], undefined, [warn]);
    expect(code).toBe(0);
    expect(err).toBe('warnings: W1\n');
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
    expect(err).toMatch(/^VALIDATION: invalid input for fixture_echo/);
    expect(err).toContain('path: count');
    expect(err).not.toContain('locations');
  });

  it('[WL-36] reports an alias bomb as a validation error of the file', async () => {
    const bomb = ['a: &a [x, x]', ...Array.from({ length: 12 }, (_, i) => `l${i}: &l${i} [${i === 0 ? '*a' : `*l${i - 1}`}, ${i === 0 ? '*a' : `*l${i - 1}`}]`)].join('\n');
    const { code, err } = await run(['fixture', 'echo', '--file', 'b.yaml'], (io) => io.files.set('b.yaml', bomb));
    expect(code).toBe(3);
    expect(err).toMatch(/^VALIDATION: b\.yaml:1:1 too many YAML aliases/);
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

  it.each([
    ['not json', '--json-input is not valid JSON'],
    ['[1]', '--json-input must be a JSON object'],
  ])('[WL-39] rejects --json-input %s with exit 3', async (json, message) => {
    const { code, err } = await run(['fixture', 'echo', '--json-input', json]);
    expect(code).toBe(3);
    expect(err).toMatch(new RegExp(`^VALIDATION: ${message}`));
  });

  it('[WL-38] trims comma-separated --fields', async () => {
    const { out } = await run(['fixture', 'list', '--format', 'json', '--fields', ' id , title ']);
    expect(Object.keys(JSON.parse(out).rows[0])).toEqual(['id', 'title']);
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

  it.each([
    ['an unknown flag', ['fixture', 'echo', '--bogus'], "unknown option '--bogus'", 'unknown_option'],
    ['an unknown command', ['nope'], "unknown command 'nope'", 'unknown_command'],
    ['an extra argument', ['fixture', 'echo', 'extra'], 'too many arguments', 'too_many_arguments'],
    ['an invalid --format', ['fixture', 'echo', '--text', 'x', '--format', 'xml'], "argument 'xml' is invalid", 'invalid_value'],
    ['a flag without its value', ['fixture', 'echo', '--text'], "option '--text <value>' argument missing", 'missing_value'],
  ])('[WL-39] [WL-40] exits 3 on %s with a stable validation error', async (_label, argv, message, reason) => {
    const { code, err } = await run(argv);
    expect(code).toBe(3);
    expect(err).toMatch(/^VALIDATION: /);
    expect(err).toContain(message);
    expect(err).toContain(`reason: ${reason}`);
  });

  it('[WL-40] reports unreadable standard input as INVALID_FILE with exit 1', async () => {
    const { code, err } = await run(['fixture', 'echo', '--file', '-'], (io) => {
      io.readStdin = async () => {
        throw new TypeError('closed');
      };
    });
    expect(code).toBe(1);
    expect(err).toMatch(/^INVALID_FILE: cannot read input file -/);
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

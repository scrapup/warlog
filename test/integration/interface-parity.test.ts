import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fieldSpecs } from '../../src/adapters/cli/flag-mapper.ts';
import { commandWords } from '../../src/core/mediator/operation-definition.ts';
import { FIXTURE_OPERATIONS } from '../support/fixture-operations.ts';
import { isolatedEnv } from '../support/isolated-env.ts';
import type { IsolatedEnv } from '../support/isolated-env.ts';
import { connectMcp, resultText } from '../support/mcp-client.ts';
import type { McpSession } from '../support/mcp-client.ts';
import { runNode } from '../support/run-node.ts';

const BIN = join(process.cwd(), 'test', 'support', 'fixture-bin.ts');
const OPERATIONS = FIXTURE_OPERATIONS.map((def) => [def.name, def] as const);

let iso: IsolatedEnv | undefined;
let session: McpSession | undefined;

beforeAll(async () => {
  iso = isolatedEnv();
  session = await connectMcp([BIN, 'mcp'], { cwd: iso.cwd, env: iso.env });
}, 30_000);

afterAll(async () => {
  await session?.close();
  iso?.dispose();
});

/**
 * Returns the isolated environment and MCP session, failing clearly when setup did not complete.
 * @returns Environment and session.
 */
function setup(): { iso: IsolatedEnv; mcp: McpSession } {
  if (iso === undefined || session === undefined) {
    throw new Error('parity setup did not complete (see beforeAll failure)');
  }
  return { iso, mcp: session };
}

/**
 * Runs the fixture command line in the isolated environment.
 * @param args - Arguments.
 * @returns The process result.
 */
function cli(args: readonly string[]) {
  const { iso: env } = setup();
  return runNode([BIN, ...args], { cwd: env.cwd, env: env.env, timeoutMs: 10_000 });
}

/**
 * Lists files under a directory, recursively.
 * @param dir - Directory.
 * @returns File paths (prefixed by `dir`).
 */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

/**
 * Replaces run-dependent values (ULIDs, timestamps, machine ids) with placeholders.
 * @param text - Output.
 * @returns Normalized output.
 */
function normalize(text: string): string {
  return text
    .trim()
    .replace(/[0-9A-HJKMNP-TV-Z]{26}/g, '<ULID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TS>')
    .replace(/m-[0-9a-z]{8}/g, '<MACHINE>');
}

/**
 * Counts activity records (one JSON line each) in a store.
 * @param store - Store root.
 * @returns Number of records.
 */
function activityRecords(store: string): number {
  return filesUnder(store)
    .filter((f) => f.includes('activity'))
    .reduce((n, f) => n + readFileSync(f, 'utf8').split('\n').filter((line) => line.trim() !== '').length, 0);
}

describe('interface parity over the full registry', () => {
  it('[WL-35] exposes exactly the registry entries as MCP tools', async () => {
    const { tools } = await setup().mcp.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(FIXTURE_OPERATIONS.map((d) => d.name).sort());
  });

  it.each(OPERATIONS)('[WL-35] %s has the same required parameters in both interfaces', async (_name, def) => {
    const { tools } = await setup().mcp.client.listTools();
    const cliRequired = fieldSpecs(def.input).filter((s) => s.required).map((s) => s.key);
    expect(tools.find((t) => t.name === def.name)?.inputSchema.required ?? []).toEqual(cliRequired);
  }, 30_000);

  it.each(OPERATIONS)('[WL-37] %s documents every parameter in its command-line help', (_name, def) => {
    const help = cli([...commandWords(def), '--help']);
    expect(help.status).toBe(0);
    fieldSpecs(def.input).forEach((s) => expect(help.stdout).toContain(s.kind === 'complex' ? `(${s.key}:` : `--${s.flag}`));
  }, 30_000);

  it.each(FIXTURE_OPERATIONS.flatMap((def) => def.examples.map((example) => [def.name, def, example] as const)))(
    '[WL-35] [WL-40] %s returns the same normalized output and error through both interfaces',
    async (_name, def, example) => {
      const viaMcp = await setup().mcp.client.callTool({ name: def.name, arguments: { ...example } });
      const viaCli = cli([...commandWords(def), '--json-input', JSON.stringify(example)]);
      expect(viaCli.status === 0).toBe(viaMcp.isError !== true);
      expect(normalize(viaCli.status === 0 ? viaCli.stdout : viaCli.stderr)).toBe(normalize(resultText(viaMcp)));
    },
    30_000,
  );

  it('[WL-18] records command activity in the isolated store only', async () => {
    const { iso: env, mcp } = setup();
    const before = activityRecords(env.store);
    const viaMcp = await mcp.client.callTool({ name: 'fixture_note_create', arguments: { title: 'activity' } });
    expect(viaMcp.isError).not.toBe(true);
    expect(cli(['fixture', 'note-create', '--title', 'activity']).status).toBe(0);
    expect(activityRecords(env.store) - before).toBe(2);
    expect(filesUnder(env.cwd)).toEqual([]);
  }, 30_000);

  it('[WL-35] keeps standard output free of anything but MCP frames', async () => {
    const { mcp } = setup();
    await mcp.client.listTools();
    expect(mcp.errors).toEqual([]);
  });
});

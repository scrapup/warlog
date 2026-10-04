import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { fieldSpecs } from '../../src/adapters/cli/flag-mapper.ts';
import { FIXTURE_OPERATIONS } from '../support/fixture-operations.ts';
import { isolatedEnv } from '../support/isolated-env.ts';
import type { IsolatedEnv } from '../support/isolated-env.ts';
import { connectMcp, resultText } from '../support/mcp-client.ts';
import type { McpSession } from '../support/mcp-client.ts';
import { runNode } from '../support/run-node.ts';

const BIN = `${process.cwd()}/test/support/fixture-bin.ts`;

let iso: IsolatedEnv;
let mcp: McpSession;

beforeAll(async () => {
  iso = isolatedEnv();
  mcp = await connectMcp([BIN, 'mcp'], { cwd: iso.cwd, env: iso.env });
}, 30_000);

afterAll(async () => {
  await mcp.close();
  iso.dispose();
});

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

describe('interface parity over the full registry', () => {
  it('[WL-35] exposes every registry entry as an MCP tool with the CLI required parameters', async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(FIXTURE_OPERATIONS.map((d) => d.name).sort());
    for (const def of FIXTURE_OPERATIONS) {
      const tool = tools.find((t) => t.name === def.name);
      const cliRequired = fieldSpecs(def.input).filter((s) => s.required).map((s) => s.key);
      expect(tool?.inputSchema.required ?? []).toEqual(cliRequired);
      const help = runNode([BIN, def.group, def.action, '--help'], { cwd: iso.cwd, env: iso.env, timeoutMs: 10_000 });
      expect(help.status).toBe(0);
      fieldSpecs(def.input).forEach((s) => expect(help.stdout).toContain(s.kind === 'complex' ? `(${s.key}:` : `--${s.flag}`));
    }
  }, 60_000);

  it.each(FIXTURE_OPERATIONS.flatMap((def) => def.examples.map((example) => [def.name, def, example] as const)))(
    '[WL-35] [WL-40] %s returns the same normalized output and error through both interfaces',
    async (_name, def, example) => {
      const viaMcp = await mcp.client.callTool({ name: def.name, arguments: { ...example } });
      const cli = runNode([BIN, def.group, def.action, '--json-input', JSON.stringify(example)], { cwd: iso.cwd, env: iso.env, timeoutMs: 10_000 });
      expect(cli.status === 0).toBe(viaMcp.isError !== true);
      expect(normalize(cli.status === 0 ? cli.stdout : cli.stderr)).toBe(normalize(resultText(viaMcp)));
    },
    30_000,
  );

  it('[WL-35] keeps standard output free of anything but MCP frames', () => {
    expect(mcp.errors).toEqual([]);
  });
});

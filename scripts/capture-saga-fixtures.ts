/**
 * Captures the saga parity fixtures (TF-97-08, TF-97-09) from a real `saga-mcp` server: its
 * `tools/list`, the outputs of the parity scenario and the export of the scenario project. Run
 * manually where `npx saga-mcp` works:
 *
 *   node scripts/capture-saga-fixtures.ts
 *
 * The fixtures are never edited by hand; rerun this script to refresh them.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SAGA_VERSION, runScenario } from '../test/support/saga-scenario.ts';
import type { CallTool } from '../test/support/saga-scenario.ts';

/** Fixture directory. */
const FIXTURES = 'test/fixtures/saga';

/**
 * Writes a JSON fixture.
 * @param name - File name.
 * @param value - Content.
 */
function writeFixture(name: string, value: unknown): void {
  writeFileSync(join(FIXTURES, name), `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Text of the first content item of a tool result.
 * @param result - Tool result.
 * @returns The text, or `''`.
 */
function firstText(result: unknown): string {
  const content: unknown = Reflect.get(Object(result), 'content');
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  const text: unknown = Reflect.get(Object(first), 'text');
  return typeof text === 'string' ? text : '';
}

const base = mkdtempSync(join(tmpdir(), 'saga-capture-'));
const transport = new StdioClientTransport({
  command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args: ['-y', `saga-mcp@${SAGA_VERSION}`],
  env: { ...getDefaultEnvironment(), DB_PATH: join(base, 'saga.db') },
  stderr: 'ignore',
});
const client = new Client({ name: 'warlog-capture', version: '0' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const sorted = [...tools].sort((a, b) => (a.name < b.name ? -1 : 1)).map((t) => ({ name: t.name, inputSchema: t.inputSchema }));
  writeFixture('tools-list.json', { saga_version: SAGA_VERSION, tools: sorted });
  /**
   * Calls a saga tool.
   * @param name - Tool.
   * @param args - Arguments.
   * @returns Error flag and first text content.
   */
  const call: CallTool = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    const text = firstText(result);
    if (result.isError === true && process.env['CAPTURE_DEBUG'] !== undefined) {
      process.stderr.write(`${name} ${JSON.stringify(args)} -> ${text}\n`);
    }
    return { isError: result.isError === true, text };
  };
  const results = await runScenario(call);
  writeFixture('scenario-results.json', { saga_version: SAGA_VERSION, results });
  const exported = await call('tracker_export', {});
  writeFixture('export.json', JSON.parse(exported.text));
  process.stdout.write(`captured ${sorted.length} tools, ${results.length} scenario steps and the scenario export\n`);
} finally {
  await client.close();
  rmSync(base, { recursive: true, force: true });
}

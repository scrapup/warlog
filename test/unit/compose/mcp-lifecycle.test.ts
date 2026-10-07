import { describe, expect, it } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { installLifecycle } from '../../../src/compose/mcp-lifecycle.ts';
import type { ProcessLike } from '../../../src/compose/mcp-lifecycle.ts';
import { RecordingLogger } from '../../support/fakes/simple-fakes.ts';

/** Process double that records its exit. */
class FakeProcess extends EventEmitter implements ProcessLike {
  /** Exit codes requested. */
  readonly exits: number[] = [];

  /**
   * Records an exit.
   * @param code - Exit code.
   */
  exit(code: number): void {
    this.exits.push(code);
  }
}

/**
 * Installs the lifecycle over doubles.
 * @returns The doubles.
 */
function setup() {
  const proc = new FakeProcess();
  const logger = new RecordingLogger();
  const calls: string[] = [];
  installLifecycle({
    proc,
    logger,
    close: () => calls.push('close'),
    closeServer: async () => {
      calls.push('closeServer');
    },
  });
  return { proc, logger, calls };
}

describe('MCP server process lifecycle', () => {
  it.each(['SIGINT', 'SIGTERM'])('[WL-06] %s stops the watcher, closes the transport and exits cleanly, leaving a trace', async (signal) => {
    const { proc, logger, calls } = setup();
    proc.emit(signal);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toEqual(['close', 'closeServer']);
    expect(proc.exits).toEqual([0]);
    expect(logger.events).toEqual([{ level: 'info', event: 'mcp.shutdown', fields: { signal } }]);
  });

  it.each(['uncaughtException', 'unhandledRejection'])('[WL-40] %s is logged with codes only, stops the watcher and exits with 1', (kind) => {
    const { proc, logger, calls } = setup();
    proc.emit(kind, new Error('failed at /Users/someone/secret.md'));
    expect(calls).toEqual(['close']);
    expect(proc.exits).toEqual([1]);
    expect(logger.events).toEqual([{ level: 'error', event: 'process.fatal', fields: expect.objectContaining({ kind, error_name: 'Error' }) }]);
    expect(JSON.stringify(logger.events)).not.toContain('someone');
  });
});

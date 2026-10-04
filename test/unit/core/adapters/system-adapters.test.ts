import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { decodeTime } from 'ulid';
import { ProcessEnv } from '../../../../src/core/adapters/process-env.ts';
import { StderrJsonLogger, parseLogLevel } from '../../../../src/core/adapters/stderr-json-logger.ts';
import { SystemClock } from '../../../../src/core/adapters/system-clock.ts';
import { UlidGenerator } from '../../../../src/core/adapters/ulid-generator.ts';
import { FixedClock } from '../../../support/fakes/simple-fakes.ts';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

afterEach(() => {
  delete process.env['WARLOG_TEST_VAR'];
  delete process.env['WARLOG_TEST_EMPTY'];
  jest.restoreAllMocks();
});

describe('UlidGenerator', () => {
  it('[WL-07] generates strictly increasing ULIDs within the same millisecond', () => {
    const generator = new UlidGenerator(new FixedClock());
    const list = Array.from({ length: 1_000 }, () => generator.next());
    expect([...list].sort()).toEqual(list);
    expect(new Set(list).size).toBe(1_000);
  });

  it('[WL-07] encodes the creation time and uses the Crockford alphabet', () => {
    const clock = new FixedClock('2026-10-03T12:00:00.000Z');
    const id = new UlidGenerator(clock).next();
    expect(id).toHaveLength(26);
    expect([...id].every((c) => CROCKFORD.includes(c))).toBe(true);
    expect(decodeTime(id)).toBe(clock.now().getTime());
  });
});

describe('SystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('ProcessEnv', () => {
  it('reads variables, treating empty as unset', () => {
    process.env['WARLOG_TEST_VAR'] = 'x';
    process.env['WARLOG_TEST_EMPTY'] = '';
    const env = new ProcessEnv();
    expect(env.get('WARLOG_TEST_VAR')).toBe('x');
    expect(env.get('WARLOG_TEST_EMPTY')).toBeUndefined();
    expect(env.get('WARLOG_TEST_UNSET_XYZ')).toBeUndefined();
    expect(env.homeDir().length).toBeGreaterThan(0);
    expect(env.cwd()).toBe(process.cwd());
  });
});

describe('StderrJsonLogger', () => {
  it('writes JSON lines at or above the threshold', () => {
    const lines: string[] = [];
    const logger = new StderrJsonLogger('info', (l) => lines.push(l), () => new Date('2026-10-03T00:00:00.000Z'));
    logger.log('debug', 'skipped');
    logger.log('info', 'index.built', { files: 3 });
    logger.log('error', 'op.failed');
    expect(lines).toEqual([
      '{"ts":"2026-10-03T00:00:00.000Z","level":"info","event":"index.built","files":3}\n',
      '{"ts":"2026-10-03T00:00:00.000Z","level":"error","event":"op.failed"}\n',
    ]);
  });

  it('never lets fields override reserved keys and survives unserializable fields', () => {
    const lines: string[] = [];
    const logger = new StderrJsonLogger('debug', (l) => lines.push(l), () => new Date('2026-10-03T00:00:00.000Z'));
    logger.log('info', 'real', { level: 'error', event: 'forged', ts: 'x' });
    logger.log('info', 'big', { n: 1n });
    expect(lines).toEqual([
      '{"ts":"2026-10-03T00:00:00.000Z","level":"info","event":"real"}\n',
      '{"ts":"2026-10-03T00:00:00.000Z","level":"info","event":"big","log_error":"serialize_failed"}\n',
    ]);
  });

  it('writes to standard error by default, never to standard output', () => {
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const out = jest.spyOn(process.stdout, 'write');
    new StderrJsonLogger('warn').log('warn', 'repo.local_scope');
    expect(err).toHaveBeenCalledTimes(1);
    expect(out).not.toHaveBeenCalled();
  });

  it.each([
    ['debug', 'debug'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['DEBUG', 'debug'],
    ['verbose', 'warn'],
    [undefined, 'warn'],
  ])('parses level %p as %p', (raw, level) => {
    expect(parseLogLevel(raw)).toBe(level);
  });
});

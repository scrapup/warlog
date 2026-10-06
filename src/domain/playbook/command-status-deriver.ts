/**
 * Status of a command per environment, derived from its observations (WL-18): the latest
 * observation decides (`ok` → works, `fail` → fails), except that a mix of outcomes among the
 * last five observations makes it flaky. The memory file is never rewritten for an observation.
 */
import type { CommandObservation } from '../../core/ports/store-view.port.ts';

/** Derived status. */
export type CommandStatus = 'works' | 'fails' | 'flaky';

/** Observations considered for flakiness. */
export const FLAKY_WINDOW = 5;

/** Status of a command in one environment. */
export interface EnvironmentStatus {
  /** Operating system. */
  readonly os: string;
  /** Node.js major version, when recorded. */
  readonly node: string;
  /** Derived status. */
  readonly status: CommandStatus;
  /** Time of the latest observation (ISO 8601). */
  readonly last_verified_at: string;
  /** Exit code of the latest observation, when recorded. */
  readonly last_exit_code?: number;
}

/**
 * Text field of an observation's environment.
 * @param observation - Observation.
 * @param field - `os` or `node`.
 * @returns The value, or `''`.
 */
function envField(observation: CommandObservation, field: string): string {
  const value = observation.env[field];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * Status from a list of observations of one environment.
 * @param observations - Observations, oldest first.
 * @returns The status.
 */
function statusOf(observations: readonly CommandObservation[]): CommandStatus {
  const recent = observations.slice(-FLAKY_WINDOW);
  const outcomes = new Set(recent.map((o) => o.outcome));
  if (outcomes.has('ok') && outcomes.has('fail')) {
    return 'flaky';
  }
  return observations[observations.length - 1]?.outcome === 'ok' ? 'works' : 'fails';
}

/**
 * Derives the status of a command in every environment it was observed in.
 * @param observations - Observations of the command, oldest first.
 * @returns One entry per environment, ordered by operating system then Node.js version.
 */
export function deriveStatuses(observations: readonly CommandObservation[]): EnvironmentStatus[] {
  const groups = new Map<string, CommandObservation[]>();
  for (const o of observations) {
    const key = `${envField(o, 'os')}\u0000${envField(o, 'node')}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, list]) => {
      const [os = '', node = ''] = key.split('\u0000');
      const last = list[list.length - 1] as CommandObservation;
      return { os, node, status: statusOf(list), last_verified_at: last.ts, ...(last.exitCode === undefined ? {} : { last_exit_code: last.exitCode }) };
    });
}

/** The status that applies to the current environment. */
export interface HereStatus {
  /** Status. */
  readonly status: CommandStatus;
  /** Whether it was observed in another environment. */
  readonly elsewhere: boolean;
}

/**
 * The status that applies to the current environment: its own when observed there, otherwise
 * the best known elsewhere (works over flaky over fails).
 * @param statuses - Per-environment statuses.
 * @param os - Current operating system.
 * @param node - Current Node.js major version.
 * @returns The status and whether it comes from another environment; `undefined` without observations.
 */
export function statusHere(statuses: readonly EnvironmentStatus[], os: string, node: string): HereStatus | undefined {
  const own = statuses.find((s) => s.os === os && s.node === node) ?? statuses.find((s) => s.os === os);
  if (own !== undefined) {
    return { status: own.status, elsewhere: false };
  }
  const order: CommandStatus[] = ['works', 'flaky', 'fails'];
  const best = order.find((s) => statuses.some((e) => e.status === s));
  return best === undefined ? undefined : { status: best, elsewhere: true };
}

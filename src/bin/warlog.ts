#!/usr/bin/env node
/**
 * warlog command-line entry point.
 *
 * Minimal bootstrap: prints the package version for `--version`. The full command line
 * generated from the operation registry arrives with US-95.
 */
import { readFileSync } from 'node:fs';

/**
 * Shape of the fields read from `package.json`.
 */
interface PackageManifest {
  /** Package version (semver). */
  readonly version: string;
}

/**
 * Tells whether a parsed `package.json` has a string version.
 * @param value - Parsed JSON.
 * @returns `true` when `value.version` is a string.
 */
function isPackageManifest(value: unknown): value is PackageManifest {
  return typeof value === 'object' && value !== null && typeof (value as Partial<PackageManifest>).version === 'string';
}

/**
 * Reads the package version from the `package.json` two levels above this file
 * (`src/bin` in development, `dist/bin` once built).
 * @returns The package version string.
 * @throws {Error} When `package.json` cannot be read or has no string `version`.
 */
function readVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  if (!isPackageManifest(raw)) {
    throw new Error('package.json has no version');
  }
  return raw.version;
}

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-V')) {
  process.stdout.write(`${readVersion()}\n`);
} else {
  process.stderr.write('warlog: command line not implemented yet; use --version\n');
  process.exitCode = 1;
}

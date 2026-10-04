/**
 * Test helper: packs the built package (`npm pack`) and installs the tarball into a
 * temporary prefix, so end-to-end tests exercise exactly what would be published.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** An installed copy of the packed package. */
export interface InstalledPackage {
  /** Absolute path of the installed `warlog` bin script. */
  readonly bin: string;
  /** Removes the temporary prefix. */
  readonly dispose: () => void;
}

/**
 * Runs an npm command, failing with its output on a non-zero exit.
 * @param args - npm arguments.
 * @returns Standard output.
 * @throws {Error} When npm exits with a non-zero status.
 */
function npm(args: readonly string[]): string {
  const result = spawnSync('npm', [...args], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 300_000 });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Packs the current package (expects `npm run build` done) and installs it.
 * @returns The installed package.
 */
export function packAndInstall(): InstalledPackage {
  const root = mkdtempSync(join(tmpdir(), 'warlog-e2e-'));
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', root])) as Array<{ filename: string }>;
  const tarball = join(root, packed[0]?.filename ?? '');
  const prefix = join(root, 'prefix');
  npm(['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
  return {
    bin: join(prefix, 'node_modules', '@scrapup', 'warlog', 'dist', 'bin', 'warlog.js'),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

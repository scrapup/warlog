/**
 * Test helper: packs the built package (`npm pack`) and installs the tarball into a
 * temporary prefix, so end-to-end tests exercise exactly what would be published.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
 * @param args - npm arguments (no user-controlled values).
 * @returns Standard output.
 * @throws {Error} When npm exits with a non-zero status.
 */
function npm(args: readonly string[]): string {
  const result = spawnSync('npm', [...args], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 280_000 });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Packs the current package (expects `npm run build` done) and installs it. No lifecycle
 * script runs (SEC-15); dependencies are resolved from the local cache when possible.
 * @returns The installed package.
 * @throws {Error} When packing or installing fails; the temporary directory is removed.
 */
export function packAndInstall(): InstalledPackage {
  const root = mkdtempSync(join(tmpdir(), 'warlog-e2e-'));
  const dispose = (): void => rmSync(root, { recursive: true, force: true });
  try {
    const packed = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', root])) as Array<{ filename?: string }>;
    const filename = packed[0]?.filename;
    if (filename === undefined) {
      throw new Error('npm pack produced no tarball');
    }
    const prefix = join(root, 'prefix');
    npm(['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', join(root, filename)]);
    const bin = join(prefix, 'node_modules', '@scrapup', 'warlog', 'dist', 'bin', 'warlog.js');
    if (!existsSync(bin)) {
      throw new Error(`installed package has no bin at ${bin}; run npm run build first`);
    }
    return { bin, dispose };
  } catch (error: unknown) {
    dispose();
    throw error;
  }
}

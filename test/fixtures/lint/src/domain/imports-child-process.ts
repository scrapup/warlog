import { execSync } from 'child_process';

/**
 * Runs git directly from the domain.
 * @returns The output.
 */
export function head(): string {
  return execSync('git rev-parse HEAD').toString();
}

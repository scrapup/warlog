/**
 * Loads a Node module dynamically from the domain.
 * @returns The module.
 */
export async function load(): Promise<unknown> {
  return import('node:fs');
}

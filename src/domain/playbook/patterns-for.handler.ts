/**
 * Finds the pattern memories that apply to a path (linear glob matching, WL-48).
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { GlobMatcher } from '../../core/security/glob-matcher.ts';
import { bySpecificityThenRecency, isInPlay, liveMemories, memoryFull } from '../memory/memory-rows.ts';
import { text } from '../shared/rows.ts';
import type { PatternsForInput } from './patterns-for.operation.ts';

/**
 * Repository-relative form of a path: `/`-separated, without a leading `./`, and without the
 * main working tree prefix of an absolute path.
 * @param path - Caller path.
 * @param mainWorktree - Main working tree of the repository, when inside one.
 * @returns The relative path.
 */
export function relativePath(path: string, mainWorktree: string | undefined): string {
  const flat = path.split('\\').join('/');
  const root = mainWorktree === undefined ? undefined : `${mainWorktree.split('\\').join('/').replace(/\/+$/, '')}/`;
  const inside = root !== undefined && flat.startsWith(root) ? flat.slice(root.length) : flat;
  return inside.startsWith('./') ? inside.slice(2) : inside;
}

/**
 * Tells whether any of a pattern memory's globs matches a path; an unusable glob never matches.
 * @param matcher - Glob matcher.
 * @param memory - Pattern memory.
 * @param path - Relative path.
 * @returns `true` when one glob matches.
 */
function applies(matcher: GlobMatcher, memory: IndexedEntity, path: string): boolean {
  const globs = Array.isArray(memory.record.data['applies_to']) ? memory.record.data['applies_to'].map(String) : [];
  return globs.some((glob) => {
    try {
      return matcher.matches(glob, path);
    } catch {
      return false;
    }
  });
}

/** Handles `patterns_for`. */
export class PatternsForHandler implements OperationHandler<PatternsForInput> {
  /** Glob matcher. */
  private readonly matcher = new GlobMatcher();

  /**
   * Returns the matching patterns.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ path, count, patterns }`.
   */
  async handle(input: PatternsForInput, context: OperationContext): Promise<OperationResult> {
    const path = relativePath(input.path, context.roots.repository?.mainWorktree);
    const patterns = liveMemories(await context.index.full())
      .filter((m) => isInPlay(m) && text(m, 'kind') === 'pattern' && applies(this.matcher, m, path))
      .sort(bySpecificityThenRecency)
      .map((m) => memoryFull(m));
    return { kind: 'object', value: { path, count: patterns.length, patterns } };
  }
}

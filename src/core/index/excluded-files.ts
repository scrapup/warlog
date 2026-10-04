/**
 * Files kept out of the view and reported (WL-43): invalid files, sync conflict copies and
 * temporary files left by interrupted writes.
 */
import type { FileProblem, TempFile } from './indexed-entity.ts';
import { sortByPath } from './relations.ts';

/** Excluded files by path. */
export class ExcludedFiles {
  /** Invalid files. */
  private readonly invalid = new Map<string, FileProblem>();
  /** Conflict copies. */
  private readonly conflicts = new Map<string, FileProblem>();
  /** Temporary files. */
  private readonly temps = new Map<string, TempFile>();

  /**
   * Files excluded as invalid.
   * @returns Problems, ordered by path.
   */
  invalidFiles(): FileProblem[] {
    return sortByPath([...this.invalid.values()]);
  }

  /**
   * Sync-service conflict copies.
   * @returns Copies, ordered by path.
   */
  conflictCopies(): FileProblem[] {
    return sortByPath([...this.conflicts.values()]);
  }

  /**
   * Temporary files.
   * @returns Files, ordered by path.
   */
  tempFiles(): TempFile[] {
    return sortByPath([...this.temps.values()]);
  }

  /**
   * Records an excluded file.
   * @param problem - Problem.
   * @param kind - `invalid` or `conflict_copy`.
   */
  add(problem: FileProblem, kind: 'invalid' | 'conflict_copy'): void {
    (kind === 'invalid' ? this.invalid : this.conflicts).set(problem.path, problem);
  }

  /**
   * Records a temporary file.
   * @param file - Temporary file.
   */
  addTemp(file: TempFile): void {
    this.temps.set(file.path, file);
  }

  /**
   * Forgets a file.
   * @param path - Absolute path.
   */
  remove(path: string): void {
    this.invalid.delete(path);
    this.conflicts.delete(path);
    this.temps.delete(path);
  }

  /**
   * Every excluded path.
   * @returns Paths.
   */
  paths(): string[] {
    return [...this.invalid.keys(), ...this.conflicts.keys(), ...this.temps.keys()];
  }

  /**
   * Copies every entry of another set.
   * @param other - Source.
   */
  addAll(other: ExcludedFiles): void {
    other.invalid.forEach((p) => this.add(p, 'invalid'));
    other.conflicts.forEach((p) => this.add(p, 'conflict_copy'));
    other.temps.forEach((t) => this.addTemp(t));
  }
}

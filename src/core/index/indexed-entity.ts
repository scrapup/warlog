/**
 * Values used inside the index: the read types come from the store-view port; a scanned file is
 * internal to the builder.
 */
import type { RootKind } from '../ports/store-view.port.ts';

export type { EntityLink, FileProblem, IndexedEntity, IndexedVar, RootKind, TempFile } from '../ports/store-view.port.ts';

/** A file found by a scan. */
export interface ScannedFile {
  /** Absolute path. */
  readonly path: string;
  /** Root holding the file. */
  readonly root: RootKind;
  /** Path relative to the root, `/`-separated. */
  readonly relative: string;
}

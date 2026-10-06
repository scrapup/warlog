/**
 * Turns one store file into a view entry (WL-05, WL-43): an entity, a variable, or the reason
 * the file is excluded. Never throws for bad content.
 */
import { isWarlogError } from '../errors/warlog-error.ts';
import { classifyFileName } from '../security/file-name-classifier.ts';
import { hasMergeConflictMarkers } from '../security/merge-marker-detector.ts';
import { isPlainRecord } from '../security/plain-record.ts';
import type { EntityType } from '../storage/entity-ref.ts';
import { parseFrontMatter } from '../storage/front-matter-codec.ts';
import type { FrontMatterDocument } from '../storage/front-matter-codec.ts';
import { parseYaml } from '../storage/yaml-codec.ts';
import type { IndexedEntity, IndexedVar, ScannedFile } from './indexed-entity.ts';

/** Entity types accepted in front matter. */
const ENTITY_TYPES: ReadonlySet<string> = new Set<EntityType>([
  'project',
  'epic',
  'story',
  'task',
  'note',
  'comment',
  'memory',
  'template',
  'questionnaire',
  'response',
]);

/** Directories whose content is not entities: activity logs, document areas (US-102), other repositories' data. */
const SKIPPED_SEGMENTS: ReadonlySet<string> = new Set(['activity', 'docs']);

/** What a scan does with a file. */
export type ScanDecision = 'read' | 'skip' | 'temp' | 'conflict_copy';

/** A file read as an entity. */
export interface EntityOutcome {
  /** Discriminant. */
  readonly kind: 'entity';
  /** Entity. */
  readonly entity: IndexedEntity;
}

/** A file read as a variable. */
export interface VarOutcome {
  /** Discriminant. */
  readonly kind: 'var';
  /** Variable. */
  readonly entry: IndexedVar;
}

/** A file excluded from the view. */
export interface InvalidOutcome {
  /** Discriminant. */
  readonly kind: 'invalid';
  /** Why. */
  readonly reason: string;
}

/** Result of reading one file. */
export type ReadOutcome = EntityOutcome | VarOutcome | InvalidOutcome;

/**
 * Tells whether a path lies in an area never indexed (activity, documents, other repositories).
 * @param file - Scanned file or directory.
 * @returns `true` when skipped whatever its name.
 */
export function inSkippedArea(file: ScannedFile): boolean {
  const segments = file.relative.split('/');
  return (file.root === 'global' && segments[0] === 'repos') || segments.some((s) => SKIPPED_SEGMENTS.has(s));
}

/**
 * Decides how a scan treats a file (WL-43).
 * @param file - Scanned file.
 * @returns The decision.
 */
export function scanDecision(file: ScannedFile): ScanDecision {
  if (inSkippedArea(file)) {
    return 'skip';
  }
  const segments = file.relative.split('/');
  const name = segments[segments.length - 1] ?? '';
  const kind = classifyFileName(name);
  if (kind !== 'entity') {
    return kind;
  }
  return name.endsWith('.md') || name.endsWith('.yaml') ? 'read' : 'skip';
}

/**
 * Owning project from the path (`projects/<id>/…`).
 * @param segments - Relative path segments.
 * @returns The project id, when the file is project-scoped.
 */
function pathProject(segments: readonly string[]): string | undefined {
  return segments[0] === 'projects' ? segments[1] : undefined;
}

/**
 * Checks the managed fields and the file name of an entity.
 * @param data - Front matter.
 * @param segments - Relative path segments.
 * @returns A reason when invalid, otherwise `undefined`.
 */
function entityProblem(data: Readonly<Record<string, unknown>>, segments: readonly string[]): string | undefined {
  const { id, type, rev } = data;
  if (typeof id !== 'string' || typeof type !== 'string' || !ENTITY_TYPES.has(type) || !(Number.isSafeInteger(rev) && Number(rev) >= 1)) {
    return 'front_matter';
  }
  const name = (segments[segments.length - 1] ?? '').slice(0, -'.md'.length);
  const expected = name === 'project' ? segments[segments.length - 2] : name;
  return expected === id ? undefined : 'id_mismatch';
}

/**
 * Key of an entity in the view: its id, except for questionnaires, whose slug may exist at both
 * scopes (the repository overrides the global one, WL-29), so the scope is part of the key.
 * @param id - Entity id (slug for questionnaires).
 * @param type - Entity type.
 * @param file - Scanned file.
 * @returns The key.
 */
function indexKey(id: string, type: unknown, file: ScannedFile): string {
  return type === 'questionnaire' ? `${file.root === 'global' ? 'global' : 'repo'}:${id}` : id;
}

/**
 * Reads an entity file.
 * @param file - Scanned file.
 * @param text - Content.
 * @returns The outcome.
 */
function readEntity(file: ScannedFile, text: string): ReadOutcome {
  let doc: FrontMatterDocument;
  try {
    doc = parseFrontMatter(text, file.path);
  } catch (error: unknown) {
    return { kind: 'invalid', reason: isWarlogError(error, 'INVALID_FILE') ? String(error.details?.['reason'] ?? 'front_matter') : 'front_matter' };
  }
  const segments = file.relative.split('/');
  const problem = entityProblem(doc.data, segments);
  if (problem !== undefined) {
    return { kind: 'invalid', reason: problem };
  }
  const project = doc.data['project_id'];
  const entity: IndexedEntity = {
    id: indexKey(String(doc.data['id']), doc.data['type'], file),
    type: doc.data['type'] as EntityType,
    scope: file.root === 'global' ? 'global' : 'repo',
    projectId: pathProject(segments) ?? (typeof project === 'string' ? project : undefined),
    path: file.path,
    record: doc,
    deleted: doc.data['deleted_at'] !== undefined,
  };
  return { kind: 'entity', entity };
}

/**
 * Reads a variable file (`…/vars/<name>.yaml`).
 * @param file - Scanned file.
 * @param text - Content.
 * @returns The outcome (other YAML files are excluded as `invalid: unexpected_file`).
 */
function readVar(file: ScannedFile, text: string): ReadOutcome {
  const segments = file.relative.split('/');
  if (segments[segments.length - 2] !== 'vars') {
    return { kind: 'invalid', reason: 'unexpected_file' };
  }
  if (hasMergeConflictMarkers(text)) {
    return { kind: 'invalid', reason: 'merge_conflict' };
  }
  let data: unknown;
  try {
    data = parseYaml(text, file.path);
  } catch {
    return { kind: 'invalid', reason: 'yaml' };
  }
  if (!isPlainRecord(data) || typeof data['name'] !== 'string' || typeof data['type'] !== 'string') {
    return { kind: 'invalid', reason: 'var_fields' };
  }
  const entry: IndexedVar = { name: data['name'], scope: file.root === 'global' ? 'global' : 'repo', projectId: pathProject(segments), path: file.path, data };
  return { kind: 'var', entry };
}

/**
 * Reads one store file.
 * @param file - Scanned file (`.md` or `.yaml`).
 * @param text - Content.
 * @returns Entity, variable or exclusion reason.
 */
export function readStoreFile(file: ScannedFile, text: string): ReadOutcome {
  return file.relative.endsWith('.md') ? readEntity(file, text) : readVar(file, text);
}

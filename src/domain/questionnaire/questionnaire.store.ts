/**
 * Questionnaire files (`questionnaires/<slug>.md` at repository scope, `global/questionnaires/`
 * at global scope). Always read straight from disk: a slug may exist at both scopes (the
 * repository overrides the global one, WL-29), and responses must see the latest version.
 */
import { dirname } from 'node:path';
import { WarlogError, isWarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { EntityRecord, EntityRef } from '../../core/storage/entity-ref.ts';
import type { EntityStore, EntityStoreFactory } from '../../core/storage/entity-store.ts';
import { isSlug } from '../../core/security/identifiers.ts';
import { AAR_QUESTIONS, AAR_SLUG, AAR_TITLE, AAR_VERSION } from './builtin/aar.questionnaire.ts';
import { QUESTION } from './question-type-registry.ts';
import type { Question } from './question-type-registry.ts';

/** Scopes a questionnaire can be defined at. */
export type QuestionnaireScope = 'repo' | 'global';

/** A questionnaire as used by the operations. */
export interface Questionnaire {
  /** Identifier. */
  readonly slug: string;
  /** Title. */
  readonly title: string;
  /** Version (1, bumped on every redefinition). */
  readonly version: number;
  /** Scope it was found at. */
  readonly scope: QuestionnaireScope;
  /** Description (Markdown). */
  readonly description: string;
  /** Questions in order. */
  readonly questions: readonly Question[];
  /** Whether it is the built-in definition (no file yet). */
  readonly builtin: boolean;
  /** The stored record, when there is a file. */
  readonly record?: EntityRecord;
}

/** Opens the questionnaire store of a call. */
export type QuestionnaireStoreFactory = (context: OperationContext) => QuestionnaireStore;

/**
 * Builds the factory.
 * @param fs - File system.
 * @param entities - Entity store factory.
 * @returns The factory.
 */
export function questionnaireStoreFactory(fs: FileSystem, entities: EntityStoreFactory): QuestionnaireStoreFactory {
  return (context) => new QuestionnaireStore(fs, entities(context), context.roots.repository !== undefined);
}

/**
 * Reference of a questionnaire file.
 * @param slug - Slug.
 * @param scope - Scope.
 * @returns The reference.
 */
export function refOfQuestionnaire(slug: string, scope: QuestionnaireScope): EntityRef {
  return { type: 'questionnaire', id: slug, scope };
}

/**
 * The built-in AAR as a questionnaire.
 * @returns The built-in definition.
 */
function builtinAar(): Questionnaire {
  return { slug: AAR_SLUG, title: AAR_TITLE, version: AAR_VERSION, scope: 'global', description: '', questions: AAR_QUESTIONS, builtin: true };
}

/**
 * Parses the questions of a stored questionnaire.
 * @param record - Stored record.
 * @param slug - Slug (for errors).
 * @returns The questions.
 * @throws {WarlogError} `INVALID_FILE` when a question is malformed (a hand edit).
 */
function questionsOf(record: EntityRecord, slug: string): Question[] {
  const raw = record.data['questions'];
  const parsed = (Array.isArray(raw) ? raw : []).map((q) => QUESTION.safeParse(q));
  if (!Array.isArray(raw) || parsed.some((p) => !p.success)) {
    throw new WarlogError('INVALID_FILE', `questionnaire ${slug}: questions are invalid`, { reason: 'questions' });
  }
  return parsed.flatMap((p) => (p.success ? [p.data as Question] : []));
}

/** Reads and lists questionnaires. */
export class QuestionnaireStore {
  /** File system. */
  private readonly fs: FileSystem;
  /** Paths and repository of the call's roots. */
  private readonly store: EntityStore;
  /** Whether the call runs inside a repository. */
  private readonly inRepo: boolean;

  /**
   * Creates the store.
   * @param fs - File system.
   * @param store - Entity store of the call.
   * @param inRepo - Whether a repository root exists.
   */
  constructor(fs: FileSystem, store: EntityStore, inRepo: boolean) {
    this.fs = fs;
    this.store = store;
    this.inRepo = inRepo;
  }

  /**
   * Reads the questionnaire of one scope (the built-in AAR stands in for a missing global one).
   * @param slug - Slug.
   * @param scope - Scope.
   * @returns The questionnaire, or `undefined` when there is none.
   * @throws {WarlogError} `VALIDATION` for a bad slug; `INVALID_FILE` for a malformed file; `NO_REPO_CONTEXT` for repository scope outside a repository.
   */
  async at(slug: string, scope: QuestionnaireScope): Promise<Questionnaire | undefined> {
    if (!isSlug(slug)) {
      throw new WarlogError('VALIDATION', 'slug must be lower-case letters, digits and "-" (max 80)', { field: 'slug' });
    }
    try {
      const record = await this.store.repo.read(refOfQuestionnaire(slug, scope));
      return {
        slug,
        title: String(record.data['title'] ?? slug),
        version: Number(record.data['version'] ?? 1),
        scope,
        description: record.body,
        questions: questionsOf(record, slug),
        builtin: false,
        record,
      };
    } catch (error: unknown) {
      if (isWarlogError(error, 'NOT_FOUND')) {
        return slug === AAR_SLUG && scope === 'global' ? builtinAar() : undefined;
      }
      throw error;
    }
  }

  /**
   * Resolves a questionnaire: the requested scope, or the repository one before the global one.
   * @param slug - Slug.
   * @param scope - Scope to look at only, when given.
   * @returns The questionnaire.
   * @throws {WarlogError} `NOT_FOUND` when there is none; see {@link QuestionnaireStore.at}.
   */
  async resolve(slug: string, scope?: QuestionnaireScope): Promise<Questionnaire> {
    const scopes: QuestionnaireScope[] = scope !== undefined ? [scope] : this.inRepo ? ['repo', 'global'] : ['global'];
    for (const s of scopes) {
      const found = await this.at(slug, s);
      if (found !== undefined) {
        return found;
      }
    }
    throw new WarlogError('NOT_FOUND', `questionnaire ${slug} not found`, { type: 'questionnaire', slug });
  }

  /**
   * Slugs of the questionnaire files of a scope.
   * @param scope - Scope.
   * @returns Sorted slugs.
   */
  async slugs(scope: QuestionnaireScope): Promise<string[]> {
    const dir = dirname(await this.store.paths.pathFor(refOfQuestionnaire('x', scope)));
    return (await this.fs.readDir(dir))
      .filter((n) => n.endsWith('.md') && isSlug(n.slice(0, -3)))
      .map((n) => n.slice(0, -3))
      .sort();
  }

  /**
   * Every questionnaire in effect: repository ones, then global ones not overridden, plus the
   * built-in AAR when no file replaces it.
   * @returns The questionnaires.
   */
  async effective(): Promise<Questionnaire[]> {
    const repo = this.inRepo ? await this.collect('repo') : [];
    const global = (await this.collect('global')).filter((g) => !repo.some((r) => r.slug === g.slug));
    const all = [...repo, ...global];
    return all.some((q) => q.slug === AAR_SLUG) ? all : [...all, builtinAar()];
  }

  /**
   * The questionnaires defined at one scope (the built-in AAR stands in at global scope when no
   * file replaces it).
   * @param scope - Scope.
   * @returns The questionnaires.
   */
  async definedAt(scope: QuestionnaireScope): Promise<Questionnaire[]> {
    const all = scope === 'repo' && !this.inRepo ? [] : await this.collect(scope);
    return scope === 'global' && !all.some((q) => q.slug === AAR_SLUG) ? [...all, builtinAar()] : all;
  }

  /**
   * Reads every questionnaire file of a scope; malformed files are skipped.
   * @param scope - Scope.
   * @returns The questionnaires.
   */
  private async collect(scope: QuestionnaireScope): Promise<Questionnaire[]> {
    const found: Questionnaire[] = [];
    for (const slug of await this.slugs(scope)) {
      const q = await this.at(slug, scope).catch(() => undefined);
      if (q !== undefined) {
        found.push(q);
      }
    }
    return found;
  }
}

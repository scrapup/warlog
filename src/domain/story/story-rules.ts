/**
 * Rules shared by the story operations (WL-12): code format and uniqueness per project, parent
 * epic in the same project.
 */
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { requireInView } from '../shared/lookup.ts';
import { text } from '../shared/rows.ts';

/** A story code: letters, digits, `-`, `_`, `.` (e.g. `US-12`). */
export const STORY_CODE = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => [...v].every((c) => /[A-Za-z0-9._-]/.test(c)), 'letters, digits, ".", "_" or "-"');

/**
 * Fails when another live story of the project already uses a code.
 * @param view - View.
 * @param projectId - Project.
 * @param code - Code (`undefined` = none).
 * @param self - Story being updated, if any.
 * @throws {WarlogError} `VALIDATION` naming the story holding the code.
 */
export function assertCodeFree(view: StoreView, projectId: string, code: string | undefined, self?: string): void {
  if (code === undefined) {
    return;
  }
  const holder = view.list('story', projectId).find((s) => !s.deleted && s.id !== self && text(s, 'code') === code);
  if (holder !== undefined) {
    throw new WarlogError('VALIDATION', `story code ${code} is already used by story ${holder.id} in this project`, { field: 'code', holder: holder.id });
  }
}

/**
 * Checks that an epic exists in a project.
 * @param view - View.
 * @param projectId - Project.
 * @param epicId - Epic (`undefined` = none).
 * @returns The epic, when given.
 * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` when the epic belongs to another project.
 */
export function epicInProject(view: StoreView, projectId: string, epicId: string | undefined): IndexedEntity | undefined {
  if (epicId === undefined) {
    return undefined;
  }
  const epic = requireInView(view, 'epic', epicId);
  if (epic.projectId !== projectId) {
    throw new WarlogError('VALIDATION', `epic ${epicId} belongs to another project`, { field: 'epic_id' });
  }
  return epic;
}

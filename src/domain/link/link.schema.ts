/**
 * Input pieces of the link operations.
 */
import { z } from 'zod';
import { LINK_RELATIONS, MAX_TARGET_CHARS, parseLinkTarget } from './link-target-parser.ts';

/** A relation. */
export const LINK_REL = z.enum(LINK_RELATIONS).describe('Relation: implements, tests, commit, derived_from, supersedes or relates');

/** A link target. */
export const LINK_TARGET = z
  .string()
  .max(MAX_TARGET_CHARS)
  .refine((v) => parseLinkTarget(v) !== undefined, 'must be an entity ID or spec:<path>[#anchor], git:<sha>, test:<path>::<name>, file:<path>[:line] or url:https://…')
  .describe('Entity ID, or spec:<path>[#anchor] | git:<sha> | test:<path>::<name> | file:<path>[:line] | url:https://…');

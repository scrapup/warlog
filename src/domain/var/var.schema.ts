/**
 * Input pieces of the variable operations (WL-25..WL-28).
 */
import { z } from 'zod';
import { isVarName } from '../../core/security/identifiers.ts';
import { idField } from '../shared/fields.ts';
import { VAR_SCOPES } from './var.repository.ts';

/** A variable name (dots are namespaces, WL-27). */
export const VAR_NAME = z.string().refine(isVarName, 'must be [a-z0-9_.-], 1-128 characters, no ".."').describe('Variable name; dots are namespaces (e.g. forge.parallel_executors)');

/** A write scope. */
export const VAR_SCOPE = z.enum(VAR_SCOPES).describe('Scope: project, repo (repository) or global');

/** The project of a project-scoped variable. */
export const VAR_PROJECT = idField('Project ID (project scope; defaults to WARLOG_PROJECT when that is an ID)').optional();

/** A value: scalar, array or object, exactly as typed (no coercion). */
export const VAR_VALUE = z
  .union([z.string().max(100_000), z.number(), z.boolean(), z.array(z.unknown()).max(10_000), z.record(z.string(), z.unknown())])
  .describe('Value (a JSON value; from the command line, valid JSON keeps its type and anything else is a string)');

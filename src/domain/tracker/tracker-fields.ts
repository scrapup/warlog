/**
 * Input pieces of the tracker queries.
 */
import { z } from 'zod';

/** An ISO 8601 date or date-time. */
export const ISO_INSTANT = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO 8601 date or date-time');

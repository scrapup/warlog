/**
 * Checks shared by question types: plain text, whole-list limits and calendar dates.
 */

/**
 * Tells whether a text has no control characters other than line breaks and tabs.
 * @param text - Text.
 * @returns `true` when printable.
 */
export function isPrintable(text: string): boolean {
  return [...text].every((c) => c >= ' ' || c === '\n' || c === '\r' || c === '\t');
}

/**
 * Checks a text answer.
 * @param answer - The answer.
 * @param max - Longest accepted text.
 * @returns A message when invalid.
 */
export function checkText(answer: unknown, max: number): string | undefined {
  if (typeof answer !== 'string') {
    return 'must be text';
  }
  if (!isPrintable(answer)) {
    return 'must not contain control characters';
  }
  return answer.length > max ? `must be at most ${max} characters` : undefined;
}

/**
 * Checks the size of a list answer.
 * @param count - Items given.
 * @param min - Fewest items (optional).
 * @param max - Most items (optional).
 * @returns A message when out of range.
 */
export function checkCount(count: number, min: number | undefined, max: number | undefined): string | undefined {
  if (min !== undefined && count < min) {
    return `needs at least ${min} item(s)`;
  }
  return max !== undefined && count > max ? `allows at most ${max} item(s)` : undefined;
}

/**
 * Tells whether a text is a real calendar date `YYYY-MM-DD`.
 * @param text - Candidate.
 * @returns `true` for a valid date.
 */
export function isIsoDate(text: string): boolean {
  const parts = text.split('-');
  if (parts.length !== 3 || [4, 2, 2].some((n, i) => parts[i]?.length !== n)) {
    return false;
  }
  const [y, m, d] = parts.map(toNumber);
  const date = new Date(Date.UTC(y ?? Number.NaN, (m ?? Number.NaN) - 1, d ?? Number.NaN));
  return date.getUTCFullYear() === y && date.getUTCMonth() === (m ?? Number.NaN) - 1 && date.getUTCDate() === d;
}

/**
 * Number of a digit string.
 * @param text - Digits.
 * @returns The number, or `NaN` when not all digits.
 */
function toNumber(text: string): number {
  return text !== '' && [...text].every((c) => c >= '0' && c <= '9') ? Number(text) : Number.NaN;
}

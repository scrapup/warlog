/**
 * `{variable}` substitution for templates by a literal scan (no regular expression, linear in
 * the text length, WL-48): `{name}` with `name` made of letters, digits and `_` is replaced when
 * a value is given; otherwise it is left as is and reported.
 */
import { isWord } from '../../core/security/char-classes.ts';

/** Result of a substitution. */
export interface Substituted {
  /** Text with known placeholders replaced. */
  readonly text: string;
  /** Placeholder names without a value. */
  readonly unresolved: readonly string[];
  /** `true` when the text would pass `maxLength`; the scan stops there and `text` is empty. */
  readonly tooLong: boolean;
}

/**
 * Tells whether a placeholder name is well formed.
 * @param name - Text between the braces.
 * @returns `true` for one or more word characters.
 */
function isName(name: string): boolean {
  return name.length > 0 && [...name].every(isWord);
}

/** Positions of a brace pair. */
interface Braces {
  /** Opening brace, `-1` when none precedes the closing one. */
  readonly open: number;
  /** Closing brace, `-1` when none is left. */
  readonly close: number;
}

/**
 * Finds the next closing brace and the opening brace nearest to it.
 * @param text - Text.
 * @param at - Where to start.
 * @returns Positions, `-1` when absent (`open` is `-1` when no `{` precedes the `}`).
 */
function nextBraces(text: string, at: number): Braces {
  const close = text.indexOf('}', at);
  const inner = close < 0 ? -1 : text.slice(at, close).lastIndexOf('{');
  return { open: inner < 0 ? -1 : at + inner, close };
}

/**
 * Builds the result; an over-long text is dropped, not returned.
 * @param pieces - Pieces of the text.
 * @param unresolved - Unresolved names.
 * @param tooLong - Whether the limit was passed.
 * @returns The result.
 */
function resultOf(pieces: readonly string[], unresolved: ReadonlySet<string>, tooLong: boolean): Substituted {
  return { text: tooLong ? '' : pieces.join(''), unresolved: [...unresolved], tooLong };
}

/**
 * Replaces the placeholders of a text.
 * @param text - Template text.
 * @param variables - Values by name.
 * @param maxLength - Longest result wanted: a short template with a long value repeated many
 *   times must not build hundreds of megabytes before anyone looks at the size.
 * @returns The text, the unresolved names and whether the limit was passed.
 */
export function substitute(text: string, variables: Readonly<Record<string, string>>, maxLength = Number.POSITIVE_INFINITY): Substituted {
  const out: string[] = [];
  let length = 0;
  const unresolved = new Set<string>();
  let at = 0;
  for (;;) {
    const { open, close } = nextBraces(text, at);
    if (close < 0) {
      break;
    }
    if (open < 0) {
      out.push(text.slice(at, close + 1));
      at = close + 1;
      continue;
    }
    const name = text.slice(open + 1, close);
    const known = isName(name) && Object.hasOwn(variables, name);
    if (!known && isName(name)) {
      unresolved.add(name);
    }
    const head = text.slice(at, open);
    const value = known ? String(variables[name]) : text.slice(open, close + 1);
    length += head.length + value.length;
    if (length > maxLength) {
      return resultOf([], unresolved, true);
    }
    out.push(head, value);
    at = close + 1;
  }
  out.push(text.slice(at));
  return resultOf(out, unresolved, length + text.length - at > maxLength);
}

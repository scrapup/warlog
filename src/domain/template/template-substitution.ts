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
}

/**
 * Tells whether a placeholder name is well formed.
 * @param name - Text between the braces.
 * @returns `true` for one or more word characters.
 */
function isName(name: string): boolean {
  return name.length > 0 && [...name].every(isWord);
}

/**
 * Replaces the placeholders of a text.
 * @param text - Template text.
 * @param variables - Values by name.
 * @returns The text and the unresolved names.
 */
export function substitute(text: string, variables: Readonly<Record<string, string>>): Substituted {
  const out: string[] = [];
  const unresolved: string[] = [];
  let at = 0;
  for (;;) {
    const close = text.indexOf('}', at);
    if (close < 0) {
      break;
    }
    const inner = text.slice(at, close).lastIndexOf('{');
    const open = inner < 0 ? -1 : at + inner;
    if (open < 0) {
      out.push(text.slice(at, close + 1));
      at = close + 1;
      continue;
    }
    const name = text.slice(open + 1, close);
    const known = isName(name) && Object.hasOwn(variables, name);
    if (isName(name) && !known && !unresolved.includes(name)) {
      unresolved.push(name);
    }
    out.push(text.slice(at, open), known ? String(variables[name]) : text.slice(open, close + 1));
    at = close + 1;
  }
  out.push(text.slice(at));
  return { text: out.join(''), unresolved };
}

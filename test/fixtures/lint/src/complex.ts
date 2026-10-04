/**
 * Classifies a number with too many branches.
 * @param n - Input.
 * @returns A label.
 */
export function classify(n: number): string {
  if (n === 1) return 'a';
  if (n === 2) return 'b';
  if (n === 3) return 'c';
  if (n === 4) return 'd';
  if (n === 5) return 'e';
  if (n === 6) return 'f';
  if (n === 7) return 'g';
  if (n === 8) return 'h';
  if (n === 9) return 'i';
  if (n === 10) return 'j';
  return 'z';
}

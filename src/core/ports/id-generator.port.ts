/** Identifier port: locally generated, coordination-free, time-sortable ids (WL-07). */
export interface IdGenerator {
  /**
   * Generates a new identifier.
   * @returns A 26-character ULID, strictly greater than the previous one of this generator.
   */
  next(): string;
}

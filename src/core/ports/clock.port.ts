/** Clock port: the only source of the current time. */
export interface Clock {
  /**
   * Returns the current instant.
   * @returns The current date.
   */
  now(): Date;
}

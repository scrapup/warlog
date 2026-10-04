import { describe, expect, it } from '@jest/globals';
import { COMMON_OPTIONS, HELP_OPTION } from '../../../../src/adapters/cli/common-options.ts';
import { OUTPUT_OPTION_KEYS } from '../../../../src/adapters/shared/output-options.ts';
import { RESERVED_INPUT_KEYS } from '../../../../src/core/mediator/operation-registry.ts';

/**
 * Input key of a long flag (`--json-input <json>` → `json_input`).
 * @param flags - Commander flags.
 * @returns The key, or the flags when no long flag is found.
 */
function keyOf(flags: string): string {
  return /--([a-z-]+)/.exec(flags)?.[1]?.split('-').join('_') ?? flags;
}

describe('interface options reserved by the registry', () => {
  it('[WL-35] reserves every output option key', () => {
    expect(RESERVED_INPUT_KEYS).toEqual(expect.arrayContaining([...OUTPUT_OPTION_KEYS]));
  });

  it('[WL-35] reserves every common command-line option', () => {
    expect(RESERVED_INPUT_KEYS).toEqual(expect.arrayContaining([...COMMON_OPTIONS, HELP_OPTION].map((o) => keyOf(o.flags))));
  });
});

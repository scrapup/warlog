import { describe, expect, it } from '@jest/globals';
import config, { COVERAGE_GATE } from '../../../jest.config.ts';

describe('jest configuration (plan §7.3)', () => {
  it('gates unit coverage at 95 % for every metric', () => {
    expect(COVERAGE_GATE).toBe(95);
    expect(config.coverageThreshold).toEqual({ global: { statements: 95, branches: 95, functions: 95, lines: 95 } });
  });

  it('measures every source and script module except entry points and composition roots', () => {
    expect(config.collectCoverageFrom).toEqual(['src/**/*.ts', 'scripts/**/*.ts', '!src/bin/**', '!src/compose/**', '!scripts/*.ts']);
  });

  it('declares the five test projects', () => {
    const names = (config.projects ?? []).map((p) => (typeof p === 'string' ? p : p['displayName']));
    expect(names).toEqual(['unit', 'integration', 'e2e-cli', 'e2e-mcp', 'bench']);
  });
});

/**
 * Jest configuration: five independent projects (plan §7.3) and the unit coverage gate.
 */
import type { Config } from 'jest';

/** Minimum unit coverage, in percent, for statements, branches, functions and lines. */
export const COVERAGE_GATE = 95;

/** ts-jest ESM transform shared by every project. */
const transform: NonNullable<Config['transform']> = {
  '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json' }],
};

/**
 * Builds one Jest project rooted at `test/<name>`.
 * @param name - Project (and directory) name.
 * @param testMatch - Glob of the test files of the project.
 * @returns The project configuration.
 */
function project(name: string, testMatch: string): Config {
  return {
    displayName: name,
    rootDir: '.',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    transform,
    // ts-jest rewrites relative `.ts` imports to `.js`; resolve them back to the sources.
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    testMatch: [`<rootDir>/test/${name}/**/${testMatch}`],
  };
}

const config: Config = {
  projects: [
    project('unit', '*.test.ts'),
    project('integration', '*.test.ts'),
    project('e2e-cli', '*.test.ts'),
    project('e2e-mcp', '*.test.ts'),
    project('bench', '*.bench.ts'),
  ],
  collectCoverageFrom: ['src/**/*.ts', 'scripts/**/*.ts', '!src/bin/**', '!src/compose/**', '!scripts/*.ts'],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      statements: COVERAGE_GATE,
      branches: COVERAGE_GATE,
      functions: COVERAGE_GATE,
      lines: COVERAGE_GATE,
    },
  },
};

export default config;

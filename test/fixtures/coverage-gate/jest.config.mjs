// Fixture project proving the unit coverage gate: same threshold as the real configuration.
import { COVERAGE_GATE } from '../../../jest.config.ts';

export default {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/*.test.mjs'],
  transform: {},
  collectCoverageFrom: ['lib.mjs'],
  coverageReporters: ['text-summary'],
  coverageThreshold: {
    global: { statements: COVERAGE_GATE, branches: COVERAGE_GATE, functions: COVERAGE_GATE, lines: COVERAGE_GATE },
  },
};

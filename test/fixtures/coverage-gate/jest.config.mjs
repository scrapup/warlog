// Fixture project proving the unit coverage gate: reuses the real threshold configuration.
import real from '../../../jest.config.ts';

export default {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/*.test.mjs'],
  transform: {},
  collectCoverageFrom: ['lib.mjs'],
  coverageReporters: ['text-summary'],
  coverageThreshold: real.coverageThreshold,
};

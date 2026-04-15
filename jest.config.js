/** @type {import('jest').Config} */
module.exports = {
  // Tell Jest to look for tests in all packages
  projects: ['<rootDir>/packages/*'],

  // When running from the root, collect coverage across all packages
  collectCoverageFrom: ['packages/*/src/**/*.ts', '!packages/*/src/**/*.d.ts'],
};

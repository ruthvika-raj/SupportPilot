/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest to transform TypeScript files before running them.
  // Without this, Jest would try to run .ts files as plain JS and fail.
  preset: 'ts-jest',

  // Run in Node.js environment (not browser/jsdom)
  testEnvironment: 'node',

  // Only run files matching this pattern
  testMatch: ['**/*.test.ts'],

  // ts-jest configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // Point ts-jest at the package's own tsconfig
      tsconfig: '<rootDir>/tsconfig.json',
    }],
  },
};

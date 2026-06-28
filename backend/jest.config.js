module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.{ts,js}'],
  coverageDirectory: '../coverage',
  testPathIgnorePatterns: ['/node_modules/', '/test/jest-e2e.json'],
};
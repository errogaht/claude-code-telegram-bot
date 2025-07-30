module.exports = {
  // Testing environment
  testEnvironment: 'node',
  
  // Root directory for tests
  roots: ['<rootDir>/tests', '<rootDir>'],
  
  // Test match patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    '*.js',
    '!node_modules/**',
    '!coverage/**',
    '!tests/**',
    '!scripts/**',
    '!*.config.js',
    '!oldbot.js',
    '!test-*.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Module paths
  moduleFileExtensions: ['js', 'json'],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Error on deprecated usage
  errorOnDeprecated: true,
  
  // Maximum worker processes
  maxWorkers: '50%'
};
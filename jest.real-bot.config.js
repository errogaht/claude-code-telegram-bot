/**
 * Jest configuration for real-bot tests
 * Runs tests sequentially to prevent race conditions and port conflicts
 */

module.exports = {
  // Extend base configuration
  ...require('./jest.config.js'),
  
  // Only run real-bot tests
  testMatch: [
    '<rootDir>/tests/real-bot/**/*.test.js'
  ],
  
  // Run tests sequentially to prevent race conditions
  maxWorkers: 1,
  
  // Increase timeout for integration tests
  testTimeout: 60000,
  
  // Better error reporting for integration tests
  verbose: true,
  
  // Setup file specific to real-bot tests
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js'
  ],
  
  // Collect coverage from real-bot test sources
  collectCoverageFrom: [
    'bot.js',
    'claude-stream-processor.js',
    'SessionManager.js',
    'KeyboardHandlers.js',
    'tests/real-bot/**/*.js',
    '!tests/real-bot/**/*.test.js'
  ]
};
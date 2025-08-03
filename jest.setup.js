const sinon = require('sinon');

// Global test utilities
global.sinon = sinon;

// Mock console methods to reduce noise in tests
global.mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Test helper functions
global.testHelpers = {
  // Create a mock Telegram bot API response
  createMockTelegramResponse: (success = true, result = {}) => ({
    ok: success,
    result,
    error_code: success ? undefined : 400,
    description: success ? undefined : 'Test error'
  }),

  // Create a mock Telegram message
  createMockMessage: (overrides = {}) => ({
    message_id: 123,
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: 67890,
      type: 'private'
    },
    date: Math.floor(Date.now() / 1000),
    text: 'Test message',
    ...overrides
  }),

  // Create a mock Claude response
  createMockClaudeResponse: (content = 'Test response', overrides = {}) => ({
    id: 'msg_123',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: content
      }
    ],
    model: 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 20
    },
    ...overrides
  }),

  // Sleep utility for async tests
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate random test data
  randomString: (length = 10) => Math.random().toString(36).substring(2, length + 2),
  randomId: () => Math.floor(Math.random() * 1000000),

  // Create a mock Telegram message with custom properties
  createMockTelegramMessage: (overrides = {}) => ({
    message_id: Math.floor(Math.random() * 1000000),
    from: {
      id: Math.floor(Math.random() * 1000000),
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: Math.floor(Math.random() * 1000000),
      type: 'private'
    },
    date: Math.floor(Date.now() / 1000),
    text: 'Test message',
    ...overrides
  }),

  // Create a mock HTTP error response
  createMockHttpError: (status = 500, message = 'Internal Server Error') => {
    const error = new Error(message);
    error.response = {
      status,
      statusText: message,
      data: {
        error: {
          message,
          type: 'http_error'
        }
      }
    };
    return error;
  },

  // Validate that a string is a valid UUID
  isValidUUID: (str) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  },

  // Validate that a message is properly formatted for Telegram
  isValidTelegramMessage: (message) => {
    if (typeof message !== 'string') {
      return false;
    }
    
    // Check length limit
    if (message.length > 4096) {
      return false;
    }
    
    // Check for properly balanced HTML tags
    const openTags = (message.match(/<[^/][^>]*>/g) || []);
    const closeTags = (message.match(/<\/[^>]*>/g) || []);
    
    // Simple validation - count should match for basic tags
    const tagCounts = {};
    
    openTags.forEach(tag => {
      const tagMatch = tag.match(/<(\w+)/);
      if (tagMatch) {
        const tagName = tagMatch[1];
        tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
      }
    });
    
    closeTags.forEach(tag => {
      const tagMatch = tag.match(/<\/(\w+)/);
      if (tagMatch) {
        const tagName = tagMatch[1];
        tagCounts[tagName] = (tagCounts[tagName] || 0) - 1;
      }
    });
    
    // All tag counts should be zero (balanced)
    return Object.values(tagCounts).every(count => count === 0);
  },

  // File system test helpers
  createTempFile: async (content = '', extension = '.txt') => {
    const fs = require('fs');
    const path = require('path');
    const tempDir = path.join(__dirname, 'tests', 'fixtures', 'temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filename = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`;
    const tempFile = path.join(tempDir, filename);
    await fs.promises.writeFile(tempFile, content);
    return tempFile;
  },

  cleanupTempFile: async (filePath) => {
    const fs = require('fs');
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
};

// Setup and teardown hooks
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  sinon.restore();
  
  // Reset console mocks
  Object.keys(global.mockConsole).forEach(method => {
    global.mockConsole[method].mockClear();
  });
});

afterEach(() => {
  // Clean up any sinon stubs
  sinon.restore();
});

// Global test configuration
jest.setTimeout(30000); // 30 second timeout for all tests

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection in test:', reason);
});

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = 'test-key-12345';
process.env.TELEGRAM_BOT_TOKEN = 'test:token';

// CRITICAL PROTECTION: Globally prevent any real claude process spawning in tests
const originalSpawn = require('child_process').spawn;
const mockSpawn = jest.fn((command, args, options) => {
  if (command === 'claude') {
    console.error('[JEST GLOBAL PROTECTION] Blocked real claude process spawn in test environment!');
    throw new Error('CRITICAL TEST SAFETY VIOLATION: Real claude process spawn blocked by Jest global protection');
  }
  return originalSpawn(command, args, options);
});

// Override child_process spawn globally
require('child_process').spawn = mockSpawn;

// Also set global protection flag
global.JEST_CLAUDE_PROTECTION_ACTIVE = true;

console.log('Jest setup complete - test environment initialized with claude process protection');
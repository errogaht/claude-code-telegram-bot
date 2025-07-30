const fs = require('fs');
const path = require('path');

class TestUtils {
  /**
   * Create a temporary file for testing
   */
  static async createTempFile(content = '', extension = '.txt') {
    const tempDir = path.join(__dirname, '../fixtures/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filename = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`;
    const filePath = path.join(tempDir, filename);
    
    await fs.promises.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Clean up temporary file
   */
  static async cleanupTempFile(filePath) {
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      // Ignore if file doesn't exist
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Clean up all temporary files
   */
  static async cleanupAllTempFiles() {
    const tempDir = path.join(__dirname, '../fixtures/temp');
    if (!fs.existsSync(tempDir)) {
      return;
    }

    const files = await fs.promises.readdir(tempDir);
    const cleanupPromises = files.map(file => 
      this.cleanupTempFile(path.join(tempDir, file))
    );
    
    await Promise.all(cleanupPromises);
    
    try {
      await fs.promises.rmdir(tempDir);
    } catch (err) {
      // Ignore if directory is not empty or doesn't exist
      // Error is expected and can be ignored
      void err;
    }
  }

  /**
   * Wait for a specified amount of time
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate random string
   */
  static randomString(length = 10) {
    return Math.random().toString(36).substring(2, length + 2);
  }

  /**
   * Generate random ID
   */
  static randomId() {
    return Math.floor(Math.random() * 1000000);
  }

  /**
   * Create a mock Telegram message with custom properties
   */
  static createMockTelegramMessage(overrides = {}) {
    return {
      message_id: this.randomId(),
      from: {
        id: this.randomId(),
        is_bot: false,
        first_name: 'Test',
        username: 'testuser'
      },
      chat: {
        id: this.randomId(),
        type: 'private'
      },
      date: Math.floor(Date.now() / 1000),
      text: 'Test message',
      ...overrides
    };
  }

  /**
   * Create a mock Claude API response
   */
  static createMockClaudeResponse(content = 'Test response', overrides = {}) {
    return {
      id: `msg_${this.randomString(8)}`,
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
        input_tokens: Math.floor(Math.random() * 100) + 10,
        output_tokens: Math.floor(Math.random() * 100) + 20
      },
      ...overrides
    };
  }

  /**
   * Create a mock HTTP error response
   */
  static createMockHttpError(status = 500, message = 'Internal Server Error') {
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
  }

  /**
   * Create a mock Telegram API error
   */
  static createMockTelegramError(errorCode = 400, description = 'Bad Request') {
    return {
      ok: false,
      error_code: errorCode,
      description,
      parameters: {}
    };
  }

  /**
   * Validate that a string is a valid UUID
   */
  static isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Validate that a message is properly formatted for Telegram
   */
  static isValidTelegramMessage(message) {
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
  }

  /**
   * Mock console methods to reduce noise in tests
   */
  static mockConsole() {
    return {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };
  }

  /**
   * Restore console methods
   */
  static restoreConsole() {
    if (global.originalConsole) {
      global.console = global.originalConsole;
    }
  }
}

module.exports = TestUtils;
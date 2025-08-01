/**
 * Telegram Bot API Mock Implementations
 * Comprehensive mocks for testing Telegram bot functionality
 */

/**
 * Create a mock Telegram bot instance
 */
function createMockTelegramBot(options = {}) {
  const bot = {
    token: options.token || 'mock-bot-token',
    
    // Message sending
    sendMessage: jest.fn().mockResolvedValue({
      message_id: options.messageId || Math.floor(Math.random() * 10000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: options.chatId || 123 },
      text: 'Mock message'
    }),

    // Message editing
    editMessageText: jest.fn().mockResolvedValue({
      message_id: options.messageId || Math.floor(Math.random() * 10000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: options.chatId || 123 },
      text: 'Edited message'
    }),

    // Message deletion
    deleteMessage: jest.fn().mockResolvedValue(true),

    // File operations
    getFile: jest.fn().mockResolvedValue({
      file_id: 'mock-file-id',
      file_unique_id: 'mock-unique-id',
      file_size: 1024,
      file_path: 'documents/file.txt'
    }),

    downloadFile: jest.fn().mockResolvedValue(Buffer.from('mock file content')),

    // Chat actions
    sendChatAction: jest.fn().mockResolvedValue(true),

    // Document sending
    sendDocument: jest.fn().mockResolvedValue({
      message_id: Math.floor(Math.random() * 10000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: options.chatId || 123 },
      document: {
        file_id: 'mock-doc-id',
        file_name: 'document.txt',
        mime_type: 'text/plain',
        file_size: 1024
      }
    }),

    // Photo sending
    sendPhoto: jest.fn().mockResolvedValue({
      message_id: Math.floor(Math.random() / 10000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: options.chatId || 123 },
      photo: [{
        file_id: 'mock-photo-id',
        file_unique_id: 'mock-photo-unique',
        width: 800,
        height: 600,
        file_size: 50000
      }]
    }),

    // Bot info
    getMe: jest.fn().mockResolvedValue({
      id: 123456789,
      is_bot: true,
      first_name: 'MockBot',
      username: 'mock_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false
    }),

    // Chat info
    getChat: jest.fn().mockResolvedValue({
      id: options.chatId || 123,
      type: 'private',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser'
    }),

    // Event listeners (for testing event-based bots)
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    emit: jest.fn(),

    // Webhook operations
    setWebHook: jest.fn().mockResolvedValue(true),
    deleteWebHook: jest.fn().mockResolvedValue(true),
    getWebHookInfo: jest.fn().mockResolvedValue({
      url: '',
      has_custom_certificate: false,
      pending_update_count: 0
    }),

    // Inline keyboard callbacks
    answerCallbackQuery: jest.fn().mockResolvedValue(true),

    // Admin operations
    getChatAdministrators: jest.fn().mockResolvedValue([]),
    getChatMember: jest.fn().mockResolvedValue({
      user: { id: 123, first_name: 'Test' },
      status: 'member'
    }),

    // Error simulation methods
    simulateError: function(method, error) {
      if (this[method] && typeof this[method].mockRejectedValue === 'function') {
        this[method].mockRejectedValue(error);
      }
    },

    simulateRateLimit: function(method, retryAfter = 30) {
      const error = new Error('Too Many Requests');
      error.code = 429;
      error.response = {
        status: 429,
        data: {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 30',
          parameters: { retry_after: retryAfter }
        }
      };
      this.simulateError(method, error);
    },

    // Reset all mocks
    resetMocks: function() {
      Object.keys(this).forEach(key => {
        if (this[key] && typeof this[key].mockReset === 'function') {
          this[key].mockReset();
        }
      });
    }
  };

  return bot;
}

/**
 * Create mock Telegram message objects
 */
function createMockMessage(overrides = {}) {
  return {
    message_id: Math.floor(Math.random() * 10000),
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: 123,
      type: 'private',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      ...overrides.chat
    },
    from: {
      id: 456,
      is_bot: false,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      language_code: 'en',
      ...overrides.from
    },
    text: 'Test message',
    ...overrides
  };
}

/**
 * Create mock voice message
 */
function createMockVoiceMessage(overrides = {}) {
  return createMockMessage({
    voice: {
      duration: 10,
      mime_type: 'audio/ogg',
      file_id: 'voice-file-id',
      file_unique_id: 'voice-unique-id',
      file_size: 8192,
      ...overrides.voice
    },
    ...overrides
  });
}

/**
 * Create mock document message
 */
function createMockDocumentMessage(overrides = {}) {
  return createMockMessage({
    document: {
      file_name: 'document.txt',
      mime_type: 'text/plain',
      file_id: 'doc-file-id',
      file_unique_id: 'doc-unique-id',
      file_size: 1024,
      ...overrides.document
    },
    ...overrides
  });
}

/**
 * Create mock photo message
 */
function createMockPhotoMessage(overrides = {}) {
  return createMockMessage({
    photo: [{
      file_id: 'photo-file-id',
      file_unique_id: 'photo-unique-id',
      width: 800,
      height: 600,
      file_size: 50000,
      ...overrides.photo
    }],
    ...overrides
  });
}

/**
 * Create mock callback query
 */
function createMockCallbackQuery(overrides = {}) {
  return {
    id: 'callback-id-' + Math.random().toString(36).substr(2, 9),
    from: {
      id: 456,
      is_bot: false,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      ...overrides.from
    },
    message: createMockMessage(overrides.message),
    data: 'callback_data',
    ...overrides
  };
}

/**
 * Create mock inline keyboard
 */
function createMockInlineKeyboard(buttons = []) {
  if (buttons.length === 0) {
    buttons = [
      [{ text: 'Button 1', callback_data: 'btn1' }],
      [{ text: 'Button 2', callback_data: 'btn2' }]
    ];
  }

  return {
    inline_keyboard: buttons
  };
}

/**
 * Create mock reply keyboard
 */
function createMockReplyKeyboard(buttons = []) {
  if (buttons.length === 0) {
    buttons = [
      [{ text: 'Option 1' }, { text: 'Option 2' }],
      [{ text: 'Option 3' }]
    ];
  }

  return {
    keyboard: buttons,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

/**
 * Mock Telegram API error responses
 */
function createTelegramError(type = 'generic') {
  const errors = {
    generic: {
      message: 'Telegram API Error',
      code: 400,
      response: {
        status: 400,
        data: {
          ok: false,
          error_code: 400,
          description: 'Bad Request'
        }
      }
    },
    rateLimit: {
      message: 'Too Many Requests',
      code: 429,
      response: {
        status: 429,
        data: {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 30',
          parameters: { retry_after: 30 }
        }
      }
    },
    forbidden: {
      message: 'Forbidden',
      code: 403,
      response: {
        status: 403,
        data: {
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user'
        }
      }
    },
    badRequest: {
      message: 'Bad Request',
      code: 400,
      response: {
        status: 400,
        data: {
          ok: false,
          error_code: 400,
          description: 'Bad Request: message is too long'
        }
      }
    },
    markdownParsingError: {
      message: 'ETELEGRAM: 400 Bad Request: can\'t parse entities: Can\'t find end of the entity starting at byte offset 100',
      code: 'ETELEGRAM',
      response: {
        status: 400,
        body: {
          ok: false,
          error_code: 400,
          description: "Bad Request: can't parse entities: Can't find end of the entity starting at byte offset 100"
        }
      }
    },
    notFound: {
      message: 'Not Found',
      code: 404,
      response: {
        status: 404,
        data: {
          ok: false,
          error_code: 404,
          description: 'Not Found: chat not found'
        }
      }
    },
    network: {
      message: 'Network Error',
      code: 'ECONNRESET',
      request: {}
    }
  };

  const error = new Error(errors[type].message);
  Object.assign(error, errors[type]);
  return error;
}

/**
 * Create mock HTTP response for file downloads
 */
function createMockFileResponse(content = 'mock file content', contentType = 'text/plain') {
  return {
    data: Buffer.from(content),
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': contentType,
      'content-length': content.length.toString()
    }
  };
}

/**
 * Mock axios responses for file operations
 */
function mockAxiosFileOperations() {
  const axios = require('axios');
  
  // Mock file download
  axios.get.mockImplementation((url) => {
    if (url.includes('api.telegram.org/file/')) {
      return Promise.resolve(createMockFileResponse());
    }
    return Promise.reject(new Error('Unknown URL'));
  });

  // Mock API requests
  axios.post.mockImplementation((url, data) => {
    if (url.includes('api.telegram.org/bot')) {
      return Promise.resolve({
        data: { ok: true, result: { message_id: 123 } }
      });
    }
    return Promise.reject(new Error('Unknown API endpoint'));
  });
}

/**
 * Test utilities for timing and async operations
 */
const testUtils = {
  // Wait for a specified time
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Wait for next tick
  nextTick: () => new Promise(resolve => process.nextTick(resolve)),

  // Wait for condition to be true
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await testUtils.sleep(interval);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  // Mock console methods and capture output
  mockConsole: () => {
    const originalLog = console.log;
    const originalError = console.error;
    const logs = [];
    const errors = [];

    console.log = jest.fn((...args) => {
      logs.push(args.join(' '));
    });

    console.error = jest.fn((...args) => {
      errors.push(args.join(' '));
    });

    return {
      logs,
      errors,
      restore: () => {
        console.log = originalLog;
        console.error = originalError;
      }
    };
  }
};

module.exports = {
  createMockTelegramBot,
  createMockMessage,
  createMockVoiceMessage,
  createMockDocumentMessage,
  createMockPhotoMessage,
  createMockCallbackQuery,
  createMockInlineKeyboard,
  createMockReplyKeyboard,
  createTelegramError,
  createMockFileResponse,
  mockAxiosFileOperations,
  testUtils
};
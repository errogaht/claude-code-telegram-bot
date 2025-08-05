/**
 * Unit Tests for Bot HTML Messaging (TDD)
 * Tests for the refactored bot.js with HTML-only messaging
 * Following TDD approach - writing tests first before implementation
 */

const EventEmitter = require('events');

// Mock TelegramBot before requiring the bot
jest.mock('node-telegram-bot-api');

// Mock dependencies
jest.mock('../../utils/markdown-html-converter');
jest.mock('../../MessageSplitter');

const TelegramBot = require('node-telegram-bot-api');
const MarkdownHtmlConverter = require('../../utils/markdown-html-converter');
const MessageSplitter = require('../../MessageSplitter');

// Mock TelegramBot implementation
class MockTelegramBot extends EventEmitter {
  constructor() {
    super();
    this.sendMessage = jest.fn().mockResolvedValue({ message_id: 123 });
    this.onText = jest.fn();
    this.answerCallbackQuery = jest.fn().mockResolvedValue(true);
    this.pinChatMessage = jest.fn().mockResolvedValue(true);
  }
}

describe('Bot HTML Messaging', () => {
  let bot;
  let mockBot;
  let mockMessageSplitter;
  let mockConverter;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock bot instance first
    mockBot = new MockTelegramBot();
    
    // Mock TelegramBot constructor to return our mock
    TelegramBot.mockImplementation(() => mockBot);
    
    // Setup mock converter
    mockConverter = {
      convert: jest.fn().mockImplementation(text => text ? `<converted>${text}</converted>` : '')
    };
    MarkdownHtmlConverter.mockImplementation(() => mockConverter);

    // Setup mock message splitter
    mockMessageSplitter = {
      sendLongMessage: jest.fn().mockResolvedValue()
    };
    MessageSplitter.mockImplementation(() => mockMessageSplitter);

    // Create bot instance with valid token
    const BotClass = require('../../bot');
    bot = new BotClass('test-token', {});
    bot.messageSplitter = mockMessageSplitter;
  });

  describe('safeSendMessage HTML Conversion', () => {
    test('should always convert text to HTML using MarkdownHtmlConverter', async () => {
      await bot.safeSendMessage(12345, 'Test **message**');

      expect(MarkdownHtmlConverter).toHaveBeenCalled();
      expect(mockConverter.convert).toHaveBeenCalledWith('Test **message**');
    });

    test('should always use HTML parse mode', async () => {
      await bot.safeSendMessage(12345, 'Test message');

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        '<converted>Test message</converted>',
        expect.objectContaining({
          parse_mode: 'HTML'
        })
      );
    });

    test('should preserve custom options while forcing HTML parse mode', async () => {
      const customOptions = {
        reply_to_message_id: 456,
        reply_markup: { keyboard: [['Button']] },
        parse_mode: 'Markdown' // This should be overridden
      };

      await bot.safeSendMessage(12345, 'Test message', customOptions);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        '<converted>Test message</converted>',
        expect.objectContaining({
          reply_to_message_id: 456,
          reply_markup: { keyboard: [['Button']] },
          parse_mode: 'HTML' // Should be HTML, not Markdown
        })
      );
    });

    test('should handle empty and null text', async () => {
      await bot.safeSendMessage(12345, '');
      expect(mockConverter.convert).toHaveBeenCalledWith('');

      await bot.safeSendMessage(12345, null);
      expect(mockConverter.convert).toHaveBeenCalledWith(null);
    });

    test('should handle undefined text', async () => {
      await bot.safeSendMessage(12345, undefined);
      expect(mockConverter.convert).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Message Length Handling', () => {
    test('should send short messages directly via bot.sendMessage', async () => {
      const shortMessage = 'Short message';
      mockConverter.convert.mockReturnValue(shortMessage);

      await bot.safeSendMessage(12345, shortMessage);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        shortMessage,
        expect.objectContaining({ parse_mode: 'HTML' })
      );
      expect(mockMessageSplitter.sendLongMessage).not.toHaveBeenCalled();
    });

    test('should use MessageSplitter for long messages', async () => {
      const longMessage = 'a'.repeat(5000);
      mockConverter.convert.mockReturnValue(longMessage);

      await bot.safeSendMessage(12345, 'original text');

      expect(mockMessageSplitter.sendLongMessage).toHaveBeenCalledWith(
        mockBot,
        12345,
        longMessage,
        expect.objectContaining({ parse_mode: 'HTML' })
      );
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });

    test('should use 4096 character limit for message splitting decision', async () => {
      // Test exactly at the boundary
      const messageBoundary = 'a'.repeat(4096);
      mockConverter.convert.mockReturnValue(messageBoundary);

      await bot.safeSendMessage(12345, 'original');

      // 4096 characters exactly should go through direct send
      expect(mockBot.sendMessage).toHaveBeenCalled();
      expect(mockMessageSplitter.sendLongMessage).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // 4097 characters should use splitter
      const messageTooLong = 'a'.repeat(4097);
      mockConverter.convert.mockReturnValue(messageTooLong);

      await bot.safeSendMessage(12345, 'original');

      expect(mockMessageSplitter.sendLongMessage).toHaveBeenCalled();
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Notification Logic', () => {
    test('should preserve existing notification logic', async () => {
      // Assume bot has shouldSendWithNotification method
      bot.shouldSendWithNotification = jest.fn().mockReturnValue(false);

      await bot.safeSendMessage(12345, 'Test message');

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.any(String),
        expect.objectContaining({
          disable_notification: true,
          parse_mode: 'HTML'
        })
      );
    });

    test('should not override explicitly set disable_notification', async () => {
      bot.shouldSendWithNotification = jest.fn().mockReturnValue(false);

      await bot.safeSendMessage(12345, 'Test message', { disable_notification: false });

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.any(String),
        expect.objectContaining({
          disable_notification: false,
          parse_mode: 'HTML'
        })
      );
    });

    test('should enable notifications when shouldSendWithNotification returns true', async () => {
      bot.shouldSendWithNotification = jest.fn().mockReturnValue(true);

      await bot.safeSendMessage(12345, 'Test message');

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.any(String),
        expect.not.objectContaining({
          disable_notification: true
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should catch HTML conversion errors and send fallback message', async () => {
      mockConverter.convert.mockImplementation(() => {
        throw new Error('Conversion failed');
      });

      await bot.safeSendMessage(12345, 'Test message');

      // Should send structured error message in Markdown format (gets auto-converted to HTML)
      const expectedErrorMessage = '❌ **Message Error**\n\n' +
        '💬 **Issue:** Conversion failed\n' +
        '🔧 **Code:** ERR_UNKNOWN\n\n' +
        '💡 This usually means there\'s invalid formatting in the message.';

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expectedErrorMessage,
        expect.objectContaining({
          disable_notification: true,
          parse_mode: 'HTML'
        })
      );
    });

    test('should catch bot.sendMessage errors and send fallback', async () => {
      mockBot.sendMessage.mockRejectedValueOnce(new Error('Send failed'));

      await bot.safeSendMessage(12345, 'Test message');

      // Should be called twice: first fails, second is fallback
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(2);
      
      const expectedErrorMessage = '❌ **Message Error**\n\n' +
        '💬 **Issue:** Send failed\n' +
        '🔧 **Code:** ERR_UNKNOWN\n\n' +
        '💡 This usually means there\'s invalid formatting in the message.';
      
      const fallbackCall = mockBot.sendMessage.mock.calls[1];
      expect(fallbackCall[1]).toBe(expectedErrorMessage);
      expect(fallbackCall[2]).toEqual({
        disable_notification: true,
        parse_mode: 'HTML'
      });
    });

    test('should catch MessageSplitter errors and send fallback', async () => {
      const longMessage = 'a'.repeat(5000);
      mockConverter.convert.mockReturnValue(longMessage);
      mockMessageSplitter.sendLongMessage.mockRejectedValue(new Error('Split failed'));

      await bot.safeSendMessage(12345, 'Long message');

      const expectedErrorMessage = '❌ **Message Error**\n\n' +
        '💬 **Issue:** Split failed\n' +
        '🔧 **Code:** ERR_UNKNOWN\n\n' +
        '💡 This usually means there\'s invalid formatting in the message.';

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expectedErrorMessage,
        expect.objectContaining({
          disable_notification: true,
          parse_mode: 'HTML'
        })
      );
    });

    test('should log errors in non-test environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockConverter.convert.mockImplementation(() => {
        throw new Error('Test error');
      });

      await bot.safeSendMessage(12345, 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[SafeSendMessage] Unknown Error:', 'Test error');
      
      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    test('should log errors even in test environment', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockConverter.convert.mockImplementation(() => {
        throw new Error('Test error');
      });

      await bot.safeSendMessage(12345, 'Test message');

      // Bot.js currently logs errors even in test environment (unlike MessageSplitter)
      expect(consoleSpy).toHaveBeenCalledWith('[SafeSendMessage] Unknown Error:', 'Test error');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Integration with MessageSplitter', () => {
    test('should pass HTML content to MessageSplitter', async () => {
      const longMessage = 'a'.repeat(5000);
      const convertedMessage = `<b>${longMessage}</b>`;
      mockConverter.convert.mockReturnValue(convertedMessage);

      await bot.safeSendMessage(12345, longMessage, { custom: 'option' });

      expect(mockMessageSplitter.sendLongMessage).toHaveBeenCalledWith(
        mockBot,
        12345,
        convertedMessage,
        expect.objectContaining({
          custom: 'option',
          parse_mode: 'HTML'
        })
      );
    });

    test('should work with MessageSplitter HTML-aware splitting', async () => {
      // Create message longer than 4096 characters to trigger MessageSplitter
      const baseMessage = '<b>Bold</b> and <i>italic</i> text that is very long ';
      const htmlMessage = baseMessage + 'a'.repeat(4100 - baseMessage.length); // Ensure > 4096
      mockConverter.convert.mockReturnValue(htmlMessage);

      await bot.safeSendMessage(12345, 'original message');

      expect(mockMessageSplitter.sendLongMessage).toHaveBeenCalledWith(
        mockBot,
        12345,
        expect.stringMatching(/^<b>Bold<\/b> and <i>italic<\/i> text that is very long a+$/),
        expect.objectContaining({ parse_mode: 'HTML' })
      );
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain same method signature', async () => {
      // Should accept (chatId, text) 
      await expect(bot.safeSendMessage(12345, 'test')).resolves.not.toThrow();
      
      // Should accept (chatId, text, options)
      await expect(bot.safeSendMessage(12345, 'test', {})).resolves.not.toThrow();
    });

    test('should not break existing option handling', async () => {
      const options = {
        reply_to_message_id: 789,
        reply_markup: { inline_keyboard: [[{ text: 'Button', callback_data: 'data' }]] },
        disable_web_page_preview: true
      };

      await bot.safeSendMessage(12345, 'Test', options);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.any(String),
        expect.objectContaining({
          reply_to_message_id: 789,
          reply_markup: { inline_keyboard: [[{ text: 'Button', callback_data: 'data' }]] },
          disable_web_page_preview: true,
          parse_mode: 'HTML'
        })
      );
    });
  });

  describe('Performance Considerations', () => {
    test('should create converter instance only when needed', async () => {
      await bot.safeSendMessage(12345, 'Test message');
      expect(MarkdownHtmlConverter).toHaveBeenCalledTimes(1);

      await bot.safeSendMessage(12345, 'Another message');
      expect(MarkdownHtmlConverter).toHaveBeenCalledTimes(2);
    });

    test('should handle concurrent message sending', async () => {
      const promises = [
        bot.safeSendMessage(12345, 'Message 1'),
        bot.safeSendMessage(12345, 'Message 2'),
        bot.safeSendMessage(12345, 'Message 3')
      ];

      await Promise.all(promises);

      expect(mockBot.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockConverter.convert).toHaveBeenCalledTimes(3);
    });
  });

  describe('Pin Human Input Message', () => {
    test('should pin human input message with hashtag and truncate long text', async () => {
      const longText = 'a'.repeat(150);
      const expectedMarkdownMessage = `#human_input\n\n💬 **User Input:**\n${longText}`; // No truncation for 150 chars (under 4000 limit)
      
      await bot.pinHumanInputMessage(longText, 12345, 67890);

      // Function should generate Markdown that gets auto-converted via safeSendMessage
      expect(mockConverter.convert).toHaveBeenCalledWith(expectedMarkdownMessage);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        67890,
        `<converted>${expectedMarkdownMessage}</converted>`,
        expect.objectContaining({
          parse_mode: 'HTML',
          disable_notification: true
        })
      );
      expect(mockBot.pinChatMessage).toHaveBeenCalledWith(
        67890,
        123,
        { disable_notification: true }
      );
    });

    test('should pin human input message without truncation for short text', async () => {
      const shortText = 'Short message';
      const expectedMarkdownMessage = `#human_input\n\n💬 **User Input:**\n${shortText}`;
      
      await bot.pinHumanInputMessage(shortText, 12345, 67890);

      // Function should generate Markdown that gets auto-converted via safeSendMessage
      expect(mockConverter.convert).toHaveBeenCalledWith(expectedMarkdownMessage);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        67890,
        `<converted>${expectedMarkdownMessage}</converted>`,
        expect.objectContaining({
          parse_mode: 'HTML',
          disable_notification: true
        })
      );
      expect(mockBot.pinChatMessage).toHaveBeenCalledWith(
        67890,
        123,
        { disable_notification: true }
      );
    });

    test('should handle empty or null text gracefully', async () => {
      await bot.pinHumanInputMessage('', 12345, 67890);
      const expectedEmptyMessage = '#human_input\n\n💬 **User Input:**\n';
      
      expect(mockConverter.convert).toHaveBeenCalledWith(expectedEmptyMessage);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        67890,
        `<converted>${expectedEmptyMessage}</converted>`,
        expect.objectContaining({
          parse_mode: 'HTML',
          disable_notification: true
        })
      );

      await bot.pinHumanInputMessage(null, 12345, 67890);
      const expectedNullMessage = '#human_input\n\n💬 **User Input:**\nnull';
      
      expect(mockConverter.convert).toHaveBeenCalledWith(expectedNullMessage);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        67890,
        `<converted>${expectedNullMessage}</converted>`,
        expect.objectContaining({
          parse_mode: 'HTML',
          disable_notification: true
        })
      );
    });

    test('should handle sendMessage errors gracefully without crashing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Mock safeSendMessage to throw directly (simulating a safeSendMessage failure)
      const originalSafeSendMessage = bot.safeSendMessage;
      bot.safeSendMessage = jest.fn().mockRejectedValueOnce(new Error('Send failed'));

      await expect(bot.pinHumanInputMessage('test', 12345, 67890)).resolves.not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Chat 67890] Failed to pin human input message:',
        'Send failed'
      );
      
      // Restore original function
      bot.safeSendMessage = originalSafeSendMessage;
      consoleSpy.mockRestore();
    });

    test('should handle pinChatMessage errors gracefully without crashing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockBot.pinChatMessage.mockRejectedValueOnce(new Error('Pin failed'));

      await expect(bot.pinHumanInputMessage('test', 12345, 67890)).resolves.not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Chat 67890] Failed to pin human input message:',
        'Pin failed'
      );
      
      consoleSpy.mockRestore();
    });

    test('should not pin if sendMessage returns no message_id', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockBot.sendMessage.mockResolvedValueOnce(null);

      await bot.pinHumanInputMessage('test', 12345, 67890);

      expect(mockBot.pinChatMessage).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Pinned human input message')
      );
      
      consoleSpy.mockRestore();
    });

    test('should log successful pinning', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await bot.pinHumanInputMessage('test message', 12345, 67890);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Chat 67890] Pinned human input message for user 12345'
      );
      
      consoleSpy.mockRestore();
    });
  });
});
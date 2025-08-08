/**
 * Unit Tests for Message Concatenation Feature
 * TDD Implementation - Tests First Approach
 */

const StreamTelegramBot = require('../../bot');

describe('Message Concatenation Feature', () => {
  let bot;
  let mockConfig;

  beforeEach(() => {
    // Mock configuration
    mockConfig = {
      botToken: 'test-token',
      adminUserId: '123456789',
      workingDirectory: '/test/path',
      configFilePath: '/test/config.json',
      botInstanceName: 'test-bot'
    };

    // Create bot instance with mocked dependencies
    bot = new StreamTelegramBot(mockConfig.botToken, {
      adminUserId: mockConfig.adminUserId,
      workingDirectory: mockConfig.workingDirectory,
      configFilePath: mockConfig.configFilePath,
      botInstanceName: mockConfig.botInstanceName
    });

    // Mock bot.bot methods to prevent actual Telegram API calls
    bot.bot = {
      on: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      editMessageText: jest.fn().mockResolvedValue(true),
      answerCallbackQuery: jest.fn().mockResolvedValue(true)
    };

    // Mock other dependencies
    bot.safeSendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
    bot.safeEditMessage = jest.fn().mockResolvedValue(true);
  });

  describe('Concat Mode State Management', () => {
    test('should initialize concat mode as disabled for new users', () => {
      const userId = 123456;
      expect(bot.getConcatModeStatus(userId)).toBe(false);
    });

    test('should enable concat mode for a user', async () => {
      const userId = 123456;
      const chatId = 789012;

      await bot.enableConcatMode(userId, chatId);
      
      expect(bot.getConcatModeStatus(userId)).toBe(true);
      expect(bot.safeSendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Concat Mode Enabled'),
        expect.any(Object)
      );
    });

    test('should disable concat mode for a user', async () => {
      const userId = 123456;
      const chatId = 789012;

      // First enable, then disable
      await bot.enableConcatMode(userId, chatId);
      await bot.disableConcatMode(userId, chatId);
      
      expect(bot.getConcatModeStatus(userId)).toBe(false);
      expect(bot.safeSendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Concat Mode Disabled'),
        expect.any(Object)
      );
    });

    test('should clear buffer when disabling concat mode with clearBuffer=true', async () => {
      const userId = 123456;
      const chatId = 789012;

      await bot.enableConcatMode(userId, chatId);
      await bot.addToMessageBuffer(userId, {
        type: 'text',
        content: 'test message',
        imagePath: null
      });

      await bot.disableConcatMode(userId, chatId, true);
      
      expect(bot.getBufferSize(userId)).toBe(0);
    });

    test('should preserve buffer when disabling concat mode with clearBuffer=false', async () => {
      const userId = 123456;
      const chatId = 789012;

      await bot.enableConcatMode(userId, chatId);
      await bot.addToMessageBuffer(userId, {
        type: 'text',
        content: 'test message',
        imagePath: null
      });

      await bot.disableConcatMode(userId, chatId, false);
      
      expect(bot.getBufferSize(userId)).toBe(1);
    });
  });

  describe('Message Buffer Operations', () => {
    beforeEach(async () => {
      const userId = 123456;
      const chatId = 789012;
      await bot.enableConcatMode(userId, chatId);
    });

    test('should add text message to buffer', async () => {
      const userId = 123456;
      const messageData = {
        type: 'text',
        content: 'Hello, this is a test message',
        imagePath: null
      };

      const bufferSize = await bot.addToMessageBuffer(userId, messageData);
      
      expect(bufferSize).toBe(1);
      expect(bot.getBufferSize(userId)).toBe(1);
    });

    test('should add voice message to buffer', async () => {
      const userId = 123456;
      const messageData = {
        type: 'voice',
        content: 'Transcribed voice message',
        imagePath: null
      };

      const bufferSize = await bot.addToMessageBuffer(userId, messageData);
      
      expect(bufferSize).toBe(1);
      expect(bot.getBufferSize(userId)).toBe(1);
    });

    test('should add image message to buffer', async () => {
      const userId = 123456;
      const messageData = {
        type: 'image',
        content: 'Image caption',
        imagePath: '/path/to/image.jpg'
      };

      const bufferSize = await bot.addToMessageBuffer(userId, messageData);
      
      expect(bufferSize).toBe(1);
      expect(bot.getBufferSize(userId)).toBe(1);
    });

    test('should accumulate multiple messages in buffer', async () => {
      const userId = 123456;
      const messages = [
        { type: 'text', content: 'First message', imagePath: null },
        { type: 'voice', content: 'Second message transcribed', imagePath: null },
        { type: 'image', content: 'Third message caption', imagePath: '/path/image.jpg' }
      ];

      for (const message of messages) {
        await bot.addToMessageBuffer(userId, message);
      }
      
      expect(bot.getBufferSize(userId)).toBe(3);
    });

    test('should return correct buffer contents', async () => {
      const userId = 123456;
      const messageData = {
        type: 'text',
        content: 'Test message content',
        imagePath: null
      };

      await bot.addToMessageBuffer(userId, messageData);
      const buffer = bot.getMessageBuffer(userId);
      
      expect(buffer).toHaveLength(1);
      expect(buffer[0]).toMatchObject({
        type: 'text',
        content: 'Test message content',
        imagePath: null
      });
      expect(buffer[0]).toHaveProperty('timestamp');
    });

    test('should clear buffer', async () => {
      const userId = 123456;
      
      await bot.addToMessageBuffer(userId, {
        type: 'text',
        content: 'Test message',
        imagePath: null
      });

      bot.clearMessageBuffer(userId);
      
      expect(bot.getBufferSize(userId)).toBe(0);
    });
  });

  describe('Message Combination Logic', () => {
    test('should combine text messages correctly', async () => {
      const messages = [
        { type: 'text', content: 'First text message', imagePath: null, timestamp: new Date() },
        { type: 'text', content: 'Second text message', imagePath: null, timestamp: new Date() }
      ];

      const combined = await bot.combineBufferedMessages(messages);
      
      expect(combined).toContain('Combined Message (2 parts)');
      expect(combined).toContain('[Message 1 - Text]');
      expect(combined).toContain('First text message');
      expect(combined).toContain('[Message 2 - Text]');
      expect(combined).toContain('Second text message');
    });

    test('should combine voice messages correctly', async () => {
      const messages = [
        { type: 'voice', content: 'Transcribed voice message', imagePath: null, timestamp: new Date() }
      ];

      const combined = await bot.combineBufferedMessages(messages);
      
      expect(combined).toContain('Combined Message (1 parts)');
      expect(combined).toContain('[Message 1 - Voice Transcription]');
      expect(combined).toContain('Transcribed voice message');
    });

    test('should combine image messages correctly', async () => {
      const messages = [
        { type: 'image', content: 'Image caption', imagePath: '/path/to/image.jpg', timestamp: new Date() },
        { type: 'image', content: '', imagePath: '/path/to/image2.jpg', timestamp: new Date() }
      ];

      const combined = await bot.combineBufferedMessages(messages);
      
      expect(combined).toContain('Combined Message (2 parts)');
      expect(combined).toContain('[Message 1 - Image with caption]');
      expect(combined).toContain('Caption: Image caption');
      expect(combined).toContain('Image: /path/to/image.jpg');
      expect(combined).toContain('[Message 2 - Image]');
      expect(combined).toContain('Image: /path/to/image2.jpg');
    });

    test('should combine mixed message types correctly', async () => {
      const messages = [
        { type: 'text', content: 'Text message', imagePath: null, timestamp: new Date() },
        { type: 'voice', content: 'Voice transcription', imagePath: null, timestamp: new Date() },
        { type: 'image', content: 'Image caption', imagePath: '/path/image.jpg', timestamp: new Date() }
      ];

      const combined = await bot.combineBufferedMessages(messages);
      
      expect(combined).toContain('Combined Message (3 parts)');
      expect(combined).toContain('[Message 1 - Text]');
      expect(combined).toContain('[Message 2 - Voice Transcription]');
      expect(combined).toContain('[Message 3 - Image with caption]');
    });

    test('should handle empty buffer gracefully', async () => {
      const messages = [];

      const combined = await bot.combineBufferedMessages(messages);
      
      expect(combined).toContain('Combined Message (0 parts)');
    });
  });

  describe('Send Concatenated Message', () => {
    test('should handle empty buffer when sending', async () => {
      const userId = 123456;
      const chatId = 789012;

      await bot.enableConcatMode(userId, chatId);
      await bot.sendConcatenatedMessage(userId, chatId);
      
      expect(bot.safeSendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Empty Buffer'),
        expect.any(Object)
      );
    });

    test('should process concatenated message and clear buffer', async () => {
      const userId = 123456;
      const chatId = 789012;

      // Mock processUserMessage
      bot.processUserMessage = jest.fn().mockResolvedValue();

      await bot.enableConcatMode(userId, chatId);
      await bot.addToMessageBuffer(userId, {
        type: 'text',
        content: 'Test message',
        imagePath: null
      });

      await bot.sendConcatenatedMessage(userId, chatId);
      
      expect(bot.processUserMessage).toHaveBeenCalledWith(
        expect.stringContaining('Combined Message (1 parts)'),
        userId,
        chatId
      );
      expect(bot.getBufferSize(userId)).toBe(0);
      expect(bot.getConcatModeStatus(userId)).toBe(false);
    });

    test('should send notification when processing concatenated message', async () => {
      const userId = 123456;
      const chatId = 789012;

      bot.processUserMessage = jest.fn().mockResolvedValue();

      await bot.enableConcatMode(userId, chatId);
      await bot.addToMessageBuffer(userId, {
        type: 'text',
        content: 'Test message',
        imagePath: null
      });

      await bot.sendConcatenatedMessage(userId, chatId);
      
      expect(bot.safeSendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Sending Combined Message'),
        expect.any(Object)
      );
    });
  });

  describe('Keyboard Integration', () => {
    test('should show "Concat On" button when concat mode is disabled', () => {
      const userId = 123456;
      
      const keyboard = bot.keyboardHandlers.createReplyKeyboard(userId);
      
      const concatButton = keyboard.keyboard.find(row => 
        row.some(button => button.text.includes('Concat On'))
      );
      expect(concatButton).toBeTruthy();
    });

    test('should show "Concat Send" button when concat mode is enabled', async () => {
      const userId = 123456;
      const chatId = 789012;

      await bot.enableConcatMode(userId, chatId);
      await bot.addToMessageBuffer(userId, {
        type: 'text',
        content: 'Test message',
        imagePath: null
      });
      
      const keyboard = bot.keyboardHandlers.createReplyKeyboard(userId);
      
      const concatButton = keyboard.keyboard.find(row => 
        row.some(button => button.text.includes('Concat Send'))
      );
      expect(concatButton).toBeTruthy();
    });

    test('should show "Concat Send" button as buffer grows', async () => {
      const userId = 123456;
      const chatId = 789012;

      await bot.enableConcatMode(userId, chatId);
      
      // Add 3 messages
      for (let i = 0; i < 3; i++) {
        await bot.addToMessageBuffer(userId, {
          type: 'text',
          content: `Test message ${i + 1}`,
          imagePath: null
        });
      }
      
      const keyboard = bot.keyboardHandlers.createReplyKeyboard(userId);
      
      const concatButton = keyboard.keyboard.find(row => 
        row.some(button => button.text.includes('Concat Send'))
      );
      expect(concatButton).toBeTruthy();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle adding message when concat mode is disabled', async () => {
      const userId = 123456;
      
      // Don't enable concat mode
      const bufferSize = await bot.addToMessageBuffer(userId, {
        type: 'text',
        content: 'Test message',
        imagePath: null
      });
      
      expect(bufferSize).toBe(1); // Should still work but may log warning
    });

    test('should initialize empty buffer for new users', () => {
      const userId = 123456;
      
      expect(bot.getBufferSize(userId)).toBe(0);
      expect(bot.getMessageBuffer(userId)).toEqual([]);
    });

    test('should handle multiple users independently', async () => {
      const user1 = 111111;
      const user2 = 222222;
      const chat1 = 333333;
      const chat2 = 444444;

      await bot.enableConcatMode(user1, chat1);
      await bot.addToMessageBuffer(user1, {
        type: 'text',
        content: 'User 1 message',
        imagePath: null
      });

      await bot.addToMessageBuffer(user2, {
        type: 'text',
        content: 'User 2 message',
        imagePath: null
      });
      
      expect(bot.getConcatModeStatus(user1)).toBe(true);
      expect(bot.getConcatModeStatus(user2)).toBe(false);
      expect(bot.getBufferSize(user1)).toBe(1);
      expect(bot.getBufferSize(user2)).toBe(1);
    });
  });
});
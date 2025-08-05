/**
 * Integration Tests for Message Concatenation Feature
 * Tests complete workflow including all message types
 */

const StreamTelegramBot = require('../../bot');

describe('Message Concatenation Integration', () => {
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
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      getFile: jest.fn().mockResolvedValue({ file_path: 'test/path.ogg' }),
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('test audio'))
    };

    // Mock other dependencies
    bot.safeSendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
    bot.safeEditMessage = jest.fn().mockResolvedValue(true);
    bot.processUserMessage = jest.fn().mockResolvedValue();
  });

  describe('Complete Text Message Workflow', () => {
    test('should handle text messages normally when concat mode is off', async () => {
      const userId = 123456;
      const chatId = 789012;
      const message = { from: { id: userId }, chat: { id: chatId }, text: 'Hello world' };

      await bot.handleUserMessage(message);

      expect(bot.processUserMessage).toHaveBeenCalledWith('Hello world', userId, chatId);
      expect(bot.getConcatModeStatus(userId)).toBe(false);
    });

    test('should buffer text messages when concat mode is on', async () => {
      const userId = 123456;
      const chatId = 789012;
      const message = { from: { id: userId }, chat: { id: chatId }, text: 'Hello world' };

      // Enable concat mode
      await bot.enableConcatMode(userId, chatId);

      // Send message
      await bot.handleUserMessage(message);

      // Should be buffered, not processed
      expect(bot.processUserMessage).not.toHaveBeenCalledWith('Hello world', userId, chatId);
      expect(bot.getBufferSize(userId)).toBe(1);
      expect(bot.safeSendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Added to Buffer'),
        expect.any(Object)
      );
    });

    test('should process multiple buffered text messages when sent', async () => {
      const userId = 123456;
      const chatId = 789012;

      // Enable concat mode
      await bot.enableConcatMode(userId, chatId);

      // Add multiple messages
      const messages = [
        { from: { id: userId }, chat: { id: chatId }, text: 'First message' },
        { from: { id: userId }, chat: { id: chatId }, text: 'Second message' },
        { from: { id: userId }, chat: { id: chatId }, text: 'Third message' }
      ];

      for (const message of messages) {
        await bot.handleUserMessage(message);
      }

      expect(bot.getBufferSize(userId)).toBe(3);

      // Send concatenated message
      await bot.sendConcatenatedMessage(userId, chatId);

      // Should process combined message
      expect(bot.processUserMessage).toHaveBeenCalledWith(
        expect.stringContaining('Combined Message (3 parts)'),
        userId,
        chatId
      );
      expect(bot.getConcatModeStatus(userId)).toBe(false);
      expect(bot.getBufferSize(userId)).toBe(0);
    });
  });

  describe('Complete Voice Message Workflow', () => {
    test('should buffer voice messages when concat mode is on', async () => {
      const userId = 123456;
      const chatId = 789012;
      const messageId = 'msg123';
      const transcribedText = 'Voice message transcription';

      // Enable concat mode
      await bot.enableConcatMode(userId, chatId);

      // Mock voice handler state
      bot.voiceHandler.pendingCommands.set(messageId, {
        transcribedText,
        userId,
        chatId
      });

      // Simulate voice confirm callback
      await bot.voiceHandler.handleVoiceCallback(
        `voice_confirm:${messageId}`, 
        chatId, 
        messageId, 
        userId, 
        bot.processUserMessage.bind(bot)
      );

      // Should be buffered, not processed directly
      expect(bot.processUserMessage).not.toHaveBeenCalled();
      expect(bot.getBufferSize(userId)).toBe(1);
      expect(bot.safeEditMessage).toHaveBeenCalledWith(
        chatId,
        messageId,
        expect.stringContaining('Voice Added to Buffer')
      );
    });

    test('should process voice messages normally when concat mode is off', async () => {
      const userId = 123456;
      const chatId = 789012;
      const messageId = 'msg123';
      const transcribedText = 'Voice message transcription';

      // Mock voice handler state
      bot.voiceHandler.pendingCommands.set(messageId, {
        transcribedText,
        userId,
        chatId
      });

      // Simulate voice confirm callback
      await bot.voiceHandler.handleVoiceCallback(
        `voice_confirm:${messageId}`, 
        chatId, 
        messageId, 
        userId, 
        bot.processUserMessage.bind(bot)
      );

      // Should be processed directly
      expect(bot.processUserMessage).toHaveBeenCalledWith(transcribedText, userId, chatId);
      expect(bot.getBufferSize(userId)).toBe(0);
    });
  });

  describe('Complete Image Message Workflow', () => {
    test('should buffer image messages when concat mode is on', async () => {
      const userId = 123456;
      const chatId = 789012;
      const message = {
        from: { id: userId },
        chat: { id: chatId },
        photo: [{ file_id: 'photo123' }],
        caption: 'Test image caption'
      };

      // Enable concat mode
      await bot.enableConcatMode(userId, chatId);


      // Mock image processing - ImageHandler uses this.bot.getFile and this.downloadFile
      bot.imageHandler.bot.getFile = jest.fn().mockResolvedValue({ file_path: 'test/image.jpg' });
      const mockBuffer = Buffer.from('fake image data');
      bot.imageHandler.downloadFile = jest.fn().mockResolvedValue(mockBuffer);

      // Mock fs operations
      const fs = require('fs');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      // Process image message
      await bot.imageHandler.handlePhotoMessage(message, bot.processUserMessage.bind(bot));

      // Should be buffered, not processed directly
      expect(bot.processUserMessage).not.toHaveBeenCalled();
      expect(bot.getBufferSize(userId)).toBe(1);
      
      const buffer = bot.getMessageBuffer(userId);
      expect(buffer[0].type).toBe('image');
      expect(buffer[0].content).toBe('Test image caption');
      expect(buffer[0].imagePath).toBeDefined();
    });

    test('should process image messages normally when concat mode is off', async () => {
      const userId = 123456;
      const chatId = 789012;
      const message = {
        from: { id: userId },
        chat: { id: chatId },
        photo: [{ file_id: 'photo123' }],
        caption: 'Test image caption'
      };

      // Mock image processing - ImageHandler uses this.bot.getFile and this.downloadFile
      bot.imageHandler.bot.getFile = jest.fn().mockResolvedValue({ file_path: 'test/image.jpg' });
      const mockBuffer = Buffer.from('fake image data');
      bot.imageHandler.downloadFile = jest.fn().mockResolvedValue(mockBuffer);

      // Mock fs operations
      const fs = require('fs');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      // Mock session manager
      bot.sessionManager.getUserSession = jest.fn().mockReturnValue({
        id: 'session123',
        userId: userId
      });

      // Process image message
      await bot.imageHandler.handlePhotoMessage(message, bot.processUserMessage.bind(bot));

      // Should be processed eventually (through processImageMessage)
      expect(bot.getBufferSize(userId)).toBe(0);
    });
  });

  describe('Mixed Message Type Workflow', () => {
    test('should handle mixed message types in concat mode', async () => {
      const userId = 123456;
      const chatId = 789012;

      // Enable concat mode
      await bot.enableConcatMode(userId, chatId);

      // Add text message
      const textMessage = { from: { id: userId }, chat: { id: chatId }, text: 'Text message' };
      await bot.handleUserMessage(textMessage);

      // Add voice message
      const messageId = 'voice123';
      bot.voiceHandler.pendingCommands.set(messageId, {
        transcribedText: 'Voice transcription',
        userId,
        chatId
      });
      await bot.voiceHandler.handleVoiceCallback(
        `voice_confirm:${messageId}`, 
        chatId, 
        messageId, 
        userId, 
        bot.processUserMessage.bind(bot)
      );

      // Add image message
      const imageMessage = {
        from: { id: userId },
        chat: { id: chatId },
        photo: [{ file_id: 'photo123' }],
        caption: 'Image caption'
      };

      // Mock image processing - ImageHandler uses this.bot.getFile and this.downloadFile
      bot.imageHandler.bot.getFile = jest.fn().mockResolvedValue({ file_path: 'test/image.jpg' });
      const mockBuffer = Buffer.from('fake image data');
      bot.imageHandler.downloadFile = jest.fn().mockResolvedValue(mockBuffer);
      const fs = require('fs');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      await bot.imageHandler.handlePhotoMessage(imageMessage, bot.processUserMessage.bind(bot));

      // Should have 3 messages buffered
      expect(bot.getBufferSize(userId)).toBe(3);

      const buffer = bot.getMessageBuffer(userId);
      expect(buffer[0].type).toBe('text');
      expect(buffer[1].type).toBe('voice');
      expect(buffer[2].type).toBe('image');

      // Send concatenated message
      await bot.sendConcatenatedMessage(userId, chatId);

      // Should combine all message types
      expect(bot.processUserMessage).toHaveBeenCalledWith(
        expect.stringMatching(/Combined Message \(3 parts\).*Text.*Voice Transcription.*Image/s),
        userId,
        chatId
      );
    });

    test('should maintain separate buffers for different users', async () => {
      const user1 = 111111;
      const user2 = 222222;
      const chat1 = 333333;
      const chat2 = 444444;

      // Enable concat mode for both users
      await bot.enableConcatMode(user1, chat1);
      await bot.enableConcatMode(user2, chat2);

      // Add messages for each user
      const message1 = { from: { id: user1 }, chat: { id: chat1 }, text: 'User 1 message' };
      const message2 = { from: { id: user2 }, chat: { id: chat2 }, text: 'User 2 message' };

      await bot.handleUserMessage(message1);
      await bot.handleUserMessage(message2);

      // Each user should have their own buffer
      expect(bot.getBufferSize(user1)).toBe(1);
      expect(bot.getBufferSize(user2)).toBe(1);

      const buffer1 = bot.getMessageBuffer(user1);
      const buffer2 = bot.getMessageBuffer(user2);

      expect(buffer1[0].content).toBe('User 1 message');
      expect(buffer2[0].content).toBe('User 2 message');

      // Send for user 1 only
      await bot.sendConcatenatedMessage(user1, chat1);

      // User 1 buffer should be cleared, user 2 should remain
      expect(bot.getBufferSize(user1)).toBe(0);
      expect(bot.getBufferSize(user2)).toBe(1);
    });
  });

  describe('Keyboard Integration Workflow', () => {
    test('should show correct buttons based on concat mode status', async () => {
      const userId = 123456;
      const chatId = 789012;

      // Initially should show "Concat On"
      let keyboard = bot.keyboardHandlers.createReplyKeyboard(userId);
      let concatButton = keyboard.keyboard.find(row => 
        row.some(button => button.text.includes('Concat On'))
      );
      expect(concatButton).toBeTruthy();

      // Enable concat mode
      await bot.enableConcatMode(userId, chatId);

      // Should show "Concat Send (0)"
      keyboard = bot.keyboardHandlers.createReplyKeyboard(userId);
      concatButton = keyboard.keyboard.find(row => 
        row.some(button => button.text.includes('Concat Send'))
      );
      expect(concatButton).toBeTruthy();

      // Add messages
      await bot.addToMessageBuffer(userId, { type: 'text', content: 'Test', imagePath: null });
      await bot.addToMessageBuffer(userId, { type: 'text', content: 'Test2', imagePath: null });

      // Should show "Concat Send (2)"
      keyboard = bot.keyboardHandlers.createReplyKeyboard(userId);
      concatButton = keyboard.keyboard.find(row => 
        row.some(button => button.text.includes('Concat Send (2)'))
      );
      expect(concatButton).toBeTruthy();
    });

    test('should handle keyboard button interactions correctly', async () => {
      const userId = 123456;
      const chatId = 789012;
      const username = 'testuser';

      // Test "Concat On" button
      const concatOnMessage = {
        text: '🔗 Concat On',
        from: { id: userId, username },
        chat: { id: chatId }
      };

      const result = await bot.keyboardHandlers.handleKeyboardButton(concatOnMessage);
      expect(result).toBe(true);
      expect(bot.getConcatModeStatus(userId)).toBe(true);

      // Add a message to buffer
      await bot.addToMessageBuffer(userId, { type: 'text', content: 'Test message', imagePath: null });

      // Test "Concat Send" button
      const concatSendMessage = {
        text: '📤 Concat Send (1)',
        from: { id: userId, username },
        chat: { id: chatId }
      };

      const result2 = await bot.keyboardHandlers.handleKeyboardButton(concatSendMessage);
      expect(result2).toBe(true);
      expect(bot.getConcatModeStatus(userId)).toBe(false);
      expect(bot.getBufferSize(userId)).toBe(0);
    });
  });
});
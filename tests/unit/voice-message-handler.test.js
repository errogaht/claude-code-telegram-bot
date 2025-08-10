/**
 * Unit Tests for VoiceMessageHandler
 * Tests voice processing logic, transcription, and callback handling
 */

const VoiceMessageHandler = require('../../VoiceMessageHandler');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Mock dependencies
jest.mock('axios');
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' })
  }));
});

const createMockBot = () => ({
  token: 'test-bot-token',
  getFile: jest.fn().mockResolvedValue({ file_path: 'voice/file.ogg' }),
  sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  editMessageText: jest.fn().mockResolvedValue(true)
});

const createMockMainBot = () => ({
  safeSendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  safeEditMessage: jest.fn().mockResolvedValue(true),
  getConcatModeStatus: jest.fn().mockReturnValue(false),
  addToMessageBuffer: jest.fn().mockResolvedValue(1)
});

const createMockActivityIndicator = () => ({
  start: jest.fn().mockResolvedValue(),
  stop: jest.fn().mockResolvedValue()
});

const createMockVoiceMessage = (overrides = {}) => ({
  chat: { id: 456 },
  from: { id: 789 },
  voice: { file_id: 'voice-file-123' },
  ...overrides
});

describe('VoiceMessageHandler', () => {
  let voiceHandler;
  let mockBot;
  let mockMainBot;
  let mockActivityIndicator;
  let mockAxios;
  let mockFormData;

  beforeEach(() => {
    // Ensure we're in production mode for unit tests
    delete process.env.NODE_ENV;
    
    mockBot = createMockBot();
    mockMainBot = createMockMainBot();
    mockActivityIndicator = createMockActivityIndicator();
    mockAxios = axios;
    mockFormData = {
      append: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' })
    };
    // Reset the FormData constructor mock
    FormData.mockClear();
    FormData.mockImplementation(() => mockFormData);

    voiceHandler = new VoiceMessageHandler(mockBot, 'test-nexara-key', mockActivityIndicator, mockMainBot);

    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with dependencies', () => {
      expect(voiceHandler.bot).toBe(mockBot);
      expect(voiceHandler.nexaraApiKey).toBe('test-nexara-key');
      expect(voiceHandler.activityIndicator).toBe(mockActivityIndicator);
    });

    test('should initialize empty pending commands map', () => {
      expect(voiceHandler.pendingCommands).toBeInstanceOf(Map);
      expect(voiceHandler.pendingCommands.size).toBe(0);
    });

    test('should handle missing API key', () => {
      const handlerWithoutKey = new VoiceMessageHandler(mockBot, null, mockActivityIndicator);
      expect(handlerWithoutKey.nexaraApiKey).toBeNull();
    });
  });

  describe('Handle Voice Message', () => {
    beforeEach(() => {
      // Mock successful file download
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('mock-audio-data')
      });

      // Mock successful transcription
      mockAxios.post.mockResolvedValue({
        data: { text: 'Hello Claude, help me with coding' }
      });
    });

    test('should start activity indicator', async () => {
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(mockActivityIndicator.start).toHaveBeenCalledWith(456);
    });

    test('should get voice file from Telegram', async () => {
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(mockBot.getFile).toHaveBeenCalledWith('voice-file-123');
    });

    test('should download voice file', async () => {
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://api.telegram.org/file/bottest-bot-token/voice/file.ogg',
        {
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );
    });

    test('should transcribe with Nexara API', async () => {
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(FormData).toHaveBeenCalled();
      expect(mockFormData.append).toHaveBeenCalledWith('file', expect.any(Buffer), {
        filename: 'audio.ogg',
        contentType: 'audio/ogg'
      });
      expect(mockFormData.append).toHaveBeenCalledWith('model', 'whisper-1');
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.nexara.ru/api/v1/audio/transcriptions',
        mockFormData,
        {
          headers: {
            'Authorization': 'Bearer test-nexara-key',
            'content-type': 'multipart/form-data'
          },
          timeout: 30000
        }
      );
    });

    test('should stop activity indicator after successful transcription', async () => {
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(mockActivityIndicator.stop).toHaveBeenCalledWith(456);
    });

    test('should send confirmation message with buttons', async () => {
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('🎤 *Voice Message Received*'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '✅ OK' }),
                expect.objectContaining({ text: '❌ Cancel' })
              ])
            ])
          })
        })
      );
    });

    test('should store pending command', async () => {
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(voiceHandler.pendingCommands.has(123)).toBe(true);
      const pendingCommand = voiceHandler.pendingCommands.get(123);
      expect(pendingCommand).toEqual({
        transcribedText: 'Hello Claude, help me with coding',
        userId: 789,
        chatId: 456
      });
    });

    test('should handle safeSendMessage returning undefined gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const voiceMsg = createMockVoiceMessage();
      
      // Create handler with mainBot that has safeSendMessage returning undefined
      const mockMainBot = {
        safeSendMessage: jest.fn().mockResolvedValue(undefined)
      };
      const handlerWithMainBot = new VoiceMessageHandler(mockBot, 'test-nexara-key', mockActivityIndicator, mockMainBot);

      await handlerWithMainBot.handleVoiceMessage(voiceMsg);

      // Should log warning about undefined message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Voice] Warning: confirmMsg or message_id is undefined, cannot store pending command'
      );
      
      // Should not crash and pendingCommands should remain empty
      expect(handlerWithMainBot.pendingCommands.size).toBe(0);
      
      consoleErrorSpy.mockRestore();
    });

    test('should handle safeSendMessage returning object without message_id', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const voiceMsg = createMockVoiceMessage();
      
      // Create handler with mainBot that returns object without message_id
      const mockMainBot = {
        safeSendMessage: jest.fn().mockResolvedValue({ some_other_field: 'value' })
      };
      const handlerWithMainBot = new VoiceMessageHandler(mockBot, 'test-nexara-key', mockActivityIndicator, mockMainBot);

      await handlerWithMainBot.handleVoiceMessage(voiceMsg);

      // Should log warning about undefined message_id
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Voice] Warning: confirmMsg or message_id is undefined, cannot store pending command'
      );
      
      // Should not crash and pendingCommands should remain empty
      expect(handlerWithMainBot.pendingCommands.size).toBe(0);
      
      consoleErrorSpy.mockRestore();
    });

    test('should handle file download error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAxios.get.mockRejectedValueOnce(new Error('Download failed'));
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Voice] Processing error:',
        expect.any(Error)
      );
      expect(mockActivityIndicator.stop).toHaveBeenCalledWith(456);

      consoleErrorSpy.mockRestore();
    });

    test('should handle transcription error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAxios.post.mockRejectedValueOnce(new Error('Transcription failed'));
      const voiceMsg = createMockVoiceMessage();

      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Voice] Processing error:',
        expect.any(Error)
      );
      expect(mockActivityIndicator.stop).toHaveBeenCalledWith(456);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('File Download', () => {
    test('should download file successfully', async () => {
      const mockBuffer = Buffer.from('audio-data');
      mockAxios.get.mockResolvedValue({ data: mockBuffer });

      const result = await voiceHandler.downloadTelegramFile('voice/test.ogg');

      expect(result).toEqual(mockBuffer);
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://api.telegram.org/file/bottest-bot-token/voice/test.ogg',
        {
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );
    });

    test('should handle download errors', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(voiceHandler.downloadTelegramFile('voice/test.ogg'))
        .rejects.toThrow('Failed to download file: Network error');
    });

    test('should construct correct file URL', async () => {
      mockAxios.get.mockResolvedValue({ data: Buffer.from('data') });

      await voiceHandler.downloadTelegramFile('audio/nested/file.ogg');

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://api.telegram.org/file/bottest-bot-token/audio/nested/file.ogg',
        expect.any(Object)
      );
    });
  });

  describe('Nexara Transcription', () => {
    test('should transcribe successfully', async () => {
      const mockBuffer = Buffer.from('audio-data');
      mockAxios.post.mockResolvedValue({
        data: { text: 'Transcribed text' }
      });

      const result = await voiceHandler.transcribeWithNexara(mockBuffer);

      expect(result).toBe('Transcribed text');
      expect(mockFormData.append).toHaveBeenCalledWith('file', mockBuffer, {
        filename: 'audio.ogg',
        contentType: 'audio/ogg'
      });
      expect(mockFormData.append).toHaveBeenCalledWith('model', 'whisper-1');
    });

    test('should throw error if no API key', async () => {
      const handlerWithoutKey = new VoiceMessageHandler(mockBot, null, mockActivityIndicator);
      const mockBuffer = Buffer.from('audio-data');

      await expect(handlerWithoutKey.transcribeWithNexara(mockBuffer))
        .rejects.toThrow('Nexara API key not configured. Voice messages unavailable.');
    });

    test('should handle empty response', async () => {
      mockAxios.post.mockResolvedValue({ data: {} });
      const mockBuffer = Buffer.from('audio-data');

      await expect(voiceHandler.transcribeWithNexara(mockBuffer))
        .rejects.toThrow('Empty response from Nexara API');
    });

    test('should handle API error response', async () => {
      mockAxios.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: { message: 'Rate limit exceeded' }
        }
      });
      const mockBuffer = Buffer.from('audio-data');

      await expect(voiceHandler.transcribeWithNexara(mockBuffer))
        .rejects.toThrow('Nexara API error: 429 - Rate limit exceeded');
    });

    test('should handle network error', async () => {
      mockAxios.post.mockRejectedValueOnce({
        request: {}
      });
      const mockBuffer = Buffer.from('audio-data');

      await expect(voiceHandler.transcribeWithNexara(mockBuffer))
        .rejects.toThrow('No response from Nexara API. Check internet connection.');
    });

    test('should handle generic request error', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('Connection timeout'));
      const mockBuffer = Buffer.from('audio-data');

      await expect(voiceHandler.transcribeWithNexara(mockBuffer))
        .rejects.toThrow('Request error: Connection timeout');
    });

    test('should log transcription activity', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockAxios.post.mockResolvedValue({
        data: { text: 'Test transcription' }
      });

      await voiceHandler.transcribeWithNexara(Buffer.from('data'));

      expect(consoleLogSpy).toHaveBeenCalledWith('[Nexara] Transcribing audio...');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Nexara] Transcribed: "Test transcription"');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Voice Callback Handling', () => {
    beforeEach(() => {
      // Set up a pending command
      voiceHandler.pendingCommands.set(123, {
        transcribedText: 'test command',
        userId: 789,
        chatId: 456
      });
    });

    test('should handle voice_confirm callback', async () => {
      const mockProcessCallback = jest.fn();

      await voiceHandler.handleVoiceCallback(
        'voice_confirm:456_1234567890',
        456,
        123,
        789,
        mockProcessCallback
      );

      expect(mockMainBot.safeEditMessage).toHaveBeenCalledWith(
        456,
        123,
        expect.stringContaining('✅ *Executing voice command*')
      );
      expect(voiceHandler.pendingCommands.has(123)).toBe(false);
      expect(mockProcessCallback).toHaveBeenCalledWith('Voice Message Transcribe: test command', 789, 456);
    });

    test('should handle voice_cancel callback', async () => {
      await voiceHandler.handleVoiceCallback(
        'voice_cancel:456_1234567890',
        456,
        123,
        789,
        jest.fn()
      );

      expect(mockMainBot.safeEditMessage).toHaveBeenCalledWith(
        456,
        123,
        '❌ *Voice command cancelled*'
      );
      expect(voiceHandler.pendingCommands.has(123)).toBe(false);
    });


    test('should handle expired command', async () => {
      // Remove the pending command to simulate expiration
      voiceHandler.pendingCommands.delete(123);

      await voiceHandler.handleVoiceCallback(
        'voice_confirm:456_1234567890',
        456,
        123,
        789,
        jest.fn()
      );

      expect(mockMainBot.safeEditMessage).toHaveBeenCalledWith(
        456,
        123,
        '❌ *Voice command expired*\n\nPlease send a new voice message.'
      );
    });


    test('should include transcribed text in confirm message', async () => {
      await voiceHandler.handleVoiceCallback(
        'voice_confirm:456_1234567890',
        456,
        123,
        789,
        jest.fn()
      );

      expect(mockMainBot.safeEditMessage).toHaveBeenCalledWith(
        456,
        123,
        expect.stringContaining('"test command"')
      );
    });
  });

  describe('Cleanup and Stats', () => {
    test('should cleanup pending commands', () => {
      voiceHandler.pendingCommands.set(1, { text: 'cmd1' });
      voiceHandler.pendingCommands.set(2, { text: 'cmd2' });

      voiceHandler.cleanup();

      expect(voiceHandler.pendingCommands.size).toBe(0);
    });

    test('should return correct stats', () => {
      voiceHandler.pendingCommands.set(1, { text: 'cmd1' });
      voiceHandler.pendingCommands.set(2, { text: 'cmd2' });

      const stats = voiceHandler.getStats();

      expect(stats).toEqual({
        pendingVoiceCommands: 2
      });
    });

    test('should return zero stats when no pending commands', () => {
      const stats = voiceHandler.getStats();

      expect(stats).toEqual({
        pendingVoiceCommands: 0
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete voice workflow', async () => {
      // Mock successful responses
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('mock-audio-data')
      });
      mockAxios.post.mockResolvedValue({
        data: { text: 'Complete voice command' }
      });

      const voiceMsg = createMockVoiceMessage();
      const mockProcessCallback = jest.fn();

      // Step 1: Handle voice message
      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(voiceHandler.pendingCommands.size).toBe(1);
      expect(mockActivityIndicator.start).toHaveBeenCalledWith(456);
      expect(mockActivityIndicator.stop).toHaveBeenCalledWith(456);

      // Step 2: Confirm execution
      await voiceHandler.handleVoiceCallback(
        'voice_confirm:456_1234567890',
        456,
        123,
        789,
        mockProcessCallback
      );

      expect(voiceHandler.pendingCommands.size).toBe(0);
      expect(mockProcessCallback).toHaveBeenCalledWith('Voice Message Transcribe: Complete voice command', 789, 456);
    });

    test('should handle voice workflow with cancellation', async () => {
      // Mock successful transcription
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('mock-audio-data')
      });
      mockAxios.post.mockResolvedValue({
        data: { text: 'Command to cancel' }
      });

      const voiceMsg = createMockVoiceMessage();

      // Step 1: Handle voice message
      await voiceHandler.handleVoiceMessage(voiceMsg);
      expect(voiceHandler.pendingCommands.size).toBe(1);

      // Step 2: Cancel command
      await voiceHandler.handleVoiceCallback(
        'voice_cancel:456_1234567890',
        456,
        123,
        789,
        jest.fn()
      );

      expect(voiceHandler.pendingCommands.size).toBe(0);
      expect(mockMainBot.safeEditMessage).toHaveBeenCalledWith(
        456,
        123,
        '❌ *Voice command cancelled*'
      );
    });

    test('should handle multiple pending commands', async () => {
      // Simulate multiple voice messages
      mockMainBot.safeSendMessage
        .mockResolvedValueOnce({ message_id: 123 })
        .mockResolvedValueOnce({ message_id: 124 });

      mockAxios.get.mockResolvedValue({
        data: Buffer.from('mock-audio-data')
      });
      mockAxios.post
        .mockResolvedValueOnce({ data: { text: 'First command' } })
        .mockResolvedValueOnce({ data: { text: 'Second command' } });

      const voiceMsg1 = createMockVoiceMessage();
      const voiceMsg2 = createMockVoiceMessage({ chat: { id: 457 }, from: { id: 790 } });

      await voiceHandler.handleVoiceMessage(voiceMsg1);
      await voiceHandler.handleVoiceMessage(voiceMsg2);

      expect(voiceHandler.pendingCommands.size).toBe(2);
      expect(voiceHandler.pendingCommands.get(123).transcribedText).toBe('First command');
      expect(voiceHandler.pendingCommands.get(124).transcribedText).toBe('Second command');
    });
  });

  describe('Error Recovery', () => {
    test('should handle bot errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockBot.getFile.mockRejectedValueOnce(new Error('Bot API error'));

      const voiceMsg = createMockVoiceMessage();
      await voiceHandler.handleVoiceMessage(voiceMsg);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockActivityIndicator.stop).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should handle callback errors gracefully', async () => {
      mockMainBot.safeEditMessage.mockRejectedValueOnce(new Error('Edit failed'));

      // This should not throw
      await expect(voiceHandler.handleVoiceCallback(
        'voice_confirm:456_1234567890',
        456,
        999, // Non-existent message ID
        789,
        jest.fn()
      )).resolves.toBeUndefined();
    });

    test('should maintain state consistency on errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Set up initial state
      voiceHandler.pendingCommands.set(123, {
        transcribedText: 'test',
        userId: 789,
        chatId: 456
      });

      // Simulate transcription error
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
      const voiceMsg = createMockVoiceMessage();
      
      await voiceHandler.handleVoiceMessage(voiceMsg);

      // Original pending command should still exist
      expect(voiceHandler.pendingCommands.has(123)).toBe(true);
      expect(voiceHandler.pendingCommands.size).toBe(1);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty transcription result', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('audio-data')
      });
      mockAxios.post.mockResolvedValue({
        data: { text: '' } // Empty string is treated as error by implementation
      });

      const voiceMsg = createMockVoiceMessage();
      await voiceHandler.handleVoiceMessage(voiceMsg);

      // Implementation treats empty string as error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Voice] Processing error:',
        expect.any(Error)
      );
      expect(mockActivityIndicator.stop).toHaveBeenCalledWith(456);

      consoleErrorSpy.mockRestore();
    });

    test('should handle very long transcription', async () => {
      const longText = 'a'.repeat(1000);
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('audio-data')
      });
      mockAxios.post.mockResolvedValue({
        data: { text: longText }
      });

      const voiceMsg = createMockVoiceMessage();
      await voiceHandler.handleVoiceMessage(voiceMsg);

      const pendingCommand = voiceHandler.pendingCommands.get(123);
      expect(pendingCommand.transcribedText).toBe(longText);
    });

    test('should handle special characters in transcription', async () => {
      const specialText = 'Hello! How are you? 😊 This costs $10.50';
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('audio-data')
      });
      mockAxios.post.mockResolvedValue({
        data: { text: specialText }
      });

      const voiceMsg = createMockVoiceMessage();
      await voiceHandler.handleVoiceMessage(voiceMsg);

      const pendingCommand = voiceHandler.pendingCommands.get(123);
      expect(pendingCommand.transcribedText).toBe(specialText);
    });
  });

  describe('Test Mode Behavior', () => {
    let testModeHandler;

    beforeEach(() => {
      // Set test environment
      process.env.NODE_ENV = 'test';
      testModeHandler = new VoiceMessageHandler(mockBot, 'test-nexara-key', mockActivityIndicator, mockMainBot);
      jest.clearAllMocks();
    });

    afterEach(() => {
      delete process.env.NODE_ENV;
    });

    test('should use simulated transcription in test mode', async () => {
      const voiceMsg = createMockVoiceMessage();

      await testModeHandler.handleVoiceMessage(voiceMsg);

      // Should not call real API methods
      expect(mockBot.getFile).not.toHaveBeenCalled();
      expect(mockAxios.get).not.toHaveBeenCalled();
      expect(mockAxios.post).not.toHaveBeenCalled();

      // Should send test mode message
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('Test Mode'),
        expect.any(Object)
      );

      // Should store simulated transcription
      expect(testModeHandler.pendingCommands.has(123)).toBe(true);
      const pendingCommand = testModeHandler.pendingCommands.get(123);
      expect(pendingCommand.transcribedText).toBe('Test voice message transcription');
    });

    test('should use simulated transcription when no API key provided', async () => {
      const handlerWithoutKey = new VoiceMessageHandler(mockBot, null, mockActivityIndicator, mockMainBot);
      const voiceMsg = createMockVoiceMessage();

      await handlerWithoutKey.handleVoiceMessage(voiceMsg);

      // Should not call real API methods
      expect(mockBot.getFile).not.toHaveBeenCalled();
      expect(mockAxios.get).not.toHaveBeenCalled();
      expect(mockAxios.post).not.toHaveBeenCalled();

      // Should send test mode message
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('Test Mode'),
        expect.any(Object)
      );
    });
  });

  describe('Voice Transcription Instant Mode', () => {
    beforeEach(() => {
      // Mock successful file download and transcription (same as other tests)
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('mock-audio-data')
      });
      mockAxios.post.mockResolvedValue({
        data: { text: 'Hello Claude, help me with coding' }
      });

      // Mock the bot config file system
      jest.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
        if (filepath === './configs/bot1.json') {
          return JSON.stringify({ 
            voiceTranscriptionMethod: 'nexara',
            voiceTranscriptionInstant: false 
          });
        }
        return '{}';
      });
    });

    test('should use normal confirmation mode when instant is disabled', async () => {
      const voiceMsg = createMockVoiceMessage();
      
      await voiceHandler.handleVoiceMessage(voiceMsg);

      // Should send confirmation message with buttons
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('Execute this command?'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '✅ OK' }),
                expect.objectContaining({ text: '❌ Cancel' })
              ])
            ])
          })
        })
      );
    });

    test('should execute immediately when instant mode is enabled', async () => {
      // Mock instant mode enabled
      jest.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
        if (filepath === './configs/bot1.json') {
          return JSON.stringify({ 
            voiceTranscriptionMethod: 'nexara',
            voiceTranscriptionInstant: true 
          });
        }
        return '{}';
      });

      // Mock the main bot processUserMessage method
      mockMainBot.processUserMessage = jest.fn();

      const voiceMsg = createMockVoiceMessage();
      
      await voiceHandler.handleVoiceMessage(voiceMsg);

      // Should send instant processing message (not confirmation)
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('⚡ **Instant Mode:** Sending to Claude...')
      );

      // Should execute the command immediately
      expect(mockMainBot.processUserMessage).toHaveBeenCalledWith(
        'Voice Message Transcribe: Hello Claude, help me with coding',
        789,
        456
      );

      // Should NOT store pending command since it executes immediately
      expect(voiceHandler.pendingCommands.size).toBe(0);
    });

    test('should get instant setting from bot config', () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
        if (filepath === './configs/bot1.json') {
          return JSON.stringify({ voiceTranscriptionInstant: true });
        }
        return '{}';
      });

      const result = voiceHandler.getVoiceTranscriptionInstant();
      expect(result).toBe(true);
    });

    test('should default to false if bot config read fails', () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = voiceHandler.getVoiceTranscriptionInstant();
      expect(result).toBe(false);
    });

    test('should handle instant mode with concat buffer', async () => {
      // Enable instant mode
      jest.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
        if (filepath === './configs/bot1.json') {
          return JSON.stringify({ 
            voiceTranscriptionMethod: 'nexara',
            voiceTranscriptionInstant: true 
          });
        }
        return '{}';
      });

      // Mock concat mode enabled
      mockMainBot.getConcatModeStatus.mockReturnValue(true);
      mockMainBot.addToMessageBuffer.mockResolvedValue(1);

      const voiceMsg = createMockVoiceMessage();
      
      await voiceHandler.handleVoiceMessage(voiceMsg);

      // Should add to buffer instead of processing immediately
      expect(mockMainBot.addToMessageBuffer).toHaveBeenCalledWith(789, {
        type: 'voice',
        content: 'Hello Claude, help me with coding',
        imagePath: null
      });

      // Should send buffer message
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('Voice Added to Buffer')
      );
    });
  });
});
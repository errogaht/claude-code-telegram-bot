const SettingsMenuHandler = require('../../SettingsMenuHandler');

describe('SettingsMenuHandler', () => {
  let settingsHandler;
  let mockBot;
  let mockVoiceHandler;

  beforeEach(() => {
    mockBot = {
      safeSendMessage: jest.fn(),
      safeEditMessage: jest.fn()
    };

    mockVoiceHandler = {
      getTranscriptionMethod: jest.fn(),
      setTranscriptionMethod: jest.fn()
    };

    settingsHandler = new SettingsMenuHandler(mockBot, mockVoiceHandler);
    jest.clearAllMocks();
  });

  describe('showSettingsMenu', () => {
    test('should show main settings menu', async () => {
      await settingsHandler.showSettingsMenu(123);

      expect(mockBot.safeSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('⚙️'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      );
    });
  });

  describe('showVoiceTranscriptionSettings', () => {
    test('should show voice transcription options with current method highlighted', async () => {
      mockVoiceHandler.getTranscriptionMethod.mockReturnValue('nexara');

      await settingsHandler.showVoiceTranscriptionSettings(123);

      expect(mockBot.safeSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('🎤'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      );
      
      // Check that the message contains the current method indicator
      const callArgs = mockBot.safeSendMessage.mock.calls[0];
      expect(callArgs[1]).toContain('Nexara API');
      expect(callArgs[2].reply_markup.inline_keyboard).toBeDefined();
    });

    test('should show available transcription services', async () => {
      mockVoiceHandler.getTranscriptionMethod.mockReturnValue('nexara');

      await settingsHandler.showVoiceTranscriptionSettings(123);

      expect(mockBot.safeSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('🎤'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      );
      
      // Check that the message shows available services
      const callArgs = mockBot.safeSendMessage.mock.calls[0];
      expect(callArgs[1]).toContain('Available transcription services');
      expect(callArgs[1]).toContain('Nexara API');
    });
  });

  describe('handleSettingsCallback', () => {
    test('should handle voice transcription settings callback', async () => {
      const spy = jest.spyOn(settingsHandler, 'showVoiceTranscriptionSettings');
      spy.mockResolvedValue();

      await settingsHandler.handleSettingsCallback('settings:voice_transcription', 123, 456);

      expect(spy).toHaveBeenCalledWith(123, 456);
    });

    test('should handle voice method change callback', async () => {
      mockVoiceHandler.setTranscriptionMethod.mockResolvedValue();

      await settingsHandler.handleSettingsCallback('settings:voice_method:telegram', 123, 456);

      expect(mockVoiceHandler.setTranscriptionMethod).toHaveBeenCalledWith('telegram');
      expect(mockBot.safeEditMessage).toHaveBeenCalledWith(
        123,
        456,
        expect.stringContaining('✅')
      );
      
      // Check that the message contains the updated method name
      const callArgs = mockBot.safeEditMessage.mock.calls[0];
      expect(callArgs[2]).toContain('Nexara API');
    });

    test('should handle voice method change error', async () => {
      mockVoiceHandler.setTranscriptionMethod.mockImplementation(() => {
        throw new Error('Config error');
      });

      await settingsHandler.handleSettingsCallback('settings:voice_method:telegram', 123, 456);

      expect(mockBot.safeEditMessage).toHaveBeenCalledWith(
        123,
        456,
        expect.stringContaining('❌')
      );
      
      // Check that the error message contains the error details
      const callArgs = mockBot.safeEditMessage.mock.calls[0];
      expect(callArgs[2]).toContain('Config error');
    });

    test('should handle back to main menu callback', async () => {
      const spy = jest.spyOn(settingsHandler, 'showSettingsMenu');
      spy.mockResolvedValue();

      await settingsHandler.handleSettingsCallback('settings:back', 123, 456);

      expect(spy).toHaveBeenCalledWith(123, 456);
    });

    test('should return false for unhandled callbacks', async () => {
      const result = await settingsHandler.handleSettingsCallback('unknown:callback', 123, 456);

      expect(result).toBe(false);
    });
  });
});
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

  describe('Voice Transcription Instant Settings', () => {
    beforeEach(() => {
      // Mock fs for bot config
      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
        if (filepath === './configs/bot1.json') {
          return JSON.stringify({ voiceTranscriptionInstant: false });
        }
        return '{}';
      });
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Mock voice handler methods since settings handler delegates to it
      mockVoiceHandler.getVoiceTranscriptionInstant = jest.fn().mockReturnValue(false);
      mockVoiceHandler.setVoiceTranscriptionInstant = jest.fn();
    });

    test('should show voice transcription instant settings', async () => {
      await settingsHandler.showVoiceTranscriptionInstantSettings(123, 456);

      expect(mockBot.safeEditMessage).toHaveBeenCalledWith(
        123,
        456,
        expect.stringContaining('Voice Auto Send'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '✅ Enable' })
              ]),
              expect.arrayContaining([
                expect.objectContaining({ text: '❌ Disabled (Current)' })
              ]),
              expect.arrayContaining([
                expect.objectContaining({ text: '🔙 Back to Settings' })
              ])
            ])
          })
        })
      );
    });

    test('should show enabled state when instant is enabled', async () => {
      // Mock voice handler to return enabled state
      mockVoiceHandler.getVoiceTranscriptionInstant.mockReturnValue(true);

      await settingsHandler.showVoiceTranscriptionInstantSettings(123, 456);

      const callArgs = mockBot.safeEditMessage.mock.calls[0];
      expect(callArgs[2]).toContain('Enabled');
      expect(callArgs[3].reply_markup.inline_keyboard).toContainEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: '✅ Enabled (Current)' })
        ])
      );
      expect(callArgs[3].reply_markup.inline_keyboard).toContainEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: '❌ Disable' })
        ])
      );
    });

    test('should handle voice instant callback', async () => {
      const spy = jest.spyOn(settingsHandler, 'showVoiceTranscriptionInstantSettings');
      spy.mockResolvedValue();

      await settingsHandler.handleSettingsCallback('settings:voice_instant', 123, 456);

      expect(spy).toHaveBeenCalledWith(123, 456);
    });

    test('should handle enable instant callback', async () => {
      await settingsHandler.handleSettingsCallback('settings:voice_instant:enable', 123, 456);

      expect(mockVoiceHandler.setVoiceTranscriptionInstant).toHaveBeenCalledWith(true);
      expect(mockBot.safeEditMessage).toHaveBeenCalledWith(
        123,
        456,
        expect.stringContaining('✅ *Settings Updated*')
      );

      const callArgs = mockBot.safeEditMessage.mock.calls[0];
      expect(callArgs[2]).toContain('Voice Auto Send: **Enabled**');
      expect(callArgs[2]).toContain('sent to AI automatically without confirmation');
    });

    test('should handle disable instant callback', async () => {
      await settingsHandler.handleSettingsCallback('settings:voice_instant:disable', 123, 456);

      expect(mockVoiceHandler.setVoiceTranscriptionInstant).toHaveBeenCalledWith(false);
      expect(mockBot.safeEditMessage).toHaveBeenCalledWith(
        123,
        456,
        expect.stringContaining('✅ *Settings Updated*')
      );

      const callArgs = mockBot.safeEditMessage.mock.calls[0];
      expect(callArgs[2]).toContain('Voice Auto Send: **Disabled**');
      expect(callArgs[2]).toContain('show confirmation buttons before sending');
    });

    test('should handle bot config write error', async () => {
      // Mock voice handler to throw error
      mockVoiceHandler.setVoiceTranscriptionInstant.mockImplementation(() => {
        throw new Error('Write permission denied');
      });

      await settingsHandler.handleSettingsCallback('settings:voice_instant:enable', 123, 456);

      expect(mockBot.safeEditMessage).toHaveBeenCalledWith(
        123,
        456,
        expect.stringContaining('❌ *Settings Error*')
      );

      const callArgs = mockBot.safeEditMessage.mock.calls[0];
      expect(callArgs[2]).toContain('Failed to update Voice Auto Send setting');
    });

    test('should get instant setting from voice handler', () => {
      mockVoiceHandler.getVoiceTranscriptionInstant.mockReturnValue(true);

      const result = settingsHandler.getVoiceTranscriptionInstant();
      expect(result).toBe(true);
      expect(mockVoiceHandler.getVoiceTranscriptionInstant).toHaveBeenCalled();
    });

    test('should delegate to voice handler when config fails', () => {
      mockVoiceHandler.getVoiceTranscriptionInstant.mockReturnValue(false);

      const result = settingsHandler.getVoiceTranscriptionInstant();
      expect(result).toBe(false);
      expect(mockVoiceHandler.getVoiceTranscriptionInstant).toHaveBeenCalled();
    });
  });
});
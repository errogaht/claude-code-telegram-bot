/**
 * Settings Menu Handler for Voice Transcription Configuration
 * Provides UI for selecting transcription method
 */
class SettingsMenuHandler {
  constructor(bot, voiceHandler) {
    this.bot = bot;
    this.voiceHandler = voiceHandler;
  }

  /**
   * Show main settings menu
   */
  async showSettingsMenu(chatId, messageId = null) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🎤 Voice Transcription Method', callback_data: 'settings:voice_transcription' }
        ],
        [
          { text: '🔙 Back to Main Menu', callback_data: 'settings:close' }
        ]
      ]
    };

    const message = '⚙️ *Settings*\n\nChoose a setting to configure:';

    if (messageId) {
      await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
    } else {
      await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
    }
  }

  /**
   * Show voice transcription method selection
   */
  async showVoiceTranscriptionSettings(chatId, messageId = null) {
    const currentMethod = this.voiceHandler.getTranscriptionMethod();
    
    const keyboard = {
      inline_keyboard: [
        [
          { 
            text: currentMethod === 'nexara' ? '🔧 Nexara API (Current)' : '🔧 Nexara API',
            callback_data: 'settings:voice_method:nexara'
          }
        ],
        [
          { text: '🔙 Back to Settings', callback_data: 'settings:back' }
        ]
      ]
    };

    const message = '🎤 *Voice Transcription Method*\n\n' +
                   `Current method: **${this.getMethodDisplayName(currentMethod)}**\n\n` +
                   'Available transcription services:';

    if (messageId) {
      await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
    } else {
      await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
    }
  }

  /**
   * Get display name for transcription method
   */
  getMethodDisplayName(method) {
    switch (method) {
    case 'nexara':
      return 'Nexara API';
    default:
      return 'Nexara API'; // Default to Nexara since it's the only available method
    }
  }

  /**
   * Handle settings callbacks
   */
  async handleSettingsCallback(callbackData, chatId, messageId) {
    try {
      if (callbackData === 'settings:voice_transcription') {
        await this.showVoiceTranscriptionSettings(chatId, messageId);
        return true;
      }

      if (callbackData.startsWith('settings:voice_method:')) {
        const method = callbackData.replace('settings:voice_method:', '');
        
        try {
          this.voiceHandler.setTranscriptionMethod(method);
          
          await this.bot.safeEditMessage(chatId, messageId,
            '✅ *Settings Updated*\n\n' +
              `Transcription method updated to: **${this.getMethodDisplayName(method)}**\n\n` +
              'The new method will be used for all future voice messages.'
          );
        } catch (error) {
          await this.bot.safeEditMessage(chatId, messageId,
            '❌ *Settings Error*\n\n' +
              `Failed to update transcription method: ${error.message}`
          );
        }
        return true;
      }

      if (callbackData === 'settings:back') {
        await this.showSettingsMenu(chatId, messageId);
        return true;
      }

      if (callbackData === 'settings:close') {
        await this.bot.safeEditMessage(chatId, messageId, '⚙️ Settings closed.');
        return true;
      }

      return false; // Callback not handled by this handler
    } catch (error) {
      console.error('[SettingsHandler] Callback error:', error);
      return false;
    }
  }
}

module.exports = SettingsMenuHandler;
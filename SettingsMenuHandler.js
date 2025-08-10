/**
 * Settings Menu Handler for Voice Transcription Configuration and Model Selection
 * Provides UI for selecting transcription method and AI model
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
          { text: '🤖 AI Model Selection', callback_data: 'settings:model_selection' }
        ],
        [
          { text: '🎤 Voice Transcription Method', callback_data: 'settings:voice_transcription' }
        ],
        [
          { text: '🚀 Voice Auto Send', callback_data: 'settings:voice_instant' }
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
   * Get voice transcription instant setting from bot config (delegate to VoiceHandler)
   */
  getVoiceTranscriptionInstant() {
    return this.voiceHandler.getVoiceTranscriptionInstant();
  }

  /**
   * Set voice transcription instant setting in bot config (delegate to VoiceHandler)
   */
  setVoiceTranscriptionInstant(enabled) {
    return this.voiceHandler.setVoiceTranscriptionInstant(enabled);
  }

  /**
   * Show voice transcription instant settings
   */
  async showVoiceTranscriptionInstantSettings(chatId, messageId = null) {
    const isEnabled = this.getVoiceTranscriptionInstant();
    
    const keyboard = {
      inline_keyboard: [
        [
          { 
            text: isEnabled ? '✅ Enabled (Current)' : '✅ Enable',
            callback_data: 'settings:voice_instant:enable'
          }
        ],
        [
          { 
            text: isEnabled ? '❌ Disable' : '❌ Disabled (Current)',
            callback_data: 'settings:voice_instant:disable'
          }
        ],
        [
          { text: '🔙 Back to Settings', callback_data: 'settings:back' }
        ]
      ]
    };

    const message = '🚀 *Voice Auto Send*\n\n' +
                   `Current status: **${isEnabled ? 'Enabled' : 'Disabled'}**\n\n` +
                   '**When enabled:**\n' +
                   '• Voice messages are sent to AI automatically\n' +
                   '• No confirmation buttons (OK/Cancel) are shown\n\n' +
                   '**When disabled:**\n' +
                   '• Voice messages show confirmation buttons\n' +
                   '• You can review transcription before sending';

    if (messageId) {
      await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
    } else {
      await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
    }
  }

  /**
   * Handle settings callbacks
   */
  async handleSettingsCallback(callbackData, chatId, messageId) {
    try {
      if (callbackData === 'settings:model_selection') {
        // Delegate to main bot's model selection
        await this.bot.showModelSelection(chatId, messageId);
        return true;
      }

      if (callbackData === 'settings:voice_transcription') {
        await this.showVoiceTranscriptionSettings(chatId, messageId);
        return true;
      }

      if (callbackData === 'settings:voice_instant') {
        await this.showVoiceTranscriptionInstantSettings(chatId, messageId);
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

      if (callbackData.startsWith('settings:voice_instant:')) {
        const action = callbackData.replace('settings:voice_instant:', '');
        const enabled = action === 'enable';
        
        try {
          this.setVoiceTranscriptionInstant(enabled);
          
          await this.bot.safeEditMessage(chatId, messageId,
            '✅ *Settings Updated*\n\n' +
              `Voice Auto Send: **${enabled ? 'Enabled' : 'Disabled'}**\n\n` +
              (enabled ? 
                '🚀 Voice messages will now be sent to AI automatically without confirmation.' :
                '⏸️ Voice messages will now show confirmation buttons before sending.'
              )
          );
        } catch (error) {
          await this.bot.safeEditMessage(chatId, messageId,
            '❌ *Settings Error*\n\n' +
              `Failed to update Voice Auto Send setting: ${error.message}`
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
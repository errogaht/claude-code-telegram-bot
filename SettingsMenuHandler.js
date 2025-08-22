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
          { text: '⏰ ActivityWatch Tracking', callback_data: 'settings:activitywatch' }
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

      if (callbackData === 'settings:activitywatch') {
        await this.showActivityWatchSettings(chatId, messageId);
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

      if (callbackData.startsWith('settings:aw_enable:')) {
        const enabled = callbackData.replace('settings:aw_enable:', '') === 'true';
        
        try {
          this.bot.sessionManager.setActivityWatchEnabled(enabled);
          
          await this.bot.safeEditMessage(chatId, messageId,
            '✅ *ActivityWatch Settings Updated*\n\n' +
              `ActivityWatch tracking: **${enabled ? 'Enabled' : 'Disabled'}**\n\n` +
              (enabled ? 
                'Session tracking will be recorded in ActivityWatch.' :
                'Session tracking is disabled.')
          );
        } catch (error) {
          await this.bot.safeEditMessage(chatId, messageId,
            '❌ *Settings Error*\n\n' +
              `Failed to update ActivityWatch setting: ${error.message}`
          );
        }
        return true;
      }

      if (callbackData.startsWith('settings:aw_multiplier:')) {
        const multiplier = parseFloat(callbackData.replace('settings:aw_multiplier:', ''));
        
        try {
          this.bot.sessionManager.setActivityWatchTimeMultiplier(multiplier);
          
          await this.bot.safeEditMessage(chatId, messageId,
            '✅ *ActivityWatch Settings Updated*\n\n' +
              `Time multiplier set to: **${multiplier}x**\n\n` +
              (multiplier === 1.0 ? 
                'Session time will be recorded exactly as it was.' :
                `Session time will be multiplied by ${multiplier}x for time tracking.`)
          );
        } catch (error) {
          await this.bot.safeEditMessage(chatId, messageId,
            '❌ *Settings Error*\n\n' +
              `Failed to update time multiplier: ${error.message}`
          );
        }
        return true;
      }

      if (callbackData === 'settings:aw_multiplier_menu') {
        await this.showActivityWatchMultiplierMenu(chatId, messageId);
        return true;
      }

      if (callbackData === 'settings:aw_stats') {
        await this.showActivityWatchStats(chatId, messageId);
        return true;
      }

      if (callbackData === 'settings:aw_test') {
        await this.testActivityWatchConnection(chatId, messageId);
        return true;
      }

      return false; // Callback not handled by this handler
    } catch (error) {
      console.error('[SettingsHandler] Callback error:', error);
      return false;
    }
  }

  /**
   * Show ActivityWatch settings menu
   */
  async showActivityWatchSettings(chatId, messageId = null) {
    try {
      const settings = this.bot.sessionManager.getActivityWatchSettings();
      
      const keyboard = {
        inline_keyboard: [
          [
            { 
              text: `${settings.enabled ? '✅' : '❌'} Enable Tracking`, 
              callback_data: `settings:aw_enable:${!settings.enabled}` 
            }
          ],
          [
            { text: `⏰ Time Multiplier: ${settings.timeMultiplier}x`, callback_data: 'settings:aw_multiplier_menu' }
          ],
          [
            { text: '📊 View Stats', callback_data: 'settings:aw_stats' }
          ],
          [
            { text: '🧪 Test Connection', callback_data: 'settings:aw_test' }
          ],
          [
            { text: '🔙 Back to Settings', callback_data: 'settings:back' }
          ]
        ]
      };

      const message = '⏰ *ActivityWatch Tracking*\n\n' +
        `**Status:** ${settings.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `**Time Multiplier:** ${settings.timeMultiplier}x\n` +
        `**Bucket:** ${settings.bucketId}\n\n` +
        'ActivityWatch integration tracks your Claude sessions for time analysis.\n\n' +
        '• **Enable/Disable** - Turn tracking on/off\n' +
        '• **Time Multiplier** - Adjust recorded session duration\n' +
        '• **Stats** - View tracking statistics\n' +
        '• **Test** - Check ActivityWatch connection';

      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
      } else {
        await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
      }
    } catch (error) {
      console.error('[SettingsHandler] Error showing ActivityWatch settings:', error);
      
      const errorMessage = '❌ *Error*\n\nFailed to load ActivityWatch settings.';
      
      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, errorMessage);
      } else {
        await this.bot.safeSendMessage(chatId, errorMessage);
      }
    }
  }

  /**
   * Show time multiplier selection menu
   */
  async showActivityWatchMultiplierMenu(chatId, messageId = null) {
    const currentSettings = this.bot.sessionManager.getActivityWatchSettings();
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: `${currentSettings.timeMultiplier === 0.5 ? '●' : '○'} 0.5x (Half Time)`, callback_data: 'settings:aw_multiplier:0.5' },
          { text: `${currentSettings.timeMultiplier === 1.0 ? '●' : '○'} 1.0x (Real Time)`, callback_data: 'settings:aw_multiplier:1.0' }
        ],
        [
          { text: `${currentSettings.timeMultiplier === 1.5 ? '●' : '○'} 1.5x`, callback_data: 'settings:aw_multiplier:1.5' },
          { text: `${currentSettings.timeMultiplier === 2.0 ? '●' : '○'} 2.0x (Double Time)`, callback_data: 'settings:aw_multiplier:2.0' }
        ],
        [
          { text: `${currentSettings.timeMultiplier === 3.0 ? '●' : '○'} 3.0x (Triple Time)`, callback_data: 'settings:aw_multiplier:3.0' },
          { text: `${currentSettings.timeMultiplier === 5.0 ? '●' : '○'} 5.0x`, callback_data: 'settings:aw_multiplier:5.0' }
        ],
        [
          { text: '🔙 Back to ActivityWatch', callback_data: 'settings:activitywatch' }
        ]
      ]
    };

    const message = '⏰ *Time Multiplier Selection*\n\n' +
      `**Current:** ${currentSettings.timeMultiplier}x\n\n` +
      'Choose how much to multiply your actual session time:\n\n' +
      '• **0.5x** - Record half the actual time\n' +
      '• **1.0x** - Record exact time (default)\n' +
      '• **1.5x** - Record 1.5x longer\n' +
      '• **2.0x** - Record double time\n' +
      '• **3.0x** - Record triple time\n' +
      '• **5.0x** - Record 5x longer\n\n' +
      'The system automatically adjusts time windows to avoid overlaps.';

    if (messageId) {
      await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
    } else {
      await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
    }
  }

  /**
   * Show ActivityWatch statistics
   */
  async showActivityWatchStats(chatId, messageId = null) {
    try {
      const stats = await this.bot.sessionManager.getActivityWatchStats();
      
      let message = '📊 *ActivityWatch Statistics*\n\n';
      
      if (stats) {
        message += `**Total Sessions:** ${stats.totalSessions}\n`;
        message += `**Total Time:** ${(stats.totalTime / 60).toFixed(1)} minutes\n`;
        message += `**Completed:** ${stats.completedSessions}\n`;
        message += `**Failed:** ${stats.failedSessions}\n`;
        message += `**Total Tokens:** ${stats.totalTokens.toLocaleString()}\n`;
        message += `**Total Cost:** $${stats.totalCost.toFixed(4)}\n`;
        message += `**Average Session:** ${(stats.averageSessionTime / 60).toFixed(1)} minutes\n\n`;
        message += '_Statistics from last 100 sessions_';
      } else {
        message += '❌ Unable to fetch statistics\n\n';
        message += 'ActivityWatch may be disconnected or no sessions recorded yet.';
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'settings:aw_stats' }
          ],
          [
            { text: '🔙 Back to ActivityWatch', callback_data: 'settings:activitywatch' }
          ]
        ]
      };

      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
      } else {
        await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
      }
    } catch (error) {
      console.error('[SettingsHandler] Error showing ActivityWatch stats:', error);
      
      const errorMessage = '❌ *Error*\n\nFailed to load ActivityWatch statistics.';
      
      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, errorMessage);
      } else {
        await this.bot.safeSendMessage(chatId, errorMessage);
      }
    }
  }

  /**
   * Test ActivityWatch connection
   */
  async testActivityWatchConnection(chatId, messageId = null) {
    try {
      // Show testing message first
      const testingMessage = '🧪 *Testing ActivityWatch Connection*\n\n⏳ Connecting...';
      
      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, testingMessage);
      } else {
        await this.bot.safeSendMessage(chatId, testingMessage);
      }

      // Perform the test
      const connected = await this.bot.sessionManager.testActivityWatchConnection();
      
      let message = '🧪 *ActivityWatch Connection Test*\n\n';
      
      if (connected) {
        message += '✅ **Connection Successful**\n\n';
        message += 'ActivityWatch is running and accessible.\n';
        message += 'Session tracking will work correctly.';
      } else {
        message += '❌ **Connection Failed**\n\n';
        message += 'Cannot connect to ActivityWatch.\n\n';
        message += '**Possible issues:**\n';
        message += '• ActivityWatch is not running\n';
        message += '• Service on different port\n';
        message += '• Network connectivity issues';
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Test Again', callback_data: 'settings:aw_test' }
          ],
          [
            { text: '🔙 Back to ActivityWatch', callback_data: 'settings:activitywatch' }
          ]
        ]
      };

      // Update the message with results
      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
      } else {
        await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
      }
    } catch (error) {
      console.error('[SettingsHandler] Error testing ActivityWatch connection:', error);
      
      const errorMessage = '❌ *Test Error*\n\nFailed to test ActivityWatch connection.';
      
      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, errorMessage);
      } else {
        await this.bot.safeSendMessage(chatId, errorMessage);
      }
    }
  }
}

module.exports = SettingsMenuHandler;
const axios = require('axios');
const FormData = require('form-data');

/**
 * Voice Message Handler - Extracted from StreamTelegramBot
 * Handles voice transcription and processing with Nexara API
 */
class VoiceMessageHandler {
  constructor(bot, nexaraApiKey, activityIndicator, mainBot) {
    this.bot = bot;
    this.nexaraApiKey = nexaraApiKey;
    this.activityIndicator = activityIndicator;
    this.mainBot = mainBot; // Reference to main bot for delegation
    this.pendingCommands = new Map(); // messageId -> { transcribedText, userId, chatId }
  }


  /**
   * Handle voice messages with Nexara API
   */
  async handleVoiceMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Start typing indicator for voice processing
    await this.activityIndicator.start(chatId);
    
    try {
      // Check if we're in test mode (no Nexara API key or test environment)
      const isTestMode = !this.nexaraApiKey || process.env.NODE_ENV === 'test';
      
      let transcribedText;
      
      if (isTestMode) {
        // Test mode - provide simulated transcription
        transcribedText = "Test voice message transcription";
        console.log('[Voice] Test mode - using simulated transcription');
      } else {
        // Production mode - use Nexara API
        const file = await this.bot.getFile(msg.voice.file_id);
        const audioBuffer = await this.downloadTelegramFile(file.file_path);
        transcribedText = await this.transcribeWithNexara(audioBuffer);
      }
      
      // Stop typing indicator
      await this.activityIndicator.stop(chatId);
      
      // Send confirmation message with buttons
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Execute', callback_data: `voice_confirm:${chatId}_${Date.now()}` },
            { text: '❌ Cancel', callback_data: `voice_cancel:${chatId}_${Date.now()}` }
          ],
          [
            { text: '✏️ Edit', callback_data: `voice_edit:${chatId}_${Date.now()}` }
          ]
        ]
      };
      
      const confirmMsg = await this.mainBot.safeSendMessage(chatId,
        `🎤 *Voice Message Received*\n\n` +
        `📝 **Text:** "${transcribedText}"\n\n` +
        `${isTestMode ? '🧪 **Test Mode:** Simulated transcription\n\n' : ''}` +
        `❓ Execute this command?`,
        {
          reply_markup: keyboard
        }
      );
      
      // Store pending command with new message ID
      this.pendingCommands.set(confirmMsg.message_id, {
        transcribedText,
        userId,
        chatId
      });
      
    } catch (error) {
      console.error('[Voice] Processing error:', error);
      
      // Stop typing indicator on error
      await this.activityIndicator.stop(chatId);
      
      // Send error message to user
      try {
        await this.mainBot.safeSendMessage(chatId,
          `❌ *Voice Message Error*\n\n` +
          `Sorry, I couldn't process your voice message.\n\n` +
          `Error: ${error.message}`
        );
      } catch (sendError) {
        console.error('[Voice] Failed to send error message:', sendError);
      }
    }
  }

  /**
   * Handle voice command callbacks
   */
  async handleVoiceCallback(data, chatId, messageId, userId, processUserMessageCallback) {
    const pendingCommand = this.pendingCommands.get(messageId);
    
    if (!pendingCommand) {
      try {
        await this.mainBot.safeEditMessage(chatId, messageId, 
          '❌ *Voice command expired*\n\nPlease send a new voice message.'
        );
      } catch (error) {
        // Silently handle edit errors for expired commands
      }
      return;
    }
    
    const { transcribedText } = pendingCommand;
    
    try {
      if (data.startsWith('voice_confirm:')) {
        // Execute the command
        await this.mainBot.safeEditMessage(chatId, messageId,
          `✅ *Executing voice command*\n\n` +
          `📝 Command: "${transcribedText}"\n\n` +
          `⏳ Sending to Claude...`
        );
        
        // Remove from pending
        this.pendingCommands.delete(messageId);
        
        // Process the command via callback
        await processUserMessageCallback(transcribedText, userId, chatId);
        
      } else if (data.startsWith('voice_cancel:')) {
        await this.mainBot.safeEditMessage(chatId, messageId,
          '❌ *Voice command cancelled*'
        );
        
        this.pendingCommands.delete(messageId);
        
      } else if (data.startsWith('voice_edit:')) {
        await this.mainBot.safeEditMessage(chatId, messageId,
          `✏️ *Edit voice command*\n\n` +
          `📝 **Original:** "${transcribedText}"\n\n` +
          `💬 Send the corrected text message:`
        );
        
        // Keep in pending for manual text input
      }
    } catch (error) {
      // Silently handle edit errors for callback operations
    }
  }

  /**
   * Download Telegram file
   */
  async downloadTelegramFile(filePath) {
    try {
      const botToken = this.bot.token;
      const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Transcribe audio with Nexara API
   */
  async transcribeWithNexara(audioBuffer) {
    if (!this.nexaraApiKey) {
      throw new Error('Nexara API key not configured. Voice messages unavailable.');
    }
    
    try {
      console.log('[Nexara] Transcribing audio...');
      
      // Create FormData with the audio file
      const formData = new FormData();
      
      // Add the audio file as a buffer with proper filename and content type
      formData.append('file', audioBuffer, {
        filename: 'audio.ogg',
        contentType: 'audio/ogg'
      });
      
      // Add other required fields
      formData.append('model', 'whisper-1');
      
      const response = await axios.post('https://api.nexara.ru/api/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${this.nexaraApiKey}`,
          ...formData.getHeaders()
        },
        timeout: 30000
      });
      
      if (response.data && response.data.text) {
        console.log(`[Nexara] Transcribed: "${response.data.text}"`);
        return response.data.text;
      } else {
        throw new Error('Empty response from Nexara API');
      }
      
    } catch (error) {
      if (error.response) {
        throw new Error(`Nexara API error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
      } else if (error.request) {
        throw new Error('No response from Nexara API. Check internet connection.');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  /**
   * Cleanup pending commands
   */
  cleanup() {
    this.pendingCommands.clear();
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      pendingVoiceCommands: this.pendingCommands.size
    };
  }
}

module.exports = VoiceMessageHandler;
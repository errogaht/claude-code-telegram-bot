const axios = require('axios');
const FormData = require('form-data');

/**
 * Voice Message Handler - Extracted from StreamTelegramBot
 * Handles voice transcription and processing with Nexara API
 */
class VoiceMessageHandler {
  constructor(bot, nexaraApiKey, activityIndicator) {
    this.bot = bot;
    this.nexaraApiKey = nexaraApiKey;
    this.activityIndicator = activityIndicator;
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
      // Get voice file from Telegram
      const file = await this.bot.getFile(msg.voice.file_id);
      const audioBuffer = await this.downloadTelegramFile(file.file_path);
      
      // Transcribe with Nexara
      const transcribedText = await this.transcribeWithNexara(audioBuffer);
      
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
      
      const confirmMsg = await this.bot.sendMessage(chatId,
        `🎤 *Voice Message Transcribed*\n\n` +
        `📝 **Text:** "${transcribedText}"\n\n` +
        `❓ Execute this command?`,
        {
          parse_mode: 'Markdown',
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
      console.error('[Voice] Transcription error:', error);
      
      // Stop typing indicator on error
      await this.activityIndicator.stop(chatId);
    }
  }

  /**
   * Handle voice command callbacks
   */
  async handleVoiceCallback(data, chatId, messageId, userId, processUserMessageCallback) {
    const pendingCommand = this.pendingCommands.get(messageId);
    
    if (!pendingCommand) {
      await this.bot.editMessageText(
        '❌ *Voice command expired*\n\nPlease send a new voice message.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );
      return;
    }
    
    const { transcribedText } = pendingCommand;
    
    if (data.startsWith('voice_confirm:')) {
      // Execute the command
      await this.bot.editMessageText(
        `✅ *Executing voice command*\n\n` +
        `📝 Command: "${transcribedText}"\n\n` +
        `⏳ Sending to Claude...`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );
      
      // Remove from pending
      this.pendingCommands.delete(messageId);
      
      // Process the command via callback
      await processUserMessageCallback(transcribedText, userId, chatId);
      
    } else if (data.startsWith('voice_cancel:')) {
      await this.bot.editMessageText(
        '❌ *Voice command cancelled*',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );
      
      this.pendingCommands.delete(messageId);
      
    } else if (data.startsWith('voice_edit:')) {
      await this.bot.editMessageText(
        `✏️ *Edit voice command*\n\n` +
        `📝 **Original:** "${transcribedText}"\n\n` +
        `💬 Send the corrected text message:`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );
      
      // Keep in pending for manual text input
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
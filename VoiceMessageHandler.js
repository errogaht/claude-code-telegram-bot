const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const NexaraTranscriptionAdapter = require('./adapters/NexaraTranscriptionAdapter');
const TestTranscriptionAdapter = require('./adapters/TestTranscriptionAdapter');

/**
 * Voice Message Handler - Extracted from StreamTelegramBot
 * Handles voice transcription and processing with Nexara API
 */
class VoiceMessageHandler {
  constructor(bot, nexaraApiKey, activityIndicator, mainBot, configFilePath = './configs/bot1.json') {
    this.bot = bot;
    this.nexaraApiKey = nexaraApiKey;
    this.activityIndicator = activityIndicator;
    this.mainBot = mainBot; // Reference to main bot for delegation
    this.configFilePath = configFilePath;
    this.pendingCommands = new Map(); // messageId -> { transcribedText, userId, chatId }
  }

  /**
   * Get transcription method from config
   */
  getTranscriptionMethod() {
    try {
      const config = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
      return config.voiceTranscriptionMethod || 'nexara';
    } catch (error) {
      console.warn('[VoiceHandler] Config read error, using default:', error.message);
      return 'nexara';
    }
  }

  /**
   * Set transcription method in config
   */
  setTranscriptionMethod(method) {
    try {
      const config = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
      config.voiceTranscriptionMethod = method;
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      console.log(`[VoiceHandler] Transcription method set to: ${method}`);
    } catch (error) {
      throw new Error(`Failed to update config: ${error.message}`);
    }
  }

  /**
   * Create transcription adapter based on config
   */
  createTranscriptionAdapter() {
    // Check if we're in test mode
    const isTestMode = !this.nexaraApiKey || process.env.NODE_ENV === 'test';
    
    if (isTestMode) {
      return new TestTranscriptionAdapter();
    }
    
    // Always use Nexara API for transcription
    return new NexaraTranscriptionAdapter(this.nexaraApiKey);
  }

  /**
   * Handle voice messages with adapter pattern
   */
  async handleVoiceMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Start typing indicator for voice processing
    await this.activityIndicator.start(chatId);
    
    try {
      const adapter = this.createTranscriptionAdapter();
      let transcribedText;
      
      if (adapter.getName() === 'Test Mode') {
        transcribedText = await adapter.transcribe(msg.voice.file_id);
        console.log('[Voice] Test mode - using simulated transcription');
      } else {
        // Nexara API requires audio buffer
        const file = await this.bot.getFile(msg.voice.file_id);
        const audioBuffer = await this.downloadTelegramFile(file.file_path);
        transcribedText = await adapter.transcribe(audioBuffer);
        console.log(`[Voice] Using ${adapter.getName()} transcription`);
      }
      
      // Stop typing indicator
      await this.activityIndicator.stop(chatId);
      
      // Send confirmation message with buttons
      const keyboard = {
        inline_keyboard: [
          [
            { text: 'OK', callback_data: `voice_confirm:${chatId}_${Date.now()}` },
            { text: 'Cancel', callback_data: `voice_cancel:${chatId}_${Date.now()}` }
          ]
        ]
      };
      
      const confirmMsg = await this.mainBot.safeSendMessage(chatId,
        '🎤 *Voice Message Received*\n\n' +
        `📝 **Text:** "${transcribedText}"\n\n` +
        `🔧 **Method:** ${adapter.getName()}\n\n` +
        '❓ Execute this command?',
        {
          reply_markup: keyboard
        }
      );
      
      // Store pending command with new message ID (with safety check)
      if (confirmMsg && confirmMsg.message_id) {
        this.pendingCommands.set(confirmMsg.message_id, {
          transcribedText,
          userId,
          chatId
        });
      } else {
        console.error('[Voice] Warning: confirmMsg or message_id is undefined, cannot store pending command');
      }
      
    } catch (error) {
      console.error('[Voice] Processing error:', error);
      
      // Stop typing indicator on error
      await this.activityIndicator.stop(chatId);
      
      // Send error message to user
      try {
        await this.mainBot.safeSendMessage(chatId,
          '❌ *Voice Message Error*\n\n' +
          'Sorry, I couldn\'t process your voice message.\n\n' +
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
      } catch {
        // Silently handle edit errors for expired commands
      }
      return;
    }
    
    const { transcribedText } = pendingCommand;
    
    try {
      if (data.startsWith('voice_confirm:')) {
        // Execute the command
        await this.mainBot.safeEditMessage(chatId, messageId,
          '✅ *Executing voice command*\n\n' +
          `📝 Command: "${transcribedText}"\n\n` +
          '⏳ Sending to Claude...'
        );
        
        // Remove from pending
        this.pendingCommands.delete(messageId);
        
        // Check if concat mode is enabled
        if (this.mainBot.getConcatModeStatus(userId)) {
          const bufferSize = await this.mainBot.addToMessageBuffer(userId, {
            type: 'voice',
            content: transcribedText,
            imagePath: null
          });
          
          await this.mainBot.safeEditMessage(chatId, messageId, 
            `📝 **Voice Added to Buffer**\n\n🎤 Transcription: "${transcribedText}"\n\nBuffer: ${bufferSize} message${bufferSize > 1 ? 's' : ''}`
          );
        } else {
          // Normal processing
          await processUserMessageCallback(transcribedText, userId, chatId);
        }
        
      } else if (data.startsWith('voice_cancel:')) {
        await this.mainBot.safeEditMessage(chatId, messageId,
          '❌ *Voice command cancelled*'
        );
        
        this.pendingCommands.delete(messageId);
      }
    } catch {
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
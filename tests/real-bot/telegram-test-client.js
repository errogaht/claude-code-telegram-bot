/**
 * Telegram Test Client
 * Simulates a real Telegram user interacting with the bot using telegram-test-api
 */

class TelegramTestClient {
  constructor(serverWrapper, token, userId = 12345, options = {}) {
    this.serverWrapper = serverWrapper; // This is our TelegramTestServer wrapper
    this.server = serverWrapper.getServer(); // This is the raw telegram-test-api server
    this.token = token;
    this.userId = userId;
    this.chatId = userId; // For private chats, chat_id equals user_id
    this.messageId = 1;
    this.options = {
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      languageCode: 'en',
      ...options
    };
    
    // Get the built-in client from telegram-test-api
    this.client = this.server.getClient(token, {
      userId: this.userId,
      ...this.options
    });
    
    // Get server URL from the wrapper
    this.serverUrl = this.serverWrapper.getApiUrl();
    
    // Track conversation state
    this.conversationHistory = [];
    this.lastBotResponse = null;
  }

  // Send a text message to the bot
  async sendMessage(text, options = {}) {
    const message = this.client.makeMessage(text, {
      ...options,
      chat: {
        id: this.chatId,
        type: 'private'
      },
      from: {
        id: this.userId,
        is_bot: false,
        first_name: this.options.firstName,
        last_name: this.options.lastName,
        username: this.options.username,
        language_code: this.options.languageCode
      }
    });

    this.conversationHistory.push({ type: 'user_message', data: message });
    
    console.log(`📤 Sent message: "${text}"`);
    
    // Send the message using the built-in client
    const result = this.client.sendMessage(message);
    
    return result;
  }

  // Send a callback query (button press)
  async sendCallbackQuery(callbackData, messageId = null, options = {}) {
    const callbackQuery = this.client.makeCallbackQuery(callbackData, {
      message_id: messageId,
      ...options,
      message: {
        message_id: messageId || 1,
        chat: {
          id: this.chatId,
          type: 'private'
        }
      },
      from: {
        id: this.userId,
        is_bot: false,
        first_name: this.options.firstName,
        last_name: this.options.lastName,
        username: this.options.username,
        language_code: this.options.languageCode
      }
    });

    this.conversationHistory.push({ type: 'callback_query', data: callbackQuery });

    console.log(`🔘 Pressed button: "${callbackData}"`);
    
    // Send the callback query using the built-in client
    const result = this.client.sendCallback(callbackQuery);
    
    return result;
  }

  // Send a voice message (simulated with document upload)
  async sendVoiceMessage(voiceFilePath, options = {}) {
    // Check if file exists before proceeding
    const fs = require('fs');
    if (!fs.existsSync(voiceFilePath)) {
      throw new Error(`Voice file not found: ${voiceFilePath}`);
    }
    
    // Use document upload to simulate voice message
    // telegram-test-api may not support voice directly, so we simulate it
    const message = this.client.makeMessage('', {
      chat: {
        id: this.chatId,
        type: 'private'
      },
      voice: {
        file_id: `voice_${Date.now()}`,
        file_unique_id: `unique_${Date.now()}`,
        duration: options.duration || 5,
        mime_type: 'audio/ogg'
      },
      ...options,
      from: {
        id: this.userId,
        is_bot: false,
        first_name: this.options.firstName,
        last_name: this.options.lastName,
        username: this.options.username,
        language_code: this.options.languageCode
      }
    });

    this.conversationHistory.push({ type: 'voice_message', data: message });

    console.log(`🎤 Sent voice message (simulated): ${voiceFilePath}`);
    
    const result = this.client.sendMessage(message);
    
    return result;
  }

  // Wait for bot response from telegram-test-api server using getUpdatesHistory
  async waitForBotResponse(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      console.log(`⏳ Waiting for bot response using telegram-test-api getUpdatesHistory...`);
      
      const startTime = Date.now();
      let checkCount = 0;
      let lastMessageCount = 0;
      
      const checkForBotMessages = async () => {
        try {
          checkCount++;
          
          const serverUrl = this.serverUrl;
          const axios = require('axios');
          
          // Use getUpdatesHistory endpoint which returns both user and bot messages
          try {
            const response = await axios.post(`${serverUrl}/getUpdatesHistory`, {
              token: this.token
            });
            
            if (response.data && response.data.result) {
              const allMessages = response.data.result;
              
              // Filter for bot messages in our chat that are newer than what we've seen
              const botMessages = allMessages.filter(item => {
                // Check if this is a bot message (from storage.botMessages)
                if (item.message && item.message.chat_id) {
                  // Bot messages have chat_id as string, and we need to check if it's from the bot
                  return String(item.message.chat_id) === String(this.chatId) && 
                         item.time > startTime - 1000; // Only messages after we started waiting
                }
                return false;
              });
              
              // Check if we have new bot messages
              if (botMessages.length > lastMessageCount) {
                const latestBotMessage = botMessages[botMessages.length - 1];
                console.log(`📥 ✅ Real bot response received from telegram-test-api: "${latestBotMessage.message.text?.substring(0, 100)}..."`);
                
                // Convert telegram-test-api format to standard Telegram Bot API format
                const standardBotMessage = {
                  update_id: latestBotMessage.updateId,
                  message: {
                    message_id: latestBotMessage.messageId,
                    from: {
                      id: parseInt(this.token.split(':')[0]),
                      is_bot: true,
                      first_name: 'Claude Bot'
                    },
                    chat: {
                      id: this.chatId,
                      type: 'private'
                    },
                    date: Math.floor(latestBotMessage.time / 1000),
                    text: latestBotMessage.message.text,
                    reply_markup: latestBotMessage.message.reply_markup
                  }
                };
                
                this.lastBotResponse = standardBotMessage;
                this.conversationHistory.push({ 
                  type: 'bot_response', 
                  data: standardBotMessage,
                  timestamp: Date.now()
                });
                
                resolve(standardBotMessage);
                return;
              }
              
              lastMessageCount = botMessages.length;
            }
          } catch (axiosError) {
            // Only log every 10 attempts to reduce noise
            if (checkCount % 10 === 0) {
              console.log(`🔍 getUpdatesHistory request failed (attempt ${checkCount}): ${axiosError.message}`);
            }
          }
          
          // Check for timeout
          if (Date.now() - startTime > timeoutMs) {
            console.log(`⏰ Timeout waiting for bot response after ${timeoutMs}ms (${checkCount} attempts)`);
            console.log(`📊 Debug: Found ${lastMessageCount} bot messages during wait period`);
            
            reject(new Error(`Bot response timeout after ${timeoutMs}ms. This may indicate the bot is not responding or telegram-test-api is not capturing bot messages properly.`));
            return;
          }
          
          // Continue polling with shorter delays for voice message tests
          const delay = Math.min(50 + (checkCount * 5), 200); // 50ms to 200ms (faster polling)
          setTimeout(checkForBotMessages, delay);
          
        } catch (error) {
          console.error(`❌ Error checking for bot responses: ${error.message}`);
          reject(error);
        }
      };
      
      // Start checking after a short delay to let the bot process the message
      setTimeout(checkForBotMessages, 200); // Shorter initial delay
    });
  }

  // Get all updates (messages) from bot
  getUpdates() {
    return this.client.getUpdates();
  }

  // Get conversation history
  getConversationHistory() {
    return this.conversationHistory;
  }

  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
    this.lastBotResponse = null;
  }

  // Get the last bot response
  getLastBotResponse() {
    return this.lastBotResponse;
  }

  // Get the underlying telegram-test-api client
  getRawClient() {
    return this.client;
  }
}

module.exports = TelegramTestClient;
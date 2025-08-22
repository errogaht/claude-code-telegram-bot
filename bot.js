/**
 * New Claude Code Telegram Bot with Stream-JSON Architecture
 * Based on Claudia's approach - no terminal interaction, direct stream processing
 */

const TelegramBot = require('node-telegram-bot-api');
const TelegramFormatter = require('./telegram-formatter');
const ActivityIndicator = require('./ActivityIndicator');
const VoiceMessageHandler = require('./VoiceMessageHandler');
const ImageHandler = require('./ImageHandler');
const SessionManager = require('./SessionManager');
const ProjectNavigator = require('./ProjectNavigator');
const KeyboardHandlers = require('./KeyboardHandlers');
const GitManager = require('./GitManager');
const MessageSplitter = require('./MessageSplitter');
const SettingsMenuHandler = require('./SettingsMenuHandler');
const CommandsHandler = require('./CommandsHandler');
const UnifiedWebServer = require('./UnifiedWebServer');
const ConfigManager = require('./ConfigManager');
const path = require('path');

class StreamTelegramBot {
  constructor(token, options = {}) {
    this.bot = new TelegramBot(token, { polling: true });
    this.formatter = new TelegramFormatter();
    
    this.options = {
      workingDirectory: process.cwd(), // Claude Code can work in any directory
      model: 'sonnet',
      maxConcurrentSessions: 5,
      ...options
    };
    
    // Store config file path for saving admin ID
    this.configFilePath = options.configFilePath;
    
    // Initialize ConfigManager for efficient in-memory config operations
    this.configManager = options.configFilePath ? new ConfigManager(options.configFilePath) : null;
    
    // Store bot instance name for PM2 restart
    this.botInstanceName = options.botInstanceName || 'bot1';
    
    // Admin user management
    this.adminUserId = options.adminUserId ? parseInt(options.adminUserId) : null;
    this.authorizedUsers = new Set();
    if (this.adminUserId) {
      this.authorizedUsers.add(this.adminUserId);
    }
    
    // Core services
    this.activeProcessors = new Set();
    
    // Message concatenation state management
    this.concatMode = new Map(); // userId -> boolean (concat mode status)
    this.messageBuffer = new Map(); // userId -> Array of buffered messages
    
    // Initialize extracted modules
    this.activityIndicator = new ActivityIndicator(this.bot);
    this.sessionManager = new SessionManager(this.formatter, this.options, this.bot, this.activeProcessors, this.activityIndicator, this);
    this.projectNavigator = new ProjectNavigator(this.bot, this.options, this);
    this.keyboardHandlers = new KeyboardHandlers(this.bot, this);
    this.messageSplitter = new MessageSplitter();
    
    // Git manager - full git workflow handler
    this.gitManager = new GitManager(this.bot, this.options, this.keyboardHandlers, this);
    
    // Voice message handler
    this.voiceHandler = new VoiceMessageHandler(this.bot, this.options.nexaraApiKey, this.activityIndicator, this, this.configFilePath);
    
    // Settings menu handler
    this.settingsHandler = new SettingsMenuHandler(this, this.voiceHandler);
    
    // Commands handler for slash commands management
    this.commandsHandler = new CommandsHandler(this, this.sessionManager);
    
    // Image message handler
    this.imageHandler = new ImageHandler(this.bot, this.sessionManager, this.activityIndicator, this);
    
    // Unified web server with QTunnel WebSocket tunneling (replaces separate file browser and git diff servers)
    // TO DISABLE: Change to { disabled: true }
    this.unifiedWebServer = new UnifiedWebServer(this.options.workingDirectory, this.botInstanceName, null, { 
      disabled: false, 
      qTunnelToken: this.getQTunnelTokenFromConfig()
    });
    this.webServerUrl = null;
    
    // Auto-start unified web server in background (non-blocking)
    this.autoStartUnifiedWebServer();
    
    // Thinking levels configuration (from claudia)
    this.thinkingModes = [
      {
        id: 'auto',
        name: 'Auto',
        description: 'Let Claude decide',
        level: 0,
        icon: '🧠',
        phrase: null
      },
      {
        id: 'think',
        name: 'Think',
        description: 'Basic reasoning',
        level: 1,
        icon: '💭',
        phrase: 'think'
      },
      {
        id: 'think_hard',
        name: 'Think Hard',
        description: 'Deeper analysis',
        level: 2,
        icon: '🤔',
        phrase: 'think hard'
      },
      {
        id: 'think_harder',
        name: 'Think Harder',
        description: 'Extensive reasoning',
        level: 3,
        icon: '🧐',
        phrase: 'think harder'
      },
      {
        id: 'ultrathink',
        name: 'Ultrathink',
        description: 'Maximum computation',
        level: 4,
        icon: '🔥',
        phrase: 'ultrathink'
      }
    ];
    
    this.setupEventHandlers();
    
    // Restore last session from config file
    this.restoreLastSessionOnStartup();
    
    // Load thinking mode from config file
    this.loadThinkingModeFromConfig();
    
    console.log('🤖 Stream Telegram Bot started');
    
    // Setup process cleanup for activity indicators
    this.setupProcessCleanup();
  }

  /**
   * Setup Telegram bot event handlers
   */
  setupEventHandlers() {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      try {
        // Ignore messages from bots (including self)
        if (msg.from.is_bot) {
          return;
        }
        
        const userId = msg.from.id;
        const username = msg.from.username || 'Unknown';
        const chatId = msg.chat.id;
        
        // Always check admin access first (auto-assign first user if needed)
        if (!this.checkAdminAccess(msg.from.id, msg.chat.id)) {
          return; // Access denied message already sent
        }

        if (msg.text && !msg.text.startsWith('/')) {
          console.log(`[TEXT_MESSAGE] User ${userId} (@${username}) sent text: "${msg.text.substring(0, 100)}${msg.text.length > 100 ? '...' : ''}" in chat ${chatId}`);
          
          console.log('[DEBUG] Checking keyboard button handler...');
          // Check if it's a keyboard button press
          if (await this.keyboardHandlers.handleKeyboardButton(msg)) {
            console.log('[DEBUG] Keyboard button handler processed the message');
            return; // Button handled, don't process as regular message
          }

          console.log('[DEBUG] Checking commands handler...');
          // Check if CommandsHandler needs to handle this text input (command arguments)
          if (await this.commandsHandler.handleTextMessage(msg)) {
            console.log('[DEBUG] Commands handler processed the message');
            return; // CommandsHandler handled the text input
          }

          console.log('[DEBUG] Checking git manager...');
          // Check if GitManager needs to handle this text input (e.g., branch creation)
          if (await this.gitManager.handleTextInput(chatId, msg.text)) {
            console.log('[DEBUG] Git manager processed the message');
            return; // GitManager handled the text input
          }
          
          console.log('[DEBUG] Checking project navigator...');
          // Check if ProjectNavigator needs to handle this text input (e.g., project creation)
          if (await this.projectNavigator.handleTextInput(chatId, msg.text)) {
            console.log('[DEBUG] Project navigator processed the message');
            return; // ProjectNavigator handled the text input
          }

          console.log('[COMPONENT] StreamTelegramBot.handleUserMessage - processing regular text message');
          await this.handleUserMessage(msg);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        await this.sessionManager.sendError(msg.chat.id, error);
      }
    });

    // Handle voice messages (if Nexara API is configured)
    this.bot.on('voice', async (msg) => {
      try {
        // Ignore messages from bots (including self)
        if (msg.from.is_bot) {
          return;
        }
        
        await this.voiceHandler.handleVoiceMessage(msg);
      } catch (error) {
        console.error('Error handling voice:', error);
        await this.sessionManager.sendError(msg.chat.id, error);
      }
    });

    // Handle photo messages with captions
    this.bot.on('photo', async (msg) => {
      try {
        // Ignore messages from bots (including self)
        if (msg.from.is_bot) {
          return;
        }
        
        const userId = msg.from.id;
        const username = msg.from.username || 'Unknown';
        const chatId = msg.chat.id;
        
        console.log(`[PHOTO_MESSAGE] User ${userId} (@${username}) sent photo in chat ${chatId}`);
        
        // Always check admin access first
        if (!this.checkAdminAccess(msg.from.id, msg.chat.id)) {
          return; // Access denied message already sent
        }

        await this.imageHandler.handlePhotoMessage(msg, this.processUserMessage.bind(this));
      } catch (error) {
        console.error('Error handling photo:', error);
        await this.sessionManager.sendError(msg.chat.id, error);
      }
    });

    // Commands
    this.bot.onText(/\/start/, async (msg) => {
      // Ignore messages from bots (including self)
      if (msg.from.is_bot) {
        return;
      }
      
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      const chatId = msg.chat.id;
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /start in chat ${chatId}`);
      
      // Check admin access (auto-assign first user if needed)
      if (!this.checkAdminAccess(msg.from.id, msg.chat.id)) {
        return; // Access denied message already sent
      }
      
      const welcomeText = '🤖 *Claude Code Stream Bot*\n\n' +
        'This bot uses Claude CLI with stream-json for seamless interaction.\n\n' +
        '*Features:*\n' +
        '• 📋 Live TodoWrite updates\n' +
        '• 🔄 Session continuity with session IDs\n' +
        '• 🛡️ Auto-skip permissions\n' +
        '• 🎯 Real-time tool execution\n' +
        '• 🧠 Thinking mode control (like Claudia)\n' +
        '• 📸 Image analysis support with captions\n' +
        '• 📁 Web-based file browser with Mini Apps\n\n' +
        '*Main Commands:*\n' +
        '• /menu - comprehensive main menu with all functions\n' +
        '• /files - web-based file browser interface\n' +
        '• /model - Claude model selection (Sonnet/Opus)\n' +
        '• /think - thinking mode selection\n' +
        '• /diff - git status and changes\n' +
        '• /sessions - session history and management\n\n' +
        '*Quick Access:*\n' +
        '• 🛑 STOP - emergency stop\n' +
        '• 📊 Status - session status\n' +
        '• 📂 Projects - project selection\n' +
        '• 🔄 New Session - start fresh\n\n' +
        '💡 Use /menu for a comprehensive interface or just send me a message to start!';
      
      await this.safeSendMessage(msg.chat.id, welcomeText, { 
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup(userId)
      });
    });

    this.bot.onText(/\/cancel/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /cancel in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] SessionManager.cancelUserSession - chatId: ${msg.chat.id}`);
      
      await this.sessionManager.cancelUserSession(msg.chat.id);
      await this.safeSendMessage(msg.chat.id, '🛑 *Session Cancelled*\n\nAll processes stopped.', {
        forceNotification: true,  // Critical user action
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup(userId)
      });
    });

    // Handle callback queries for directory selection
    this.bot.on('callback_query', async (query) => {
      const data = query.data;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      const userId = query.from.id;
      const username = query.from.username || 'Unknown';
      
      console.log(`[BUTTON_CLICK] User ${userId} (@${username}) clicked button: "${data}" in chat ${chatId}`);
      
      try {
        if (data.startsWith('setdir:')) {
          const dirAction = data.replace('setdir:', '');
          console.log(`[COMPONENT] ProjectNavigator.handleSetdirCallback - action: "${dirAction}", chatId: ${chatId}, messageId: ${messageId}`);
          await this.projectNavigator.handleSetdirCallback(dirAction, chatId, messageId);
        } else if (data.startsWith('voice_')) {
          console.log(`[COMPONENT] VoiceMessageHandler.handleVoiceCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.voiceHandler.handleVoiceCallback(data, chatId, messageId, query.from.id, this.processUserMessage.bind(this));
        } else if (data.startsWith('resume_session:')) {
          const sessionId = data.replace('resume_session:', '');
          const userId = this.getUserIdFromChat(chatId);
          console.log(`[COMPONENT] SessionManager.handleSessionResume - sessionId: "${sessionId}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          // Update access time when resuming session
          this.sessionManager.storeSessionId(userId, sessionId);
          // Save to config for persistence
          await this.sessionManager.saveCurrentSessionToConfig(userId, sessionId);
          await this.sessionManager.handleSessionResume(sessionId, chatId, messageId, query.from.id);
        } else if (data.startsWith('model:')) {
          console.log(`[COMPONENT] StreamTelegramBot.handleModelCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.handleModelCallback(data, chatId, messageId, query.from.id);
        } else if (data.startsWith('thinking:')) {
          console.log(`[COMPONENT] StreamTelegramBot.handleThinkingModeCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.handleThinkingModeCallback(data, chatId, messageId, query.from.id);
        } else if (data.startsWith('diff:') || data.startsWith('git:')) {
          console.log(`[COMPONENT] GitManager.handleGitCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.gitManager.handleGitCallback(data, chatId, messageId, query.from.id);
        } else if (data.startsWith('session_page:')) {
          const page = parseInt(data.replace('session_page:', ''));
          console.log(`[COMPONENT] SessionManager.handleSessionPageCallback - page: ${page}, chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.sessionManager.handleSessionPageCallback(page, chatId, messageId, query.from.id);
        } else if (data === 'page_info') {
          console.log(`[COMPONENT] Non-interactive button - page_info, chatId: ${chatId}`);
          // Just answer the callback - page info button is non-interactive
          await this.bot.answerCallbackQuery(query.id, { text: 'Page indicator' });
          return;
        } else if (data.startsWith('settings:')) {
          console.log(`[COMPONENT] SettingsMenuHandler.handleSettingsCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          const handled = await this.settingsHandler.handleSettingsCallback(data, chatId, messageId);
          if (!handled) {
            console.log(`[COMPONENT] Settings callback not handled: "${data}", chatId: ${chatId}`);
          }
        } else if (data.startsWith('cmd:')) {
          console.log(`[COMPONENT] CommandsHandler.handleCommandsCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          const handled = await this.commandsHandler.handleCommandsCallback(data, chatId, messageId, userId);
          if (!handled) {
            console.log(`[COMPONENT] Commands callback not handled: "${data}", chatId: ${chatId}`);
          }
        } else if (data.startsWith('files:')) {
          console.log(`[COMPONENT] UnifiedWebServer.handleFileBrowserCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.handleFileBrowserCallback(query);
        } else if (data.startsWith('main_menu:')) {
          console.log(`[COMPONENT] StreamTelegramBot.handleMainMenuCallback - data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.handleMainMenuCallback(data, chatId, messageId, userId);
        } else if (data.startsWith('continue_after_compact:')) {
          const [, sessionId, chatId, userId] = data.split(':');
          console.log(`[COMPONENT] SessionManager.handleContinueAfterCompact - sessionId: "${sessionId}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.sessionManager.handleContinueAfterCompact(sessionId, chatId, messageId, parseInt(userId));
        } else if (data.startsWith('start_new_session:')) {
          const [, userId, chatId] = data.split(':');
          console.log(`[COMPONENT] SessionManager.handleStartNewSession - userId: ${userId}, chatId: ${chatId}, messageId: ${messageId}`);
          await this.sessionManager.handleStartNewSession(parseInt(userId), parseInt(chatId), messageId);
        } else if (data === 'new_session') {
          console.log(`[COMPONENT] SessionManager.startNewSession - simple new session, chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
          await this.sessionManager.startNewSession(chatId);
          await this.bot.deleteMessage(chatId, messageId);
        } else {
          console.log(`[COMPONENT] Unknown button data: "${data}", chatId: ${chatId}, messageId: ${messageId}, userId: ${userId}`);
        }
        
        await this.bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error('Callback query error:', error);
        
        // Handle specific Telegram errors
        if (error.code === 'ETELEGRAM') {
          const errorBody = error.response?.body;
          const errorMessage = typeof errorBody === 'string' ? errorBody : errorBody?.description || '';
          
          if (errorMessage.includes('BUTTON_DATA_INVALID')) {
            await this.safeSendMessage(chatId, 
              '❌ *Button data error*\n\nProject list expired. Use /cd to refresh.'
            );
          } else {
            await this.safeSendMessage(chatId, 
              `❌ *Telegram API Error*\n\n${error.message}`
            );
          }
        } else {
          await this.safeSendMessage(chatId, 
            `❌ *Error*\n\n${error.message}`
          );
        }
        
        try {
          await this.bot.answerCallbackQuery(query.id, { text: 'Error occurred' });
        } catch (answerError) {
          console.error('Failed to answer callback query:', answerError);
        }
      }
    });

    this.bot.onText(/\/status/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /status in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] SessionManager.showSessionStatus - chatId: ${msg.chat.id}`);
      await this.sessionManager.showSessionStatus(msg.chat.id);
    });

    this.bot.onText(/\/new/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /new in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] SessionManager.startNewSession - chatId: ${msg.chat.id}`);
      await this.sessionManager.startNewSession(msg.chat.id);
    });

    this.bot.onText(/\/end/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /end in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] SessionManager.endSession - chatId: ${msg.chat.id}`);
      await this.sessionManager.endSession(msg.chat.id);
    });

    this.bot.onText(/\/sessions/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /sessions in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] SessionManager.showSessionHistory - chatId: ${msg.chat.id}`);
      await this.sessionManager.showSessionHistory(msg.chat.id);
    });

    this.bot.onText(/\/cd/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /cd in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] ProjectNavigator.showProjectSelection - chatId: ${msg.chat.id}`);
      await this.projectNavigator.showProjectSelection(msg.chat.id);
    });

    this.bot.onText(/\/pwd/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /pwd in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] StreamTelegramBot.showCurrentDirectory - chatId: ${msg.chat.id}`);
      await this.showCurrentDirectory(msg.chat.id);
    });

    this.bot.onText(/\/settings/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /settings in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] SettingsMenuHandler.showSettingsMenu - chatId: ${msg.chat.id}`);
      await this.settingsHandler.showSettingsMenu(msg.chat.id);
    });

    // Model selection commands
    this.bot.onText(/\/sonnet/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /sonnet in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] StreamTelegramBot.setModel - model: "sonnet", chatId: ${msg.chat.id}`);
      await this.setModel(msg.chat.id, 'sonnet', 'Claude 4 Sonnet');
    });

    this.bot.onText(/\/opus/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /opus in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] StreamTelegramBot.setModel - model: "opus", chatId: ${msg.chat.id}`);
      await this.setModel(msg.chat.id, 'opus', 'Claude 4 Opus');
    });

    this.bot.onText(/\/model/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /model in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] StreamTelegramBot.showModelSelection - chatId: ${msg.chat.id}`);
      await this.showModelSelection(msg.chat.id);
    });

    this.bot.onText(/\/think/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /think in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] StreamTelegramBot.showThinkingModeSelection - chatId: ${msg.chat.id}`);
      await this.showThinkingModeSelection(msg.chat.id);
    });

    // Git diff command
    this.bot.onText(/\/diff/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /diff in chat ${msg.chat.id}`);
      console.log(`[COMPONENT] GitManager.showGitOverview - chatId: ${msg.chat.id}`);
      await this.gitManager.showGitOverview(msg.chat.id);
    });

    // Bot restart command (admin only)
    this.bot.onText(/\/restart/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /restart in chat ${msg.chat.id}`);
      
      // Check if user is admin
      if (!this.authorizedUsers.has(userId)) {
        await this.safeSendMessage(msg.chat.id, '❌ Access denied. Only administrators can restart the bot.');
        return;
      }
      
      await this.restartBot(msg.chat.id, userId);
    });

    // File browser command
    this.bot.onText(/\/files/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /files in chat ${msg.chat.id}`);
      
      if (!this.checkAdminAccess(userId, msg.chat.id)) {
        return;
      }
      
      await this.handleFilesCommand(msg.chat.id);
    });

    // Main menu command
    this.bot.onText(/\/menu/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /menu in chat ${msg.chat.id}`);
      
      if (!this.checkAdminAccess(userId, msg.chat.id)) {
        return;
      }
      
      await this.showMainMenu(msg.chat.id);
    });
  }


  /**
   * Truncate text to fit within Telegram message limits
   * @param {string} text - The text to truncate
   * @param {number} maxLength - Maximum length (default: 4000 chars)
   * @returns {string} - Truncated text
   */
  truncateForTelegram(text, maxLength = 4000) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Handle incoming user text message
   */
  async handleUserMessage(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text;

    console.log(`[User ${userId}] Message: ${text}`);

    // Check if concat mode is enabled
    if (this.getConcatModeStatus(userId)) {
      // Add to buffer instead of processing immediately
      const bufferSize = await this.addToMessageBuffer(userId, {
        type: 'text',
        content: text,
        imagePath: null
      });
      
      // Send buffer status update
      await this.safeSendMessage(chatId, `📝 **Added to Buffer**\n\nBuffer: ${bufferSize} message${bufferSize > 1 ? 's' : ''}`, {
        reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
      });
      return;
    }

    // Build the final message text with reply context if present
    let finalText = text;
    
    // Check if this is a reply to another message
    if (msg.reply_to_message) {
      const repliedText = msg.reply_to_message.text || '[non-text message]';
      
      // Check if this is a quote reply (partial text selected)
      if (msg.quote && msg.quote.text) {
        finalText = `User replied to the following quoted text:\n[QUOTED_TEXT]\n${msg.quote.text}\n[/QUOTED_TEXT]\n\nUser's reply: ${text}`;
      } else {
        // Regular reply to full message
        finalText = `User replied to the following message:\n[REPLIED_MESSAGE]\n${repliedText}\n[/REPLIED_MESSAGE]\n\nUser's reply: ${text}`;
      }
    }

    // Normal processing if concat mode is off
    await this.processUserMessage(finalText, userId, chatId);
  }


  /**
   * Send session initialization message
   */
  async sendSessionInit(chatId, _session) {
    const text = '🚀 **New Session Started**\n\n' +
      'Ready to process your requests with Claude CLI stream-json mode.\n\n' +
      '🔄 Session continuity with ID tracking\n' +
      '🛡️ Auto-permissions enabled\n' +
      '📋 Live TodoWrite updates active\n\n' +
      '💡 Use /end to close this session\n' +
      '📚 Use /sessions to view history';
    
    await this.safeSendMessage(chatId, text);
  }


  /**
   * Show current working directory
   */
  async showCurrentDirectory(chatId, userId = null) {
    const currentDir = this.options.workingDirectory;
    const dirName = path.basename(currentDir);
    const parentDir = path.dirname(currentDir);
    
    // Get userId from chatId if not provided
    if (!userId) {
      userId = this.getUserIdFromChat(chatId);
    }
    
    await this.safeSendMessage(chatId,
      '📁 *Current Working Directory*\n\n' +
      `🏷️ **Name:** ${dirName}\n` +
      `📂 **Parent:** ${parentDir}\n` +
      `🔗 **Full Path:** \`${currentDir}\`\n\n` +
      '💡 Use /cd to change directory',
      { 
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup(userId)
      }
    );
  }

  /**
   * Set Claude model for current user
   */
  async setModel(chatId, model, modelName) {
    const userId = this.getUserIdFromChat(chatId);
    
    // Update model in options for new sessions
    this.options.model = model;
    
    // Store user's model preference
    this.storeUserModel(userId, model);
    
    // If there's an active session, it will use the new model on next message
    const session = this.sessionManager.getUserSession(userId);
    const sessionInfo = session ? '\n\n⚠️ *Current session:* will use new model on next message' : '';
    
    await this.safeSendMessage(chatId,
      '🤖 *Model Changed*\n\n' +
      `📝 **Selected:** ${modelName} (\`${model}\`)\n` +
      `🔄 **Status:** active for new sessions${sessionInfo}`,
      { 
        forceNotification: true,  // Important user setting change
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup(userId)
      }
    );
  }

  /**
   * Show model selection with inline keyboard
   */
  storeUserThinkingMode(userId, thinkingMode) {
    if (!this.userPreferences) {
      this.userPreferences = new Map();
    }
    this.userPreferences.set(`${userId}_thinking`, thinkingMode);
    
    // Persist to config file using ConfigManager (efficient in-memory operation)
    if (!this.configManager) {
      console.warn('[Bot] No config manager available, cannot store user thinking mode');
      return;
    }
    
    try {
      // Store thinking mode in config (ConfigManager handles disk persistence)
      this.configManager.setThinkingMode(thinkingMode);
      
      console.log(`[Bot] Stored thinking mode ${thinkingMode} for bot config`);
    } catch (error) {
      console.error('[Bot] Error storing thinking mode:', error.message);
    }
  }

  /**
   * Get user's thinking mode preference
   */  async showModelSelection(chatId) {
    const userId = this.getUserIdFromChat(chatId);
    const currentModel = this.getUserModel(userId) || this.options.model || 'sonnet';

    const keyboard = {
      inline_keyboard: [
        [
          { text: `${currentModel === 'sonnet' ? '✅' : '🤖'} Claude 4 Sonnet`, callback_data: 'model:sonnet' },
          { text: `${currentModel === 'opus' ? '✅' : '🧠'} Claude 4 Opus`, callback_data: 'model:opus' }
        ],
        [
          { text: '🔄 Refresh', callback_data: 'model:refresh' }
        ]
      ]
    };

    await this.safeSendMessage(chatId,
      '🤖 *Claude 4 Model Selection*\n\n' +
      `📊 **Current model:** ${this.getModelDisplayName(currentModel)}\n\n` +
      '**Available Claude 4 models:**\n' +
      '🤖 **Sonnet** - balance of speed and quality (recommended for most tasks)\n' +
      '🧠 **Opus** - maximum performance for most complex tasks\n\n' +
      '💡 Select model for new sessions:',
      {
        reply_markup: keyboard
      }
    );
  }

  /**
   * Show thinking mode selection with inline keyboard (like claudia)
   */
  async showThinkingModeSelection(chatId) {
    const userId = this.getUserIdFromChat(chatId);
    const currentThinking = this.getUserThinkingMode(userId);
    const currentMode = this.getThinkingModeById(currentThinking);

    // Create keyboard with thinking modes (2 buttons per row)
    const keyboard = {
      inline_keyboard: []
    };

    // Add thinking mode buttons in pairs
    for (let i = 0; i < this.thinkingModes.length; i += 2) {
      const row = [];

      // First mode in pair
      const mode1 = this.thinkingModes[i];
      const isSelected1 = currentThinking === mode1.id;
      row.push({
        text: `${isSelected1 ? '✅' : mode1.icon} ${mode1.name} ${this.getThinkingLevelIndicator(mode1.level)}`,
        callback_data: `thinking:${mode1.id}`
      });

      // Second mode in pair (if exists)
      if (i + 1 < this.thinkingModes.length) {
        const mode2 = this.thinkingModes[i + 1];
        const isSelected2 = currentThinking === mode2.id;
        row.push({
          text: `${isSelected2 ? '✅' : mode2.icon} ${mode2.name} ${this.getThinkingLevelIndicator(mode2.level)}`,
          callback_data: `thinking:${mode2.id}`
        });
      }

      keyboard.inline_keyboard.push(row);
    }

    // Add refresh button
    keyboard.inline_keyboard.push([
      { text: '🔄 Refresh', callback_data: 'thinking:refresh' }
    ]);

    await this.safeSendMessage(chatId,
      '🧠 *Thinking Mode Selection*\n\n' +
      `📊 **Current mode:** ${currentMode.icon} ${currentMode.name} ${this.getThinkingLevelIndicator(currentMode.level)}\n` +
      `📝 **Description:** ${currentMode.description}\n\n` +
      '**Available thinking modes:**\n' +
      `${this.thinkingModes.map(mode =>
        `${mode.icon} **${mode.name}** ${this.getThinkingLevelIndicator(mode.level)} - ${mode.description}`
      ).join('\n')}\n\n` +
      '💡 Select thinking mode for Claude:',
      {
        reply_markup: keyboard
      }
    );
  }

  /**
   * Get display name for model
   */
  getModelDisplayName(model) {
    const models = {
      'sonnet': 'Claude 4 Sonnet',
      'opus': 'Claude 4 Opus'
    };
    return models[model] || model;
  }

  /**
   * Get visual indicator for thinking level (like claudia)
   */
  getThinkingLevelIndicator(level) {
    const bars = ['▱', '▱', '▱', '▱']; // empty bars
    for (let i = 0; i < level && i < 4; i++) {
      bars[i] = '▰'; // filled bars
    }
    return bars.join('');
  }

  /**
   * Store user's thinking mode preference
   */

  getUserThinkingMode(userId) {
    // First check memory cache
    if (this.userPreferences) {
      const cachedMode = this.userPreferences.get(`${userId}_thinking`);
      if (cachedMode) {
        return cachedMode;
      }
    }
    
    // Then check config file using ConfigManager (efficient in-memory read)
    if (this.configManager) {
      try {
        const thinkingMode = this.configManager.getThinkingMode();
        
        if (thinkingMode) {
          // Cache in memory for faster access
          if (!this.userPreferences) {
            this.userPreferences = new Map();
          }
          this.userPreferences.set(`${userId}_thinking`, thinkingMode);
          return thinkingMode;
        }
      } catch (error) {
        console.error('[Bot] Error loading thinking mode from config:', error.message);
      }
    }
    
    return 'auto';
  }

  /**
   * Get thinking mode config by ID
   */
  getThinkingModeById(id) {
    return this.thinkingModes.find(mode => mode.id === id) || this.thinkingModes[0];
  }

  /**
   * Store user's model preference for current project
   */
  storeUserModel(userId, model) {
    if (!this.configManager) {
      console.warn('[Bot] No config manager available, cannot store user model');
      return;
    }
    
    try {
      // Get current project sessions using ConfigManager (efficient in-memory read)
      const projectSessions = this.configManager.getProjectSessions();
      const currentProject = this.options.workingDirectory;
      
      // Update or create project session with new model preference
      const updatedSessions = { ...projectSessions };
      if (!updatedSessions[currentProject]) {
        updatedSessions[currentProject] = {
          userId: userId.toString(),
          model: model,
          timestamp: new Date().toISOString()
        };
      } else {
        updatedSessions[currentProject] = {
          ...updatedSessions[currentProject],
          model: model,
          timestamp: new Date().toISOString()
        };
      }
      
      // Update project sessions using ConfigManager (handles disk persistence)
      this.configManager.updateProjectSessions(updatedSessions);
      
      console.log(`[Bot] Stored user model ${model} for project ${currentProject}`);
    } catch (error) {
      console.error('[Bot] Error storing user model:', error.message);
    }
  }

  /**
   * Get user's model preference for current project
   */
  getUserModel(userId) {
    if (!this.configManager) {
      return null;
    }
    
    try {
      // Get project sessions using ConfigManager (efficient in-memory read)
      const projectSessions = this.configManager.getProjectSessions();
      const currentProject = this.options.workingDirectory;
      
      // Get model preference from project-specific session
      if (projectSessions && projectSessions[currentProject]) {
        const projectSession = projectSessions[currentProject];
        if (projectSession.userId === userId.toString() && projectSession.model) {
          return projectSession.model;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[Bot] Error getting user model:', error.message);
      return null;
    }
  }

  /**
   * Helper to get user ID from chat (for group compatibility)
   */
  getUserIdFromChat(chatId) {
    // For private chats, chatId equals userId
    // For groups, you might want different logic
    return chatId;
  }

  /**
   * Determine if message should send with notification (not silent)
   */
  shouldSendWithNotification(text, options) {
    // Always notify for session completion messages
    if (text.includes('Session') && text.includes('ended')) {
      return true;
    }
    
    // Always notify for critical errors and exceptions
    if (text.includes('❌') && (
      text.includes('Error') || 
        text.includes('Exception') || 
        text.includes('Failed') ||
        text.includes('Crash') ||
        text.includes('Critical')
    )) {
      return true;
    }
    
    // Always notify for welcome/admin messages
    if (text.includes('Welcome! You are now the bot administrator') ||
        text.includes('Bot setup complete')) {
      return true;
    }
    
    // Always notify for urgent user interactions
    if (text.includes('🚨') || text.includes('⚠️ URGENT') || text.includes('CRITICAL')) {
      return true;
    }
    
    // Notify for model changes (important user settings)
    if (text.includes('Model changed to') || text.includes('Model set to')) {
      return true;
    }
    
    // If options explicitly request notification
    if (options.forceNotification === true) {
      return true;
    }
    
    // All other messages should be silent by default
    return false;
  }

  /**
   * Extract meaningful error information from Telegram API errors
   */
  extractTelegramError(error) {
    // Handle Telegram API errors specifically
    if (error.code === 'ETELEGRAM' && error.response && error.response.body) {
      const description = error.response.body.description || error.message;
      const errorCode = error.response.body.error_code || 'Unknown';
      
      // Extract the actual error from description
      let cleanError = description;
      
      // Parse HTML parsing errors
      if (description.includes('can\'t parse entities')) {
        const match = description.match(/Unsupported start tag "([^"]*)" at byte offset (\d+)/);
        if (match) {
          cleanError = `Invalid HTML tag "${match[1]}" at position ${match[2]}`;
        } else {
          cleanError = 'HTML formatting error - invalid markup detected';
        }
      } else if (description.includes('Bad Request')) {
        cleanError = description.replace('Bad Request: ', '');
      }
      
      return {
        type: 'TelegramAPI',
        code: errorCode,
        message: cleanError,
        originalMessage: description
      };
    }
    
    // Handle other errors
    return {
      type: 'Unknown',
      code: error.code || 'ERR_UNKNOWN',
      message: error.message || 'Unknown error occurred',
      originalMessage: error.message || 'Unknown error'
    };
  }


  /**
   * Safely send message with proper Telegram markdown sanitization
   */
  async safeSendMessage(chatId, text, options = {}) {
    let htmlText = text;
    try {
      
      // Always convert markdown to HTML using unified converter
      const MarkdownHtmlConverter = require('./utils/markdown-html-converter');
      const converter = new MarkdownHtmlConverter();
      htmlText = converter.convert(text);
      
      const messageOptions = {
        ...options,
        parse_mode: 'HTML'  // ALWAYS HTML - no exceptions
      };
      
      // Keep existing notification logic (don't break existing behavior)
      const shouldNotify = this.shouldSendWithNotification(text, options);
      if (!shouldNotify && !Object.prototype.hasOwnProperty.call(messageOptions, 'disable_notification')) {
        messageOptions.disable_notification = true;
      }
      
      // Use existing MessageSplitter (already HTML-aware!)
      if (htmlText.length <= 4096) {
        return await this.bot.sendMessage(chatId, htmlText, messageOptions);
      } else {
        return await this.messageSplitter.sendLongMessage(this.bot, chatId, htmlText, messageOptions);
      }
      
    } catch (error) {
      const parsedError = this.extractTelegramError(error);
      console.error(`[SafeSendMessage] ${parsedError.type} Error:`, parsedError.message);
      
      // Enhanced error logging with full message content for HTML parsing errors
      if (parsedError.message && (parsedError.message.includes('Invalid HTML tag') || parsedError.message.includes('position'))) {
        console.error(`[SafeSendMessage] Original text that caused the error (length: ${text.length}):`);
        console.error('[SafeSendMessage] ===== ORIGINAL TEXT START =====');
        console.error(text);
        console.error('[SafeSendMessage] ===== ORIGINAL TEXT END =====');
        
        if (htmlText !== text) {
          console.error(`[SafeSendMessage] Converted HTML (length: ${htmlText.length}):`);
          console.error('[SafeSendMessage] ===== HTML TEXT START =====');
          console.error(htmlText);
          console.error('[SafeSendMessage] ===== HTML TEXT END =====');
        }
      }
      
      // Throw a clean error for calling code to handle
      const cleanError = new Error(`Message send failed: ${parsedError.message}`);
      cleanError.telegramError = parsedError;
      
      // Send user-friendly error message to chat
      try {
        const userMessage = '❌ **Message Error**\n\n' +
          `💬 **Issue:** ${parsedError.message}\n` +
          `🔧 **Code:** ${parsedError.code}\n\n` +
          '💡 This usually means there\'s invalid formatting in the message.';
        
        // Try to convert markdown to HTML to avoid formatting errors
        let finalMessage;
        try {
          const MarkdownHtmlConverter = require('./utils/markdown-html-converter');
          const converter = new MarkdownHtmlConverter();
          finalMessage = converter.convert(userMessage);
        } catch (conversionError) {
          // If conversion fails, fall back to plain text
          console.error('[SafeSendMessage] Error message conversion failed:', conversionError.message);
          finalMessage = 'Message Error: ' + parsedError.message + ' (Code: ' + parsedError.code + ')';
        }
          
        return await this.bot.sendMessage(chatId, finalMessage, {
          parse_mode: finalMessage.includes('<') ? 'HTML' : undefined,
          disable_notification: true
        });
      } catch (fallbackError) {
        // If even the error message fails, send minimal text
        console.error('[SafeSendMessage] Fallback error message also failed:', fallbackError);
        return await this.bot.sendMessage(chatId, 'Unable to send message due to formatting error.', {
          disable_notification: true
        });
      }
    }
  }

  /**
   * Safely edit message with proper Markdown to HTML conversion
   */
  async safeEditMessage(chatId, messageId, text, options = {}) {
    try {
      let htmlText = text;
      
      // Always convert markdown to HTML using unified converter
      const MarkdownHtmlConverter = require('./utils/markdown-html-converter');
      const converter = new MarkdownHtmlConverter();
      htmlText = converter.convert(text);
      
      const messageOptions = {
        ...options,
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML'  // ALWAYS HTML - no exceptions
      };
      
      await this.bot.editMessageText(htmlText, messageOptions);
      
    } catch (error) {
      const parsedError = this.extractTelegramError(error);
      console.error(`[SafeEditMessage] ${parsedError.type} Error:`, parsedError.message);
      
      // Throw a clean error for calling code to handle
      const cleanError = new Error(`Message edit failed: ${parsedError.message}`);
      cleanError.telegramError = parsedError;
      
      // Try to edit with user-friendly error message
      try {
        const userMessage = '❌ **Edit Error**\n\n' +
          `💬 **Issue:** ${parsedError.message}\n` +
          `🔧 **Code:** ${parsedError.code}\n\n` +
          '💡 This usually means there\'s invalid formatting in the message.';
        
        // Try to convert markdown to HTML to avoid formatting errors
        let finalMessage;
        try {
          const MarkdownHtmlConverter = require('./utils/markdown-html-converter');
          const converter = new MarkdownHtmlConverter();
          finalMessage = converter.convert(userMessage);
        } catch (conversionError) {
          // If conversion fails, fall back to plain text
          console.error('[SafeEditMessage] Error message conversion failed:', conversionError.message);
          finalMessage = 'Edit Error: ' + parsedError.message + ' (Code: ' + parsedError.code + ')';
        }
          
        await this.bot.editMessageText(finalMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: finalMessage.includes('<') ? 'HTML' : undefined
        });
      } catch (fallbackError) {
        // If even the error message fails, try minimal text
        console.error('[SafeEditMessage] Fallback error edit also failed:', fallbackError);
        try {
          await this.bot.editMessageText('Unable to edit message due to formatting error.', {
            chat_id: chatId,
            message_id: messageId
          });
        } catch (finalError) {
          console.error('[SafeEditMessage] Final fallback also failed:', finalError);
          // If editing fails completely, we can't do much more
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('🧹 Cleaning up bot resources...');
    
    // Cleanup session manager
    this.sessionManager.cleanup();
    
    // Cancel all active processors
    for (const processor of this.activeProcessors) {
      processor.cancel();
    }
    
    this.activeProcessors.clear();
    
    // Note: We keep sessionStorage for session persistence
    console.log(`💾 Preserved session data for ${this.sessionManager.sessionStorage.size} users`);
    
    // Clear voice handler, image handler, and project cache
    this.voiceHandler.cleanup();
    this.imageHandler.cleanup();
    this.projectNavigator.cleanup();
    
    // Stop polling
    this.bot.stopPolling();
  }

  /**
   * Get stored session ID for user - delegates to SessionManager
   */
  getStoredSessionId(userId) {
    return this.sessionManager.getStoredSessionId(userId);
  }

  /**
   * Handle model selection callback
   */
  async handleModelCallback(data, chatId, messageId, _userId) {
    const action = data.replace('model:', '');
    
    if (action === 'refresh') {
      // Refresh the model selection
      await this.bot.deleteMessage(chatId, messageId);
      await this.showModelSelection(chatId);
      return;
    }
    
    if (['sonnet', 'opus'].includes(action)) {
      const modelNames = {
        'sonnet': 'Claude 4 Sonnet',
        'opus': 'Claude 4 Opus'
      };
      
      // Update model
      await this.setModel(chatId, action, modelNames[action]);
      
      // Update the message to show selection was made
      await this.safeEditMessage(chatId, messageId,
        '✅ *Model Changed*\n\n' +
        `📝 **Selected:** ${modelNames[action]} (\`${action}\`)\n` +
        '🔄 **Status:** active for new sessions\n\n' +
        '💡 Use /model to change model'
      );
    }
  }

  /**
   * Handle thinking mode selection callback
   */
  async handleThinkingModeCallback(data, chatId, messageId, userId) {
    const action = data.replace('thinking:', '');
    
    if (action === 'refresh') {
      // Refresh the thinking mode selection
      await this.bot.deleteMessage(chatId, messageId);
      await this.showThinkingModeSelection(chatId);
      return;
    }
    
    // Check if it's a valid thinking mode
    const selectedMode = this.getThinkingModeById(action);
    if (selectedMode) {
      // Store user's thinking mode preference
      this.storeUserThinkingMode(userId, action);
      
      // Update the message to show selection was made
      await this.safeEditMessage(chatId, messageId,
        '✅ *Thinking Mode Changed*\n\n' +
        `${selectedMode.icon} **Selected:** ${selectedMode.name} ${this.getThinkingLevelIndicator(selectedMode.level)}\n` +
        `📝 **Description:** ${selectedMode.description}\n` +
        '🔄 **Status:** active for new messages\n\n' +
        '💡 Use /think to change thinking mode'
      );
    }
  }

  /**
   * Save admin user ID to config file permanently
   */
  async saveAdminToConfig(userId) {
    if (!this.configManager) {
      console.warn('[Admin] No config manager available, cannot save admin ID');
      return;
    }
    
    try {
      // Update admin user ID using ConfigManager (handles disk persistence)
      this.configManager.update({
        adminUserId: userId.toString(),
        lastAdminUpdate: new Date().toISOString()
      });
      
      console.log(`[Admin] Saved admin user ID ${userId} to config file`);
    } catch (error) {
      console.error('[Admin] Error saving admin to config:', error.message);
    }
  }

  /**
   * Save current session state to config file
   */
  async saveCurrentSessionToConfig(userId, sessionId) {
    if (!this.configManager) {
      console.warn('[Session] No config manager available, cannot save session');
      return;
    }
    
    try {
      // Save current session info using ConfigManager (handles disk persistence)
      const lastSession = {
        userId: userId.toString(),
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        workingDirectory: this.options.workingDirectory,
        model: this.options.model
      };
      
      this.configManager.set('lastSession', lastSession);
      
      console.log(`[Session] Saved current session ${sessionId.slice(-8)} to config`);
    } catch (error) {
      console.error('[Session] Error saving session to config:', error.message);
    }
  }

  /**
   * Restore last session from config file
   */
  async restoreLastSessionFromConfig() {
    if (!this.configManager) {
      return null;
    }
    
    try {
      // Get current project using ConfigManager (efficient in-memory read)
      const currentProject = this.configManager.getCurrentProject();
      
      // Set working directory from currentProject
      if (currentProject) {
        this.options.workingDirectory = currentProject;
        console.log(`[Startup] Restored current project: ${currentProject}`);
        
        // Update UnifiedWebServer project root to match current project
        if (this.unifiedWebServer) {
          this.unifiedWebServer.updateProjectRoot(currentProject);
        }
      }
      
      // Get project-specific session using ConfigManager (efficient in-memory read)
      const projectSessions = this.configManager.getProjectSessions();
      if (projectSessions && currentProject) {
        const projectSession = projectSessions[currentProject];
        
        if (projectSession && projectSession.sessionId) {
          console.log(`[Session] Found session ${projectSession.sessionId.slice(-8)} for project ${currentProject}`);
          
          // Update bot options from project session
          if (projectSession.model) {
            this.options.model = projectSession.model;
          }
          
          return {
            userId: parseInt(projectSession.userId),
            sessionId: projectSession.sessionId,
            timestamp: projectSession.timestamp,
            workingDirectory: currentProject,
            model: projectSession.model
          };
        } else {
          console.log(`[Session] No session found for current project: ${currentProject}`);
        }
      }
      
      return null;
    } catch (error) {
      console.error('[Session] Error restoring session from config:', error.message);
      return null;
    }
  }

  /**
   * Restore last session on bot startup
   */
  async restoreLastSessionOnStartup() {
    try {
      const lastSession = await this.restoreLastSessionFromConfig();
      
      if (lastSession) {
        const { userId, sessionId } = lastSession;
        
        // Initialize session storage for this user
        if (!this.sessionManager.sessionStorage.has(userId)) {
          this.sessionManager.sessionStorage.set(userId, {
            currentSessionId: null,
            sessionHistory: [],
            sessionAccessTimes: new Map()
          });
        }
        
        // Restore session ID in memory
        const storage = this.sessionManager.sessionStorage.get(userId);
        storage.currentSessionId = sessionId;
        
        if (!storage.sessionAccessTimes) {
          storage.sessionAccessTimes = new Map();
        }
        storage.sessionAccessTimes.set(sessionId, Date.now());
        
        console.log(`🔄 [Startup] Restored last session ${sessionId.slice(-8)} for user ${userId}`);
        console.log(`📁 [Startup] Working directory: ${this.options.workingDirectory}`);
        console.log(`🤖 [Startup] Model: ${this.options.model}`);
      } else {
        console.log('💡 [Startup] No previous session found in config');
      }
    } catch (error) {
      console.error('⚠️ [Startup] Failed to restore last session:', error.message);
    }
  }

  /**
   * Load thinking mode from config file on startup
   */
  loadThinkingModeFromConfig() {
    if (!this.configManager) {
      console.log('💡 [Startup] No config manager available, using default thinking mode');
      return;
    }
    
    try {
      // Get thinking mode using ConfigManager (efficient in-memory read)
      const thinkingMode = this.configManager.getThinkingMode();
      
      if (thinkingMode) {
        // Initialize user preferences map if needed
        if (!this.userPreferences) {
          this.userPreferences = new Map();
        }
        
        // Store thinking mode globally - will be applied when admin user is known
        this.configThinkingMode = thinkingMode;
        
        // If admin user is already known, apply immediately
        if (this.adminUserId) {
          this.userPreferences.set(`${this.adminUserId}_thinking`, thinkingMode);
          console.log(`🧠 [Startup] Loaded thinking mode: ${thinkingMode} for user ${this.adminUserId}`);
        } else {
          console.log(`🧠 [Startup] Thinking mode in config: ${thinkingMode}, will apply when admin user is set`);
        }
      } else {
        console.log('💡 [Startup] No thinking mode found in config, using default (auto)');
      }
    } catch (error) {
      console.error('⚠️ [Startup] Failed to load thinking mode from config:', error.message);
    }
  }

  /**
   * Check admin access and handle authorization
   */
  checkAdminAccess(userId, chatId) {
    // If no admin is configured yet, first user becomes admin
    if (this.authorizedUsers.size === 0) {
      console.log(`[Admin] First user ${userId} becomes admin`);
      this.adminUserId = userId;
      this.authorizedUsers.add(userId);
      
      // Save admin ID to config file
      this.saveAdminToConfig(userId);
      
      // Apply thinking mode from config if available
      if (this.configThinkingMode) {
        if (!this.userPreferences) {
          this.userPreferences = new Map();
        }
        this.userPreferences.set(`${userId}_thinking`, this.configThinkingMode);
        console.log(`🧠 [Admin Setup] Applied thinking mode from config: ${this.configThinkingMode} for user ${userId}`);
      }
      
      // Send welcome message asynchronously to avoid blocking
      setImmediate(() => {
        this.safeSendMessage(chatId, 
          '🎉 *Welcome!* You are now the bot administrator.\n\n' +
          '🔐 Only you can use this bot.\n' +
          '💾 Your admin status has been saved permanently.\n' +
          '🚀 Send any message to start using Claude Code!',
          { 
            forceNotification: true,  // Important admin setup message
            reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup(userId)
          }
        ).catch(error => {
          console.error('Error sending admin welcome message:', error);
        });
      });
      
      console.log(`[Admin] User ${userId} granted admin access (first user)`);
      return true;
    }
    
    // Check if user is authorized
    if (this.authorizedUsers.has(userId)) {
      return true;
    }
    
    // Unauthorized user - silently block (no response)
    console.log(`[Security] Silently blocked unauthorized user ${userId}`);
    
    return false;
  }

  /**
   * Restart the bot (admin only)
   */
  async restartBot(chatId, userId) {
    try {
      console.log(`[Admin] User ${userId} initiated bot restart`);
      
      // Send restart confirmation message
      const webServerStatus = this.webServerUrl ? '\n🌐 Dev tools server will also restart' : '';
      await this.safeSendMessage(chatId, 
        '🔄 **Bot Restart Initiated**\n\n' +
        `⏳ Restarting ${this.botInstanceName} process...${webServerStatus}\n` +
        '🚀 Bot will be back online shortly!'
      );
      
      // Use PM2 to restart the bot
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Execute PM2 restart command
      const result = await execAsync(`pm2 restart ${this.botInstanceName}`);
      console.log(`[Admin] PM2 restart output: ${result.stdout}`);
      
      // The process will be killed by PM2, so this message might not send
      await this.safeSendMessage(chatId, 
        '✅ **Restart Command Sent**\n\n' +
        '🔄 PM2 is restarting the bot process...'
      );
      
    } catch (error) {
      console.error('[Admin] Error restarting bot:', error);
      await this.safeSendMessage(chatId, 
        '❌ **Restart Failed**\n\n' +
        `Error: \`${error.message}\`\n\n` +
        `💡 Try using \`pm2 restart ${this.botInstanceName}\` manually.`
      );
    }
  }

  /**
   * Pin human input message with hashtag for easy searching
   */
  async pinHumanInputMessage(originalText, userId, chatId) {
    try {
      const textToProcess = originalText === null ? 'null' : (originalText || '');
      
      // Attach original user input (truncated to fit Telegram limits)
      const truncatedInput = this.truncateForTelegram(textToProcess);
      const message = `#human_input\n\n💬 **User Input:**\n${truncatedInput}`;
      
      const sentMessage = await this.safeSendMessage(chatId, message, {
        disable_notification: true
      });

      if (sentMessage && sentMessage.message_id) {
        await this.bot.pinChatMessage(chatId, sentMessage.message_id, {
          disable_notification: true
        });
        console.log(`[Chat ${chatId}] Pinned human input message for user ${userId}`);
      }
    } catch (error) {
      console.error(`[Chat ${chatId}] Failed to pin human input message:`, error.message);
    }
  }

  /**
   * Process user message (unified handler for text and voice)
   */
  async processUserMessage(text, userId, chatId) {
    console.log(`[ProcessUserMessage] Starting to process message for user ${userId}: "${text}"`);
    
    // Pin human input message with hashtag for easy searching
    await this.pinHumanInputMessage(text, userId, chatId);
    
    // Admin access already checked in message handler
    
    // Apply thinking mode to message (like in claudia)
    let finalText = text.trim();
    const userThinkingMode = this.getUserThinkingMode(userId);
    const thinkingMode = this.getThinkingModeById(userThinkingMode);
    
    // Append thinking phrase if not auto mode (same as claudia logic)
    // Skip thinking mode for slash commands to avoid breaking them
    if (thinkingMode && thinkingMode.phrase) {
      if (finalText.startsWith('/')) {
        console.log(`[User ${userId}] Skipped thinking mode for slash command: ${finalText}`);
      } else {
        finalText = `${finalText}.\n\n${thinkingMode.phrase}.`;
        console.log(`[User ${userId}] Applied thinking mode: ${thinkingMode.name} (${thinkingMode.phrase})`);
      }
    }
    
    console.log(`[ProcessUserMessage] Final text to send to Claude: "${finalText}"`);
    
    // Get or create user session
    let session = this.sessionManager.getUserSession(userId);
    
    if (!session) {
      // First message - create new session
      console.log(`[ProcessUserMessage] Creating new session for user ${userId}`);
      session = await this.sessionManager.createUserSession(userId, chatId);
    } else {
      console.log(`[ProcessUserMessage] Using existing session for user ${userId}, message count: ${session.messageCount}`);
    }

    // Check if previous request is still processing
    if (session.processor.isActive()) {
      console.log(`[ProcessUserMessage] Previous request still processing for user ${userId}`);
      await this.safeSendMessage(chatId, '⏳ *Processing previous request...*\nPlease wait or use /cancel');
      return;
    }

    console.log(`[ProcessUserMessage] Starting typing indicator for chat ${chatId}`);
    // Start typing indicator
    await this.activityIndicator.start(chatId);

    // Start session duration tracking
    this.sessionManager.startSessionTiming(userId, finalText);

    try {
      // Check if we have a stored session ID to resume
      const sessionId = this.getStoredSessionId(userId);
      console.log(`[ProcessUserMessage] Stored session ID for user ${userId}: ${sessionId ? sessionId.slice(-8) : 'none'}`);
      
      if (sessionId) {
        // Resume existing session with -r flag
        console.log(`[ProcessUserMessage] Resuming session for user ${userId}: ${sessionId.slice(-8)}`);
        await session.processor.resumeSession(sessionId, finalText);
      } else if (session.messageCount === 0) {
        // First message - start new conversation
        console.log(`[ProcessUserMessage] Starting new conversation for user ${userId} (message count: ${session.messageCount})`);
        await session.processor.startNewConversation(finalText);
      } else {
        // Continue conversation with -c flag (fallback)
        console.log(`[ProcessUserMessage] Continuing conversation for user ${userId} (message count: ${session.messageCount})`);
        await session.processor.continueConversation(finalText);
      }
      
      session.messageCount++;
      console.log(`[ProcessUserMessage] Claude invocation completed, incremented message count to: ${session.messageCount}`);
      
      // Activity indicator will be stopped when Claude completes (in 'complete' event)
      
    } catch (error) {
      console.error(`[ProcessUserMessage] Error starting Claude for user ${userId}:`, error);
      
      // Error - stop typing indicator
      await this.activityIndicator.stop(chatId);
      
      await this.sessionManager.sendError(chatId, error);
    }
  }


  /**
   * Setup process cleanup for activity indicators
   */
  setupProcessCleanup() {
    const cleanup = async () => {
      console.log('\n📦 Bot shutting down - cleaning up...');
      this.activityIndicator.cleanup();
      
      // Stop unified web server if running
      if (this.webServerUrl) {
        console.log('🌐 Stopping unified web server...');
        try {
          await this.stopUnifiedWebServer();
        } catch (error) {
          console.error('Error stopping unified web server:', error);
        }
      }
      
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', async () => {
      this.activityIndicator.cleanup();
      if (this.webServerUrl) {
        try {
          await this.stopUnifiedWebServer();
        } catch (error) {
          console.error('Error stopping unified web server on exit:', error);
        }
      }
    });
  }

  /**
   * Get bot statistics
   */
  getStats() {
    const activityStats = this.activityIndicator.getStats();
    const voiceStats = this.voiceHandler.getStats();
    return {
      activeSessions: this.sessionManager.userSessions.size,
      activeProcessors: this.activeProcessors.size,
      totalUsers: this.sessionManager.sessionStorage.size,
      pendingVoiceCommands: voiceStats.pendingVoiceCommands,
      activeIndicators: activityStats.activeIndicators,
      uptime: process.uptime()
    };
  }

  // ==================== MESSAGE CONCATENATION FEATURE ====================

  /**
   * Get concat mode status for a user
   */
  getConcatModeStatus(userId) {
    return this.concatMode.get(userId) || false;
  }

  /**
   * Enable concat mode for a user
   */
  async enableConcatMode(userId, chatId) {
    this.concatMode.set(userId, true);
    this.messageBuffer.set(userId, []);
    
    console.log(`[User ${userId}] Concat mode enabled`);
    
    const instructionMessage = `🔗 **Concat Mode Enabled**

📝 **How to use:**
• Send any messages (text, voice, images)
• All messages will be collected in a buffer
• Click "📤 Concat Send" to process all at once
• Click "🔗 Concat On" again to disable

📊 **Buffer**: 0 messages`;

    await this.safeSendMessage(chatId, instructionMessage, {
      reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
    });
  }

  /**
   * Disable concat mode for a user
   */
  async disableConcatMode(userId, chatId, clearBuffer = true) {
    this.concatMode.set(userId, false);
    if (clearBuffer) {
      this.messageBuffer.set(userId, []);
    }
    
    console.log(`[User ${userId}] Concat mode disabled, clearBuffer: ${clearBuffer}`);
    
    await this.safeSendMessage(chatId, '🔗 **Concat Mode Disabled**\n\nMessages will be sent immediately again.', {
      reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
    });
  }

  /**
   * Add message to buffer
   */
  async addToMessageBuffer(userId, messageData) {
    if (!this.messageBuffer.has(userId)) {
      this.messageBuffer.set(userId, []);
    }
    
    const buffer = this.messageBuffer.get(userId);
    buffer.push({
      ...messageData,
      timestamp: new Date()
    });
    
    console.log(`[User ${userId}] Added to buffer: ${messageData.type} message. Buffer size: ${buffer.length}`);
    return buffer.length;
  }

  /**
   * Get buffer size for a user
   */
  getBufferSize(userId) {
    const buffer = this.messageBuffer.get(userId);
    return buffer ? buffer.length : 0;
  }

  /**
   * Get message buffer for a user
   */
  getMessageBuffer(userId) {
    return this.messageBuffer.get(userId) || [];
  }

  /**
   * Clear message buffer for a user
   */
  clearMessageBuffer(userId) {
    this.messageBuffer.set(userId, []);
    console.log(`[User ${userId}] Message buffer cleared`);
  }

  /**
   * Combine buffered messages into a single message
   */
  async combineBufferedMessages(buffer) {
    let combinedText = '';
    const imagePaths = [];
    
    for (let i = 0; i < buffer.length; i++) {
      const message = buffer[i];
      const messageNumber = i + 1;
      
      switch (message.type) {
      case 'text':
        combinedText += `[Message ${messageNumber} - Text]\n${message.content}\n\n`;
        break;
          
      case 'voice':
        combinedText += `[Message ${messageNumber} - Voice Transcription]\n${message.content}\n\n`;
        break;
          
      case 'image':
        combinedText += `[Message ${messageNumber} - Image${message.content ? ' with caption' : ''}]\n`;
        if (message.content) {
          combinedText += `Caption: ${message.content}\n`;
        }
        combinedText += `Image: ${message.imagePath}\n\n`;
        imagePaths.push(message.imagePath);
        break;
      }
    }
    
    // Add summary header
    const summaryHeader = `Combined Message (${buffer.length} parts):\n${'='.repeat(40)}\n\n`;
    
    return summaryHeader + combinedText.trim();
  }

  /**
   * Send concatenated message
   */
  async sendConcatenatedMessage(userId, chatId) {
    const buffer = this.messageBuffer.get(userId) || [];
    
    if (buffer.length === 0) {
      await this.safeSendMessage(chatId, '📭 **Empty Buffer**\n\nNo messages to send. Add some messages first!', {
        reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
      });
      return;
    }

    // Combine all messages
    const combinedMessage = await this.combineBufferedMessages(buffer);
    
    // Clear buffer and disable concat mode
    this.messageBuffer.set(userId, []);
    this.concatMode.set(userId, false);
    
    console.log(`[User ${userId}] Sending concatenated message with ${buffer.length} parts`);
    
    // Send notification with original message preview (truncated)
    const truncatedPreview = this.truncateForTelegram(combinedMessage, 300); // Shorter preview for notification
    const notificationText = `📤 **Sending Combined Message**\n\n💬 **Preview:** ${truncatedPreview}\n\nProcessing ${buffer.length} messages...`;
    await this.safeSendMessage(chatId, notificationText, {
      reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
    });
    
    // Process the combined message
    await this.processUserMessage(combinedMessage, userId, chatId);
  }

  /**
   * Start unified web server with LocalTunnel
   */
  async startUnifiedWebServer() {
    try {
      if (this.webServerUrl) {
        return this.webServerUrl; // Already running
      }

      console.log('Starting unified web server...');
      const url = await this.unifiedWebServer.start();
      
      // Get secure URL with token for external access
      this.webServerUrl = this.unifiedWebServer.getSecurePublicUrl();
      console.log(`✅ Unified web server available at: ${this.webServerUrl}`);
      console.log(`🔐 URL includes security token for protected access`);
      return this.webServerUrl;
    } catch (error) {
      console.error('Failed to start unified web server:', error);
      throw error;
    }
  }

  /**
   * Stop unified web server and close LocalTunnel
   */
  async stopUnifiedWebServer() {
    try {
      if (!this.webServerUrl) {
        return; // Already stopped
      }

      console.log('Stopping unified web server...');
      await this.unifiedWebServer.stop();
      this.webServerUrl = null;
      console.log('✅ Unified web server stopped');
    } catch (error) {
      console.error('Failed to stop unified web server:', error);
      throw error;
    }
  }

  /**
   * Handle /files command to open file browser
   */
  async handleFilesCommand(chatId) {
    try {
      // Start unified web server if not already running
      await this.startUnifiedWebServer();
      const secureUrl = this.unifiedWebServer.getSecurePublicUrl() || this.webServerUrl;
      
      // Check if using local access (LocalTunnel failed) 
      const isLocalOnly = secureUrl && secureUrl.includes('localhost');
      const accessType = isLocalOnly ? '🏠 Local Access Only' : '🌐 Public Access Available';
      const statusIcon = isLocalOnly ? '🏠' : '🌐';
      const buttonText = isLocalOnly ? '🏠 Open Locally' : '🌐 Open File Browser';
      
      // secureUrl already contains the security token from startUnifiedWebServer
      
      const ngrokTip = isLocalOnly ? 
        `🔧 **Setup Remote Access:** Set NGROK_AUTHTOKEN environment variable` : 
        `💡 **Tip:** Add header \`ngrok-skip-browser-warning: true\` to bypass ngrok warning banner`;
      
      const message = `🌐 **Web App Available**\n\n` +
        `🔗 Access URL:\n${secureUrl}`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🌐 Open Web App', web_app: { url: secureUrl } }]
        ]
      };

      await this.safeSendMessage(chatId, message, {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      await this.safeSendMessage(chatId, `❌ Error starting file browser: ${error.message}`);
    }
  }

  /**
   * Handle file browser callback queries
   */
  async handleFileBrowserCallback(query) {
    const [, action] = query.data.split(':');
    const chatId = query.message.chat.id;

    try {
      switch (action) {
        case 'stop':
          await this.stopUnifiedWebServer();
          await this.bot.editMessageText(
            '✅ Dev tools server stopped',
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              reply_markup: {
                inline_keyboard: [[
                  { text: '🔄 Restart', callback_data: 'files:start' }
                ]]
              }
            }
          );
          break;

        case 'start':
          await this.startUnifiedWebServer();
          const secureUrl = this.unifiedWebServer.getSecurePublicUrl() || this.webServerUrl;
          const isUrlLocalOnly = secureUrl && secureUrl.includes('localhost');
          const accessType = isUrlLocalOnly ? '🏠 Local Access Only' : '🌐 Public Access Available';
          const statusIcon = isUrlLocalOnly ? '🏠' : '🌐';
          
          const message = `🌐 **Web App Available**\n\n` +
            `🔗 Access URL:\n${secureUrl}`;
          
          const replyMarkup = {
            inline_keyboard: [
              [{ text: '🌐 Open Web App', web_app: { url: secureUrl } }]
            ]
          };
            
          await this.bot.editMessageText(message, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: replyMarkup
          });
          break;

        case 'refresh':
          if (this.webServerUrl) {
            const secureRefreshUrl = this.unifiedWebServer.getSecurePublicUrl() || this.webServerUrl;
            const isRefreshLocalOnly = this.webServerUrl.includes('localhost');
            const refreshAccessType = isRefreshLocalOnly ? '🏠 Local Access Only' : '🌐 Public Access Available';
            const refreshStatusIcon = isRefreshLocalOnly ? '🏠' : '🌐';
            
            const refreshMessage = `🌐 **Web App Available**\n\n` +
              `🔗 Access URL:\n${secureRefreshUrl}`;
            
            const refreshReplyMarkup = {
              inline_keyboard: [
                [{ text: '🌐 Open Web App', web_app: { url: secureRefreshUrl } }]
              ]
            };
              
            await this.bot.editMessageText(refreshMessage, {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'Markdown',
              reply_markup: refreshReplyMarkup
            });
          } else {
            await this.bot.editMessageText(
              '⚠️ File browser is not running. Start it first.',
              {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                  inline_keyboard: [[
                    { text: '🔄 Start Server', callback_data: 'files:start' }
                  ]]
                }
              }
            );
          }
          break;
      }

      await this.bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error('Error handling file browser callback:', error);
      await this.bot.answerCallbackQuery(query.id, {
        text: `Error: ${error.message}`,
        show_alert: true
      });
    }
  }

  /**
   * Auto-start unified web server in background (non-blocking)
   */
  autoStartUnifiedWebServer() {
    // Start in background without blocking bot initialization
    setImmediate(async () => {
      try {
        console.log(`[${this.botInstanceName}] Auto-starting unified web server...`);
        this.webServerUrl = await this.unifiedWebServer.start();
        
        if (this.webServerUrl) {
          console.log(`[${this.botInstanceName}] ✅ Unified web server auto-started: ${this.webServerUrl}`);
          
          // Only send notification if public URL (not localhost)
          const isPublicAccess = !this.webServerUrl.includes('localhost');
          if (this.adminUserId && isPublicAccess) {
            console.log(`[${this.botInstanceName}] 📤 Public URL available, sending notification...`);
            await this.notifyWebServerReady();
          } else if (this.adminUserId && !isPublicAccess) {
            console.log(`[${this.botInstanceName}] 🏠 Local access only, skipping auto-notification`);
          }
        }
      } catch (error) {
        console.error(`[${this.botInstanceName}] ❌ Unified web server auto-start failed:`, error);
        
        // For LocalTunnel errors, provide helpful message
        if (error.message?.includes('localtunnel') || error.message?.includes('tunnel')) {
          console.log(`[${this.botInstanceName}] 💡 Tip: LocalTunnel connection failed, using local access only`);
        }
      }
    });
  }

  /**
   * Create comprehensive main menu keyboard with all bot functions
   */
  createMainMenuKeyboard(isLocalOnly = false) {
    const keyboard = {
      inline_keyboard: []
    };

    // Row 1: Core Functions
    const row1 = [];
    
    // Development Tools button - unified web server with files and git
    if (!isLocalOnly && this.webServerUrl) {
      const secureUrl = this.unifiedWebServer.getSecurePublicUrl();
      if (secureUrl) {
        row1.push({ text: '🚀 Dev Tools', web_app: { url: secureUrl } });
      } else {
        row1.push({ text: '🚀 Dev Tools', callback_data: 'main_menu:files' });
      }
    } else {
      row1.push({ text: '🚀 Dev Tools', callback_data: 'main_menu:files' });
    }
    
    row1.push({ text: '📂 Projects', callback_data: 'main_menu:projects' });
    row1.push({ text: '🔍 Git', callback_data: 'main_menu:git' });
    keyboard.inline_keyboard.push(row1);

    // Row 2: Session Management
    const row2 = [
      { text: '📊 Status', callback_data: 'main_menu:status' },
      { text: '🆕 New Session', callback_data: 'main_menu:new_session' },
      { text: '📝 Sessions', callback_data: 'main_menu:sessions' }
    ];
    keyboard.inline_keyboard.push(row2);

    // Row 3: Configuration
    const row3 = [
      { text: '🤖 Model', callback_data: 'main_menu:model' },
      { text: '🧠 Thinking', callback_data: 'main_menu:thinking' },
      { text: '⚙️ Settings', callback_data: 'main_menu:settings' }
    ];
    keyboard.inline_keyboard.push(row3);

    // Row 4: Utilities
    const row4 = [
      { text: '📍 Current Path', callback_data: 'main_menu:pwd' },
      { text: '💬 Commands', callback_data: 'main_menu:commands' }
    ];
    keyboard.inline_keyboard.push(row4);

    return keyboard;
  }

  /**
   * Show main menu to user
   */
  async showMainMenu(chatId) {
    try {
      const isServerRunning = this.webServerUrl && !this.webServerUrl.includes('localhost');
      const serverStatus = isServerRunning ? '🌐 Web server running' : '🏠 Local access only';
      
      const message = `🎯 **Main Menu**\n\n` +
        `${serverStatus}\n` +
        `📍 **Current Project:** ${path.basename(this.options.workingDirectory)}\n` +
        `🤖 **Model:** ${this.getModelDisplayName(this.options.model)}\n\n` +
        `💡 Choose an option from the menu below:`;

      const keyboard = this.createMainMenuKeyboard(!isServerRunning);

      await this.safeSendMessage(chatId, message, {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('[MainMenu] Error showing main menu:', error);
      await this.safeSendMessage(chatId, `❌ Error showing main menu: ${error.message}`);
    }
  }

  /**
   * Handle main menu button clicks
   */
  async handleMainMenuCallback(data, chatId, messageId, userId) {
    const action = data.replace('main_menu:', '');
    
    try {
      switch (action) {
        case 'files':
          await this.handleFilesCommand(chatId);
          break;
        case 'projects':
          await this.projectNavigator.showProjectSelection(chatId);
          break;
        case 'git':
          await this.gitManager.showGitOverview(chatId);
          break;
        case 'status':
          await this.sessionManager.showSessionStatus(chatId);
          break;
        case 'new_session':
          await this.sessionManager.startNewSession(chatId);
          break;
        case 'sessions':
          await this.sessionManager.showSessionHistory(chatId);
          break;
        case 'model':
          await this.showModelSelection(chatId);
          break;
        case 'thinking':
          await this.showThinkingModeSelection(chatId);
          break;
        case 'settings':
          await this.settingsHandler.showSettingsMenu(chatId);
          break;
        case 'pwd':
          await this.showCurrentDirectory(chatId, userId);
          break;
        case 'commands':
          await this.commandsHandler.showCommandsMenu(chatId, messageId);
          break;
        default:
          console.log(`[MainMenu] Unknown action: ${action}`);
      }
    } catch (error) {
      console.error(`[MainMenu] Error handling ${action}:`, error);
      await this.safeSendMessage(chatId, `❌ Error executing ${action}: ${error.message}`);
    }
  }

  /**
   * Send notification to admin when unified web server is ready
   */
  async notifyWebServerReady() {
    try {
      console.log(`[${this.botInstanceName}] 📤 Sending web server ready notification to admin ${this.adminUserId}`);
      const isLocalOnly = this.webServerUrl.includes('localhost');
      const accessType = isLocalOnly ? '🏠 Local Access Only' : '🌐 Public Access Available';
      const statusIcon = isLocalOnly ? '🏠' : '🌐';
      
      // Get secure URL with token for notification
      const secureUrl = this.unifiedWebServer.getSecurePublicUrl() || this.webServerUrl;
      
      const message = `${statusIcon} **${this.botInstanceName.toUpperCase()} - Dev Tools Ready**\n\n` +
        `🌐 Web server started successfully!\n` +
        `🔗 Secure URL: ${secureUrl}\n` +
        `📍 Access: ${accessType}\n\n` +
        `🎯 **Available Services:**\n` +
        `• File browser and project explorer\n` +
        `• Git diff viewer with syntax highlighting\n` +
        `• Unified development tools interface\n\n` +
        `💡 Use the menu below to access all features` +
        (isLocalOnly ? '\n\n🔧 Set NGROK_AUTHTOKEN for remote access' : '');

      const messageOptions = {
        parse_mode: 'Markdown'
        // No inline keyboard - user wants clean notification message
      };

      await this.safeSendMessage(this.adminUserId, message, messageOptions);
      console.log(`[${this.botInstanceName}] ✅ Web server ready notification with main menu sent successfully`);
    } catch (error) {
      console.error(`[${this.botInstanceName}] ❌ Error sending file browser notification:`, error);
    }
  }

  /**
   * Get QTunnel token from bot config file
   */
  getQTunnelTokenFromConfig() {
    if (!this.configManager) {
      console.warn(`[${this.botInstanceName}] No config manager available, QTunnel token unavailable`);
      return null;
    }
    
    try {
      // Get QTunnel token using ConfigManager (efficient in-memory read)
      const token = this.configManager.getQTunnelToken();
      console.log(`[${this.botInstanceName}] QTunnel token: ${token ? '[CONFIGURED]' : '[NOT FOUND]'}`);
      
      return token || null;
    } catch (error) {
      console.error(`[${this.botInstanceName}] Error reading config for QTunnel token:`, error.message);
      return null;
    }
  }

}

// Export for use
module.exports = StreamTelegramBot;
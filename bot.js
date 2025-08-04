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
    this.voiceHandler = new VoiceMessageHandler(this.bot, this.options.nexaraApiKey, this.activityIndicator, this);
    
    // Settings menu handler
    this.settingsHandler = new SettingsMenuHandler(this, this.voiceHandler);
    
    // Image message handler
    this.imageHandler = new ImageHandler(this.bot, this.sessionManager, this.activityIndicator, this);
    
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
          
          // Check if it's a keyboard button press
          if (await this.keyboardHandlers.handleKeyboardButton(msg)) {
            return; // Button handled, don't process as regular message
          }

          // Check if GitManager needs to handle this text input (e.g., branch creation)
          if (await this.gitManager.handleTextInput(chatId, msg.text)) {
            return; // GitManager handled the text input
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
        '• 📸 Image analysis support with captions\n\n' +
        '*Quick Buttons:*\n' +
        '• 🛑 STOP - emergency stop\n' +
        '• 📊 Status - session status\n' +
        '• 📂 Projects - project selection\n' +
        '• 🔄 New Session - start fresh\n' +
        '• 📝 Sessions - session history\n' +
        '• 🤖 Model - Claude model selection\n' +
        '• 🧠 Thinking - thinking mode selection\n' +
        '• 📍 Path - current directory\n' +
        '• 🔍 Git Diff - view git changes\n\n' +
        '*Claude 4 Model Commands:*\n' +
        '• /sonnet - Claude 4 Sonnet (recommended)\n' +
        '• /opus - Claude 4 Opus (maximum performance)\n' +
        '• /model - show model selection\n\n' +
        '*Git Commands:*\n' +
        '• /diff - view git status and diff (includes untracked files) with mobile-friendly pagination\n\n' +
        '*Thinking Mode Commands:*\n' +
        '• /think - select thinking mode (Auto, Think, Think Hard, Think Harder, Ultrathink)\n\n' +
        'Just send me a message to start!';
      
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

    // Normal processing if concat mode is off
    await this.processUserMessage(text, userId, chatId);
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
    if (!this.userPreferences) {
      return 'auto';
    }
    return this.userPreferences.get(`${userId}_thinking`) || 'auto';
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
    if (!this.configFilePath) {
      console.warn('[Bot] No config file path provided, cannot store user model');
      return;
    }
    
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(configData);
      
      // Initialize projectSessions if it doesn't exist
      if (!config.projectSessions) {
        config.projectSessions = {};
      }
      
      const currentProject = this.options.workingDirectory;
      
      // Update or create project session with new model preference
      if (!config.projectSessions[currentProject]) {
        config.projectSessions[currentProject] = {
          userId: userId.toString(),
          model: model,
          timestamp: new Date().toISOString()
        };
      } else {
        config.projectSessions[currentProject].model = model;
        config.projectSessions[currentProject].timestamp = new Date().toISOString();
      }
      
      // Write back to file
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      
      console.log(`[Bot] Stored user model ${model} for project ${currentProject}`);
    } catch (error) {
      console.error('[Bot] Error storing user model:', error.message);
    }
  }

  /**
   * Get user's model preference for current project
   */
  getUserModel(userId) {
    if (!this.configFilePath) {
      return null;
    }
    
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(configData);
      
      const currentProject = this.options.workingDirectory;
      
      // Get model preference from project-specific session
      if (config.projectSessions && config.projectSessions[currentProject]) {
        const projectSession = config.projectSessions[currentProject];
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
   * Sanitize HTML content to fix malformed patterns while preserving valid HTML
   */
  sanitizeHtmlContent(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Find malformed HTML-like patterns that could cause Telegram API errors
    // Pattern: < followed immediately by quote/apostrophe (these are never valid HTML tags)
    const malformedPatterns = /<['"`][^<>]*(?![>])/g;
    
    return text.replace(malformedPatterns, (match) => {
      // Escape the malformed pattern by replacing < with &lt;
      return match.replace(/</g, '&lt;');
    });
  }

  /**
   * Safely send message with proper Telegram markdown sanitization
   */
  async safeSendMessage(chatId, text, options = {}) {
    let htmlText = text;
    try {
      
      // Convert markdown to HTML if text doesn't already contain HTML tags
      const containsHtml = /<[^>]+>/.test(text);
      if (!containsHtml) {
        const MarkdownHtmlConverter = require('./utils/markdown-html-converter');
        const converter = new MarkdownHtmlConverter();
        htmlText = converter.convert(text);
      } else {
        // Even if text contains HTML, validate and fix malformed patterns
        htmlText = this.sanitizeHtmlContent(text);
      }
      
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
      if (parsedError.message.includes('Invalid HTML tag') || parsedError.message.includes('position')) {
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
          
        return await this.bot.sendMessage(chatId, userMessage, {
          parse_mode: 'HTML',
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
      
      // Convert markdown to HTML if text doesn't already contain HTML tags
      const containsHtml = /<[^>]+>/.test(text);
      if (!containsHtml) {
        const MarkdownHtmlConverter = require('./utils/markdown-html-converter');
        const converter = new MarkdownHtmlConverter();
        htmlText = converter.convert(text);
      }
      
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
          
        await this.bot.editMessageText(userMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML'
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
    if (!this.configFilePath) {
      console.warn('[Admin] No config file path provided, cannot save admin ID');
      return;
    }
    
    try {
      // Read current config
      const fs = require('fs');
      const configData = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(configData);
      
      // Update admin user ID
      config.adminUserId = userId.toString();
      config.lastAdminUpdate = new Date().toISOString();
      
      // Write back to file
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      
      console.log(`[Admin] Saved admin user ID ${userId} to config file`);
    } catch (error) {
      console.error('[Admin] Error saving admin to config:', error.message);
    }
  }

  /**
   * Save current session state to config file
   */
  async saveCurrentSessionToConfig(userId, sessionId) {
    if (!this.configFilePath) {
      console.warn('[Session] No config file path provided, cannot save session');
      return;
    }
    
    try {
      // Read current config
      const fs = require('fs');
      const configData = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(configData);
      
      // Save current session info
      if (!config.lastSession) {
        config.lastSession = {};
      }
      
      config.lastSession.userId = userId.toString();
      config.lastSession.sessionId = sessionId;
      config.lastSession.timestamp = new Date().toISOString();
      config.lastSession.workingDirectory = this.options.workingDirectory;
      config.lastSession.model = this.options.model;
      
      // Write back to file
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      
      console.log(`[Session] Saved current session ${sessionId.slice(-8)} to config`);
    } catch (error) {
      console.error('[Session] Error saving session to config:', error.message);
    }
  }

  /**
   * Restore last session from config file
   */
  async restoreLastSessionFromConfig() {
    if (!this.configFilePath) {
      return null;
    }
    
    try {
      // Read current config
      const fs = require('fs');
      const configData = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(configData);
      
      // Set working directory from currentProject
      if (config.currentProject) {
        this.options.workingDirectory = config.currentProject;
        console.log(`[Startup] Restored current project: ${config.currentProject}`);
      }
      
      // Get project-specific session
      if (config.projectSessions && config.currentProject) {
        const projectSession = config.projectSessions[config.currentProject];
        
        if (projectSession && projectSession.sessionId) {
          console.log(`[Session] Found session ${projectSession.sessionId.slice(-8)} for project ${config.currentProject}`);
          
          // Update bot options from project session
          if (projectSession.model) {
            this.options.model = projectSession.model;
          }
          
          return {
            userId: parseInt(projectSession.userId),
            sessionId: projectSession.sessionId,
            timestamp: projectSession.timestamp,
            workingDirectory: config.currentProject,
            model: projectSession.model
          };
        } else {
          console.log(`[Session] No session found for current project: ${config.currentProject}`);
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
      await this.safeSendMessage(chatId, 
        '🔄 **Bot Restart Initiated**\n\n' +
        `⏳ Restarting ${this.botInstanceName} process...\n` +
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
   * Process user message (unified handler for text and voice)
   */
  async processUserMessage(text, userId, chatId) {
    console.log(`[ProcessUserMessage] Starting to process message for user ${userId}: "${text}"`);
    
    // Admin access already checked in message handler
    
    // Apply thinking mode to message (like in claudia)
    let finalText = text.trim();
    const userThinkingMode = this.getUserThinkingMode(userId);
    const thinkingMode = this.getThinkingModeById(userThinkingMode);
    
    // Append thinking phrase if not auto mode (same as claudia logic)
    if (thinkingMode && thinkingMode.phrase) {
      finalText = `${finalText}.\n\n${thinkingMode.phrase}.`;
      console.log(`[User ${userId}] Applied thinking mode: ${thinkingMode.name} (${thinkingMode.phrase})`);
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
    const cleanup = () => {
      console.log('\n📦 Bot shutting down - cleaning up activity indicators...');
      this.activityIndicator.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
      this.activityIndicator.cleanup();
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
    
    // Send notification
    await this.safeSendMessage(chatId, `📤 **Sending Combined Message**\n\nProcessing ${buffer.length} messages...`, {
      reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
    });
    
    // Process the combined message
    await this.processUserMessage(combinedMessage, userId, chatId);
  }
}

// Export for use
module.exports = StreamTelegramBot;
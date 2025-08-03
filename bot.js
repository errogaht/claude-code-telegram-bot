/**
 * New Claude Code Telegram Bot with Stream-JSON Architecture
 * Based on Claudia's approach - no terminal interaction, direct stream processing
 */

const TelegramBot = require('node-telegram-bot-api');
const TelegramFormatter = require('./telegram-formatter');
const ActivityIndicator = require('./ActivityIndicator');
const VoiceMessageHandler = require('./VoiceMessageHandler');
const SessionManager = require('./SessionManager');
const ProjectNavigator = require('./ProjectNavigator');
const KeyboardHandlers = require('./KeyboardHandlers');
const GitManager = require('./GitManager');
const MessageSplitter = require('./MessageSplitter');
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
    
    // Admin user management
    this.adminUserId = options.adminUserId ? parseInt(options.adminUserId) : null;
    this.authorizedUsers = new Set();
    if (this.adminUserId) {
      this.authorizedUsers.add(this.adminUserId);
    }
    
    // Core services
    this.activeProcessors = new Set();
    
    // Initialize extracted modules
    this.activityIndicator = new ActivityIndicator(this.bot);
    this.sessionManager = new SessionManager(this.formatter, this.options, this.bot, this.activeProcessors, this.activityIndicator, this);
    this.projectNavigator = new ProjectNavigator(this.bot, this.options);
    this.keyboardHandlers = new KeyboardHandlers(this.bot, this);
    this.messageSplitter = new MessageSplitter();
    
    // Git manager - full git workflow handler
    this.gitManager = new GitManager(this.bot, this.options, this.keyboardHandlers);
    
    // Voice message handler
    this.voiceHandler = new VoiceMessageHandler(this.bot, this.options.nexaraApiKey, this.activityIndicator);
    
    // Thinking levels configuration (from claudia)
    this.thinkingModes = [
      {
        id: "auto",
        name: "Auto",
        description: "Let Claude decide",
        level: 0,
        icon: "🧠",
        phrase: null
      },
      {
        id: "think",
        name: "Think",
        description: "Basic reasoning",
        level: 1,
        icon: "💭",
        phrase: "think"
      },
      {
        id: "think_hard",
        name: "Think Hard",
        description: "Deeper analysis",
        level: 2,
        icon: "🤔",
        phrase: "think hard"
      },
      {
        id: "think_harder",
        name: "Think Harder",
        description: "Extensive reasoning",
        level: 3,
        icon: "🧐",
        phrase: "think harder"
      },
      {
        id: "ultrathink",
        name: "Ultrathink",
        description: "Maximum computation",
        level: 4,
        icon: "🔥",
        phrase: "ultrathink"
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

          console.log(`[COMPONENT] StreamTelegramBot.handleUserMessage - processing regular text message`);
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
        await this.voiceHandler.handleVoiceMessage(msg);
      } catch (error) {
        console.error('Error handling voice:', error);
        await this.sessionManager.sendError(msg.chat.id, error);
      }
    });

    // Commands
    this.bot.onText(/\/start/, async (msg) => {
      const userId = msg.from.id;
      const username = msg.from.username || 'Unknown';
      const chatId = msg.chat.id;
      console.log(`[SLASH_COMMAND] User ${userId} (@${username}) executed /start in chat ${chatId}`);
      
      // Check admin access (auto-assign first user if needed)
      if (!this.checkAdminAccess(msg.from.id, msg.chat.id)) {
        return; // Access denied message already sent
      }
      
      const welcomeText = `🤖 *Claude Code Stream Bot*\n\n` +
        `This bot uses Claude CLI with stream-json for seamless interaction.\n\n` +
        `*Features:*\n` +
        `• 📋 Live TodoWrite updates\n` +
        `• 🔄 Session continuity with session IDs\n` +
        `• 🛡️ Auto-skip permissions\n` +
        `• 🎯 Real-time tool execution\n` +
        `• 🧠 Thinking mode control (like Claudia)\n\n` +
        `*Quick Buttons:*\n` +
        `• 🛑 STOP - emergency stop\n` +
        `• 📊 Status - session status\n` +
        `• 📂 Projects - project selection\n` +
        `• 🔄 New Session - start fresh\n` +
        `• 📝 Sessions - session history\n` +
        `• 🤖 Model - Claude model selection\n` +
        `• 🧠 Thinking - thinking mode selection\n` +
        `• 📍 Path - current directory\n` +
        `• 🔍 Git Diff - view git changes\n\n` +
        `*Claude 4 Model Commands:*\n` +
        `• /sonnet - Claude 4 Sonnet (recommended)\n` +
        `• /opus - Claude 4 Opus (maximum performance)\n` +
        `• /model - show model selection\n\n` +
        `*Git Commands:*\n` +
        `• /diff - view git status and diff (includes untracked files) with mobile-friendly pagination\n\n` +
        `*Thinking Mode Commands:*\n` +
        `• /think - select thinking mode (Auto, Think, Think Hard, Think Harder, Ultrathink)\n\n` +
        `Just send me a message to start!`;
      
      await this.bot.sendMessage(msg.chat.id, welcomeText, { 
        parse_mode: 'Markdown',
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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
            await this.bot.sendMessage(chatId, 
              '❌ *Button data error*\n\nProject list expired. Use /cd to refresh.',
              { parse_mode: 'Markdown' }
            );
          } else {
            await this.bot.sendMessage(chatId, 
              `❌ *Telegram API Error*\n\n${error.message}`,
              { parse_mode: 'Markdown' }
            );
          }
        } else {
          await this.bot.sendMessage(chatId, 
            `❌ *Error*\n\n${error.message}`,
            { parse_mode: 'Markdown' }
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
  }


  /**
   * Handle incoming user text message
   */
  async handleUserMessage(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text;

    console.log(`[User ${userId}] Message: ${text}`);

    // Use unified message processor
    await this.processUserMessage(text, userId, chatId);
  }

  /**
   * Send session initialization message
   */
  async sendSessionInit(chatId, session) {
    const text = `🚀 *New Session Started*\n\n` +
      `Ready to process your requests with Claude CLI stream-json mode.\n\n` +
      `🔄 Session continuity with ID tracking\n` +
      `🛡️ Auto-permissions enabled\n` +
      `📋 Live TodoWrite updates active\n\n` +
      `💡 Use /end to close this session\n` +
      `📚 Use /sessions to view history`;
    
    await this.safeSendMessage(chatId, text, { parse_mode: 'Markdown' });
  }


  /**
   * Show current working directory
   */
  async showCurrentDirectory(chatId) {
    const currentDir = this.options.workingDirectory;
    const dirName = path.basename(currentDir);
    const parentDir = path.dirname(currentDir);
    
    await this.bot.sendMessage(chatId,
      `📁 *Current Working Directory*\n\n` +
      `🏷️ **Name:** ${dirName}\n` +
      `📂 **Parent:** ${parentDir}\n` +
      `🔗 **Full Path:** \`${currentDir}\`\n\n` +
      `💡 Use /cd to change directory`,
      { 
        parse_mode: 'Markdown',
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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
    const sessionInfo = session ? `\n\n⚠️ *Current session:* will use new model on next message` : '';
    
    await this.safeSendMessage(chatId,
      `🤖 *Model Changed*\n\n` +
      `📝 **Selected:** ${modelName} (\`${model}\`)\n` +
      `🔄 **Status:** active for new sessions${sessionInfo}`,
      { 
        forceNotification: true,  // Important user setting change
        reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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

    await this.bot.sendMessage(chatId,
      `🤖 *Claude 4 Model Selection*\n\n` +
      `📊 **Current model:** ${this.getModelDisplayName(currentModel)}\n\n` +
      `**Available Claude 4 models:**\n` +
      `🤖 **Sonnet** - balance of speed and quality (recommended for most tasks)\n` +
      `🧠 **Opus** - maximum performance for most complex tasks\n\n` +
      `💡 Select model for new sessions:`,
      {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
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

    await this.bot.sendMessage(chatId,
      `🧠 *Thinking Mode Selection*\n\n` +
      `📊 **Current mode:** ${currentMode.icon} ${currentMode.name} ${this.getThinkingLevelIndicator(currentMode.level)}\n` +
      `📝 **Description:** ${currentMode.description}\n\n` +
      `**Available thinking modes:**\n` +
      `${this.thinkingModes.map(mode =>
        `${mode.icon} **${mode.name}** ${this.getThinkingLevelIndicator(mode.level)} - ${mode.description}`
      ).join('\n')}\n\n` +
      `💡 Select thinking mode for Claude:`,
      {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
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
   * Store user's model preference
   */
  storeUserModel(userId, model) {
    if (!this.userPreferences) {
      this.userPreferences = new Map();
    }
    this.userPreferences.set(`${userId}_model`, model);
  }

  /**
   * Get user's model preference
   */
  getUserModel(userId) {
    if (!this.userPreferences) {
      return null;
    }
    return this.userPreferences.get(`${userId}_model`);
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
   * Safely send message with proper Telegram markdown sanitization
   */
  async safeSendMessage(chatId, text, options = {}) {
    const { TelegramSanitizer, TelegramSanitizerError } = require('./telegram-sanitizer.js');
    
    try {
      let messageOptions = { ...options };
      let messageText = text;
      
      // Apply sanitization if using markdown
      if (options.parse_mode === 'Markdown' || !options.parse_mode) {
        const sanitizer = new TelegramSanitizer();
        const sanitized = sanitizer.sanitizeForTelegram(text, options);
        messageText = sanitized.text;
        messageOptions.parse_mode = sanitized.parse_mode; // Will be MarkdownV2
      }
      
      // Determine if message should have notification
      const shouldNotify = this.shouldSendWithNotification(text, options);
      if (!shouldNotify && !messageOptions.hasOwnProperty('disable_notification')) {
        messageOptions.disable_notification = true;
      }
      
      // Check message length and split if necessary
      const TELEGRAM_MAX_LENGTH = 4096;
      if (messageText.length <= TELEGRAM_MAX_LENGTH) {
        // Send single message
        await this.bot.sendMessage(chatId, messageText, messageOptions);
      } else {
        // Split into multiple messages
        await this.messageSplitter.sendLongMessage(this.bot, chatId, messageText, messageOptions);
      }
      
    } catch (error) {
      // Handle different types of errors with proper context
      if (error instanceof TelegramSanitizerError) {
        // Sanitizer error - log details and send error message
        console.error('🚨 Telegram Sanitizer Error:', {
          message: error.message,
          details: error.details,
          timestamp: error.timestamp
        });
        
        await this.bot.sendMessage(chatId, 
          `❌ Message Formatting Error\n\n` +
          `Issue: ${error.message}\n` +
          `Details: ${JSON.stringify(error.details, null, 2)}\n\n` +
          `Original content was too complex to display safely.`,
          { parse_mode: undefined, disable_notification: false }
        );
        
      } else if (error.code === 'ETELEGRAM' && error.message.includes("can't parse entities")) {
        // Telegram parsing error - provide clean error info
        const errorInfo = {
          error: 'Telegram Markdown Parsing Failed',
          message: error.message,
          textLength: text?.length || 0,
          textPreview: text?.substring(0, 150) + '...' || 'N/A',
          parseMode: options.parse_mode || 'Markdown',
          timestamp: new Date().toISOString()
        };
        
        console.error('🚨 Telegram Parse Error:', errorInfo);
        console.error('🔍 FULL MESSAGE CONTENT FOR DEBUGGING:');
        console.error('═'.repeat(80));
        console.error(text);
        console.error('═'.repeat(80));
        
        // Send clean error message without problematic formatting
        await this.bot.sendMessage(chatId, 
          `❌ Telegram Parse Error\n\n` +
          `Message: ${errorInfo.message}\n` +
          `Length: ${errorInfo.textLength} chars\n` +
          `Preview: ${errorInfo.textPreview}\n` +
          `Time: ${errorInfo.timestamp}\n\n` +
          `The message contained formatting that Telegram couldn't parse.`,
          { parse_mode: undefined, disable_notification: false }
        );
        
      } else if (error.code === 'ETELEGRAM' && error.message.includes("message is too long")) {
        // Message too long error - retry with splitting
        console.error('🚨 Message Too Long Error - Retrying with splitting:', {
          textLength: text?.length || 0,
          timestamp: new Date().toISOString()
        });
        
        try {
          // Force split the message
          await this.messageSplitter.sendLongMessage(this.bot, chatId, text, options);
        } catch (splitError) {
          // If splitting also fails, send basic error
          await this.bot.sendMessage(chatId, 
            `❌ *Message Too Long*\n\n` +
            `The message (${text?.length || 0} chars) was too long for Telegram and couldn't be split properly.\n\n` +
            `Try using a more specific request for shorter responses.`,
            { parse_mode: undefined, disable_notification: false }
          );
        }
        
      } else {
        // Other errors - re-throw with context
        console.error('🚨 Unknown Send Message Error:', {
          error: error.message,
          code: error.code,
          textLength: text?.length || 0,
          options: options,
          timestamp: new Date().toISOString()
        });
        throw error;
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
    
    // Clear voice handler and project cache
    this.voiceHandler.cleanup();
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
  async handleModelCallback(data, chatId, messageId, userId) {
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
      await this.bot.editMessageText(
        `✅ *Model Changed*\n\n` +
        `📝 **Selected:** ${modelNames[action]} (\`${action}\`)\n` +
        `🔄 **Status:** active for new sessions\n\n` +
        `💡 Use /model to change model`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
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
      await this.bot.editMessageText(
        `✅ *Thinking Mode Changed*\n\n` +
        `${selectedMode.icon} **Selected:** ${selectedMode.name} ${this.getThinkingLevelIndicator(selectedMode.level)}\n` +
        `📝 **Description:** ${selectedMode.description}\n` +
        `🔄 **Status:** active for new messages\n\n` +
        `💡 Use /think to change thinking mode`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
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
      
      if (config.lastSession && config.lastSession.sessionId) {
        const session = config.lastSession;
        console.log(`[Session] Found last session ${session.sessionId.slice(-8)} for user ${session.userId}`);
        
        // Update bot options from saved session
        if (session.workingDirectory) {
          this.options.workingDirectory = session.workingDirectory;
        }
        if (session.model) {
          this.options.model = session.model;
        }
        
        return {
          userId: parseInt(session.userId),
          sessionId: session.sessionId,
          timestamp: session.timestamp,
          workingDirectory: session.workingDirectory,
          model: session.model
        };
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
            reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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
    
    // Unauthorized user
    console.log(`[Security] Blocked unauthorized user ${userId}`);
    
    // Send unauthorized message asynchronously
    setImmediate(() => {
      this.bot.sendMessage(chatId, 
        '🚫 *Access Denied*\n\n' +
        'This bot is private and only available to authorized users.\n\n' +
        '👤 Your User ID: `' + userId + '`',
        { parse_mode: 'Markdown' }
      ).catch(error => {
        console.error('Error sending unauthorized message:', error);
      });
    });
    
    return false;
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
      await this.sendSessionInit(chatId, session);
    } else {
      console.log(`[ProcessUserMessage] Using existing session for user ${userId}, message count: ${session.messageCount}`);
    }

    // Check if previous request is still processing
    if (session.processor.isActive()) {
      console.log(`[ProcessUserMessage] Previous request still processing for user ${userId}`);
      await this.bot.sendMessage(chatId, '⏳ *Processing previous request...*\nPlease wait or use /cancel', 
        { parse_mode: 'Markdown' });
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
}

// Export for use
module.exports = StreamTelegramBot;
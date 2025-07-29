/**
 * New Claude Code Telegram Bot with Stream-JSON Architecture
 * Based on Claudia's approach - no terminal interaction, direct stream processing
 */

const TelegramBot = require('node-telegram-bot-api');
const ClaudeStreamProcessor = require('./claude-stream-processor');
const TelegramFormatter = require('./telegram-formatter');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');

/**
 * Simple Typing Indicator for Telegram Bot
 * Shows typing action during Claude processing
 */
class ActivityIndicator {
  constructor(bot) {
    this.bot = bot;
    this.activeIndicators = new Map();
  }

  async start(chatId) {
    try {
      // Start typing indicator immediately
      await this.bot.sendChatAction(chatId, 'typing');

      // Continue typing indicator every 4 seconds to stay within 5s limit
      const typingInterval = setInterval(async () => {
        try {
          await this.bot.sendChatAction(chatId, 'typing');
        } catch (error) {
          console.error(`[ActivityIndicator] Typing error for chat ${chatId}:`, error.message);
        }
      }, 4000);

      // Store for cleanup
      this.activeIndicators.set(chatId, {
        typingInterval,
        startTime: Date.now()
      });

      console.log(`[ActivityIndicator] Started typing for chat ${chatId}`);
    } catch (error) {
      console.error(`[ActivityIndicator] Failed to start typing for chat ${chatId}:`, error.message);
    }
  }

  async stop(chatId) {
    const indicator = this.activeIndicators.get(chatId);
    if (!indicator) {
      return; // Already stopped or never started
    }

    // Clear typing interval
    clearInterval(indicator.typingInterval);

    // Calculate processing time
    const processingTime = Date.now() - indicator.startTime;
    console.log(`[ActivityIndicator] Stopped typing for chat ${chatId}, duration: ${processingTime}ms`);

    this.activeIndicators.delete(chatId);
  }

  // Emergency cleanup - stops all indicators
  cleanup() {
    console.log(`[ActivityIndicator] Emergency cleanup - stopping ${this.activeIndicators.size} typing indicators`);
    for (const [chatId, indicator] of this.activeIndicators) {
      clearInterval(indicator.typingInterval);
    }
    this.activeIndicators.clear();
  }

  // Get stats for debugging
  getStats() {
    return {
      activeIndicators: this.activeIndicators.size,
      indicators: Array.from(this.activeIndicators.keys())
    };
  }
}

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

    // Session management
    this.userSessions = new Map(); // userId -> { processor, sessionId, lastTodoMessageId, etc }
    this.activeProcessors = new Set();
    this.sessionStorage = new Map(); // userId -> { currentSessionId, sessionHistory: [] }
    this.pendingVoiceCommands = new Map(); // messageId -> { transcribedText, userId, chatId }
    this.projectCache = new Map(); // shortId -> fullPath
    this.projectCacheCounter = 0;

    // Activity indicator for showing processing status
    this.activityIndicator = new ActivityIndicator(this.bot);

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
    this.setupClaudeEventHandlers();

    // Restore last session from config file
    this.restoreLastSessionOnStartup();

    console.log('🤖 Stream Telegram Bot started');

    // Setup process cleanup for activity indicators
    this.setupProcessCleanup();
  }

  /**
   * Create persistent reply keyboard with useful buttons
   */
  createReplyKeyboard() {
    return {
      keyboard: [
        [
          { text: '🛑 STOP' },
          { text: '📊 Status' },
          { text: '📂 Projects' }
        ],
        [
          { text: '🔄 New Session' },
          { text: '📝 Sessions' },
          { text: '🤖 Model' }
        ],
        [
          { text: '🧠 Thinking' },
          { text: '📍 Path' },
          { text: '🔍 Git Diff' }
        ]
      ],
      resize_keyboard: true,
      persistent: true
    };
  }

  /**
   * Handle keyboard button presses
   */
  async handleKeyboardButton(msg) {
    const text = msg.text;
    const chatId = msg.chat.id;

    switch (text) {
      case '🛑 STOP':
        await this.cancelUserSession(chatId);
        await this.safeSendMessage(chatId, '🛑 *Emergency Stop*\n\nAll processes stopped.', {
          forceNotification: true,  // Critical user action
          reply_markup: this.createReplyKeyboard()
        });
        return true;

      case '📊 Status':
        await this.showSessionStatus(chatId);
        return true;

      case '📂 Projects':
        await this.showProjectSelection(chatId);
        return true;

      case '🔄 New Session':
        await this.startNewSession(chatId);
        await this.safeSendMessage(chatId, '🔄 *New Session*\n\nOld session ended, new session started.', {
          forceNotification: true,  // Important session action
          reply_markup: this.createReplyKeyboard()
        });
        return true;

      case '📝 Sessions':
        await this.showSessionHistory(chatId);
        return true;

      case '📍 Path':
        const currentDir = this.getCurrentDirectory(msg.from.id);
        await this.bot.sendMessage(chatId, `📍 *Current Path:*\n\n\`${currentDir}\``, {
          parse_mode: 'Markdown',
          reply_markup: this.createReplyKeyboard()
        });
        return true;

      case '🤖 Model':
        await this.showModelSelection(chatId);
        return true;

      case '🧠 Thinking':
        await this.showThinkingModeSelection(chatId);
        return true;

      case '🔍 Git Diff':
        await this.showGitDiff(chatId);
        return true;

      default:
        return false; // Not a keyboard button
    }
  }

  /**
   * Setup Telegram bot event handlers
   */
  setupEventHandlers() {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      try {
        // Always check admin access first (auto-assign first user if needed)
        if (!this.checkAdminAccess(msg.from.id, msg.chat.id)) {
          return; // Access denied message already sent
        }

        if (msg.text && !msg.text.startsWith('/')) {
          // Check if it's a keyboard button press
          if (await this.handleKeyboardButton(msg)) {
            return; // Button handled, don't process as regular message
          }

          await this.handleUserMessage(msg);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        await this.sendError(msg.chat.id, error);
      }
    });

    // Handle voice messages (if Nexara API is configured)
    this.bot.on('voice', async (msg) => {
      try {
        await this.handleVoiceMessage(msg);
      } catch (error) {
        console.error('Error handling voice:', error);
        await this.sendError(msg.chat.id, error);
      }
    });

    // Commands
    this.bot.onText(/\/start/, async (msg) => {
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
        reply_markup: this.createReplyKeyboard()
      });
    });

    this.bot.onText(/\/cancel/, async (msg) => {
      await this.cancelUserSession(msg.chat.id);
      await this.safeSendMessage(msg.chat.id, '🛑 *Session Cancelled*\n\nAll processes stopped.', {
        forceNotification: true,  // Critical user action
        reply_markup: this.createReplyKeyboard()
      });
    });

    // Handle callback queries for directory selection
    this.bot.on('callback_query', async (query) => {
      const data = query.data;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;

      try {
        if (data.startsWith('setdir:')) {
          const dirAction = data.replace('setdir:', '');

          if (dirAction === 'refresh') {
            await this.bot.deleteMessage(chatId, messageId);
            await this.showProjectSelection(chatId);
          } else {
            await this.handleDirectoryChange(dirAction, chatId, messageId);
          }
        } else if (data.startsWith('voice_')) {
          await this.handleVoiceCallback(data, chatId, messageId, query.from.id);
        } else if (data.startsWith('resume_session:')) {
          const sessionId = data.replace('resume_session:', '');
          const userId = this.getUserIdFromChat(chatId);
          // Update access time when resuming session
          this.storeSessionId(userId, sessionId);
          // Save to config for persistence
          await this.saveCurrentSessionToConfig(userId, sessionId);
          await this.handleSessionResume(sessionId, chatId, messageId, query.from.id);
        } else if (data.startsWith('model:')) {
          await this.handleModelCallback(data, chatId, messageId, query.from.id);
        } else if (data.startsWith('thinking:')) {
          await this.handleThinkingModeCallback(data, chatId, messageId, query.from.id);
        } else if (data.startsWith('diff:')) {
          await this.handleDiffCallback(data, chatId, messageId, query.from.id);
        } else if (data.startsWith('session_page:')) {
          const page = parseInt(data.replace('session_page:', ''));
          await this.handleSessionPageCallback(page, chatId, messageId, query.from.id);
        } else if (data === 'page_info') {
          // Just answer the callback - page info button is non-interactive
          await this.bot.answerCallbackQuery(query.id, { text: 'Page indicator' });
          return;
        }

        await this.bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error('Callback query error:', error);

        // Handle specific Telegram errors
        if (error.code === 'ETELEGRAM') {
          if (error.response?.body?.includes('BUTTON_DATA_INVALID')) {
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
      await this.showSessionStatus(msg.chat.id);
    });

    this.bot.onText(/\/new/, async (msg) => {
      await this.startNewSession(msg.chat.id);
    });

    this.bot.onText(/\/end/, async (msg) => {
      await this.endSession(msg.chat.id);
    });

    this.bot.onText(/\/sessions/, async (msg) => {
      await this.showSessionHistory(msg.chat.id);
    });

    this.bot.onText(/\/cd/, async (msg) => {
      await this.showProjectSelection(msg.chat.id);
    });

    this.bot.onText(/\/pwd/, async (msg) => {
      await this.showCurrentDirectory(msg.chat.id);
    });

    // Model selection commands
    this.bot.onText(/\/sonnet/, async (msg) => {
      await this.setModel(msg.chat.id, 'sonnet', 'Claude 4 Sonnet');
    });

    this.bot.onText(/\/opus/, async (msg) => {
      await this.setModel(msg.chat.id, 'opus', 'Claude 4 Opus');
    });

    this.bot.onText(/\/model/, async (msg) => {
      await this.showModelSelection(msg.chat.id);
    });

    this.bot.onText(/\/think/, async (msg) => {
      await this.showThinkingModeSelection(msg.chat.id);
    });

    // Git diff command
    this.bot.onText(/\/diff/, async (msg) => {
      await this.showGitDiff(msg.chat.id);
    });
  }

  /**
   * Setup Claude stream processor event handlers
   */
  setupClaudeEventHandlers() {
    // This will be called for each new processor
    // We'll set up events when we create processors
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
      this.pendingVoiceCommands.set(confirmMsg.message_id, {
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
   * Create new user session with Claude processor
   */
  async createUserSession(userId, chatId) {
    console.log(`[User ${userId}] Creating new session`);

    // Use user's preferred model or default to bot's model
    const userModel = this.getUserModel(userId) || this.options.model;

    const processor = new ClaudeStreamProcessor({
      model: userModel,
      workingDirectory: this.options.workingDirectory
    });

    const session = {
      userId,
      chatId,
      processor,
      messageCount: 0,
      lastTodoMessageId: null,
      lastTodos: null,
      createdAt: new Date()
    };

    // Setup event handlers for this processor
    this.setupProcessorEvents(processor, session);

    this.userSessions.set(userId, session);
    this.activeProcessors.add(processor);

    return session;
  }

  /**
   * Setup event handlers for a Claude processor
   */
  setupProcessorEvents(processor, session) {
    const { chatId, userId } = session;

    // Session initialization
    processor.on('session-init', async (data) => {
      console.log(`[User ${userId}] Session initialized: ${data.sessionId}`);

      // Store session ID for user in memory
      this.storeSessionId(userId, data.sessionId);
      session.sessionId = data.sessionId;

      // IMPORTANT: Save session to config file immediately for persistence across bot restarts
      await this.saveCurrentSessionToConfig(userId, data.sessionId);

      const formatted = this.formatter.formatSessionInit(data);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // Assistant text responses
    processor.on('assistant-text', async (data) => {
      console.log(`[User ${userId}] Assistant text: ${data.text.substring(0, 100)}...`);

      // Typing indicator continues automatically

      const formatted = this.formatter.formatAssistantText(data.text);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // Thinking processes
    processor.on('assistant-thinking', async (data) => {
      console.log(`[User ${userId}] Claude thinking`);
      const formatted = this.formatter.formatThinking(data.thinking, data.signature);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // TodoWrite - with live updating
    processor.on('todo-write', async (data) => {
      console.log(`[User ${userId}] TodoWrite: ${data.todos.length} todos`);
      await this.handleTodoWrite(session, data.todos, data.toolId);
    });

    // File operations
    processor.on('file-edit', async (data) => {
      console.log(`[User ${userId}] File edit: ${data.filePath}`);
      const formatted = this.formatter.formatFileEdit(data.filePath, data.oldString, data.newString);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    processor.on('file-write', async (data) => {
      console.log(`[User ${userId}] File write: ${data.filePath}`);
      const formatted = this.formatter.formatFileWrite(data.filePath, data.content);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    processor.on('file-read', async (data) => {
      console.log(`[User ${userId}] File read: ${data.filePath}`);
      const formatted = this.formatter.formatFileRead(data.filePath);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // Bash commands
    processor.on('bash-command', async (data) => {
      console.log(`[User ${userId}] Bash: ${data.command}`);
      const formatted = this.formatter.formatBashCommand(data.command, data.description);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // Task spawning
    processor.on('task-spawn', async (data) => {
      console.log(`[User ${userId}] Task: ${data.description}`);
      const formatted = this.formatter.formatTaskSpawn(data.description, data.prompt, data.subagentType);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // MCP tools
    processor.on('mcp-tool', async (data) => {
      console.log(`[User ${userId}] MCP tool: ${data.toolName}`);
      const formatted = this.formatter.formatMCPTool(data.toolName, data.input);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // Tool results - we can enhance tool messages with results
    processor.on('tool-result', async (data) => {
      // Tool results are automatically integrated - we don't need separate messages
      console.log(`[User ${userId}] Tool result for: ${data.toolUseId}`);
    });

    // Execution completion
    processor.on('complete', async (data) => {
      console.log(`[User ${userId}] Execution complete: ${data.success}`);

      // Stop typing indicator when Claude finishes
      await this.activityIndicator.stop(chatId);

      const formatted = this.formatter.formatExecutionResult(data, session.sessionId);
      await this.safeSendMessage(chatId, formatted.text, { parse_mode: formatted.parse_mode });
    });

    // Errors
    processor.on('error', async (error) => {
      console.error(`[User ${userId}] Claude error:`, error);

      // Stop typing indicator on error
      await this.activityIndicator.stop(chatId);

      await this.sendError(chatId, error);
    });
  }

  /**
   * Handle TodoWrite with live updating
   */
  async handleTodoWrite(session, todos, toolId) {
    const { chatId, lastTodoMessageId, lastTodos } = session;

    // Check if todos changed
    if (lastTodos && !this.formatter.todosChanged(lastTodos, todos)) {
      console.log(`[User ${session.userId}] Todos unchanged, skipping update`);
      return;
    }

    const formatted = this.formatter.formatTodoWrite(todos);

    try {
      if (lastTodoMessageId) {
        // Try to edit existing message
        try {
          await this.bot.editMessageText(formatted.text, {
            chat_id: chatId,
            message_id: lastTodoMessageId,
            parse_mode: formatted.parse_mode
          });

          console.log(`[User ${session.userId}] Updated todo message ${lastTodoMessageId}`);

        } catch (editError) {
          // If edit fails (message too old, etc.), send new message
          console.log(`[User ${session.userId}] Edit failed, sending new todo message`);
          const newMessage = await this.bot.sendMessage(chatId, formatted.text,
            { parse_mode: formatted.parse_mode });
          session.lastTodoMessageId = newMessage.message_id;
        }
      } else {
        // Send new message
        const newMessage = await this.bot.sendMessage(chatId, formatted.text,
          { parse_mode: formatted.parse_mode });
        session.lastTodoMessageId = newMessage.message_id;
        console.log(`[User ${session.userId}] Created new todo message ${newMessage.message_id}`);
      }

      // Update stored todos
      session.lastTodos = todos;

    } catch (error) {
      console.error(`[User ${session.userId}] Error updating todos:`, error);
    }
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
   * Cancel user session
   */
  async cancelUserSession(chatId) {
    const userId = this.getUserIdFromChat(chatId);
    const session = this.userSessions.get(userId);

    if (session && session.processor) {
      session.processor.cancel();
      await this.safeSendMessage(chatId, '❌ *Session cancelled*', { parse_mode: 'Markdown' });
    } else {
      await this.safeSendMessage(chatId, '⚠️ *No active session to cancel*', { parse_mode: 'Markdown' });
    }
  }

  /**
   * Show session status
   */
  async showSessionStatus(chatId) {
    const userId = this.getUserIdFromChat(chatId);
    const session = this.userSessions.get(userId);
    const storedSessionId = this.getStoredSessionId(userId);
    const sessionHistory = this.getSessionHistory(userId);

    // Check if we have any session info (active or stored)
    if (!session && !storedSessionId) {
      await this.bot.sendMessage(chatId, '📋 *No active session*\n\nSend a message to start!',
        { parse_mode: 'Markdown' });
      return;
    }

    let text = `📊 *Session Status*\n\n`;

    if (session) {
      // Active session exists
      const isActive = session.processor.isActive();
      const sessionId = session.sessionId || session.processor.getCurrentSessionId();
      const messageCount = session.messageCount;
      const uptime = Math.round((Date.now() - session.createdAt.getTime()) / 1000);

      text += `🆔 *Current:* \`${sessionId ? sessionId.slice(-8) : 'Not started'}\`\n`;
      text += `📋 *Stored:* \`${storedSessionId ? storedSessionId.slice(-8) : 'None'}\`\n`;
      text += `📊 *Status:* ${isActive ? '🔄 Processing' : '💤 Idle'}\n`;
      text += `💬 *Messages:* ${messageCount}\n`;
      text += `⏱ *Uptime:* ${uptime}s\n`;
    } else if (storedSessionId) {
      // Only stored session exists (bot was restarted)
      text += `🆔 *Current:* 💤 *Not active*\n`;
      text += `📋 *Stored:* \`${storedSessionId.slice(-8)}\` *(can resume)*\n`;
      text += `📊 *Status:* ⏸️ *Paused (bot restarted)*\n`;
      text += `💬 *Messages:* -\n`;
      text += `⏱ *Uptime:* -\n`;
      text += `\n💡 *Send a message to resume this session*\n`;
    }

    text += `📁 *Directory:* ${path.basename(this.options.workingDirectory)}\n`;
    text += `📚 *History:* ${sessionHistory.length} sessions\n`;
    text += `🤖 *Model:* ${this.options.model}`;

    await this.safeSendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  /**
   * Start new session (reset current)
   */
  async startNewSession(chatId) {
    const userId = this.getUserIdFromChat(chatId);

    // Cancel existing session
    const existingSession = this.userSessions.get(userId);
    if (existingSession) {
      // Store old session ID in history
      if (existingSession.sessionId) {
        this.addSessionToHistory(userId, existingSession.sessionId);
      }

      existingSession.processor.cancel();
      this.activeProcessors.delete(existingSession.processor);
      this.userSessions.delete(userId);
    }

    // Clear current session ID to force new session
    this.clearCurrentSessionId(userId);

    // Create new session
    const session = await this.createUserSession(userId, chatId);
    await this.sendSessionInit(chatId, session);

    await this.bot.sendMessage(chatId,
      `🆕 *New session started*\n\n` +
      `📁 **Directory:** ${path.basename(this.options.workingDirectory)}\n` +
      `Previous session saved to history.\n` +
      `Use /sessions to view session history.`,
      {
        parse_mode: 'Markdown',
        reply_markup: this.createReplyKeyboard()
      }
    );
  }

  /**
   * End current session
   */
  async endSession(chatId) {
    const userId = this.getUserIdFromChat(chatId);
    const session = this.userSessions.get(userId);

    if (!session) {
      await this.bot.sendMessage(chatId, '⚠️ *No active session to end*', {
        parse_mode: 'Markdown',
        reply_markup: this.createReplyKeyboard()
      });
      return;
    }

    // Store session ID in history
    if (session.sessionId) {
      this.addSessionToHistory(userId, session.sessionId);
    }

    // Cancel session
    session.processor.cancel();
    this.activeProcessors.delete(session.processor);
    this.userSessions.delete(userId);

    // Clear current session ID
    this.clearCurrentSessionId(userId);

    const messageCount = session.messageCount;
    const uptime = Math.round((Date.now() - session.createdAt.getTime()) / 1000);

    await this.bot.sendMessage(chatId,
      `🔚 *Session ended*\n\n` +
      `💬 Messages: ${messageCount}\n` +
      `⏱ Duration: ${uptime}s\n` +
      `📁 Directory: ${path.basename(this.options.workingDirectory)}\n\n` +
      `Session saved to history.\n` +
      `Use /new to start a new session.`,
      {
        parse_mode: 'Markdown',
        reply_markup: this.createReplyKeyboard()
      }
    );
  }

  /**
   * Show session history (reads from Claude Code files)
   *
   * Features:
   * - Reads session files from ~/.claude/projects/<project-dir>/
   * - Supports both 'summary' type and 'user' type sessions
   * - Handles string and array message content
   * - Shows 5 sessions per page with pagination navigation
   * - Includes quick resume buttons for all displayed sessions
   * - Displays human-readable time stamps
   * - Shows current project directory
   */
  async showSessionHistory(chatId, page = 0) {
    const userId = this.getUserIdFromChat(chatId);
    const currentSessionId = this.getStoredSessionId(userId);
    const currentDirectory = this.getCurrentDirectory(userId);

    try {
      const sessions = await this.readClaudeCodeSessions(currentDirectory, userId);
      const pageSize = 5;
      const totalPages = Math.ceil(sessions.length / pageSize);
      const startIndex = page * pageSize;
      const endIndex = startIndex + pageSize;
      const displayedSessions = sessions.slice(startIndex, endIndex);

      let text = '📚 *Session History*\n\n';

      if (currentDirectory) {
        text += `📁 *Project:* \`${currentDirectory.replace(process.env.HOME, '~')}\`\n\n`;
      }

      if (currentSessionId) {
        text += `🔄 *Current:* \`${currentSessionId.slice(-8)}\`\n\n`;
      }

      if (sessions.length === 0) {
        text += 'No previous sessions found in this project.\n\n';
        text += 'Send a message to start your first session!';

        await this.safeSendMessage(chatId, text, { parse_mode: 'Markdown' });
      } else {
        // Show pagination info
        if (totalPages > 1) {
          text += `*Page ${page + 1} of ${totalPages}* (${sessions.length} total sessions)\n\n`;
        } else {
          text += `*${sessions.length} session${sessions.length === 1 ? '' : 's'} found*\n\n`;
        }

        displayedSessions.forEach((session, index) => {
          const shortId = session.sessionId.slice(-8);
          const timeAgo = this.getTimeAgo(session.timestamp);
          let preview = session.preview;

          // Truncate preview if too long
          if (preview.length > 80) {
            preview = preview.substring(0, 80) + '...';
          }

          text += `${startIndex + index + 1}. \`${shortId}\` • ${timeAgo}\n`;
          text += `   💬 _${preview}_\n\n`;
        });

        text += '💡 Tap a session number to resume it';

        // Create inline keyboard
        const keyboard = {
          inline_keyboard: []
        };

        // Session resume buttons (single row of up to 5 numbers)
        const resumeRow = displayedSessions.map((session, index) => ({
          text: `${startIndex + index + 1}`,
          callback_data: `resume_session:${session.sessionId}`
        }));
        keyboard.inline_keyboard.push(resumeRow);

        // Pagination buttons (if more than one page)
        if (totalPages > 1) {
          const paginationRow = [];

          // Previous button
          if (page > 0) {
            paginationRow.push({
              text: '◀️ Previous',
              callback_data: `session_page:${page - 1}`
            });
          }

          // Page indicator
          paginationRow.push({
            text: `${page + 1}/${totalPages}`,
            callback_data: 'page_info'
          });

          // Next button
          if (page < totalPages - 1) {
            paginationRow.push({
              text: 'Next ▶️',
              callback_data: `session_page:${page + 1}`
            });
          }

          keyboard.inline_keyboard.push(paginationRow);
        }

        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }

    } catch (error) {
      console.error('[showSessionHistory] Error:', error);
      await this.bot.sendMessage(chatId,
        '❌ Error reading session history.\n\n' +
        'Make sure you have selected a project with `/cd` command.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Get Claude projects from ~/.claude.json
   */
  getClaudeProjects() {
    try {
      const claudeConfigPath = path.join(os.homedir(), '.claude.json');

      if (!fsSync.existsSync(claudeConfigPath)) {
        console.log('⚠️ ~/.claude.json not found');
        return [];
      }

      const claudeConfig = JSON.parse(fsSync.readFileSync(claudeConfigPath, 'utf8'));

      if (!claudeConfig.projects) {
        console.log('⚠️ No projects section found in ~/.claude.json');
        return [];
      }

      // Get all directories and filter existing ones
      const projectDirs = Object.keys(claudeConfig.projects).filter(dir => {
        return fsSync.existsSync(dir) && fsSync.statSync(dir).isDirectory();
      });

      // Sort by last used if available
      return projectDirs.sort((a, b) => {
        const aTime = claudeConfig.projects[a]?.lastUsed || 0;
        const bTime = claudeConfig.projects[b]?.lastUsed || 0;
        return bTime - aTime; // Newest first
      });

    } catch (error) {
      console.error('Error reading Claude config:', error.message);
      return [];
    }
  }

  /**
   * Show project selection with inline keyboard
   */
  async showProjectSelection(chatId) {
    const projects = this.getClaudeProjects();

    if (projects.length === 0) {
      await this.bot.sendMessage(chatId,
        `📁 *Current Directory*\n${this.options.workingDirectory}\n\n` +
        `❌ No Claude projects found\n` +
        `💡 Open projects in Claude Code first`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Clear old cache and create new short IDs
    this.projectCache.clear();
    this.projectCacheCounter = 0;

    // Create inline buttons for projects with short IDs
    const buttons = projects.slice(0, 15).map(projectPath => {
      const projectName = path.basename(projectPath);
      const isCurrentDir = projectPath === this.options.workingDirectory;
      const buttonText = isCurrentDir ? `✅ ${projectName}` : `📁 ${projectName}`;

      // Create short ID and cache the full path
      const shortId = `p${this.projectCacheCounter++}`;
      this.projectCache.set(shortId, projectPath);

      return [{
        text: buttonText,
        callback_data: `setdir:${shortId}`
      }];
    });

    // Add refresh button
    buttons.push([{
      text: '🔄 Refresh Projects',
      callback_data: 'setdir:refresh'
    }]);

    const keyboard = { inline_keyboard: buttons };

    await this.bot.sendMessage(chatId,
      `📁 *Current Directory*\n${this.options.workingDirectory}\n\n` +
      `📋 *Select Claude Project:*\n` +
      `(Showing ${Math.min(projects.length, 15)} projects)`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
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
        reply_markup: this.createReplyKeyboard()
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
    const session = this.userSessions.get(userId);
    const sessionInfo = session ? `\n\n⚠️ *Current session:* will use new model on next message` : '';

    await this.safeSendMessage(chatId,
      `🤖 *Model Changed*\n\n` +
      `📝 **Selected:** ${modelName} (\`${model}\`)\n` +
      `🔄 **Status:** active for new sessions${sessionInfo}`,
      {
        forceNotification: true,  // Important user setting change
        reply_markup: this.createReplyKeyboard()
      }
    );
  }

  /**
   * Show model selection with inline keyboard
   */
  async showModelSelection(chatId) {
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
  storeUserThinkingMode(userId, thinkingMode) {
    if (!this.userPreferences) {
      this.userPreferences = new Map();
    }
    this.userPreferences.set(`${userId}_thinking`, thinkingMode);
  }

  /**
   * Get user's thinking mode preference
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
   * Handle directory change
   */
  async handleDirectoryChange(dirAction, chatId, messageId = null) {
    try {
      // Get actual path from cache or use directly
      let actualPath = dirAction;

      // Check if it's a cached short ID
      if (this.projectCache.has(dirAction)) {
        actualPath = this.projectCache.get(dirAction);
      }

      // Check if directory exists
      if (!fsSync.existsSync(actualPath)) {
        const errorMsg = `❌ Directory not found: ${actualPath}`;
        if (messageId) {
          await this.bot.editMessageText(errorMsg, {
            chat_id: chatId,
            message_id: messageId
          });
        } else {
          await this.bot.sendMessage(chatId, errorMsg);
        }
        return;
      }

      // Check if it's actually a directory
      const stats = fsSync.statSync(actualPath);
      if (!stats.isDirectory()) {
        const errorMsg = `❌ Not a directory: ${actualPath}`;
        if (messageId) {
          await this.bot.editMessageText(errorMsg, {
            chat_id: chatId,
            message_id: messageId
          });
        } else {
          await this.bot.sendMessage(chatId, errorMsg);
        }
        return;
      }

      // Update working directory
      this.options.workingDirectory = actualPath;

      const successMsg =
        `✅ *Directory Changed*\n\n` +
        `📁 **New Directory:**\n\`${actualPath}\`\n\n` +
        `💡 New sessions will use this directory\n` +
        `🔄 Use /new to start fresh session here`;

      if (messageId) {
        await this.bot.editMessageText(successMsg, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      } else {
        await this.safeSendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
      }

      console.log(`[Bot] Directory changed to: ${actualPath}`);

    } catch (error) {
      const errorMsg = `❌ Error: ${error.message}`;
      if (messageId) {
        await this.bot.editMessageText(errorMsg, {
          chat_id: chatId,
          message_id: messageId
        });
      } else {
        await this.bot.sendMessage(chatId, errorMsg);
      }
    }
  }

  /**
   * Send error message
   */
  async sendError(chatId, error) {
    const formatted = this.formatter.formatError(error);
    await this.safeSendMessage(chatId, formatted.text, {
      forceNotification: true  // Always notify for internal errors
    });
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
   * Show git diff with mobile-friendly pagination
   */
  async showGitDiff(chatId, options = {}) {
    const {
      mode = 'overview',
      page = 0,
      fileIndex = 0,
      contextLines = 3,
      wordDiff = false
    } = options;

    try {
      // Check if we're in a git repository
      const isGitRepo = await this.checkGitRepository();
      if (!isGitRepo) {
        await this.bot.sendMessage(chatId,
          '❌ *Not a Git Repository*\n\n' +
          'This directory is not a git repository.\n' +
          'Use `📂 Projects` to navigate to a git project.',
          {
            parse_mode: 'Markdown',
            reply_markup: this.createReplyKeyboard()
          }
        );
        return;
      }

      // Get git status first
      const gitStatus = await this.getGitStatus();

      if (mode === 'overview') {
        await this.showDiffOverview(chatId, gitStatus);
      } else if (mode === 'files') {
        await this.showDiffFileList(chatId, gitStatus, page);
      } else if (mode === 'file') {
        await this.showDiffFile(chatId, gitStatus, fileIndex, contextLines, wordDiff);
      }

    } catch (error) {
      console.error('[Git Diff] Error:', error);
      await this.bot.sendMessage(chatId,
        `❌ *Git Diff Error*\n\n\`${error.message}\``,
        {
          parse_mode: 'Markdown',
          reply_markup: this.createReplyKeyboard()
        }
      );
    }
  }

  /**
   * Check if current directory is a git repository
   */
  async checkGitRepository() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      await execAsync('git rev-parse --git-dir', {
        cwd: this.options.workingDirectory
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get git status and diff statistics
   */
  async getGitStatus() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const cwd = this.options.workingDirectory;

    try {
      // Get basic status (includes untracked files)
      const statusResult = await execAsync('git status --porcelain', { cwd });
      const modifiedFiles = statusResult.stdout.trim().split('\n').filter(line => line.trim());

      // Get diff stats (includes both staged and unstaged changes)
      const statsResult = await execAsync('git diff HEAD --stat --color=never', { cwd });
      const diffStats = statsResult.stdout.trim();

      // Get file details (includes both staged and unstaged changes)
      const nameStatusResult = await execAsync('git diff HEAD --name-status', { cwd });
      const gitDiffNameStatus = nameStatusResult.stdout.trim().split('\n').filter(line => line.trim());

      // Get numeric stats (includes both staged and unstaged changes)
      const numStatsResult = await execAsync('git diff HEAD --numstat', { cwd });
      const numStats = numStatsResult.stdout.trim().split('\n').filter(line => line.trim());

      // Parse git status --porcelain to get ALL files including untracked
      const allFiles = [];
      const allNumStats = [];

      modifiedFiles.forEach(line => {
        const status = line.substring(0, 2);
        const filename = line.substring(3);

        if (status.includes('??')) {
          // Untracked file - get line count
          allFiles.push(`??	${filename}`);
          // For untracked files, count lines and show as all added
          try {
            const fs = require('fs');
            const filePath = path.join(cwd, filename);
            const content = fs.readFileSync(filePath, 'utf8');
            const lineCount = content.split('\n').length;
            allNumStats.push(`${lineCount}	0	${filename}`);
          } catch (error) {
            allNumStats.push(`0	0	${filename}`);
          }
        } else if (status.includes('A')) {
          // Added file (staged)
          allFiles.push(`A	${filename}`);
        } else if (status.includes('M')) {
          // Modified file - use 'M' regardless of position
          allFiles.push(`M	${filename}`);
        } else if (status.includes('D')) {
          // Deleted file
          allFiles.push(`D	${filename}`);
        } else if (status.includes('R')) {
          // Renamed file
          allFiles.push(`R	${filename}`);
        } else {
          // Other status, use first non-space character
          const statusChar = status.trim() || status.charAt(0);
          allFiles.push(`${statusChar}	${filename}`);
        }
      });

      // Use combined file list (git diff + untracked files) as nameStatus
      const nameStatus = allFiles.length > 0 ? allFiles : gitDiffNameStatus;

      // Combine numStats from git diff with untracked file stats
      const combinedNumStats = [...numStats, ...allNumStats];

      return {
        modifiedFiles,
        diffStats,
        nameStatus,
        numStats: combinedNumStats,
        hasChanges: modifiedFiles.length > 0 || diffStats.length > 0
      };

    } catch (error) {
      throw new Error(`Git status failed: ${error.message}`);
    }
  }

  /**
   * Show diff overview with summary and navigation
   */
  async showDiffOverview(chatId, gitStatus) {
    if (!gitStatus.hasChanges) {
      await this.bot.sendMessage(chatId,
        '✅ *No Changes*\n\n' +
        'Working directory is clean.\n' +
        'All changes are committed.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🔄 Refresh', callback_data: 'diff:refresh' }
            ]]
          }
        }
      );
      return;
    }

    // Parse statistics
    const fileCount = gitStatus.nameStatus.length;
    let addedLines = 0;
    let removedLines = 0;

    gitStatus.numStats.forEach(line => {
      const [added, removed] = line.split('\t');
      if (added !== '-') addedLines += parseInt(added) || 0;
      if (removed !== '-') removedLines += parseInt(removed) || 0;
    });

    // Create summary
    let text = '📊 *Git Diff Overview*\n\n';
    text += `📁 **Directory:** ${path.basename(this.options.workingDirectory)}\n`;
    text += `📋 **Files changed:** ${fileCount}\n`;
    text += `➕ **Added lines:** ${addedLines}\n`;
    text += `➖ **Removed lines:** ${removedLines}\n\n`;

    // Show top 5 files preview
    if (gitStatus.nameStatus.length > 0) {
      text += '*📝 Changed files:*\n';
      gitStatus.nameStatus.slice(0, 5).forEach((line, index) => {
        const [status, filename] = line.split('\t');
        const icon = status.includes('M') ? '📝' : status.includes('A') ? '➕' : status.includes('D') ? '➖' : status === '??' ? '🆕' : '🔄';
        const shortName = path.basename(filename);
        text += `${icon} \`${shortName}\`\n`;
      });

      if (gitStatus.nameStatus.length > 5) {
        text += `... and ${gitStatus.nameStatus.length - 5} more files\n`;
      }
    }

    text += '\n💡 Choose view mode:';

    // Create navigation keyboard
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 File List', callback_data: 'diff:files:0' },
          { text: '📄 File Details', callback_data: 'diff:file:0' }
        ],
        [
          { text: '📊 Stats Only', callback_data: 'diff:stats' },
          { text: '🔄 Refresh', callback_data: 'diff:refresh' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Show paginated file list with status
   */
  async showDiffFileList(chatId, gitStatus, page = 0) {
    const filesPerPage = 6;
    const startIndex = page * filesPerPage;
    const endIndex = startIndex + filesPerPage;
    const files = gitStatus.nameStatus.slice(startIndex, endIndex);
    const totalPages = Math.ceil(gitStatus.nameStatus.length / filesPerPage);

    let text = `📋 *Changed Files* (Page ${page + 1}/${totalPages})\n\n`;

    // Show files with stats
    for (let i = 0; i < files.length; i++) {
      const [status, filename] = files[i].split('\t');
      const globalIndex = startIndex + i;
      const numStatLine = gitStatus.numStats[globalIndex] || '';
      const [added = '0', removed = '0'] = numStatLine.split('\t');

      const icon = status === 'M' ? '📝' : status === 'A' ? '➕' : status === 'D' ? '➖' : '🔄';
      const shortName = path.basename(filename);

      text += `${icon} \`${shortName}\`\n`;
      if (added !== '-' && removed !== '-') {
        text += `   +${added} -${removed} lines\n`;
      }
      text += '\n';
    }

    // Create navigation keyboard
    const keyboard = {
      inline_keyboard: []
    };

    // File selection buttons (2 per row)
    for (let i = 0; i < files.length; i += 2) {
      const row = [];

      // First file
      const index1 = startIndex + i;
      const file1 = files[i].split('\t')[1];
      row.push({
        text: `${i + 1}. ${path.basename(file1).substring(0, 15)}`,
        callback_data: `diff:file:${index1}`
      });

      // Second file (if exists)
      if (i + 1 < files.length) {
        const index2 = startIndex + i + 1;
        const file2 = files[i + 1].split('\t')[1];
        row.push({
          text: `${i + 2}. ${path.basename(file2).substring(0, 15)}`,
          callback_data: `diff:file:${index2}`
        });
      }

      keyboard.inline_keyboard.push(row);
    }

    // Navigation buttons
    const navRow = [];
    if (page > 0) {
      navRow.push({ text: '⬅️ Prev', callback_data: `diff:files:${page - 1}` });
    }
    navRow.push({ text: '🏠 Overview', callback_data: 'diff:overview' });
    if (page < totalPages - 1) {
      navRow.push({ text: 'Next ➡️', callback_data: `diff:files:${page + 1}` });
    }
    keyboard.inline_keyboard.push(navRow);

    await this.bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Format untracked file content with pagination support
   */
  async formatUntrackedFileContent(filename, cwd, page = 0) {
    const fs = require('fs');
    const filePath = path.join(cwd, filename);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const shortName = path.basename(filename);

      // Pagination settings
      const linesPerPage = 40;
      const totalPages = Math.ceil(lines.length / linesPerPage);
      const startLine = page * linesPerPage;
      const endLine = Math.min(startLine + linesPerPage, lines.length);
      const displayLines = lines.slice(startLine, endLine);

      let formattedDiff = `🆕 <b>${this.escapeHtml(shortName)}</b> (new file)\n`;

      // Add pagination info if multiple pages
      if (totalPages > 1) {
        formattedDiff += `📄 <i>Page ${page + 1} of ${totalPages} (lines ${startLine + 1}-${endLine} of ${lines.length})</i>\n`;
      } else {
        formattedDiff += `📄 <i>${lines.length} lines</i>\n`;
      }

      formattedDiff += '\n<pre><code>';

      displayLines.forEach((line, index) => {
        const lineNumber = startLine + index + 1;
        formattedDiff += `${lineNumber}: ${this.escapeHtml(line)}\n`;
      });

      formattedDiff += '</code></pre>';

      return {
        content: formattedDiff,
        totalPages,
        currentPage: page,
        totalLines: lines.length
      };

    } catch (readError) {
      return {
        content: `❌ <b>Cannot read file: ${this.escapeHtml(path.basename(filename))}</b>\n\nError: ${readError.message}`,
        totalPages: 1,
        currentPage: 0,
        totalLines: 0
      };
    }
  }

  /**
   * Show detailed diff for a specific file
   */
  async showDiffFile(chatId, gitStatus, fileIndex = 0, contextLines = 3, wordDiff = false) {
    if (fileIndex >= gitStatus.nameStatus.length) {
      await this.bot.sendMessage(chatId, '❌ File not found');
      return;
    }

    const [status, filename] = gitStatus.nameStatus[fileIndex].split('\t');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const cwd = this.options.workingDirectory;

    try {
      let formattedDiff;

      if (status === '??') {
        // For untracked files, show the file content with pagination
        const untrackedResult = await this.formatUntrackedFileContent(filename, cwd, 0);
        formattedDiff = untrackedResult.content;

        // Store pagination info for later use
        this.untrackedFilePagination = {
          fileIndex,
          filename,
          totalPages: untrackedResult.totalPages,
          currentPage: untrackedResult.currentPage,
          totalLines: untrackedResult.totalLines
        };
      } else {
        // For tracked files, use git diff
        let diffCommand = `git diff HEAD --color=never --unified=${contextLines}`;
        if (wordDiff) {
          diffCommand += ' --word-diff=porcelain';
        }
        diffCommand += ` -- "${filename}"`;

        const diffResult = await execAsync(diffCommand, { cwd });
        const diffOutput = diffResult.stdout;

        // Parse and format diff
        formattedDiff = this.formatDiffForTelegram(diffOutput, filename, contextLines);
      }

      // Split into chunks if too long (Telegram limit ~4096 chars)
      const chunks = this.splitIntoChunks(formattedDiff, 3800);

      // Show first chunk with navigation
      await this.sendDiffChunk(chatId, chunks, 0, {
        filename,
        fileIndex,
        contextLines,
        wordDiff,
        status,
        totalFiles: gitStatus.nameStatus.length
      });

    } catch (error) {
      await this.bot.sendMessage(chatId,
        `❌ *Error reading diff for ${path.basename(filename)}*\n\n\`${error.message}\``,
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Format git diff output for Telegram display
   */
  formatDiffForTelegram(diffOutput, filename, contextLines) {
    const lines = diffOutput.split('\n');
    const shortName = path.basename(filename);

    // Safely escape filename for markdown
    const escapedFilename = this.escapeMarkdown(shortName);
    let formatted = `📄 *${escapedFilename}*\n\n`;
    let inHunk = false;

    for (let line of lines) {
      // Skip git metadata lines except hunk headers
      if (line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('+++') ||
        line.startsWith('---')) {
        continue;
      }

      // Hunk header - escape and display safely
      if (line.startsWith('@@')) {
        if (inHunk) formatted += '```\n\n';

        // Clean hunk header and display in code format to avoid markdown issues
        const cleanHunkLine = this.escapeForCodeBlock(line);
        formatted += `🔹 \`${cleanHunkLine}\`\n`;
        formatted += '```diff\n';
        inHunk = true;
        continue;
      }

      if (inHunk) {
        // Thoroughly clean line content
        let cleanLine = this.escapeForCodeBlock(line);

        // Limit line length to prevent overflow
        if (cleanLine.length > 100) {
          cleanLine = cleanLine.substring(0, 97) + '...';
        }

        // Only add proper diff lines
        if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line.trim() === '') {
          formatted += cleanLine + '\n';
        }
      }
    }

    if (inHunk) {
      formatted += '```';
    }

    return formatted;
  }

  /**
   * Escape markdown special characters
   */
  escapeMarkdown(text) {
    return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
  }

  /**
   * Escape HTML special characters for safe display
   */
  escapeHtml(text) {
    return text.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
   * Send long message by splitting it into multiple parts
   */
  async sendLongMessage(chatId, text, options = {}) {
    const TELEGRAM_MAX_LENGTH = 4096;
    const SAFE_LENGTH = 4000; // Leave some buffer for markdown

    // Smart splitting: try to split at good points
    const chunks = this.splitMessageIntelligently(text, SAFE_LENGTH);

    console.log(`📨 Splitting long message (${text.length} chars) into ${chunks.length} parts`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Add part indicator for multi-part messages
      let finalChunk = chunk;
      if (chunks.length > 1) {
        const partInfo = `\n\n_\\[Part ${i + 1}/${chunks.length}\\]_`;
        finalChunk = chunk + partInfo;
      }

      try {
        // Only notify on first part to avoid spam
        const chunkOptions = { ...options };
        if (i > 0) {
          chunkOptions.disable_notification = true;
        }

        await this.bot.sendMessage(chatId, finalChunk, chunkOptions);

        // Small delay between parts to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`❌ Failed to send part ${i + 1}/${chunks.length}:`, error.message);

        // Log the full problematic text for debugging
        console.error(`🔍 Problematic chunk content (${chunk.length} chars):`);
        console.error('--- START CHUNK ---');
        console.error(chunk);
        console.error('--- END CHUNK ---');

        // If this part fails, try to send error info
        await this.bot.sendMessage(chatId,
          `❌ *Message Part Error*\n\nFailed to send part ${i + 1} of ${chunks.length}.\nLength: ${chunk.length} chars`,
          { parse_mode: undefined }
        );
      }
    }
  }

  /**
   * Intelligently split message at good breakpoints with HTML support
   */
  splitMessageIntelligently(text, maxLength) {
    if (text.length <= maxLength) {
      return [text];
    }

    // Check if text contains HTML tags
    const hasHtmlTags = /<[^>]+>/.test(text);

    if (hasHtmlTags) {
      console.log('🔧 Using HTML-aware splitting');
      return this.splitHtmlMessageSimple(text, maxLength);
    } else {
      console.log('📝 Using plain text splitting');
      return this.splitPlainMessage(text, maxLength);
    }
  }

  /**
   * Intelligent HTML-aware splitting with validation-based cutoff
   */
  splitHtmlMessageSimple(text, maxLength) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // Find the best split point that ensures HTML balance
      let bestSplitPoint = this.findBestHtmlSplitPoint(remaining, maxLength);

      // Get the chunk up to best split point
      let chunk = remaining.substring(0, bestSplitPoint).trim();

      // If chunk is not HTML balanced, apply tag closing/opening
      if (!this.isHtmlBalanced(chunk)) {
        const openTags = this.findOpenTags(chunk);
        // Add closing tags to current chunk
        for (let i = openTags.length - 1; i >= 0; i--) {
          chunk += `</${openTags[i]}>`;
        }

        // Add opening tags to remaining text
        let nextPart = remaining.substring(bestSplitPoint).trim();
        for (const tag of openTags) {
          nextPart = `<${tag}>` + nextPart;
        }
        remaining = nextPart;
      } else {
        remaining = remaining.substring(bestSplitPoint).trim();
      }

      chunks.push(chunk);
    }

    // Add the final remaining part
    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * Find the best split point that ensures HTML tags are balanced
   */
  findBestHtmlSplitPoint(text, maxLength) {
    // Start with a minimum safe length (70% of max) and work up to max
    const minLength = Math.floor(maxLength * 0.7);

    // Try different split points, preferring longer chunks
    for (let testLength = maxLength; testLength >= minLength; testLength -= 10) {
      let testPoint = this.findGoodCutoffPoint(text, testLength);
      let testChunk = text.substring(0, testPoint).trim();

      // Check if this chunk has balanced HTML
      if (this.isHtmlBalanced(testChunk)) {
        console.log(`🎯 Found balanced split at ${testChunk.length} chars (target was ${maxLength})`);
        return testPoint;
      }
    }

    // If no balanced point found, use the simple approach with tag closing
    console.log(`⚠️ No balanced split found, using tag-closing approach`);

    // Find a smaller cutoff point and add closing tags
    let cutoffPoint = this.findGoodCutoffPoint(text, Math.floor(maxLength * 0.8));
    let chunk = text.substring(0, cutoffPoint).trim();

    // Find open tags and add closing tags
    const openTags = this.findOpenTags(chunk);
    const closingTags = openTags.map(tag => `</${tag}>`).reverse().join('');

    // Adjust cutoff if adding closing tags would exceed max length
    while (chunk.length + closingTags.length > maxLength && cutoffPoint > minLength) {
      cutoffPoint = Math.floor(cutoffPoint * 0.9);
      cutoffPoint = this.findGoodCutoffPoint(text, cutoffPoint);
      chunk = text.substring(0, cutoffPoint).trim();
    }

    return cutoffPoint;
  }

  /**
   * Check if HTML tags are balanced in text
   */
  isHtmlBalanced(text) {
    const openTags = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      if (fullTag.startsWith('</')) {
        // Closing tag
        const index = openTags.lastIndexOf(tagName);
        if (index !== -1) {
          openTags.splice(index, 1);
        } else {
          // Unmatched closing tag
          return false;
        }
      } else if (!fullTag.endsWith('/>')) {
        // Opening tag (not self-closing)
        openTags.push(tagName);
      }
    }

    // All tags should be closed for balanced HTML
    return openTags.length === 0;
  }

  /**
   * Find all unclosed opening HTML tags in text
   */
  findOpenTags(text) {
    const openTags = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      if (fullTag.startsWith('</')) {
        // Closing tag - remove from open tags
        const index = openTags.lastIndexOf(tagName);
        if (index !== -1) {
          openTags.splice(index, 1);
        }
      } else if (!fullTag.endsWith('/>')) {
        // Opening tag (not self-closing)
        openTags.push(tagName);
      }
    }

    return openTags;
  }

  /**
   * Find good cutoff point that doesn't break HTML tags
   */
  findGoodCutoffPoint(text, maxLength) {
    let cutoffPoint = maxLength;

    // Don't cut inside HTML tags
    const tagStart = text.lastIndexOf('<', cutoffPoint);
    const tagEnd = text.indexOf('>', tagStart);

    if (tagStart !== -1 && (tagEnd === -1 || tagEnd > cutoffPoint)) {
      // We're inside a tag, move cutoff before the tag
      cutoffPoint = tagStart;
    }

    // Try to find good breakpoints
    const goodBreaks = [
      '\n\n',  // Double line break (paragraph)
      '\n',    // Single line break
      '. ',    // End of sentence
      ', ',    // Comma
      ' '      // Space
    ];

    for (const breakChar of goodBreaks) {
      const lastBreak = text.lastIndexOf(breakChar, cutoffPoint);
      if (lastBreak > maxLength * 0.7) { // Don't split too early
        cutoffPoint = lastBreak + breakChar.length;
        break;
      }
    }

    return cutoffPoint;
  }

  /**
   * Plain text splitting (original logic)
   */
  splitPlainMessage(text, maxLength) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      let splitPoint = maxLength;

      // Try to find good split points (in order of preference)
      const goodBreaks = [
        '\n\n',  // Double line break (paragraph)
        '\n',    // Single line break
        '. ',    // End of sentence
        ', ',    // Comma
        ' '      // Space
      ];

      for (const breakChar of goodBreaks) {
        const lastBreak = remaining.lastIndexOf(breakChar, maxLength);
        if (lastBreak > maxLength * 0.7) { // Don't split too early
          splitPoint = lastBreak + breakChar.length;
          break;
        }
      }

      // Extract chunk and continue with remaining
      const chunk = remaining.substring(0, splitPoint).trim();
      chunks.push(chunk);
      remaining = remaining.substring(splitPoint).trim();
    }

    // Add the final remaining part
    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
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
        await this.sendLongMessage(chatId, messageText, messageOptions);
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
          await this.sendLongMessage(chatId, text, options);
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
   * Escape characters that might break code blocks
   */
  escapeForCodeBlock(text) {
    // Replace backticks and other problematic characters
    return text
      .replace(/`/g, "'")  // Replace backticks with single quotes
      .replace(/\r/g, '')  // Remove carriage returns
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove control characters
      .replace(/[\u{1F600}-\u{1F6FF}]/gu, '[emoji]') // Replace emojis that might break parsing
      .replace(/[\u{2600}-\u{26FF}]/gu, '[symbol]') // Replace symbols that might break parsing
      .trim(); // Remove leading/trailing whitespace
  }

  /**
   * Split text into chunks that fit Telegram message limits
   */
  splitIntoChunks(text, maxLength = 3800) {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks = [];
    let currentChunk = '';
    const lines = text.split('\n');

    for (let line of lines) {
      const lineWithNewline = line + '\n';

      if (currentChunk.length + lineWithNewline.length > maxLength) {
        if (currentChunk.trim()) {
          // Close any open code blocks
          if ((currentChunk.match(/```/g) || []).length % 2 === 1) {
            currentChunk += '```\n';
          }
          chunks.push(currentChunk.trim());
        }

        // Start new chunk
        currentChunk = lineWithNewline;

        // Add code block start if needed for diff lines
        if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
          currentChunk = '```diff\n' + currentChunk;
        }
      } else {
        currentChunk += lineWithNewline;
      }
    }

    if (currentChunk.trim()) {
      // Close any open code blocks
      if ((currentChunk.match(/```/g) || []).length % 2 === 1) {
        currentChunk += '```';
      }
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Send diff chunk with navigation
   */
  async sendDiffChunk(chatId, chunks, chunkIndex, options) {
    const {
      filename,
      fileIndex,
      contextLines,
      wordDiff,
      status,
      totalFiles
    } = options;

    const chunk = chunks[chunkIndex];

    let text = chunk;

    // Add chunk info if multiple chunks
    if (chunks.length > 1) {
      text += `\n\n📃 *Part ${chunkIndex + 1} of ${chunks.length}*`;
    }

    // Create navigation keyboard
    const keyboard = {
      inline_keyboard: []
    };

    // Chunk navigation (if multiple chunks)
    if (chunks.length > 1) {
      const chunkRow = [];
      if (chunkIndex > 0) {
        chunkRow.push({
          text: '⬅️ Prev Part',
          callback_data: `diff:chunk:${fileIndex}:${chunkIndex - 1}:${contextLines}:${wordDiff}`
        });
      }
      if (chunkIndex < chunks.length - 1) {
        chunkRow.push({
          text: 'Next Part ➡️',
          callback_data: `diff:chunk:${fileIndex}:${chunkIndex + 1}:${contextLines}:${wordDiff}`
        });
      }
      if (chunkRow.length > 0) {
        keyboard.inline_keyboard.push(chunkRow);
      }
    }

    // Page navigation for untracked files
    if (status === '??' && this.untrackedFilePagination && this.untrackedFilePagination.totalPages > 1) {
      const pageRow = [];
      const currentPage = this.untrackedFilePagination.currentPage;
      const totalPages = this.untrackedFilePagination.totalPages;

      if (currentPage > 0) {
        pageRow.push({
          text: '⬅️ Prev Page',
          callback_data: `diff:untracked_page:${fileIndex}:${currentPage - 1}:${contextLines}:${wordDiff}`
        });
      }

      // Page indicator
      pageRow.push({
        text: `📄 ${currentPage + 1}/${totalPages}`,
        callback_data: 'page_info'
      });

      if (currentPage < totalPages - 1) {
        pageRow.push({
          text: 'Next Page ➡️',
          callback_data: `diff:untracked_page:${fileIndex}:${currentPage + 1}:${contextLines}:${wordDiff}`
        });
      }

      keyboard.inline_keyboard.push(pageRow);
    }

    // File navigation
    const fileRow = [];
    if (fileIndex > 0) {
      fileRow.push({ text: '⬅️ Prev File', callback_data: `diff:file:${fileIndex - 1}` });
    }
    if (fileIndex < totalFiles - 1) {
      fileRow.push({ text: 'Next File ➡️', callback_data: `diff:file:${fileIndex + 1}` });
    }
    if (fileRow.length > 0) {
      keyboard.inline_keyboard.push(fileRow);
    }

    // Context options row
    const optionsRow = [
      {
        text: contextLines === 1 ? '✅ Min' : '📏 Min',
        callback_data: `diff:file:${fileIndex}:1:${wordDiff}`
      },
      {
        text: contextLines === 3 ? '✅ Normal' : '📏 Normal',
        callback_data: `diff:file:${fileIndex}:3:${wordDiff}`
      },
      {
        text: contextLines === 5 ? '✅ More' : '📏 More',
        callback_data: `diff:file:${fileIndex}:5:${wordDiff}`
      }
    ];
    keyboard.inline_keyboard.push(optionsRow);

    // Bottom navigation
    keyboard.inline_keyboard.push([
      { text: '📋 File List', callback_data: 'diff:files:0' },
      { text: '🏠 Overview', callback_data: 'diff:overview' }
    ]);

    try {
      // Use HTML parse mode for untracked files to prevent backtick issues
      const parseMode = status === '??' ? 'HTML' : 'Markdown';

      await this.bot.sendMessage(chatId, text, {
        parse_mode: parseMode,
        reply_markup: keyboard
      });
    } catch (error) {
      // If parsing fails, try without formatting
      console.error(`[Diff] ${parseMode} parsing error:`, error.message);

      // Remove markdown formatting and try again
      const plainText = text
        .replace(/\*([^*]+)\*/g, '$1')  // Remove bold
        .replace(/`([^`]+)`/g, '$1')    // Remove inline code
        .replace(/```[\s\S]*?```/g, '[Diff content - formatting error]'); // Replace code blocks

      await this.bot.sendMessage(chatId,
        '⚠️ *Formatting Error*\n\n' +
        'There was an issue displaying the diff with formatting.\n' +
        'Raw diff content:\n\n' +
        plainText,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    }
  }

  /**
   * Handle diff callback queries
   */
  async handleDiffCallback(data, chatId, messageId, userId) {
    const parts = data.split(':');
    const action = parts[1];

    try {
      if (action === 'refresh' || action === 'overview') {
        await this.bot.deleteMessage(chatId, messageId);
        await this.showGitDiff(chatId);

      } else if (action === 'files') {
        const page = parseInt(parts[2]) || 0;
        await this.bot.deleteMessage(chatId, messageId);
        const gitStatus = await this.getGitStatus();
        await this.showDiffFileList(chatId, gitStatus, page);

      } else if (action === 'file') {
        const fileIndex = parseInt(parts[2]) || 0;
        const contextLines = parseInt(parts[3]) || 3;
        const wordDiff = parts[4] === 'true';
        await this.bot.deleteMessage(chatId, messageId);
        const gitStatus = await this.getGitStatus();
        await this.showDiffFile(chatId, gitStatus, fileIndex, contextLines, wordDiff);

      } else if (action === 'chunk') {
        const fileIndex = parseInt(parts[2]) || 0;
        const chunkIndex = parseInt(parts[3]) || 0;
        const contextLines = parseInt(parts[4]) || 3;
        const wordDiff = parts[5] === 'true';

        await this.bot.deleteMessage(chatId, messageId);
        const gitStatus = await this.getGitStatus();

        // Get diff and show specific chunk
        const [status, filename] = gitStatus.nameStatus[fileIndex].split('\t');
        let formattedDiff;

        if (status === '??') {
          // For untracked files, use pagination logic
          const untrackedResult = await this.formatUntrackedFileContent(filename, this.options.workingDirectory, 0);
          formattedDiff = untrackedResult.content;

          // Update pagination info for chunk navigation
          this.untrackedFilePagination = {
            fileIndex,
            filename,
            totalPages: untrackedResult.totalPages,
            currentPage: untrackedResult.currentPage,
            totalLines: untrackedResult.totalLines
          };
        } else {
          // For tracked files, use git diff
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          const diffCommand = `git diff HEAD --color=never --unified=${contextLines} -- "${filename}"`;
          const diffResult = await execAsync(diffCommand, {
            cwd: this.options.workingDirectory
          });

          formattedDiff = this.formatDiffForTelegram(diffResult.stdout, filename, contextLines);
        }

        const chunks = this.splitIntoChunks(formattedDiff, 3800);

        await this.sendDiffChunk(chatId, chunks, chunkIndex, {
          filename,
          fileIndex,
          contextLines,
          wordDiff,
          status,
          totalFiles: gitStatus.nameStatus.length
        });

      } else if (action === 'untracked_page') {
        const fileIndex = parseInt(parts[2]) || 0;
        const page = parseInt(parts[3]) || 0;
        const contextLines = parseInt(parts[4]) || 3;
        const wordDiff = parts[5] === 'true';

        await this.bot.deleteMessage(chatId, messageId);
        const gitStatus = await this.getGitStatus();

        // Get the filename and show the specific page
        const [status, filename] = gitStatus.nameStatus[fileIndex].split('\t');
        const untrackedResult = await this.formatUntrackedFileContent(filename, this.options.workingDirectory, page);

        // Update pagination info
        this.untrackedFilePagination = {
          fileIndex,
          filename,
          totalPages: untrackedResult.totalPages,
          currentPage: untrackedResult.currentPage,
          totalLines: untrackedResult.totalLines
        };

        const chunks = this.splitIntoChunks(untrackedResult.content, 3800);

        await this.sendDiffChunk(chatId, chunks, 0, {
          filename,
          fileIndex,
          contextLines,
          wordDiff,
          status,
          totalFiles: gitStatus.nameStatus.length
        });

      } else if (action === 'stats') {
        await this.bot.deleteMessage(chatId, messageId);
        const gitStatus = await this.getGitStatus();

        let text = '📊 *Git Diff Statistics*\n\n';
        text += '```\n' + gitStatus.diffStats + '\n```\n\n';
        text += '💡 Use overview for more options.';

        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🏠 Overview', callback_data: 'diff:overview' },
              { text: '🔄 Refresh', callback_data: 'diff:refresh' }
            ]]
          }
        });
      }

    } catch (error) {
      console.error('[Diff Callback] Error:', error);
      await this.bot.sendMessage(chatId,
        `❌ *Error*\n\n\`${error.message}\``,
        { parse_mode: 'Markdown' }
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

    const validModes = this.thinkingModes.map(mode => mode.id);
    if (validModes.includes(action)) {
      // Store the thinking mode preference
      this.storeUserThinkingMode(userId, action);
      const selectedMode = this.getThinkingModeById(action);

      // Update the message to show selection was made
      await this.bot.editMessageText(
        `✅ *Thinking Mode Changed*\n\n` +
        `🧠 **Selected:** ${selectedMode.icon} ${selectedMode.name} ${this.getThinkingLevelIndicator(selectedMode.level)}\n` +
        `📝 **Description:** ${selectedMode.description}\n\n` +
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
   * Cleanup resources
   */
  cleanup() {
    console.log('🧹 Cleaning up bot resources...');

    // Save active sessions to history before cleanup
    for (const [userId, session] of this.userSessions) {
      if (session.sessionId) {
        this.addSessionToHistory(userId, session.sessionId);
      }
    }

    // Cancel all active processors
    for (const processor of this.activeProcessors) {
      processor.cancel();
    }

    this.activeProcessors.clear();
    this.userSessions.clear();

    // Note: We keep sessionStorage for session persistence
    console.log(`💾 Preserved session data for ${this.sessionStorage.size} users`);

    // Clear pending voice commands and project cache
    this.pendingVoiceCommands.clear();
    this.projectCache.clear();

    // Stop polling
    this.bot.stopPolling();
  }

  /**
   * Store session ID for user
   */
  storeSessionId(userId, sessionId) {
    if (!this.sessionStorage.has(userId)) {
      this.sessionStorage.set(userId, {
        currentSessionId: null,
        sessionHistory: [],
        sessionAccessTimes: new Map() // sessionId -> timestamp
      });
    }

    const storage = this.sessionStorage.get(userId);
    storage.currentSessionId = sessionId;

    // Track access time
    if (!storage.sessionAccessTimes) {
      storage.sessionAccessTimes = new Map();
    }
    storage.sessionAccessTimes.set(sessionId, Date.now());

    // Add to history and update access time
    this.addSessionToHistory(userId, sessionId);

    // Save to config file for persistence across bot restarts
    this.saveCurrentSessionToConfig(userId, sessionId);

    console.log(`[User ${userId}] Stored session ID: ${sessionId}`);
  }

  /**
   * Get stored session ID for user
   */
  getStoredSessionId(userId) {
    const storage = this.sessionStorage.get(userId);
    return storage ? storage.currentSessionId : null;
  }

  /**
   * Clear current session ID
   */
  clearCurrentSessionId(userId) {
    if (this.sessionStorage.has(userId)) {
      const storage = this.sessionStorage.get(userId);
      storage.currentSessionId = null;
    }
  }

  /**
   * Add session to history
   */
  addSessionToHistory(userId, sessionId) {
    if (!this.sessionStorage.has(userId)) {
      this.sessionStorage.set(userId, {
        currentSessionId: null,
        sessionHistory: [],
        sessionAccessTimes: new Map()
      });
    }

    const storage = this.sessionStorage.get(userId);

    // Initialize sessionAccessTimes if not present
    if (!storage.sessionAccessTimes) {
      storage.sessionAccessTimes = new Map();
    }

    if (!storage.sessionHistory.includes(sessionId)) {
      storage.sessionHistory.push(sessionId);

      // Keep only last 50 sessions
      if (storage.sessionHistory.length > 50) {
        storage.sessionHistory = storage.sessionHistory.slice(-50);
      }

      console.log(`[User ${userId}] Added session to history: ${sessionId}`);
    }
  }

  /**
   * Get session history for user
   */
  getSessionHistory(userId) {
    const storage = this.sessionStorage.get(userId);
    return storage ? storage.sessionHistory : [];
  }

  /**
   * Read Claude Code sessions from filesystem
   */
  async readClaudeCodeSessions(projectPath, userId = null) {
    if (!projectPath) {
      throw new Error('No project directory selected');
    }

    const path = require('path');
    const fs = require('fs').promises;
    const os = require('os');

    // Convert project path to Claude Code directory format
    const claudeProjectDir = projectPath.replace(/\//g, '-').replace(/^-/, '');
    const sessionsDir = path.join(os.homedir(), '.claude', 'projects', `-${claudeProjectDir}`);

    try {
      // Check if sessions directory exists
      await fs.access(sessionsDir);

      // Read all .jsonl files
      const files = await fs.readdir(sessionsDir);
      const sessionFiles = files.filter(file => file.endsWith('.jsonl'));

      if (sessionFiles.length === 0) {
        return [];
      }

      // Get file stats and read first line of each session
      const sessions = [];

      for (const file of sessionFiles) {
        try {
          const filePath = path.join(sessionsDir, file);
          const stats = await fs.stat(filePath);
          const sessionId = file.replace('.jsonl', '');

          // Read first line to get session info
          const content = await fs.readFile(filePath, 'utf8');
          const firstLine = content.split('\n')[0];

          if (firstLine.trim()) {
            const sessionData = JSON.parse(firstLine);
            let preview = '';

            // Extract preview based on session type
            if (sessionData.type === 'summary') {
              preview = sessionData.summary || 'No summary available';
            } else if (sessionData.type === 'user' && sessionData.message && sessionData.message.content) {
              // Handle both string and array content
              if (typeof sessionData.message.content === 'string') {
                preview = sessionData.message.content;
              } else if (Array.isArray(sessionData.message.content)) {
                // For array content, look for text type
                const textContent = sessionData.message.content.find(item => item.type === 'text');
                preview = textContent ? textContent.text : 'Complex message';
              } else {
                preview = 'Session without text content';
              }
            } else {
              preview = 'Session without description';
            }

            sessions.push({
              sessionId: sessionId,
              timestamp: sessionData.timestamp || stats.mtime.toISOString(),
              preview: preview,
              modifiedTime: stats.mtime
            });
          }
        } catch (fileError) {
          console.warn(`Failed to read session file ${file}:`, fileError.message);
          // Continue with other files
        }
      }

      // Sort by access time if available, otherwise by modification time (newest first)
      if (userId) {
        const storage = this.sessionStorage.get(userId);
        const accessTimes = storage?.sessionAccessTimes;

        sessions.sort((a, b) => {
          const aAccessTime = accessTimes?.get(a.sessionId);
          const bAccessTime = accessTimes?.get(b.sessionId);

          // If both have access times, sort by access time
          if (aAccessTime && bAccessTime) {
            return bAccessTime - aAccessTime;
          }

          // If only one has access time, prioritize it
          if (aAccessTime && !bAccessTime) return -1;
          if (!aAccessTime && bAccessTime) return 1;

          // If neither has access time, sort by file modification time
          return b.modifiedTime - a.modifiedTime;
        });
      } else {
        // Fallback to modification time when userId not provided
        sessions.sort((a, b) => b.modifiedTime - a.modifiedTime);
      }

      return sessions;

    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // Directory doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Get human-readable time ago string
   */
  getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return time.toLocaleDateString();
    }
  }

  /**
   * Get current working directory for user
   */
  getCurrentDirectory(userId) {
    // For now, return the bot's working directory
    // In future, could be user-specific
    return this.options.workingDirectory;
  }

  /**
   * Handle session resume from quick button
   */
  async handleSessionResume(sessionId, chatId, messageId, userId) {
    try {
      // Update button message to show it was selected
      await this.bot.editMessageText(
        `✅ *Resuming session* \`${sessionId.slice(-8)}\`\n\nSession will continue with next message.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );

      // Store this session as current for the user
      this.storeSessionId(userId, sessionId);
      // Save to config for persistence
      await this.saveCurrentSessionToConfig(userId, sessionId);

      console.log(`[User ${userId}] Quick resumed session: ${sessionId}`);

    } catch (error) {
      console.error('Session resume error:', error);
      await this.bot.sendMessage(chatId,
        `❌ Failed to resume session \`${sessionId.slice(-8)}\``,
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Handle session page navigation callbacks
   */
  async handleSessionPageCallback(page, chatId, messageId, userId) {
    try {
      // Edit the message to show the new page
      await this.bot.editMessageText(
        '🔄 *Loading session page...*',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );

      // Get session history for the new page
      const currentDirectory = this.getCurrentDirectory(userId);
      const sessions = await this.readClaudeCodeSessions(currentDirectory, userId);
      const pageSize = 5;
      const totalPages = Math.ceil(sessions.length / pageSize);
      const startIndex = page * pageSize;
      const displayedSessions = sessions.slice(startIndex, startIndex + pageSize);

      // Build the message text
      let text = '📚 *Session History*\n\n';

      if (currentDirectory) {
        text += `📁 *Project:* \`${currentDirectory.replace(process.env.HOME, '~')}\`\n\n`;
      }

      const currentSessionId = this.getStoredSessionId(userId);
      if (currentSessionId) {
        text += `🔄 *Current:* \`${currentSessionId.slice(-8)}\`\n\n`;
      }

      // Show pagination info
      if (totalPages > 1) {
        text += `*Page ${page + 1} of ${totalPages}* (${sessions.length} total sessions)\n\n`;
      } else {
        text += `*${sessions.length} session${sessions.length === 1 ? '' : 's'} found*\n\n`;
      }

      displayedSessions.forEach((session, index) => {
        const shortId = session.sessionId.slice(-8);
        const timeAgo = this.getTimeAgo(session.timestamp);
        let preview = session.preview;

        // Truncate preview if too long
        if (preview.length > 80) {
          preview = preview.substring(0, 80) + '...';
        }

        text += `${startIndex + index + 1}. \`${shortId}\` • ${timeAgo}\n`;
        text += `   💬 _${preview}_\n\n`;
      });

      text += '💡 Tap a session number to resume it';

      // Create inline keyboard
      const keyboard = {
        inline_keyboard: []
      };

      // Session resume buttons (single row of up to 5 numbers)
      const resumeRow = displayedSessions.map((session, index) => ({
        text: `${startIndex + index + 1}`,
        callback_data: `resume_session:${session.sessionId}`
      }));
      keyboard.inline_keyboard.push(resumeRow);

      // Pagination buttons (if more than one page)
      if (totalPages > 1) {
        const paginationRow = [];

        // Previous button
        if (page > 0) {
          paginationRow.push({
            text: '◀️ Previous',
            callback_data: `session_page:${page - 1}`
          });
        }

        // Page indicator
        paginationRow.push({
          text: `${page + 1}/${totalPages}`,
          callback_data: 'page_info'
        });

        // Next button
        if (page < totalPages - 1) {
          paginationRow.push({
            text: 'Next ▶️',
            callback_data: `session_page:${page + 1}`
          });
        }

        keyboard.inline_keyboard.push(paginationRow);
      }

      // Update the message with new content
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('Session page callback error:', error);
      await this.bot.editMessageText(
        `❌ *Error loading page ${page + 1}*\n\nTry again or use /sessions to refresh.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );
    }
  }

  /**
   * Handle voice command callbacks
   */
  async handleVoiceCallback(data, chatId, messageId, userId) {
    const pendingCommand = this.pendingVoiceCommands.get(messageId);

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
      this.pendingVoiceCommands.delete(messageId);

      // Process the command
      await this.processUserMessage(transcribedText, userId, chatId);

    } else if (data.startsWith('voice_cancel:')) {
      await this.bot.editMessageText(
        '❌ *Voice command cancelled*',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );

      this.pendingVoiceCommands.delete(messageId);

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
   * Download file from Telegram
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
    const nexaraApiKey = this.options.nexaraApiKey;

    if (!nexaraApiKey) {
      throw new Error('Nexara API key not configured. Voice messages unavailable.');
    }

    try {
      console.log('[Nexara] Transcribing audio...');

      // Create FormData with the audio file
      const FormData = require('form-data');
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
          'Authorization': `Bearer ${nexaraApiKey}`,
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
        if (!this.sessionStorage.has(userId)) {
          this.sessionStorage.set(userId, {
            currentSessionId: null,
            sessionHistory: [],
            sessionAccessTimes: new Map()
          });
        }

        // Restore session ID in memory
        const storage = this.sessionStorage.get(userId);
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
            reply_markup: this.createReplyKeyboard()
          }
        ).catch(error => {
          console.error('Error sending admin welcome message:', error);
        });
      });

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

    // Get or create user session
    let session = this.userSessions.get(userId);

    if (!session) {
      // First message - create new session
      session = await this.createUserSession(userId, chatId);
      await this.sendSessionInit(chatId, session);
    }

    // Check if previous request is still processing
    if (session.processor.isActive()) {
      await this.bot.sendMessage(chatId, '⏳ *Processing previous request...*\nPlease wait or use /cancel',
        { parse_mode: 'Markdown' });
      return;
    }

    // Start typing indicator
    await this.activityIndicator.start(chatId);

    try {
      // Check if we have a stored session ID to resume
      const sessionId = this.getStoredSessionId(userId);

      if (sessionId) {
        // Resume existing session with -r flag
        console.log(`[User ${userId}] Resuming session: ${sessionId}`);
        await session.processor.resumeSession(sessionId, finalText);
      } else if (session.messageCount === 0) {
        // First message - start new conversation
        console.log(`[User ${userId}] Creating new session`);
        await session.processor.startNewConversation(finalText);
      } else {
        // Continue conversation with -c flag (fallback)
        console.log(`[User ${userId}] Continuing conversation`);
        await session.processor.continueConversation(finalText);
      }

      session.messageCount++;

      // Activity indicator will be stopped when Claude completes (in 'complete' event)

    } catch (error) {
      console.error(`[User ${userId}] Error starting Claude:`, error);

      // Error - stop typing indicator
      await this.activityIndicator.stop(chatId);

      await this.sendError(chatId, error);
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
    return {
      activeSessions: this.userSessions.size,
      activeProcessors: this.activeProcessors.size,
      totalUsers: this.sessionStorage.size,
      pendingVoiceCommands: this.pendingVoiceCommands.size,
      activeIndicators: activityStats.activeIndicators,
      uptime: process.uptime()
    };
  }
}

// Export for use
module.exports = StreamTelegramBot;
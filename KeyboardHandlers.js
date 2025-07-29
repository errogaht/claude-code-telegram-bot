/**
 * Keyboard Handlers - Extracted from StreamTelegramBot
 * Handles keyboard UI and button press routing
 */
class KeyboardHandlers {
  constructor(bot, mainBotInstance) {
    this.bot = bot;
    this.mainBot = mainBotInstance; // Reference to main bot for delegation
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
        await this.mainBot.cancelUserSession(chatId);
        await this.mainBot.safeSendMessage(chatId, '🛑 *Emergency Stop*\n\nAll processes stopped.', {
          forceNotification: true,  // Critical user action
          reply_markup: this.createReplyKeyboard()
        });
        return true;
        
      case '📊 Status':
        await this.mainBot.sessionManager.showSessionStatus(chatId);
        return true;
        
      case '📂 Projects':
        await this.mainBot.projectNavigator.showProjectSelection(chatId);
        return true;
        
      case '🔄 New Session':
        await this.mainBot.sessionManager.startNewSession(chatId);
        await this.mainBot.safeSendMessage(chatId, '🔄 *New Session*\n\nOld session ended, new session started.', {
          forceNotification: true,  // Important session action
          reply_markup: this.createReplyKeyboard()
        });
        return true;
        
      case '📝 Sessions':
        await this.mainBot.sessionManager.showSessionHistory(chatId);
        return true;
        
      case '📍 Path':
        const currentDir = this.mainBot.sessionManager.getCurrentDirectory(msg.from.id);
        await this.bot.sendMessage(chatId, `📍 *Current Path:*\n\n\`${currentDir}\``, {
          parse_mode: 'Markdown',
          reply_markup: this.createReplyKeyboard()
        });
        return true;
        
      case '🤖 Model':
        await this.mainBot.showModelSelection(chatId);
        return true;
        
      case '🧠 Thinking':
        await this.mainBot.showThinkingModeSelection(chatId);
        return true;
        
      case '🔍 Git Diff':
        await this.mainBot.gitDiffManager.showGitDiff(chatId);
        return true;
        
      default:
        return false; // Not a keyboard button
    }
  }

  /**
   * Create inline keyboard for session history navigation
   */
  createSessionHistoryKeyboard(page = 0, totalPages = 1, sessions = []) {
    const keyboard = {
      inline_keyboard: []
    };

    // Add resume buttons for sessions (up to 5 per page)
    if (sessions.length > 0) {
      const resumeRow = sessions.slice(0, 5).map(sessionId => ({
        text: `📄 ${sessionId.slice(-8)}`,
        callback_data: `resume_session:${sessionId}`
      }));
      keyboard.inline_keyboard.push(resumeRow);
    }

    // Add pagination if needed
    if (totalPages > 1) {
      const paginationRow = [];
      if (page > 0) {
        paginationRow.push({
          text: '◀️ Previous',
          callback_data: `sessions_page:${page - 1}`
        });
      }
      paginationRow.push({
        text: `📄 ${page + 1}/${totalPages}`,
        callback_data: 'noop'
      });
      if (page < totalPages - 1) {
        paginationRow.push({
          text: 'Next ▶️',
          callback_data: `sessions_page:${page + 1}`
        });
      }
      keyboard.inline_keyboard.push(paginationRow);
    }

    return keyboard;
  }

  /**
   * Create inline keyboard for model selection
   */
  createModelSelectionKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: '🚀 Sonnet (Fast)', callback_data: 'model:claude-3-5-sonnet-20241022' },
          { text: '🎯 Haiku (Quick)', callback_data: 'model:claude-3-5-haiku-20241022' }
        ],
        [
          { text: '🧠 Opus (Smart)', callback_data: 'model:claude-3-opus-20240229' }
        ],
        [
          { text: '❌ Cancel', callback_data: 'model:cancel' }
        ]
      ]
    };
  }

  /**
   * Create inline keyboard for thinking mode selection
   */
  createThinkingModeKeyboard() {
    // Create keyboard with thinking modes (2 buttons per row)
    const keyboard = {
      inline_keyboard: []
    };

    const modes = [
      { text: '💭 Standard', data: 'think:standard' },
      { text: '🤔 Deep Think', data: 'think:deep' },
      { text: '🧠 Ultra Think', data: 'think:ultra' },
      { text: '⚡ Quick', data: 'think:quick' },
      { text: '🎯 Focused', data: 'think:focused' },
      { text: '🔍 Analysis', data: 'think:analysis' }
    ];

    // Group modes into rows of 2
    for (let i = 0; i < modes.length; i += 2) {
      const row = modes.slice(i, i + 2);
      keyboard.inline_keyboard.push(row.map(mode => ({
        text: mode.text,
        callback_data: mode.data
      })));
    }

    keyboard.inline_keyboard.push([
      { text: '❌ Cancel', callback_data: 'think:cancel' }
    ]);

    return keyboard;
  }

  /**
   * Create inline keyboard for git diff navigation
   */
  createGitDiffKeyboard(options = {}) {
    const { 
      showOverview = true, 
      showFileList = true, 
      currentFile = null,
      hasNextChunk = false,
      hasPrevChunk = false,
      currentChunk = 0,
      totalChunks = 1
    } = options;

    const keyboard = {
      inline_keyboard: []
    };

    // File navigation row
    const fileRow = [];
    if (showOverview) {
      fileRow.push({ text: '📋 Overview', callback_data: 'diff:overview' });
    }
    if (showFileList) {
      fileRow.push({ text: '📁 Files', callback_data: 'diff:files' });
    }
    if (fileRow.length > 0) {
      keyboard.inline_keyboard.push(fileRow);
    }

    // Chunk navigation for large diffs
    if (totalChunks > 1) {
      const chunkRow = [];
      if (hasPrevChunk) {
        chunkRow.push({ text: '◀️ Prev', callback_data: `diff:chunk:${currentChunk - 1}` });
      }
      chunkRow.push({ text: `${currentChunk + 1}/${totalChunks}`, callback_data: 'noop' });
      if (hasNextChunk) {
        chunkRow.push({ text: 'Next ▶️', callback_data: `diff:chunk:${currentChunk + 1}` });
      }
      keyboard.inline_keyboard.push(chunkRow);
    }

    // Options row
    const optionsRow = [
      { text: '🔄 Refresh', callback_data: 'diff:refresh' },
      { text: '❌ Close', callback_data: 'diff:close' }
    ];
    keyboard.inline_keyboard.push(optionsRow);

    return keyboard;
  }

  /**
   * Get reply keyboard markup for sending with messages
   */
  getReplyKeyboardMarkup() {
    return this.createReplyKeyboard();
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      keyboardType: 'persistent_reply',
      buttonsCount: 9 // 3x3 grid
    };
  }
}

module.exports = KeyboardHandlers;
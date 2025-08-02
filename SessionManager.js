const ClaudeStreamProcessor = require('./claude-stream-processor');

/**
 * Session Manager - Extracted from StreamTelegramBot
 * Handles user session lifecycle, storage, and processor events
 */
class SessionManager {
  constructor(formatter, options, bot, activeProcessors, activityIndicator, mainBot) {
    this.formatter = formatter;
    this.options = options;
    this.bot = bot;
    this.activeProcessors = activeProcessors;
    this.activityIndicator = activityIndicator;
    this.mainBot = mainBot; // Reference to main bot instance for safeSendMessage
    this.configFilePath = options.configFilePath;
    
    // Session storage
    this.userSessions = new Map(); // userId -> { processor, sessionId, lastTodoMessageId, etc }
    this.sessionStorage = new Map(); // userId -> { currentSessionId, sessionHistory: [] }
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
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    // Assistant text responses
    processor.on('assistant-text', async (data) => {
      console.log(`[User ${userId}] Assistant text: ${data.text.substring(0, 100)}...`);
      
      // Typing indicator continues automatically
      const formatted = this.formatter.formatAssistantText(data.text);
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    // Thinking processes
    processor.on('assistant-thinking', async (data) => {
      console.log(`[User ${userId}] Claude thinking`);
      const formatted = this.formatter.formatThinking(data.thinking, data.signature);
      await this.mainBot.safeSendMessage(chatId, formatted);
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
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    processor.on('file-write', async (data) => {
      console.log(`[User ${userId}] File write: ${data.filePath}`);
      const formatted = this.formatter.formatFileWrite(data.filePath, data.content);
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    processor.on('file-read', async (data) => {
      console.log(`[User ${userId}] File read: ${data.filePath}`);
      const formatted = this.formatter.formatFileRead(data.filePath);
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    // Bash commands
    processor.on('bash-command', async (data) => {
      console.log(`[User ${userId}] Bash: ${data.command}`);
      const formatted = this.formatter.formatBashCommand(data.command, data.description);
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    // Task spawning
    processor.on('task-spawn', async (data) => {
      console.log(`[User ${userId}] Task: ${data.description}`);
      const formatted = this.formatter.formatTaskSpawn(data.description, data.prompt, data.subagentType);
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    // MCP tools
    processor.on('mcp-tool', async (data) => {
      console.log(`[User ${userId}] MCP tool: ${data.toolName}`);
      const formatted = this.formatter.formatMCPTool(data.toolName, data.input);
      await this.mainBot.safeSendMessage(chatId, formatted);
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

      // Clean up temp file if exists
      const ImageHandler = require('./ImageHandler');
      ImageHandler.cleanupTempFile(session, userId);

      const formatted = this.formatter.formatExecutionResult(data, session.sessionId);
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    // Errors
    processor.on('error', async (error) => {
      console.error(`[User ${userId}] Claude error:`, error);

      // Stop typing indicator on error
      await this.activityIndicator.stop(chatId);

      // Clean up temp file if exists
      const ImageHandler = require('./ImageHandler');
      ImageHandler.cleanupTempFile(session, userId);

      await this.sendError(chatId, error);
    });
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
    if (!storage) {
      return [];
    }
    
    // Sort by access time (most recent first)
    return storage.sessionHistory
      .filter(sessionId => storage.sessionAccessTimes && storage.sessionAccessTimes.has(sessionId))
      .sort((a, b) => {
        const timeA = storage.sessionAccessTimes.get(a) || 0;
        const timeB = storage.sessionAccessTimes.get(b) || 0;
        return timeB - timeA; // Descending order (newest first)
      })
      .slice(0, 10); // Return top 10 sessions
  }

  /**
   * Save current session to config file (project-specific)
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
      
      // Initialize projectSessions if it doesn't exist
      if (!config.projectSessions) {
        config.projectSessions = {};
      }
      
      // Save session info for current project
      const currentProject = this.options.workingDirectory;
      config.projectSessions[currentProject] = {
        userId: userId.toString(),
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        model: this.options.model
      };
      
      // Also update currentProject
      config.currentProject = currentProject;
      
      // Write back to file
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      
      console.log(`[Session] Saved session ${sessionId.slice(-8)} for project ${currentProject}`);
    } catch (error) {
      console.error('[Session] Error saving session to config:', error.message);
    }
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
        // Try to edit existing message using safeEditMessage
        try {
          await this.mainBot.safeEditMessage(chatId, lastTodoMessageId, formatted);
          console.log(`[User ${session.userId}] Updated todo message ${lastTodoMessageId}`);

        } catch (editError) {
          // If edit fails (message too old, etc.), send new message
          console.log(`[User ${session.userId}] Edit failed, sending new todo message`);
          await this.mainBot.safeSendMessage(chatId, formatted);
          // Note: We can't get message_id from safeSendMessage, but that's okay for now
        }
      } else {
        // Send new message using safeSendMessage
        await this.mainBot.safeSendMessage(chatId, formatted);
        console.log(`[User ${session.userId}] Created new todo message`);
      }

      // Update stored todos
      session.lastTodos = todos;

    } catch (error) {
      console.error(`[User ${session.userId}] Error updating todos:`, error);
    }
  }

  /**
   * Send error message
   */
  async sendError(chatId, error) {
    const formatted = this.formatter.formatError(error);
    await this.mainBot.safeSendMessage(chatId, formatted, {
      forceNotification: true  // Always notify for internal errors
    });
  }

  /**
   * Get user's preferred model for current project
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
      console.error('[SessionManager] Error getting user model:', error.message);
      return null;
    }
  }

  /**
   * Get user session
   */
  getUserSession(userId) {
    return this.userSessions.get(userId);
  }

  /**
   * Delete user session
   */
  deleteUserSession(userId) {
    const session = this.userSessions.get(userId);
    if (session) {
      // Add to history before deleting
      if (session.sessionId) {
        this.addSessionToHistory(userId, session.sessionId);
      }
      
      // Remove from active processors
      if (session.processor) {
        this.activeProcessors.delete(session.processor);
      }
      
      this.userSessions.delete(userId);
    }
  }

  /**
   * Cleanup all sessions
   */
  cleanup() {
    // Add all active sessions to history
    for (const [userId, session] of this.userSessions) {
      if (session.sessionId) {
        this.addSessionToHistory(userId, session.sessionId);
      }
    }

    this.userSessions.clear();
    
    // Note: We keep sessionStorage for session persistence
    console.log(`💾 Preserved session data for ${this.sessionStorage.size} users`);
  }

  /**
   * Cancel user session
   */
  async cancelUserSession(chatId) {
    const userId = this.mainBot.getUserIdFromChat(chatId);
    const session = this.getUserSession(userId);

    if (session && session.processor) {
      session.processor.cancel();
      await this.mainBot.safeSendMessage(chatId, '❌ **Session cancelled**');
    } else {
      await this.mainBot.safeSendMessage(chatId, '⚠️ **No active session to cancel**');
    }
  }

  /**
   * Show session status
   */
  async showSessionStatus(chatId) {
    const userId = this.mainBot.getUserIdFromChat(chatId);
    const session = this.getUserSession(userId);
    const storedSessionId = this.getStoredSessionId(userId);
    const sessionHistory = this.getSessionHistory(userId);

    // Check if we have any session info (active or stored)
    if (!session && !storedSessionId) {
      await this.mainBot.safeSendMessage(chatId, '📋 **No active session**\n\nSend a message to start!', 
        {});
      return;
    }

    let text = '📊 **Session Status**\n\n';

    if (session) {
      // Active session exists
      const isActive = session.processor.isActive();
      const sessionId = session.sessionId || session.processor.getCurrentSessionId();
      const messageCount = session.messageCount;
      const uptime = Math.round((Date.now() - session.createdAt.getTime()) / 1000);

      text += `🆔 **Current:** \`${sessionId ? sessionId.slice(-8) : 'Not started'}\`\n`;
      text += `📋 **Stored:** \`${storedSessionId ? storedSessionId.slice(-8) : 'None'}\`\n`;
      text += `📊 **Status:** ${isActive ? '🔄 Processing' : '💤 Idle'}\n`;
      text += `💬 **Messages:** ${messageCount}\n`;
      text += `⏱ **Uptime:** ${uptime}s\n`;
    } else if (storedSessionId) {
      // Only stored session exists (bot was restarted)
      text += '🆔 **Current:** 💤 **Not active**\n';
      text += `📋 **Stored:** \`${storedSessionId.slice(-8)}\` **(can resume)**\n`;
      text += '📊 **Status:** ⏸️ **Paused (bot restarted)**\n';
      text += '💬 **Messages:** -\n';
      text += '⏱ **Uptime:** -\n';
      text += '\n💡 **Send a message to resume this session**\n';
    }

    const path = require('path');
    text += `📁 **Directory:** ${path.basename(this.options.workingDirectory)}\n`;
    text += `📚 **History:** ${sessionHistory.length} sessions\n`;
    text += `🤖 **Model:** ${this.options.model}`;

    await this.mainBot.safeSendMessage(chatId, text);
  }

  /**
   * Start new session (reset current)
   */
  async startNewSession(chatId) {
    const userId = this.mainBot.getUserIdFromChat(chatId);
    
    // Cancel existing session
    const existingSession = this.getUserSession(userId);
    if (existingSession) {
      // Store old session ID in history
      if (existingSession.sessionId) {
        this.addSessionToHistory(userId, existingSession.sessionId);
      }
      
      existingSession.processor.cancel();
      this.activeProcessors.delete(existingSession.processor);
      this.deleteUserSession(userId);
    }

    // Clear current session ID to force new session
    this.clearCurrentSessionId(userId);
    
    // Create new session
    const session = await this.createUserSession(userId, chatId);
    await this.mainBot.sendSessionInit(chatId, session);
    
    const path = require('path');
    await this.mainBot.safeSendMessage(chatId, 
      '🆕 **New session started**\n\n' +
      `📁 **Directory:** ${path.basename(this.options.workingDirectory)}\n` +
      'Previous session saved to history.\n' +
      'Use /sessions to view session history.',
      { 
        reply_markup: this.mainBot.keyboardHandlers.getReplyKeyboardMarkup()
      }
    );
  }

  /**
   * End current session
   */
  async endSession(chatId) {
    const userId = this.mainBot.getUserIdFromChat(chatId);
    const session = this.getUserSession(userId);

    if (!session) {
      await this.mainBot.safeSendMessage(chatId, '⚠️ **No active session to end**', { 
        reply_markup: this.mainBot.keyboardHandlers.getReplyKeyboardMarkup()
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
    this.deleteUserSession(userId);
    
    // Clear current session ID
    this.clearCurrentSessionId(userId);

    const messageCount = session.messageCount;
    const uptime = Math.round((Date.now() - session.createdAt.getTime()) / 1000);
    
    const path = require('path');
    await this.mainBot.safeSendMessage(chatId, 
      '🔚 **Session ended**\n\n' +
      `💬 Messages: ${messageCount}\n` +
      `⏱ Duration: ${uptime}s\n` +
      `📁 Directory: ${path.basename(this.options.workingDirectory)}\n\n` +
      'Session saved to history.\n' +
      'Use /new to start a new session.',
      { 
        reply_markup: this.mainBot.keyboardHandlers.getReplyKeyboardMarkup()
      }
    );
  }

  /**
   * Get stored session ID for user from current project config
   */
  getStoredSessionId(userId) {
    if (!this.configFilePath) {
      return null;
    }
    
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(configData);
      
      const currentProject = this.options.workingDirectory;
      
      // Get session ID from project-specific config
      if (config.projectSessions && config.projectSessions[currentProject]) {
        const projectSession = config.projectSessions[currentProject];
        if (projectSession.userId === userId.toString()) {
          return projectSession.sessionId;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[SessionManager] Error getting stored session ID:', error.message);
      return null;
    }
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      activeSessions: this.userSessions.size,
      totalUsers: this.sessionStorage.size
    };
  }

  /**
   * Show session history (reads from Claude Code files)
   */
  async showSessionHistory(chatId, page = 0) {
    const userId = this.mainBot.getUserIdFromChat(chatId);
    const currentSessionId = this.getStoredSessionId(userId);
    const currentDirectory = this.getCurrentDirectory(userId);
    
    try {
      const sessions = await this.readClaudeCodeSessions(currentDirectory, userId);
      const pageSize = 5;
      const totalPages = Math.ceil(sessions.length / pageSize);
      const startIndex = page * pageSize;
      const endIndex = startIndex + pageSize;
      const displayedSessions = sessions.slice(startIndex, endIndex);
      
      let text = '📚 **Session History**\n\n';
      
      if (currentDirectory) {
        text += `📁 **Project:** \`${currentDirectory.replace(process.env.HOME, '~')}\`\n\n`;
      }
      
      if (currentSessionId) {
        text += `🔄 **Current:** \`${currentSessionId.slice(-8)}\`\n\n`;
      }
      
      if (sessions.length === 0) {
        text += 'No previous sessions found in this project.\n\n';
        text += 'Send a message to start your first session!';
        
        await this.mainBot.safeSendMessage(chatId, text);
      } else {
        // Show pagination info
        if (totalPages > 1) {
          text += `**Page ${page + 1} of ${totalPages}** (${sessions.length} total sessions)\n\n`;
        } else {
          text += `**${sessions.length} session${sessions.length === 1 ? '' : 's'} found**\n\n`;
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
        
        await this.mainBot.safeSendMessage(chatId, text, { 
          reply_markup: keyboard 
        });
      }
      
    } catch (error) {
      console.error('[showSessionHistory] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Error loading session history**\n\n' +
        'Could not read Claude Code session files.\n' +
        'Make sure you are in a project directory.',
        {}
      );
    }
  }

  /**
   * Read Claude Code session files from project directory
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
        `✅ **Resuming session** \`${sessionId.slice(-8)}\`\n\nSession will continue with next message.`,
        {
          chat_id: chatId,
          message_id: messageId
        }
      );

      // Store this session ID as the user's current session
      this.storeSessionId(userId, sessionId);
      
      console.log(`[User ${userId}] Resume session: ${sessionId.slice(-8)}`);
      
    } catch (error) {
      console.error('Error resuming session:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Error resuming session**\n\nPlease try again or start a new session.',
        {}
      );
    }
  }

  /**
   * Handle session history pagination
   */
  async handleSessionPageCallback(page, chatId, messageId, userId) {
    try {
      // Delete the old message and send a new one
      await this.bot.deleteMessage(chatId, messageId);
      
      // Show the requested page
      await this.showSessionHistory(chatId, page);
      
    } catch (error) {
      console.error('Error handling session page callback:', error);
      
      // If we can't delete the message, try to edit it
      try {
        const currentDirectory = this.getCurrentDirectory(userId);
        const sessions = await this.readClaudeCodeSessions(currentDirectory, userId);
        const pageSize = 5;
        const totalPages = Math.ceil(sessions.length / pageSize);
        const startIndex = page * pageSize;
        const displayedSessions = sessions.slice(startIndex, startIndex + pageSize);

        // Build the message text
        let text = '📚 *Session History*\n\n';
        
        if (currentDirectory) {
          text += `📁 **Project:** \`${currentDirectory.replace(process.env.HOME, '~')}\`\n\n`;
        }
        
        // Show pagination info
        if (totalPages > 1) {
          text += `**Page ${page + 1} of ${totalPages}** (${sessions.length} total sessions)\n\n`;
        } else {
          text += `**${sessions.length} session${sessions.length === 1 ? '' : 's'} found**\n\n`;
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
        
        await this.bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard
        });
        
      } catch (editError) {
        await this.mainBot.safeSendMessage(chatId, 
          '❌ **Error updating session history**\n\nPlease use /sessions to view history again.',
          {}
        );
      }
    }
  }

}

module.exports = SessionManager;
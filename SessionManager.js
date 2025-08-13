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
    
    // Token tracking across session chains
    this.cumulativeTokenCache = new Map(); // sessionId -> { totalInputTokens, totalOutputTokens, cacheReadTokens, cacheCreationTokens, transactionCount }
    
    // Title tracking for auto-pin functionality
    this.sessionTitles = new Map(); // userId -> { lastTitle, chatId }
  }

  /**
   * Create new user session with Claude processor
   */
  async createUserSession(userId, chatId) {
    console.log(`[User ${userId}] Creating new session`);

    // Use user's preferred model or default to bot's model
    const userModel = this.getUserModel(userId) || this.options.model;
    console.log(`[SessionManager] Debug: userModel=${userModel}, getUserModel result=${this.getUserModel(userId)}, options.model=${this.options.model}, workingDir=${this.options.workingDirectory}`);
    
    const processor = new ClaudeStreamProcessor({
      model: userModel,
      workingDirectory: this.options.workingDirectory
    });

    // Get stored session ID to check if this is a continuation
    const storedSessionId = this.getStoredSessionId(userId);
    let previousTokenUsage = null;
    let sessionTitle = null;

    // If we have a stored session, try to get its token usage and title for continuation
    if (storedSessionId) {
      previousTokenUsage = await this.getSessionTokenUsage(storedSessionId);
      
      // Calculate and cache cumulative tokens from all parent sessions
      // This ensures we have the full context usage for accurate status display
      await this.getCumulativeTokens(storedSessionId);
      
      // First try to get session title from config (faster), then from JSONL file
      sessionTitle = this.getStoredSessionTitle(userId);
      if (!sessionTitle) {
        sessionTitle = await this.getSessionSummary(storedSessionId);
      }
      
      // For resumed sessions, thinking mode is already in memory (userPreferences)
      // No need to restore from config - each bot process maintains its own thinking mode state
      console.log(`[User ${userId}] Resumed session with current thinking mode: ${this.getUserThinkingMode(userId)}`);
    }

    const session = {
      userId,
      chatId,
      processor,
      messageCount: 0,
      lastTodoMessageId: null,
      lastTodos: null,
      createdAt: new Date(),
      // Status monitoring fields
      tokenUsage: previousTokenUsage || {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        transactionCount: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      },
      lastActivityTime: Date.now(),
      isStreamActive: false,
      isHealthy: true,
      lastHealthCheck: Date.now(),
      isContinuation: !!previousTokenUsage,
      sessionTitle: sessionTitle,
      autoCompactInProgress: false
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
      
      // Enhance data with additional information for better session display
      const enhancedData = {
        ...data,
        thinkingMode: this.getUserThinkingMode(userId),
        isContinuation: session.isContinuation,
        sessionTitle: this.getStoredSessionTitle(userId)
      };
      
      const formatted = this.formatter.formatSessionInit(enhancedData);
      await this.mainBot.safeSendMessage(chatId, formatted);
    });

    // Assistant text responses
    processor.on('assistant-text', async (data) => {
      console.log(`[User ${userId}] Assistant text: ${data.text.substring(0, 100)}...`);
      
      // Update activity tracking
      this.updateSessionActivity(session);
      
      // Update token usage if present in assistant message
      if (data.usage) {
        this.updateTokenUsage(session, { usage: data.usage });
        await this.checkAutoCompact(session, chatId);
      }
      
      // Update session title from latest JSONL content (throttled to avoid excessive file reads)
      await this.updateSessionTitle(session, userId);
      
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

    // Execution completion - listen for execution-result which has usage data
    processor.on('execution-result', async (data) => {
      console.log(`[User ${userId}] Execution complete: ${data.success}`);

      // Update activity and token tracking
      this.updateSessionActivity(session);
      this.updateTokenUsage(session, data);

      // Check for auto-compact after token update
      await this.checkAutoCompact(session, chatId);

      // Stop typing indicator when Claude finishes
      await this.activityIndicator.stop(chatId);

      // Clean up temp file if exists
      const ImageHandler = require('./ImageHandler');
      ImageHandler.cleanupTempFile(session, userId);

      const formatted = this.formatter.formatExecutionResult(data, session.sessionId);
      await this.mainBot.safeSendMessage(chatId, formatted);
      
      // Check for title changes after Claude completes processing
      const sessionId = session.sessionId || session.processor.getCurrentSessionId();
      if (sessionId) {
        const currentTitle = await this.getSessionSummary(sessionId);
        if (currentTitle) {
          await this.checkAndHandleTitleChange(userId, chatId, currentTitle);
        }
      }
    });

    // Keep the legacy 'complete' event for backward compatibility (but without usage updates)
    processor.on('complete', async (data) => {
      console.log(`[User ${userId}] Process complete (legacy): ${data.success}`);
      
      // Only handle basic completion without token tracking since this event doesn't have usage data
      this.updateSessionActivity(session);
      await this.activityIndicator.stop(chatId);

      // Clean up temp file if exists
      const ImageHandler = require('./ImageHandler');
      ImageHandler.cleanupTempFile(session, userId);
      
      // Check for title changes after Claude completes processing
      const sessionId = session.sessionId || session.processor.getCurrentSessionId();
      if (sessionId) {
        const currentTitle = await this.getSessionSummary(sessionId);
        if (currentTitle) {
          await this.checkAndHandleTitleChange(userId, chatId, currentTitle);
        }
      }
    });

    // Prompt too long errors - trigger auto-compact
    processor.on('prompt-too-long', async (data) => {
      console.log(`[User ${userId}] Prompt too long detected - triggering auto-compact`);
      await this.handleClaudeCodeError(data.sessionId, data);
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
   * Clear session from both memory and config file (for new sessions)
   */
  async clearStoredSession(userId) {
    // Clear in-memory session
    this.clearCurrentSessionId(userId);
    
    // Clear session from config file
    if (!this.configFilePath) {
      console.warn('[Session] No config file path provided, cannot clear stored session');
      return;
    }
    
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(this.configFilePath, 'utf8');
      const config = JSON.parse(configData);
      
      const currentProject = this.options.workingDirectory;
      
      // Remove session from project-specific config
      if (config.projectSessions && config.projectSessions[currentProject]) {
        const projectSession = config.projectSessions[currentProject];
        if (projectSession.userId === userId.toString()) {
          delete config.projectSessions[currentProject];
          console.log(`[Session] Cleared stored session for project ${currentProject}`);
        }
      }
      
      // Write back to file
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      
    } catch (error) {
      console.error('[Session] Error clearing stored session from config:', error.message);
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
  async handleTodoWrite(session, todos, _toolId) {
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

        } catch {
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
    let storedSessionId = this.getStoredSessionId(userId);
    
    // If no stored session from config file, check sessionStorage
    if (!storedSessionId) {
      const sessionStorage = this.sessionStorage.get(userId);
      if (sessionStorage && sessionStorage.currentSessionId) {
        storedSessionId = sessionStorage.currentSessionId;
      }
    }
    
    const sessionHistory = this.getSessionHistory(userId);

    // Check if we have any session info (active or stored)
    if (!session && !storedSessionId) {
      await this.mainBot.safeSendMessage(chatId, '📋 **No active session**\n\nSend a message to start!', 
        {});
      return;
    }

    let text = '📊 **Session Status**\n\n';

    // Get session summary/title for better identification
    let sessionSummary = null;
    const targetSessionId = session ? (session.sessionId || session.processor.getCurrentSessionId()) : storedSessionId;
    if (targetSessionId) {
      sessionSummary = await this.getSessionSummary(targetSessionId);
    }

    // Add session summary at the top if available
    if (sessionSummary) {
      text += `💡 **Current Work:** ${sessionSummary}\n\n`;
      
      // Check if title has changed and handle auto-pin
      await this.checkAndHandleTitleChange(userId, chatId, sessionSummary);
    }

    if (session) {
      // Active session exists
      const isActive = session.processor.isActive();
      const sessionId = session.sessionId || session.processor.getCurrentSessionId();
      const messageCount = session.messageCount;
      const uptime = Math.round((Date.now() - session.createdAt.getTime()) / 1000);
      
      // Get health status
      const healthStatus = this.checkSessionHealth(session);
      
      // Format activity time
      const timeSinceActivity = Math.round((Date.now() - session.lastActivityTime) / 1000);
      const activityText = timeSinceActivity < 60 ? 
        `${timeSinceActivity}s ago` : 
        `${Math.round(timeSinceActivity / 60)}m ago`;

      text += `🆔 **Current:** \`${sessionId ? sessionId.slice(-8) : 'Not started'}\`\n`;
      text += `📋 **Stored:** \`${storedSessionId ? storedSessionId.slice(-8) : 'None'}\`\n`;
      text += `📊 **Status:** ${isActive ? '🔄 Processing' : '💤 Idle'}\n`;
      text += `💬 **Messages:** ${messageCount}\n`;
      text += `⏱ **Uptime:** ${uptime}s\n\n`;
      
      // Token usage information with context window ratio - including cumulative from all parent sessions
      const currentTokens = session.tokenUsage;
      const contextLimit = this.getContextWindowLimit(this.options.model);
      
      // Get cumulative tokens from session chain (if continuation) or use current session tokens
      let displayTokens = currentTokens;
      if (session.isContinuation && storedSessionId) {
        // Get cumulative tokens from cache (should be available from session creation)
        const cumulativeTokens = this.cumulativeTokenCache.get(storedSessionId);
        if (cumulativeTokens) {
          // Combine cumulative parent tokens with current session tokens
          displayTokens = {
            totalInputTokens: cumulativeTokens.totalInputTokens + currentTokens.totalInputTokens,
            totalOutputTokens: cumulativeTokens.totalOutputTokens + currentTokens.totalOutputTokens,
            totalTokens: cumulativeTokens.totalTokens + currentTokens.totalTokens,
            transactionCount: cumulativeTokens.transactionCount + currentTokens.transactionCount,
            cacheReadTokens: cumulativeTokens.cacheReadTokens + currentTokens.cacheReadTokens,
            cacheCreationTokens: cumulativeTokens.cacheCreationTokens + currentTokens.cacheCreationTokens
          };
        }
      }
      
      if (displayTokens.transactionCount > 0) {
        // Calculate core tokens (input + output only, cache size tracked separately in Real Context)
        const coreTokens = displayTokens.totalInputTokens + displayTokens.totalOutputTokens;
        const usagePercentage = ((coreTokens / contextLimit) * 100).toFixed(1);
        
        // Always calculate real context usage including tool results and dynamic system overhead
        const toolResultsTokens = await this.calculateToolResultsSize(sessionId);
        const systemOverhead = await this.calculateSystemOverhead(sessionId, session.workingDirectory);
        const realContextUsage = coreTokens + toolResultsTokens + systemOverhead;
        const realUsagePercentage = ((realContextUsage / contextLimit) * 100).toFixed(1);
        text += `🎯 **Context:** ${realContextUsage.toLocaleString()} / ${contextLimit.toLocaleString()} (${realUsagePercentage}%)\n`;
        text += `   ↳ ${displayTokens.totalInputTokens} in, ${displayTokens.totalOutputTokens} out\n`;
        text += `   ↳ ${displayTokens.transactionCount} transaction${displayTokens.transactionCount > 1 ? 's' : ''}\n`;
        
        if (session.isContinuation) {
          // Show breakdown of previous vs current session tokens
          text += `   ↳ 🔄 Previous sessions: ${(displayTokens.totalInputTokens - currentTokens.totalInputTokens + displayTokens.totalOutputTokens - currentTokens.totalOutputTokens).toLocaleString()} tokens\n`;
          text += `   ↳ 📝 Current session: ${(currentTokens.totalInputTokens + currentTokens.totalOutputTokens).toLocaleString()} tokens\n`;
        }
        
        // Show tool results size if present
        if (toolResultsTokens > 0) {
          text += `🔧 **Tool Results:** ${toolResultsTokens.toLocaleString()} tokens\n`;
        }
        
        // Warning when approaching limit based on real usage
        if (realUsagePercentage > 80) {
          text += '⚠️ **Close to limit - consider /compact soon**\n';
        }
        
        text += '\n';
      } else {
        // Always calculate real context usage even when no tokens
        const toolResultsTokens = await this.calculateToolResultsSize(sessionId);
        const systemOverhead = await this.calculateSystemOverhead(sessionId, session.workingDirectory);
        const realContextUsage = toolResultsTokens + systemOverhead;
        const realUsagePercentage = ((realContextUsage / contextLimit) * 100).toFixed(1);
        text += `🎯 **Context:** ${realContextUsage.toLocaleString()} / ${contextLimit.toLocaleString()} (${realUsagePercentage}%)\n\n`;
      }
      
      // Activity and health status
      text += `💚 **Health:** ${healthStatus.isHealthy ? '✅ Healthy' : '⚠️ ' + healthStatus.reason}\n`;
      text += `⏰ **Last Activity:** ${activityText}\n`;
      text += `🔄 **Stream:** ${session.isStreamActive ? '🟢 Active' : '⚪ Idle'}\n`;
    } else if (storedSessionId) {
      // Only stored session exists (bot was restarted)
      text += '🆔 **Current:** 💤 **Not active**\n';
      text += `📋 **Stored:** \`${storedSessionId.slice(-8)}\` **(can resume)**\n`;
      text += '📊 **Status:** ⏸️ **Paused (bot restarted)**\n';
      text += '💬 **Messages:** -\n';
      text += '⏱ **Uptime:** -\n\n';
      
      // Get cumulative token usage from stored session chain
      const contextLimit = this.getContextWindowLimit(this.options.model);
      
      // Check if we have cumulative tokens cached, otherwise calculate them
      let cumulativeTokens = this.cumulativeTokenCache.get(storedSessionId);
      if (!cumulativeTokens) {
        // Calculate cumulative tokens if not cached (e.g., after bot restart)
        cumulativeTokens = await this.getCumulativeTokens(storedSessionId);
      }
      
      if (cumulativeTokens && cumulativeTokens.transactionCount > 0) {
        // Calculate core tokens (input + output only, cache size tracked separately in Real Context)
        const coreTokens = cumulativeTokens.totalInputTokens + cumulativeTokens.totalOutputTokens;
        const usagePercentage = ((coreTokens / contextLimit) * 100).toFixed(1);
        
        // Calculate real context usage for stored session
        const systemOverhead = await this.calculateSystemOverhead(storedSessionId, this.options.workingDirectory);
        const realContextUsage = coreTokens + systemOverhead;
        const realUsagePercentage = ((realContextUsage / contextLimit) * 100).toFixed(1);
        
        text += `🎯 **Context:** ${realContextUsage.toLocaleString()} / ${contextLimit.toLocaleString()} (${realUsagePercentage}%)\n`;
        text += `   ↳ ${cumulativeTokens.totalInputTokens} in, ${cumulativeTokens.totalOutputTokens} out\n`;
        text += `   ↳ ${cumulativeTokens.transactionCount} transaction${cumulativeTokens.transactionCount > 1 ? 's' : ''}\n`;
        text += '   ↳ 🔗 Includes all parent sessions in chain\n';
        
        // Warning when approaching limit based on real usage
        if (realUsagePercentage > 80) {
          text += '⚠️ **Close to limit - consider /compact soon**\n';
        }
        
        text += '\n';
      } else {
        // Calculate real context usage even when no cumulative tokens
        const systemOverhead = await this.calculateSystemOverhead(storedSessionId, this.options.workingDirectory);
        const realContextUsage = systemOverhead;
        const realUsagePercentage = ((realContextUsage / contextLimit) * 100).toFixed(1);
        text += `🎯 **Context:** ${realContextUsage.toLocaleString()} / ${contextLimit.toLocaleString()} (${realUsagePercentage}%)\n\n`;
      }
      
      text += '💡 **Send a message to resume this session**\n';
    }

    const path = require('path');
    text += `📁 **Directory:** ${path.basename(this.options.workingDirectory)}\n`;
    text += `📚 **History:** ${sessionHistory.length} sessions\n`;
    
    const actualModel = this.getUserModel(userId) || this.options.model;
    text += `🤖 **Model:** ${actualModel}\n`;
    
    // Add thinking mode display
    const thinkingMode = this.getUserThinkingMode(userId);
    if (thinkingMode) {
      const thinkingDisplay = this.getThinkingModeDisplay(thinkingMode);
      text += `🧠 **Thinking Mode:** ${thinkingDisplay}`;
    }

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

    // Clear current session ID from both memory and config file to force new session
    await this.clearStoredSession(userId);
    
    // IMPORTANT: Reset thinking mode to 'auto' for new sessions
    // This ensures fresh sessions start with default thinking mode
    console.log(`[User ${userId}] Resetting thinking mode to 'auto' for new session`);
    this.mainBot.storeUserThinkingMode(userId, 'auto');
    
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
        reply_markup: this.mainBot.keyboardHandlers.getReplyKeyboardMarkup(userId)
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
        reply_markup: this.mainBot.keyboardHandlers.getReplyKeyboardMarkup(userId)
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
    
    // Clear current session ID from both memory and config file
    await this.clearStoredSession(userId);

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
        reply_markup: this.mainBot.keyboardHandlers.getReplyKeyboardMarkup(userId)
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
          
          text += `${startIndex + index + 1}) \`${shortId}\` • ${timeAgo}\n`;
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
  getCurrentDirectory(_userId) {
    // For now, return the bot's working directory
    // In future, could be user-specific
    return this.options.workingDirectory;
  }

  /**
   * Get token usage from Claude Code session file
   */
  async getSessionTokenUsage(sessionId, customSessionsDir = null) {
    if (!sessionId) {
      return null;
    }

    try {
      const path = require('path');
      const fs = require('fs').promises;
      const os = require('os');

      // Use custom sessions directory for testing, otherwise compute real one
      let sessionsDir;
      if (customSessionsDir) {
        sessionsDir = customSessionsDir;
      } else {
        // Convert project path to Claude Code directory format
        const projectPath = this.options.workingDirectory;
        const claudeProjectDir = projectPath.replace(/\//g, '-').replace(/^-/, '');
        sessionsDir = path.join(os.homedir(), '.claude', 'projects', `-${claudeProjectDir}`);
      }
      
      const sessionFilePath = path.join(sessionsDir, `${sessionId}.jsonl`);

      // Check if session file exists
      await fs.access(sessionFilePath);
      
      // Read the session file and parse token usage from result messages
      const content = await fs.readFile(sessionFilePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let cacheReadTokens = 0;
      let cacheCreationTokens = 0;
      let transactionCount = 0;
      
      // Look for result messages with usage data
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          
          // Check for usage in different message types
          let usage = null;
          if (data.type === 'result' && data.usage) {
            usage = data.usage;
          } else if (data.type === 'assistant' && data.message && data.message.usage) {
            usage = data.message.usage;
          } else if (data.usage) {
            usage = data.usage;
          }
          
          if (usage) {
            totalInputTokens += parseInt(usage.input_tokens) || 0;
            totalOutputTokens += parseInt(usage.output_tokens) || 0;
            cacheReadTokens += parseInt(usage.cache_read_input_tokens) || 0;
            cacheCreationTokens += parseInt(usage.cache_creation_input_tokens) || 0;
            transactionCount += 1;
          }
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }
      
      // Only return token usage if we found some data
      if (transactionCount > 0) {
        return {
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          transactionCount,
          cacheReadTokens,
          cacheCreationTokens
        };
      }
      
      return null;
      
    } catch (error) {
      // Session file not found or other error
      console.error(`[SessionManager] Error reading session tokens for ${sessionId}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate system overhead tokens (CLAUDE.md, active cache, system prompts)
   */
  async calculateSystemOverhead(sessionId, workingDirectory) {
    try {
      let totalOverhead = 0;
      
      // 1. Calculate CLAUDE.md size
      const fs = require('fs');
      const path = require('path');
      
      // Check for CLAUDE.md in working directory
      if (workingDirectory && fs.existsSync(workingDirectory)) {
        const claudeMdPath = path.join(workingDirectory, 'CLAUDE.md');
        if (fs.existsSync(claudeMdPath)) {
          const stats = fs.statSync(claudeMdPath);
          const claudeMdTokens = Math.ceil(stats.size / 4); // Rough estimate: 4 chars per token
          totalOverhead += claudeMdTokens;
          console.log(`[SystemOverhead] CLAUDE.md: ${claudeMdTokens} tokens`);
        }
      }
      
      // 2. Active cache is already included in context, don't double-count
      // const activeCacheTokens = await this.getActiveCacheSize(sessionId);
      // totalOverhead += activeCacheTokens;
      
      // 3. System prompts and metadata (Claude Code system prompts, env info, etc)
      const systemPromptsTokens = 15000; // Estimated based on Claude Code system prompts
      totalOverhead += systemPromptsTokens;
      
      console.log(`[SystemOverhead] Total: ${totalOverhead} tokens (CLAUDE.md: ${totalOverhead - systemPromptsTokens}, system: ${systemPromptsTokens})`);
      return totalOverhead;
      
    } catch (error) {
      console.error('[SystemOverhead] Error calculating overhead:', error.message);
      return 15000; // Fallback to system prompts only
    }
  }

  /**
   * Get active cache size from the most recent request in session
   */
  async getActiveCacheSize(sessionId) {
    try {
      const sessionFile = this.getSessionFilePath(sessionId);
      if (!require('fs').existsSync(sessionFile)) {
        return 0;
      }

      const content = require('fs').readFileSync(sessionFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Find the last entry with usage data
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const data = JSON.parse(lines[i]);
          let usage = null;
          
          if (data.type === 'assistant' && data.message && data.message.usage) {
            usage = data.message.usage;
          } else if (data.usage) {
            usage = data.usage;
          }
          
          if (usage && usage.cache_read_input_tokens) {
            const cacheSize = usage.cache_read_input_tokens;
            console.log(`[SystemOverhead] Active cache: ${cacheSize} tokens`);
            return cacheSize;
          }
        } catch (parseError) {
          continue;
        }
      }
      
      return 0;
    } catch (error) {
      console.error('[SystemOverhead] Error getting active cache size:', error.message);
      return 0;
    }
  }

  /**
   * Get parent session ID from session file
   */
  async getParentSessionId(sessionId, customSessionsDir = null) {
    if (!sessionId) {
      return null;
    }

    try {
      const path = require('path');
      const fs = require('fs').promises;
      const os = require('os');

      // Use custom sessions directory for testing, otherwise compute real one
      let sessionsDir;
      if (customSessionsDir) {
        sessionsDir = customSessionsDir;
      } else {
        // Convert project path to Claude Code directory format
        const projectPath = this.options.workingDirectory;
        const claudeProjectDir = projectPath.replace(/\//g, '-').replace(/^-/, '');
        sessionsDir = path.join(os.homedir(), '.claude', 'projects', `-${claudeProjectDir}`);
      }
      
      const sessionFilePath = path.join(sessionsDir, `${sessionId}.jsonl`);

      // Check if session file exists
      await fs.access(sessionFilePath);
      
      // Read the first line to get parent session ID
      const content = await fs.readFile(sessionFilePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length > 0) {
        try {
          const firstLine = JSON.parse(lines[0]);
          return firstLine.parentUuid || null;
        } catch {
          return null;
        }
      }
      
      return null;
      
    } catch (error) {
      console.error(`[SessionManager] Error reading parent session ID for ${sessionId}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate cumulative tokens from all parent sessions in the chain
   */
  async calculateCumulativeTokens(sessionId, customSessionsDir = null) {
    if (!sessionId) {
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        transactionCount: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      };
    }

    // Check if we already have this cached
    if (this.cumulativeTokenCache.has(sessionId)) {
      return this.cumulativeTokenCache.get(sessionId);
    }

    const result = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      transactionCount: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0
    };

    // Walk up the session chain
    let currentSessionId = sessionId;
    const visitedSessions = new Set(); // Prevent infinite loops
    
    while (currentSessionId && !visitedSessions.has(currentSessionId)) {
      visitedSessions.add(currentSessionId);
      
      // Get tokens for current session
      const sessionTokens = await this.getSessionTokenUsage(currentSessionId, customSessionsDir);
      if (sessionTokens) {
        result.totalInputTokens += sessionTokens.totalInputTokens;
        result.totalOutputTokens += sessionTokens.totalOutputTokens;
        result.totalTokens += sessionTokens.totalTokens;
        result.transactionCount += sessionTokens.transactionCount;
        result.cacheReadTokens += sessionTokens.cacheReadTokens;
        result.cacheCreationTokens += sessionTokens.cacheCreationTokens;
      }

      // Get parent session ID
      currentSessionId = await this.getParentSessionId(currentSessionId, customSessionsDir);
    }

    // Cache the result for future use
    this.cumulativeTokenCache.set(sessionId, result);
    
    return result;
  }

  /**
   * Get or calculate cumulative tokens for a session chain
   */
  async getCumulativeTokens(sessionId, customSessionsDir = null) {
    // If we have it cached, return it
    if (this.cumulativeTokenCache.has(sessionId)) {
      return this.cumulativeTokenCache.get(sessionId);
    }

    // Otherwise calculate and cache it
    return await this.calculateCumulativeTokens(sessionId, customSessionsDir);
  }

  /**
   * Get session summary from Claude Code session file
   */
  async getSessionSummary(sessionId, customSessionsDir = null) {
    if (!sessionId) {
      return null;
    }

    try {
      const path = require('path');
      const fs = require('fs').promises;
      const os = require('os');

      // Use custom sessions directory for testing, otherwise compute real one
      let sessionsDir;
      if (customSessionsDir) {
        sessionsDir = customSessionsDir;
      } else {
        // Convert project path to Claude Code directory format
        const projectPath = this.options.workingDirectory;
        const claudeProjectDir = projectPath.replace(/\//g, '-').replace(/^-/, '');
        sessionsDir = path.join(os.homedir(), '.claude', 'projects', `-${claudeProjectDir}`);
      }
      
      const sessionFilePath = path.join(sessionsDir, `${sessionId}.jsonl`);

      // Check if session file exists
      await fs.access(sessionFilePath);
      
      // Read the first few lines to find the summary
      const content = await fs.readFile(sessionFilePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Look for summary in the first few lines
      for (const line of lines.slice(0, 5)) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'summary' && data.summary) {
            return data.summary;
          }
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }
      
      // If no summary found, try to extract from first user message
      for (const line of lines.slice(0, 10)) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'user' && data.message && data.message.content && !data.isMeta) {
            let content = data.message.content;
            
            // Handle array content
            if (Array.isArray(content)) {
              const textContent = content.find(item => item.type === 'text');
              content = textContent ? textContent.text : null;
            }
            
            if (typeof content === 'string' && content.trim()) {
              // Extract meaningful part, skip command metadata
              if (content.includes('<command-name>')) {
                continue;
              }
              
              // Truncate and return as fallback summary
              const summary = content.length > 60 ? content.substring(0, 60) + '...' : content;
              return summary;
            }
          }
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }
      
      return null;
      
    } catch {
      // Session file not found or other error
      return null;
    }
  }

  /**
   * Check if session title has changed and send/pin message if it has
   */
  async checkAndHandleTitleChange(userId, chatId, newTitle) {
    if (!newTitle) return;

    const titleInfo = this.sessionTitles.get(userId);
    const lastTitle = titleInfo?.lastTitle;

    // Only proceed if title has actually changed
    if (lastTitle !== newTitle) {
      console.log(`[User ${userId}] Title changed from "${lastTitle}" to "${newTitle}"`);
      
      // Update stored title
      this.sessionTitles.set(userId, { lastTitle: newTitle, chatId: chatId });
      
      // Don't send pin message for very first title (when lastTitle is undefined)
      if (lastTitle !== undefined) {
        await this.sendAndPinTitleMessage(chatId, newTitle);
      }
    }
  }

  /**
   * Send a title message and pin it to the chat
   */
  async sendAndPinTitleMessage(chatId, title) {
    try {
      const message = `💡 **Current Work:** ${title}`;
      
      const sentMessage = await this.mainBot.safeSendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_notification: true
      });

      if (sentMessage && sentMessage.message_id) {
        await this.bot.pinChatMessage(chatId, sentMessage.message_id, {
          disable_notification: true
        });
        console.log(`[Chat ${chatId}] Pinned title message: "${title}"`);
      }
    } catch (error) {
      console.error(`[Chat ${chatId}] Failed to send/pin title message:`, error.message);
    }
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
          
          text += `${startIndex + index + 1}) \`${shortId}\` • ${timeAgo}\n`;
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
        
      } catch {
        await this.mainBot.safeSendMessage(chatId, 
          '❌ **Error updating session history**\n\nPlease use /sessions to view history again.',
          {}
        );
      }
    }
  }

  // Safe Send Message Wrapper
  async safeSendMessage(chatId, text, options = {}) {
    try {
      return await this.mainBot.safeSendMessage(chatId, text, options);
    } catch (error) {
      console.error('Failed to send message:', error.message);
      throw error;
    }
  }

  /**
   * Update session activity timestamp and stream status
   */
  updateSessionActivity(session) {
    session.lastActivityTime = Date.now();
    session.isStreamActive = true;
    
    // Auto-reset stream activity after 5 seconds of inactivity
    if (session.activityTimer) {
      clearTimeout(session.activityTimer);
    }
    
    session.activityTimer = setTimeout(() => {
      session.isStreamActive = false;
    }, 5000);
  }

  /**
   * Update token usage from execution data
   */
  updateTokenUsage(session, executionData) {
    // Check if we have usage data or cost data (indicates usage even if tokens are 0)
    if (!executionData.usage && !executionData.cost) {
      return;
    }

    const usage = executionData.usage || {};
    const cost = executionData.cost || 0;
    
    // Validate usage data
    const inputTokens = parseInt(usage.input_tokens) || 0;
    const outputTokens = parseInt(usage.output_tokens) || 0;
    const cacheReadTokens = parseInt(usage.cache_read_input_tokens) || 0;
    const cacheCreationTokens = parseInt(usage.cache_creation_input_tokens) || 0;

    // Update if we have valid token data OR if there's a cost (indicating real usage)
    const hasTokens = inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0 || cacheCreationTokens > 0;
    const hasCost = cost > 0;

    if (hasTokens || hasCost) {
      // If tokens are 0 but there's cost, estimate token usage from cost
      // Sonnet 4 costs: $12/1M input, $60/1M output (approximate)
      let estimatedInputTokens = inputTokens;
      let estimatedOutputTokens = outputTokens;

      if (!hasTokens && hasCost) {
        // Rough estimation: assume 70% input, 30% output cost split
        const inputCost = cost * 0.7;
        const outputCost = cost * 0.3;
        estimatedInputTokens = Math.round((inputCost / 12) * 1000000);
        estimatedOutputTokens = Math.round((outputCost / 60) * 1000000);
        
        console.log(`[User ${session.userId}] Estimated tokens from cost $${cost}: ${estimatedInputTokens} in, ${estimatedOutputTokens} out`);
      }

      session.tokenUsage.totalInputTokens += estimatedInputTokens;
      session.tokenUsage.totalOutputTokens += estimatedOutputTokens;
      session.tokenUsage.cacheReadTokens += cacheReadTokens;
      session.tokenUsage.cacheCreationTokens += cacheCreationTokens;
      session.tokenUsage.totalTokens = session.tokenUsage.totalInputTokens + session.tokenUsage.totalOutputTokens;
      session.tokenUsage.transactionCount += 1;

      console.log(`[User ${session.userId}] Token usage updated: ${session.tokenUsage.totalTokens} total (${session.tokenUsage.transactionCount} transactions)`);
    }
  }

  /**
   * Get context window limit for a given model
   */
  getContextWindowLimit(model) {
    const contextLimits = {
      'claude-4-opus': 200000,
      'claude-4-sonnet': 200000,
      'claude-sonnet-4-20250514': 200000,
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-sonnet': 200000,
      'claude-3-opus': 200000,
      'claude-3-haiku': 200000,
      'opus': 200000,
      'sonnet': 200000,
      'haiku': 200000
    };
    
    // Check exact match first
    if (contextLimits[model]) {
      return contextLimits[model];
    }
    
    // Check partial matches
    const modelLower = model.toLowerCase();
    for (const [key, limit] of Object.entries(contextLimits)) {
      if (modelLower.includes(key) || key.includes(modelLower)) {
        return limit;
      }
    }
    
    // Default to 200k if unknown
    return 200000;
  }

  /**
   * Check if auto-compact should be triggered
   */
  async checkAutoCompact(session, chatId) {
    try {
      const tokens = session.tokenUsage;
      
      // Skip if auto-compact already in progress
      if (session.autoCompactInProgress) {
        return;
      }
      
      // Skip if this session is already running a compact command
      if (session.isCompactSession) {
        return;
      }
      
      // Only check if we have token data
      if (!tokens || tokens.transactionCount === 0) {
        return;
      }
      
      // Calculate real context including dynamic system overhead (CLAUDE.md, system prompts, active cache)
      const coreTokens = tokens.totalInputTokens + tokens.totalOutputTokens;
      const systemOverhead = await this.calculateSystemOverhead(session.sessionId, session.workingDirectory);
      const toolResultsTokens = await this.calculateToolResultsSize(session.sessionId);
      const realContextTokens = coreTokens + systemOverhead + toolResultsTokens;
      
      const contextLimit = this.getContextWindowLimit(this.options.model);
      const coreUsagePercentage = (coreTokens / contextLimit) * 100;
      const realUsagePercentage = (realContextTokens / contextLimit) * 100;
      
      console.log(`[User ${session.userId}] Context usage: ${coreTokens}/${contextLimit} (${coreUsagePercentage.toFixed(1)}%) | Real: ${realContextTokens}/${contextLimit} (${realUsagePercentage.toFixed(1)}%)`);
      
      // Trigger auto-compact based on REAL context usage if less than 5% remaining (95% used)
      if (realUsagePercentage >= 95) {
        console.log(`[User ${session.userId}] Auto-compact triggered at ${realUsagePercentage.toFixed(1)}% real usage`);
        session.autoCompactInProgress = true;
        await this.performAutoCompact(session, chatId);
      }
    } catch (error) {
      console.error(`[User ${session.userId}] Error checking auto-compact:`, error);
    }
  }

  /**
   * Perform auto-compact: stop current process and restart with /compact
   */
  async performAutoCompact(session, chatId) {
    try {
      const userId = session.userId;
      const currentSessionId = session.sessionId || session.processor.getCurrentSessionId();
      
      if (!currentSessionId) {
        console.error(`[User ${userId}] Cannot perform auto-compact: no session ID`);
        return;
      }
      
      console.log(`[User ${userId}] Performing auto-compact for session ${currentSessionId.slice(-8)}`);
      
      // Send notification to user
      await this.mainBot.safeSendMessage(chatId, 
        '🔄 **Auto-compact triggered**\n\n' +
        '⚠️ Context window nearly full (>95%)\n' +
        '🛠️ Compacting session automatically...\n\n' +
        '⏳ Please wait...'
      );
      
      // Stop current process
      if (session.processor && session.processor.isActive()) {
        session.processor.cancel();
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Store current session and clean up
      if (currentSessionId) {
        this.addSessionToHistory(userId, currentSessionId);
        this.storeSessionId(userId, currentSessionId);
      }
      
      // Remove from active processors
      this.activeProcessors.delete(session.processor);
      this.deleteUserSession(userId);
      
      // Create new session for compact
      const newSession = await this.createUserSession(userId, chatId);
      
      // Mark this as a compact session to prevent recursive auto-compact
      newSession.isCompactSession = true;
      
      // Resume with /compact command
      console.log(`[User ${userId}] Resuming session ${currentSessionId.slice(-8)} with /compact`);
      await newSession.processor.resumeSession(currentSessionId, '/compact');
      
    } catch (error) {
      console.error(`[User ${session.userId}] Error performing auto-compact:`, error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Auto-compact failed**\n\n' +
        'Please try running `/compact` manually.'
      );
    }
  }

  /**
   * Check session health status
   */
  checkSessionHealth(session) {
    const now = Date.now();
    const timeSinceActivity = now - session.lastActivityTime;
    // const timeSinceHealthCheck = now - session.lastHealthCheck;
    
    // Update health check timestamp
    session.lastHealthCheck = now;
    
    // Check for stale activity (more than 3 minutes)
    if (timeSinceActivity > 180000) {
      session.isHealthy = false;
      return {
        isHealthy: false,
        reason: 'stale activity (>3min)',
        timeSinceActivity: Math.round(timeSinceActivity / 1000)
      };
    }
    
    // Check if processor is responsive
    if (session.processor && typeof session.processor.isResponsive === 'function' && !session.processor.isResponsive()) {
      session.isHealthy = false;
      return {
        isHealthy: false,
        reason: 'unresponsive processor',
        timeSinceActivity: Math.round(timeSinceActivity / 1000)
      };
    }
    
    // Session is healthy
    session.isHealthy = true;
    return {
      isHealthy: true,
      reason: 'active and responsive',
      timeSinceActivity: Math.round(timeSinceActivity / 1000)
    };
  }

  /**
   * Get user's thinking mode preference
   */
  getUserThinkingMode(userId) {
    if (!this.mainBot.userPreferences) {
      return 'auto';
    }
    return this.mainBot.userPreferences.get(`${userId}_thinking`) || 'auto';
  }

  /**
   * Get thinking mode display format
   */
  getThinkingModeDisplay(thinkingMode) {
    const thinkingModes = {
      'none': '🚫 None',
      'light': '💡 Light',
      'medium': '🧠 Medium', 
      'deep': '🎯 Deep',
      'max': '🚀 Maximum',
      'auto': '🤖 Auto'
    };
    
    return thinkingModes[thinkingMode] || `🤔 ${thinkingMode}`;
  }

  /**
   * Get thinking mode config by ID
   */
  getThinkingModeById(id) {
    const thinkingModes = this.mainBot.thinkingModes || [
      { id: 'none', name: 'None', description: 'No thinking process' },
      { id: 'light', name: 'Light', description: 'Basic reasoning' },
      { id: 'medium', name: 'Medium', description: 'Balanced analysis' },
      { id: 'deep', name: 'Deep', description: 'Thorough consideration' },
      { id: 'max', name: 'Maximum', description: 'Exhaustive analysis' }
    ];
    return thinkingModes.find(mode => mode.id === id) || thinkingModes[0];
  }

  /**
   * Get stored session title from config file
   */
  getStoredSessionTitle(userId) {
    // Get session title from memory (not config)
    const titleInfo = this.sessionTitles.get(userId);
    return titleInfo ? titleInfo.lastTitle : null;
  }

  /**
   * Set session title in memory only (not config)
   */
  setStoredSessionTitle(userId, title, chatId) {
    this.sessionTitles.set(userId, { lastTitle: title, chatId: chatId });
  }

  /**
   * Update session title from latest JSONL content (throttled)
   */
  async updateSessionTitle(session, userId) {
    // Throttle updates to avoid excessive file system access
    const now = Date.now();
    if (!session.lastTitleUpdate || now - session.lastTitleUpdate > 30000) { // Update at most every 30 seconds
      session.lastTitleUpdate = now;
      
      try {
        const sessionId = session.sessionId || session.processor.getCurrentSessionId();
        if (sessionId) {
          const newTitle = await this.getSessionSummary(sessionId);
          if (newTitle) {
            console.log(`[User ${userId}] Session title updated: "${newTitle}"`);
            // Store title only in memory (not in config)
            this.setStoredSessionTitle(userId, newTitle, null);
          }
        }
      } catch (error) {
        console.error(`[User ${userId}] Failed to update session title:`, error.message);
      }
    }
  }

  /**
   * Handle Claude Code errors, specifically "prompt too long" errors
   */
  async handleClaudeCodeError(sessionId, error) {
    try {
      // Find the session that corresponds to this sessionId
      let targetSession = null;
      let targetUserId = null;
      let targetChatId = null;

      for (const [userId, session] of this.userSessions) {
        if (session.sessionId === sessionId) {
          targetSession = session;
          targetUserId = userId;
          targetChatId = session.chatId;
          break;
        }
      }

      if (!targetSession) {
        console.error(`[SessionManager] No active session found for ID: ${sessionId}`);
        return;
      }

      if (error.type === 'prompt-too-long') {
        console.log(`[User ${targetUserId}] Handling prompt too long error for session ${sessionId.slice(-8)}`);
        
        // Send notification about auto-compact trigger
        await this.mainBot.safeSendMessage(targetChatId, 
          '🔄 **Auto-compact triggered**\n\n' +
          '⚠️ Claude Code returned "prompt too long" error\n' +
          '🛠️ Compacting session automatically...\n\n' +
          '⏳ Please wait...'
        );

        // Execute compact command
        const compactSuccess = await this._executeClaudeCompact(sessionId);
        
        if (compactSuccess) {
          // Send success message with continue button
          await this.mainBot.safeSendMessage(targetChatId,
            '✅ **Auto-compact completed**\n\n' +
            '🔄 Session has been compacted successfully\n' +
            '💡 You can now continue your conversation',
            {
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: '✅ Continue Session',
                    callback_data: `continue_after_compact:${sessionId.slice(-8)}:${targetChatId}:${targetUserId}`
                  }
                ]]
              }
            }
          );
        } else {
          await this.mainBot.safeSendMessage(targetChatId,
            '❌ **Session Recovery Failed**\n\n' +
            '🔧 Auto-compact completed, but the session cannot be resumed\n' +
            '📄 This usually means the session file is too corrupted to recover\n\n' +
            '💡 **Options:**\n' +
            '• Start a new session (recommended)\n' +
            '• Try manual compact: `claude -r [session-id] /compact`\n' +
            '• Contact support if the issue persists',
            {
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: '🆕 Start New Session',
                    callback_data: `start_new_session:${targetUserId}:${targetChatId}`
                  }
                ]]
              }
            }
          );
        }
      }
    } catch (error) {
      console.error('[SessionManager] Error handling Claude Code error:', error);
    }
  }

  /**
   * Execute Claude compact command
   */
  async _executeClaudeCompact(sessionId) {
    return new Promise((resolve) => {
      try {
        const { spawn } = require('child_process');
        
        console.log(`[SessionManager] Executing compact for session ${sessionId.slice(-8)}`);
        
        const compactProcess = spawn('claude', ['-r', sessionId, '/compact'], {
          cwd: this.options.workingDirectory,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';

        compactProcess.stdout.on('data', () => {
          // Compact output is not needed, just consume the stream
        });

        compactProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        compactProcess.on('close', async (code) => {
          if (code === 0) {
            console.log(`[SessionManager] Compact completed for session ${sessionId.slice(-8)}, validating...`);
            
            // Test if session can actually be resumed after compact
            const isResumable = await this._validateSessionAfterCompact(sessionId);
            
            if (isResumable) {
              console.log(`[SessionManager] Compact successful for session ${sessionId.slice(-8)}`);
              resolve(true);
            } else {
              console.error(`[SessionManager] Session ${sessionId.slice(-8)} still corrupted after compact`);
              resolve(false);
            }
          } else {
            console.error(`[SessionManager] Compact failed for session ${sessionId.slice(-8)}:`, stderr);
            resolve(false);
          }
        });

        compactProcess.on('error', (error) => {
          console.error('[SessionManager] Compact process error:', error);
          resolve(false);
        });

      } catch (error) {
        console.error('[SessionManager] Error executing compact:', error);
        resolve(false);
      }
    });
  }

  /**
   * Validate that a session can be resumed after compact
   */
  async _validateSessionAfterCompact(sessionId) {
    return new Promise((resolve) => {
      try {
        const { spawn } = require('child_process');
        
        console.log(`[SessionManager] Validating session ${sessionId.slice(-8)} after compact`);
        
        // Try to resume with a simple validation message  
        const userModel = this.getUserModel(this.mainBot.adminUserId) || this.options.model || 'sonnet';
        const testProcess = spawn('claude', ['-r', sessionId, '--model', userModel, 'echo \'validation test\''], {
          cwd: this.options.workingDirectory,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let hasResponse = false;

        testProcess.stdout.on('data', (data) => {
          stdout += data.toString();
          // If we get any actual response (not error), session is working
          if (stdout.includes('"type":"assistant"') || stdout.includes('validation test')) {
            hasResponse = true;
          }
        });

        testProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        testProcess.on('close', (code) => {
          // Session is valid if:
          // 1. Exit code is 0 AND we got a response, OR
          // 2. Exit code is non-zero but we got actual content (sometimes Claude returns 1 but works)
          const isValid = (code === 0 && hasResponse) || (hasResponse && !stderr.includes('Prompt is too long'));
          
          if (isValid) {
            console.log(`[SessionManager] Session ${sessionId.slice(-8)} validation successful`);
          } else {
            console.log(`[SessionManager] Session ${sessionId.slice(-8)} validation failed - code: ${code}, hasResponse: ${hasResponse}, stderr: ${stderr.slice(0, 100)}`);
          }
          
          resolve(isValid);
        });

        testProcess.on('error', (error) => {
          console.error('[SessionManager] Session validation error:', error);
          resolve(false);
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          testProcess.kill();
          console.log(`[SessionManager] Session ${sessionId.slice(-8)} validation timeout`);
          resolve(false);
        }, 30000);
        
      } catch (error) {
        console.error('[SessionManager] Error validating session after compact:', error);
        resolve(false);
      }
    });
  }

  /**
   * Handle start new session button after failed compact
   */
  async handleStartNewSession(userId, chatId, messageId) {
    try {
      // End current session if exists
      const currentSession = this.getUserSession(userId);
      if (currentSession) {
        await this.endSession(chatId, userId);
        console.log(`[User ${userId}] Ended corrupted session before starting new one`);
      }

      // Clear stored session ID
      this.clearCurrentSessionId(userId);

      // Update the button message
      await this.bot.editMessageText(
        '✅ **New Session Starting**\n\nPrevious session ended. Send a message to start fresh!',
        {
          chat_id: chatId,
          message_id: messageId
        }
      );

      console.log(`[User ${userId}] Started new session after failed compact recovery`);
    } catch (error) {
      console.error('[SessionManager] Error handling start new session:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '⚠️ **Error starting new session**\n\nPlease try using /new command.'
      );
    }
  }

  /**
   * Handle continue button callback after compact
   */
  async handleContinueAfterCompact(shortSessionId, chatId, messageId, userId) {
    try {
      const session = this.getUserSession(userId);
      
      if (session && session.processor) {
        // Use the current session ID from the user's session (auto-compact works on current session)
        const fullSessionId = session.processor.getCurrentSessionId();
        
        // Verify the short session ID matches (safety check)
        if (fullSessionId && fullSessionId.slice(-8) === shortSessionId) {
          // Send 'continue' message to Claude to resume the session
          await session.processor.continueConversation('continue', fullSessionId);
        
          // Update the button message
          await this.bot.editMessageText(
            '✅ **Session resumed**\n\nConversation has been resumed. You can continue chatting.',
            {
              chat_id: chatId,
              message_id: messageId
            }
          );
          
          console.log(`[User ${userId}] Session ${fullSessionId.slice(-8)} resumed after compact`);
        } else {
          // Session ID mismatch - shouldn't happen but handle gracefully
          await this.mainBot.safeSendMessage(chatId, 
            '⚠️ **Session mismatch**\n\nPlease start a new conversation.'
          );
        }
      } else {
        await this.mainBot.safeSendMessage(chatId, 
          '⚠️ **Session not found**\n\nPlease start a new conversation.'
        );
      }
    } catch (error) {
      console.error('[SessionManager] Error handling continue after compact:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Error resuming session**\n\nPlease try starting a new conversation.'
      );
    }
  }

  /**
   * Calculate tool results size from session JSONL file
   */
  async calculateToolResultsSize(sessionId, customSessionsDir = null) {
    // Check cache first
    if (this.toolResultsCache && this.toolResultsCache.has(sessionId)) {
      return this.toolResultsCache.get(sessionId);
    }
    
    try {
      const path = require('path');
      const fs = require('fs').promises;
      const os = require('os');

      // Use custom sessions directory for testing, otherwise compute real one
      let sessionsDir;
      if (customSessionsDir) {
        sessionsDir = customSessionsDir;
      } else {
        // Convert project path to Claude Code directory format
        const projectPath = this.options.workingDirectory;
        const claudeProjectDir = projectPath.replace(/\//g, '-').replace(/^-/, '');
        sessionsDir = path.join(os.homedir(), '.claude', 'projects', `-${claudeProjectDir}`);
      }
      
      const sessionFilePath = path.join(sessionsDir, `${sessionId}.jsonl`);

      // Check if session file exists
      await fs.access(sessionFilePath);
      
      // Read the session file and extract tool results
      const content = await fs.readFile(sessionFilePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      let totalToolResultsChars = 0;
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          
          // Look for tool_result content in user messages
          if (data.type === 'user' && data.message && data.message.content) {
            const messageContent = data.message.content;
            
            if (Array.isArray(messageContent)) {
              for (const item of messageContent) {
                if (item.type === 'tool_result' && item.content) {
                  const contentStr = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
                  totalToolResultsChars += contentStr.length;
                }
              }
            }
          }
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }
      
      // Convert characters to approximate token count (chars/4)
      const estimatedTokens = Math.ceil(totalToolResultsChars / 4);
      
      // Cache the result
      if (!this.toolResultsCache) {
        this.toolResultsCache = new Map();
      }
      this.toolResultsCache.set(sessionId, estimatedTokens);
      
      console.log(`[SessionManager] Tool results size for ${sessionId.slice(-8)}: ${estimatedTokens} tokens (${totalToolResultsChars} chars)`);
      
      return estimatedTokens;
      
    } catch (error) {
      console.error(`[SessionManager] Error calculating tool results size for ${sessionId}:`, error.message);
      return 0; // Return 0 if calculation fails
    }
  }

}

module.exports = SessionManager;
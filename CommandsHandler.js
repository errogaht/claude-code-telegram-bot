const fs = require('fs');
const path = require('path');

/**
 * Commands Handler for Slash Commands Management
 * Handles discovery, pagination, and execution of Claude Code slash commands
 */
class CommandsHandler {
  constructor(bot, sessionManager) {
    this.bot = bot;
    this.sessionManager = sessionManager;
    this.commandsCache = null;
    this.cacheTimestamp = null;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    this.COMMANDS_PER_PAGE = 10;
  }

  /**
   * Discover slash commands from both project and global directories
   */
  async discoverCommands() {
    // Check cache first
    if (this.commandsCache && this.cacheTimestamp && 
        Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
      return this.commandsCache;
    }

    const commands = [];
    const projectCommandsDir = path.join(process.cwd(), '.claude', 'commands');
    const globalCommandsDir = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'commands');

    // Discover project commands
    await this.discoverCommandsInDirectory(projectCommandsDir, commands, 'project');
    
    // Discover global commands  
    await this.discoverCommandsInDirectory(globalCommandsDir, commands, 'global');

    // Sort commands alphabetically
    commands.sort((a, b) => a.name.localeCompare(b.name));

    // Update cache
    this.commandsCache = commands;
    this.cacheTimestamp = Date.now();

    return commands;
  }

  /**
   * Discover commands in a specific directory
   */
  async discoverCommandsInDirectory(dir, commands, scope) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const scanDirectory = (currentDir, prefix = '') => {
      try {
        const items = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(currentDir, item.name);
          
          if (item.isDirectory()) {
            // Recursively scan subdirectories (for namespaced commands)
            scanDirectory(fullPath, prefix ? `${prefix}:${item.name}` : item.name);
          } else if (item.isFile() && item.name.endsWith('.md')) {
            // Parse command file
            const commandName = path.basename(item.name, '.md');
            const displayName = prefix ? `${prefix}:${commandName}` : commandName;
            
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const command = this.parseCommandFile(content, displayName, scope, fullPath);
              if (command) {
                commands.push(command);
              }
            } catch (error) {
              console.error(`[CommandsHandler] Error parsing command ${fullPath}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`[CommandsHandler] Error scanning directory ${currentDir}:`, error);
      }
    };

    scanDirectory(dir);
  }

  /**
   * Parse command file and extract metadata
   */
  parseCommandFile(content, name, scope, filePath) {
    const command = {
      name: name,
      scope: scope,
      filePath: filePath,
      description: '',
      argumentHint: '',
      allowedTools: []
    };

    // Parse frontmatter if present
    if (content.startsWith('---')) {
      const frontmatterEnd = content.indexOf('---', 3);
      if (frontmatterEnd !== -1) {
        const frontmatter = content.substring(3, frontmatterEnd);
        const lines = frontmatter.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('description:')) {
            command.description = trimmedLine.substring(12).trim();
          } else if (trimmedLine.startsWith('argument-hint:')) {
            command.argumentHint = trimmedLine.substring(14).trim();
          } else if (trimmedLine.startsWith('allowed-tools:')) {
            // Parse array format
            const toolsString = trimmedLine.substring(14).trim();
            if (toolsString.startsWith('[') && toolsString.endsWith(']')) {
              command.allowedTools = toolsString.slice(1, -1).split(',').map(t => t.trim());
            }
          }
        }
        
        // Extract content after frontmatter
        const mainContent = content.substring(frontmatterEnd + 3).trim();
        if (!command.description && mainContent) {
          // Use first line of content as description if no frontmatter description
          const firstLine = mainContent.split('\n')[0].trim();
          if (firstLine.startsWith('#')) {
            command.description = firstLine.replace(/^#+\s*/, '');
          }
        }
      }
    } else {
      // No frontmatter, try to extract from content
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('#') && !command.description) {
          command.description = trimmedLine.replace(/^#+\s*/, '');
          break;
        }
      }
    }

    // Generate slash command
    command.slashCommand = `/${name}`;

    return command;
  }

  /**
   * Show commands menu with pagination
   */
  async showCommandsMenu(chatId, page = 0, messageId = null) {
    try {
      const commands = await this.discoverCommands();
      const totalPages = Math.ceil(commands.length / this.COMMANDS_PER_PAGE);
      
      if (commands.length === 0) {
        const message = '⚡ **Commands**\n\n' +
          'No slash commands found.\n\n' +
          '💡 **Tip:** Add commands to `.claude/commands/` (project) or `~/.claude/commands/` (global)';
        
        if (messageId) {
          await this.bot.safeEditMessage(chatId, messageId, message);
        } else {
          await this.bot.safeSendMessage(chatId, message);
        }
        return;
      }

      const startIndex = page * this.COMMANDS_PER_PAGE;
      const endIndex = Math.min(startIndex + this.COMMANDS_PER_PAGE, commands.length);
      const pageCommands = commands.slice(startIndex, endIndex);

      let message = `⚡ **Commands** (Page ${page + 1}/${totalPages})\n\n`;
      message += 'Available slash commands:\n\n';

      // Add numbered commands (1-10)
      pageCommands.forEach((command, index) => {
        const number = index + 1;
        const scopeIcon = command.scope === 'global' ? '🌍' : '📁';
        message += `**${number}.** ${scopeIcon} \`${command.slashCommand}\`\n`;
        if (command.description) {
          message += `   ${command.description}\n`;
        }
        if (command.argumentHint) {
          message += `   💡 Usage: \`${command.slashCommand} ${command.argumentHint}\`\n`;
        }
        message += '\n';
      });

      message += '👆 **Tap a number (1-10) to execute the command**';

      const keyboard = this.createCommandsKeyboard(page, totalPages, pageCommands.length);
      
      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
      } else {
        await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
      }
      
    } catch (error) {
      console.error('[CommandsHandler] Error showing commands menu:', error);
      const errorMessage = '❌ **Commands Error**\n\n' + 'Failed to load commands list.';
      
      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, errorMessage);
      } else {
        await this.bot.safeSendMessage(chatId, errorMessage);
      }
    }
  }

  /**
   * Create commands keyboard with numbered buttons and pagination
   */
  createCommandsKeyboard(page = 0, totalPages = 1, commandsOnPage = 0) {
    const keyboard = {
      inline_keyboard: []
    };

    // Add numbered buttons (1-10) in rows of 5
    if (commandsOnPage > 0) {
      const maxButtons = Math.min(commandsOnPage, 10);
      
      // First row (1-5)
      const firstRow = [];
      for (let i = 1; i <= Math.min(5, maxButtons); i++) {
        firstRow.push({
          text: i.toString(),
          callback_data: `cmd:exec:${page}:${i - 1}`
        });
      }
      keyboard.inline_keyboard.push(firstRow);
      
      // Second row (6-10) if needed
      if (maxButtons > 5) {
        const secondRow = [];
        for (let i = 6; i <= maxButtons; i++) {
          secondRow.push({
            text: i.toString(),
            callback_data: `cmd:exec:${page}:${i - 1}`
          });
        }
        keyboard.inline_keyboard.push(secondRow);
      }
    }

    // Add pagination if needed
    if (totalPages > 1) {
      const paginationRow = [];
      if (page > 0) {
        paginationRow.push({
          text: '◀️',
          callback_data: `cmd:page:${page - 1}`
        });
      }
      paginationRow.push({
        text: `${page + 1}/${totalPages}`,
        callback_data: 'noop'
      });
      if (page < totalPages - 1) {
        paginationRow.push({
          text: '▶️',
          callback_data: `cmd:page:${page + 1}`
        });
      }
      keyboard.inline_keyboard.push(paginationRow);
    }

    // Add close button
    keyboard.inline_keyboard.push([
      { text: '❌ Close', callback_data: 'cmd:close' }
    ]);

    return keyboard;
  }

  /**
   * Execute a command by index
   */
  async executeCommand(chatId, userId, page, commandIndex, messageId) {
    try {
      const commands = await this.discoverCommands();
      const startIndex = page * this.COMMANDS_PER_PAGE;
      const actualIndex = startIndex + commandIndex;

      if (actualIndex >= commands.length) {
        await this.bot.safeSendMessage(chatId, '❌ Command not found');
        return;
      }

      const command = commands[actualIndex];
      console.log(`[CommandsHandler] Executing command: ${command.slashCommand} for user ${userId}`);

      // Check if session is currently processing (only if session exists in memory)
      const userSession = this.sessionManager.userSessions.get(userId);
      if (userSession) {
        const isProcessing = userSession.processor && userSession.processor.isActive();
        if (isProcessing) {
          await this.bot.safeSendMessage(chatId, 
            '⏳ **Session Busy**\n\n' +
            'Claude is currently processing a request. Please wait for it to complete before executing commands.'
          );
          return;
        }
      }
      // If no session in memory, SessionManager will handle resuming/creating as needed

      // Show argument input interface
      await this.showArgumentInput(chatId, userId, command, messageId);
      
    } catch (error) {
      console.error('[CommandsHandler] Error executing command:', error);
      await this.bot.safeSendMessage(chatId, 
        '❌ **Command Execution Error**\n\n' +
        'Failed to execute the selected command.'
      );
    }
  }

  /**
   * Show argument input interface
   */
  async showArgumentInput(chatId, userId, command, messageId) {
    try {
      const scopeIcon = command.scope === 'global' ? '🌍' : '📁';
      let message = '⚡ **Execute Command**\n\n';
      message += `${scopeIcon} \`${command.slashCommand}\`\n`;
      
      if (command.description) {
        message += `📝 ${command.description}\n`;
      }
      
      message += '\n';
      
      if (command.argumentHint) {
        message += `💡 **Expected arguments:** \`${command.argumentHint}\`\n\n`;
        message += '📝 **Please type the arguments for this command, or send without arguments:**';
      } else {
        message += '✅ **This command requires no arguments.**\n\n';
        message += '🚀 **Ready to execute!**';
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Execute Without Arguments', callback_data: `cmd:run:${command.name}:noargs` },
            { text: '❌ Cancel', callback_data: 'cmd:close' }
          ]
        ]
      };

      // Store command for argument input
      this.pendingCommands = this.pendingCommands || new Map();
      this.pendingCommands.set(userId, {
        command: command,
        chatId: chatId,
        messageId: messageId
      });

      if (messageId) {
        await this.bot.safeEditMessage(chatId, messageId, message, { reply_markup: keyboard });
      } else {
        await this.bot.safeSendMessage(chatId, message, { reply_markup: keyboard });
      }

    } catch (error) {
      console.error('[CommandsHandler] Error showing argument input:', error);
      await this.bot.safeSendMessage(chatId, 
        '❌ **Argument Input Error**\n\n' +
        'Failed to show argument input interface.'
      );
    }
  }

  /**
   * Send command to Claude Code session
   */
  async sendCommandToSession(chatId, userId, command, args = '') {
    try {
      // Format full command with arguments
      const fullCommand = args.trim() ? `${command.slashCommand} ${args.trim()}` : command.slashCommand;
      
      // Clear pending command
      if (this.pendingCommands) {
        this.pendingCommands.delete(userId);
      }

      await this.bot.safeSendMessage(chatId, 
        '⚡ **Executing Command**\n\n' +
        `\`${fullCommand}\`\n\n` +
        '🚀 Sending to Claude Code session...'
      );

      // Use main bot's processUserMessage method to handle it like a regular message
      await this.bot.processUserMessage(fullCommand, userId, chatId);
      
    } catch (error) {
      console.error('[CommandsHandler] Error sending command to session:', error);
      await this.bot.safeSendMessage(chatId, 
        '❌ **Command Send Error**\n\n' +
        'Failed to send command to Claude session.'
      );
    }
  }

  /**
   * Handle text message input for command arguments
   */
  async handleTextMessage(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text;

    // Check if user has a pending command
    if (!this.pendingCommands || !this.pendingCommands.has(userId)) {
      return false; // Not handling this message
    }

    const pendingCommand = this.pendingCommands.get(userId);
    const { command } = pendingCommand;

    console.log(`[CommandsHandler] Processing argument input for command: ${command.slashCommand}`);
    
    // Send command with arguments
    await this.sendCommandToSession(chatId, userId, command, text);
    
    return true; // Message was handled
  }

  /**
   * Handle commands callbacks
   */
  async handleCommandsCallback(callbackData, chatId, messageId, userId) {
    try {
      if (callbackData.startsWith('cmd:page:')) {
        const page = parseInt(callbackData.split(':')[2]);
        await this.showCommandsMenu(chatId, page, messageId);
        return true;
      }

      if (callbackData.startsWith('cmd:exec:')) {
        const parts = callbackData.split(':');
        const page = parseInt(parts[2]);
        const commandIndex = parseInt(parts[3]);
        
        await this.executeCommand(chatId, userId, page, commandIndex, messageId);
        return true;
      }

      if (callbackData.startsWith('cmd:run:') && callbackData.endsWith(':noargs')) {
        const commandName = callbackData.replace('cmd:run:', '').replace(':noargs', '');
        
        // Find command by name
        const commands = await this.discoverCommands();
        const command = commands.find(cmd => cmd.name === commandName);
        
        if (command) {
          await this.sendCommandToSession(chatId, userId, command, '');
          await this.bot.bot.deleteMessage(chatId, messageId);
        } else {
          await this.bot.safeEditMessage(chatId, messageId, 
            '❌ **Command Not Found**\n\nThe selected command could not be found.'
          );
        }
        return true;
      }

      if (callbackData === 'cmd:close') {
        await this.bot.bot.deleteMessage(chatId, messageId);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[CommandsHandler] Callback error:', error);
      return false;
    }
  }

  /**
   * Clear commands cache (useful for refreshing)
   */
  clearCache() {
    this.commandsCache = null;
    this.cacheTimestamp = null;
  }

  /**
   * Get stats for debugging
   */
  async getStats() {
    const commands = await this.discoverCommands();
    const projectCommands = commands.filter(c => c.scope === 'project').length;
    const globalCommands = commands.filter(c => c.scope === 'global').length;
    
    return {
      totalCommands: commands.length,
      projectCommands: projectCommands,
      globalCommands: globalCommands,
      cacheAge: this.cacheTimestamp ? Date.now() - this.cacheTimestamp : null
    };
  }
}

module.exports = CommandsHandler;
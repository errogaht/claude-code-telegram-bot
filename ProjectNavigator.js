const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Project Navigator - Extracted from StreamTelegramBot  
 * Handles project selection and directory management
 */
class ProjectNavigator {
  constructor(bot, options, mainBot) {
    this.bot = bot;
    this.options = options;
    this.mainBot = mainBot; // Reference to main bot for delegation
    this.projectCache = new Map(); // shortId -> fullPath
    this.projectCacheCounter = 0;
  }


  /**
   * Get Claude projects from ~/.claude.json
   */
  getClaudeProjects() {
    try {
      const claudeConfigPath = path.join(os.homedir(), '.claude.json');
      
      if (!fs.existsSync(claudeConfigPath)) {
        console.log('⚠️ ~/.claude.json not found');
        return [];
      }
      
      const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      
      if (!claudeConfig.projects) {
        console.log('⚠️ No projects section found in ~/.claude.json');
        return [];
      }
      
      // Get all directories and filter existing ones
      const projectDirs = Object.keys(claudeConfig.projects).filter(dir => {
        return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
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
  async showProjectSelection(chatId, page = 0) {
    const projects = this.getClaudeProjects();
    
    if (projects.length === 0) {
      await this.mainBot.safeSendMessage(chatId, 
        `📁 **Current Directory**\n${this.options.workingDirectory}\n\n` +
        '❌ No Claude projects found\n' +
        '💡 Open projects in Claude Code first'
      );
      return;
    }
    
    // Pagination settings
    const projectsPerPage = 12;
    const startIndex = page * projectsPerPage;
    const endIndex = startIndex + projectsPerPage;
    const currentPageProjects = projects.slice(startIndex, endIndex);
    const totalPages = Math.ceil(projects.length / projectsPerPage);
    
    // Clear old cache and create new short IDs
    this.projectCache.clear();
    this.projectCacheCounter = 0;
    
    // Create inline buttons for projects with short IDs
    const buttons = currentPageProjects.map(projectPath => {
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
    
    // Add pagination buttons if needed
    if (totalPages > 1) {
      const paginationRow = [];
      
      if (page > 0) {
        paginationRow.push({
          text: '⬅️ Previous',
          callback_data: `setdir:page:${page - 1}`
        });
      }
      
      // Page indicator
      paginationRow.push({
        text: `${page + 1}/${totalPages}`,
        callback_data: 'setdir:pageinfo'
      });
      
      if (page < totalPages - 1) {
        paginationRow.push({
          text: 'Next ➡️',
          callback_data: `setdir:page:${page + 1}`
        });
      }
      
      buttons.push(paginationRow);
    }
    
    // Add refresh button
    buttons.push([{
      text: '🔄 Refresh Projects',
      callback_data: 'setdir:refresh'
    }]);
    
    const keyboard = { inline_keyboard: buttons };
    
    const pageInfo = totalPages > 1 ? `\n📄 Page ${page + 1}/${totalPages}` : '';
    
    await this.mainBot.safeSendMessage(chatId, 
      `📁 *Current Directory*\n${this.options.workingDirectory}\n\n` +
      '📋 **Select Claude Project:**\n' +
      `(Showing ${startIndex + 1}-${Math.min(endIndex, projects.length)} of ${projects.length} projects)${pageInfo}`,
      { reply_markup: keyboard }
    );
  }

  /**
   * Handle directory change from callback
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
      if (!fs.existsSync(actualPath)) {
        const errorMsg = `❌ Directory not found: ${actualPath}`;
        if (messageId) {
          await this.mainBot.safeEditMessage(chatId, messageId, errorMsg);
        } else {
          await this.mainBot.safeSendMessage(chatId, errorMsg);
        }
        return;
      }
      
      // Check if it's actually a directory
      const stats = fs.statSync(actualPath);
      if (!stats.isDirectory()) {
        const errorMsg = `❌ Not a directory: ${actualPath}`;
        if (messageId) {
          await this.mainBot.safeEditMessage(chatId, messageId, errorMsg);
        } else {
          await this.mainBot.safeSendMessage(chatId, errorMsg);
        }
        return;
      }
      
      // Update working directory
      this.options.workingDirectory = actualPath;
      
      // Update UnifiedWebServer project root to match new directory
      if (this.mainBot && this.mainBot.unifiedWebServer) {
        this.mainBot.unifiedWebServer.updateProjectRoot(actualPath);
      }
      
      // IMPORTANT: Save the new project to config immediately
      // This ensures the bot remembers the selected project after restart
      await this.saveCurrentProjectToConfig(actualPath);
      
      const successMsg = 
        '✅ **Directory Changed**\n\n' +
        `📁 **New Directory:**\n\`${actualPath}\`\n\n` +
        '💡 New sessions will use this directory\n' +
        '🔄 Use /new to start fresh session here';
      
      if (messageId) {
        await this.mainBot.safeEditMessage(chatId, messageId, successMsg);
      } else {
        await this.mainBot.safeSendMessage(chatId, successMsg);
      }
      
      console.log(`[ProjectNavigator] Directory changed to: ${actualPath}`);
      
    } catch (error) {
      const errorMsg = `❌ Error: ${error.message}`;
      if (messageId) {
        await this.mainBot.safeEditMessage(chatId, messageId, errorMsg);
      } else {
        await this.mainBot.safeSendMessage(chatId, errorMsg);
      }
    }
  }


  /**
   * Handle setdir callback routing
   */
  async handleSetdirCallback(dirAction, chatId, messageId) {
    if (dirAction === 'refresh') {
      await this.bot.deleteMessage(chatId, messageId);
      await this.showProjectSelection(chatId);
    } else if (dirAction.startsWith('page:')) {
      const page = parseInt(dirAction.split(':')[1]);
      await this.bot.deleteMessage(chatId, messageId);
      await this.showProjectSelection(chatId, page);
    } else if (dirAction === 'pageinfo') {
      // Do nothing for page info button
      return;
    } else {
      await this.handleDirectoryChange(dirAction, chatId, messageId);
    }
  }

  /**
   * Save current project to config file for persistence
   */
  async saveCurrentProjectToConfig(projectPath) {
    // Save the project as currentProject in config using ConfigManager
    if (this.mainBot && this.mainBot.configManager) {
      try {
        // Update the currentProject using ConfigManager (handles disk persistence)
        this.mainBot.configManager.setCurrentProject(projectPath);
        
        // Ensure projectSessions exists - ConfigManager handles this automatically
        const projectSessions = this.mainBot.configManager.getProjectSessions();
        
        // Note: We don't create a session here, just set the current project
        // Sessions will be created/updated when the user actually starts using the project
        
        console.log(`[ProjectNavigator] Saved current project to config: ${projectPath}`);
      } catch (error) {
        console.error('[ProjectNavigator] Error saving current project to config:', error.message);
      }
    } else if (this.mainBot && this.mainBot.configFilePath) {
      // Fallback to old method if ConfigManager not available
      try {
        const fs = require('fs');
        const configData = fs.readFileSync(this.mainBot.configFilePath, 'utf8');
        const config = JSON.parse(configData);
        
        config.currentProject = projectPath;
        if (!config.projectSessions) {
          config.projectSessions = {};
        }
        
        fs.writeFileSync(this.mainBot.configFilePath, JSON.stringify(config, null, 2));
        console.log(`[ProjectNavigator] Saved current project to config (fallback): ${projectPath}`);
      } catch (error) {
        console.error('[ProjectNavigator] Error saving current project to config (fallback):', error.message);
      }
    }
  }

  /**
   * Cleanup project cache
   */
  cleanup() {
    this.projectCache.clear();
    console.log('[ProjectNavigator] Cache cleared');
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      cachedProjects: this.projectCache.size,
      currentDirectory: this.options.workingDirectory
    };
  }
}

module.exports = ProjectNavigator;
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
  async showProjectSelection(chatId) {
    const projects = this.getClaudeProjects();
    
    if (projects.length === 0) {
      await this.mainBot.safeSendMessage(chatId, 
        `📁 **Current Directory**\n${this.options.workingDirectory}\n\n` +
        `❌ No Claude projects found\n` +
        `💡 Open projects in Claude Code first`
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
    
    await this.mainBot.safeSendMessage(chatId, 
      `📁 *Current Directory*\n${this.options.workingDirectory}\n\n` +
      `📋 **Select Claude Project:**\n` +
      `(Showing ${Math.min(projects.length, 15)} projects)`,
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
      
      // IMPORTANT: Save the new working directory to config immediately
      // This ensures the bot remembers the selected project after restart
      await this.saveWorkingDirectoryToConfig(actualPath);
      
      const successMsg = 
        `✅ **Directory Changed**\n\n` +
        `📁 **New Directory:**\n\`${actualPath}\`\n\n` +
        `💡 New sessions will use this directory\n` +
        `🔄 Use /new to start fresh session here`;
      
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
    } else {
      await this.handleDirectoryChange(dirAction, chatId, messageId);
    }
  }

  /**
   * Save working directory to config file for persistence
   */
  async saveWorkingDirectoryToConfig(workingDirectory) {
    // Delegate to the main bot's config save method
    if (this.mainBot && this.mainBot.configFilePath) {
      try {
        const fs = require('fs');
        const configData = fs.readFileSync(this.mainBot.configFilePath, 'utf8');
        const config = JSON.parse(configData);
        
        // Update the workingDirectory in config
        config.workingDirectory = workingDirectory;
        config.lastDirectoryUpdate = new Date().toISOString();
        
        fs.writeFileSync(this.mainBot.configFilePath, JSON.stringify(config, null, 2));
        
        console.log(`[ProjectNavigator] Saved working directory to config: ${workingDirectory}`);
      } catch (error) {
        console.error('[ProjectNavigator] Error saving working directory to config:', error.message);
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
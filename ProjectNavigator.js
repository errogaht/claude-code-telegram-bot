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
    
    // State for new project creation
    this.projectCreationState = {
      inProgress: false,
      chatId: null
    };
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
    
    // Add create new project and refresh buttons
    buttons.push([{
      text: '➕ Create New Project',
      callback_data: 'setdir:create_new'
    }, {
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
    } else if (dirAction === 'create_new') {
      await this.showCreateNewProjectInterface(chatId, messageId);
    } else if (dirAction === 'cancel_create') {
      // Cancel project creation
      this.projectCreationState.inProgress = false;
      this.projectCreationState.chatId = null;
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
   * Show create new project interface
   */
  async showCreateNewProjectInterface(chatId, messageId) {
    const projectsHomeDir = this.getProjectsHomeDirectory();
    
    if (!projectsHomeDir) {
      await this.mainBot.safeEditMessage(chatId, messageId, 
        '❌ **Projects Home Directory Not Configured**\n\n' +
        'Please add `projectsHomeDirectory` to your bot configuration file.\n\n' +
        '**Example:**\n```json\n{\n  "projectsHomeDirectory": "/home/user/projects"\n}\n```',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Projects', callback_data: 'setdir:refresh' }
            ]]
          }
        }
      );
      return;
    }

    // Check if projects home directory exists
    if (!fs.existsSync(projectsHomeDir)) {
      try {
        fs.mkdirSync(projectsHomeDir, { recursive: true });
      } catch (error) {
        await this.mainBot.safeEditMessage(chatId, messageId, 
          `❌ **Cannot Create Projects Directory**\n\n` +
          `**Path:** \`${projectsHomeDir}\`\n` +
          `**Error:** ${error.message}\n\n` +
          'Please check the path and permissions.',
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Projects', callback_data: 'setdir:refresh' }
              ]]
            }
          }
        );
        return;
      }
    }

    // Set state for text input
    this.projectCreationState.inProgress = true;
    this.projectCreationState.chatId = chatId;

    await this.mainBot.safeEditMessage(chatId, messageId,
      '➕ **Create New Project**\n\n' +
      `**Projects Directory:** \`${projectsHomeDir}\`\n\n` +
      '💡 **Enter project name:**\n' +
      '• Use alphanumeric characters and dashes\n' +
      '• No spaces or special characters\n' +
      '• Example: `my-awesome-project`\n\n' +
      '📝 Type the project name in your next message...',
      { 
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'setdir:cancel_create' }
          ]]
        }
      }
    );
  }

  /**
   * Get projects home directory from config
   */
  getProjectsHomeDirectory() {
    if (this.mainBot && this.mainBot.configManager) {
      return this.mainBot.configManager.get('projectsHomeDirectory');
    }
    
    // Fallback to reading from config file directly
    if (this.mainBot && this.mainBot.configFilePath) {
      try {
        const configData = fs.readFileSync(this.mainBot.configFilePath, 'utf8');
        const config = JSON.parse(configData);
        return config.projectsHomeDirectory;
      } catch (error) {
        console.error('[ProjectNavigator] Error reading config for projectsHomeDirectory:', error.message);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Handle text input for project creation
   */
  async handleTextInput(chatId, text) {
    if (this.projectCreationState.inProgress && this.projectCreationState.chatId === chatId) {
      // Reset state
      this.projectCreationState.inProgress = false;
      this.projectCreationState.chatId = null;
      
      // Process project creation
      await this.createNewProject(chatId, text);
      return true; // Indicate that we handled this text input
    }
    
    return false; // We didn't handle this text input
  }

  /**
   * Create new project directory and initialize Claude Code files
   */
  async createNewProject(chatId, projectName) {
    try {
      // Validate project name
      const validationResult = this.validateProjectName(projectName);
      if (!validationResult.valid) {
        await this.mainBot.safeSendMessage(chatId, 
          '❌ **Invalid Project Name**\n\n' +
          `**Error:** ${validationResult.error}\n\n` +
          '💡 **Valid project names:**\n' +
          '• Use alphanumeric characters and dashes only\n' +
          '• Must start with letter or number\n' +
          '• 3-50 characters long\n' +
          '• Examples: `my-app`, `web-project-2024`',
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '➕ Try Again', callback_data: 'setdir:create_new' },
                { text: '📂 Projects', callback_data: 'setdir:refresh' }
              ]]
            }
          }
        );
        return;
      }

      const projectsHomeDir = this.getProjectsHomeDirectory();
      const newProjectPath = path.join(projectsHomeDir, projectName);

      // Check if project already exists
      if (fs.existsSync(newProjectPath)) {
        await this.mainBot.safeSendMessage(chatId, 
          '❌ **Project Already Exists**\n\n' +
          `A project named \`${projectName}\` already exists.\n\n` +
          '💡 Choose a different name or select the existing project.',
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '➕ Try Different Name', callback_data: 'setdir:create_new' },
                { text: '📂 Projects', callback_data: 'setdir:refresh' }
              ]]
            }
          }
        );
        return;
      }

      // Create project directory
      fs.mkdirSync(newProjectPath, { recursive: true });

      // Initialize Claude Code project structure
      await this.initializeClaudeCodeProject(newProjectPath, projectName);

      // Update working directory to the new project
      this.options.workingDirectory = newProjectPath;

      // Update UnifiedWebServer project root to match new directory
      if (this.mainBot && this.mainBot.unifiedWebServer) {
        this.mainBot.unifiedWebServer.updateProjectRoot(newProjectPath);
      }

      // Save to config
      await this.saveCurrentProjectToConfig(newProjectPath);

      await this.mainBot.safeSendMessage(chatId, 
        '✅ **Project Created Successfully**\n\n' +
        `📁 **Project:** \`${projectName}\`\n` +
        `📂 **Path:** \`${newProjectPath}\`\n\n` +
        '🚀 **What was created:**\n' +
        '• Project directory structure\n' +
        '• Claude Code session files\n' +
        '• Basic README.md file\n' +
        '• .gitignore file\n\n' +
        '💡 **Next steps:**\n' +
        '• Start coding in your new project\n' +
        '• Use /new to begin a Claude session',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔄 New Session', callback_data: 'new_session' },
              { text: '📂 Projects', callback_data: 'setdir:refresh' }
            ]]
          }
        }
      );

    } catch (error) {
      console.error('[ProjectNavigator] Error creating new project:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Project Creation Failed**\n\n' +
        `**Error:** ${error.message}\n\n` +
        '💡 This might happen due to:\n' +
        '• Permission issues\n' +
        '• Disk space problems\n' +
        '• Invalid directory path',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '➕ Try Again', callback_data: 'setdir:create_new' },
              { text: '📂 Projects', callback_data: 'setdir:refresh' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Validate project name
   */
  validateProjectName(projectName) {
    if (!projectName || projectName.trim().length === 0) {
      return { valid: false, error: 'Project name cannot be empty' };
    }

    const name = projectName.trim();

    if (name.length < 3 || name.length > 50) {
      return { valid: false, error: 'Project name must be 3-50 characters long' };
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name)) {
      return { valid: false, error: 'Project name must start with letter/number and contain only letters, numbers, and dashes' };
    }

    if (name.startsWith('-') || name.endsWith('-')) {
      return { valid: false, error: 'Project name cannot start or end with dash' };
    }

    if (name.includes('--')) {
      return { valid: false, error: 'Project name cannot contain consecutive dashes' };
    }

    return { valid: true };
  }

  /**
   * Initialize Claude Code project structure
   */
  async initializeClaudeCodeProject(projectPath, projectName) {
    // Create basic README.md
    const readmeContent = `# ${projectName}\n\nA new project created with Claude Code Telegram Bot.\n\n## Getting Started\n\nThis project was automatically initialized with:\n- Basic project structure\n- Claude Code session support\n- Git ignore file\n\n## Usage\n\nUse the Telegram bot to:\n- Start coding sessions with /new\n- Manage git operations\n- Browse and edit files\n- Run development tasks\n\n## Development\n\nAdd your project-specific instructions here.\n`;

    fs.writeFileSync(path.join(projectPath, 'README.md'), readmeContent, 'utf8');

    // Create basic .gitignore
    const gitignoreContent = `# Dependencies\nnode_modules/\n\n# Logs\nlogs\n*.log\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\n\n# Environment variables\n.env\n.env.local\n.env.development.local\n.env.test.local\n.env.production.local\n\n# IDE\n.vscode/\n.idea/\n*.swp\n*.swo\n*~\n\n# OS\n.DS_Store\nThumbs.db\n\n# Build output\ndist/\nbuild/\n\n# Claude Code temporary files\n.claude-temp/\n`;

    fs.writeFileSync(path.join(projectPath, '.gitignore'), gitignoreContent, 'utf8');

    // Update ~/.claude.json to add this project
    await this.addProjectToClaudeConfig(projectPath);
  }

  /**
   * Add project to ~/.claude.json configuration
   */
  async addProjectToClaudeConfig(projectPath) {
    try {
      const claudeConfigPath = path.join(os.homedir(), '.claude.json');
      
      let claudeConfig = {};
      if (fs.existsSync(claudeConfigPath)) {
        const configData = fs.readFileSync(claudeConfigPath, 'utf8');
        claudeConfig = JSON.parse(configData);
      }

      if (!claudeConfig.projects) {
        claudeConfig.projects = {};
      }

      // Add the new project with basic configuration
      claudeConfig.projects[projectPath] = {
        allowedTools: [],
        dontCrawlDirectory: false,
        hasClaudeMdExternalIncludesApproved: false,
        hasClaudeMdExternalIncludesWarningShown: false,
        hasTrustDialogAccepted: false,
        history: [],
        lastTotalWebSearchRequests: 0,
        mcpContextUris: [],
        mcpServers: {},
        projectOnboardingSeenCount: 0,
        lastUsed: Date.now()
      };

      // Write back to file
      fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2), 'utf8');
      
      console.log(`[ProjectNavigator] Added project to Claude config: ${projectPath}`);
    } catch (error) {
      console.error('[ProjectNavigator] Error updating Claude config:', error.message);
      // Don't throw - project creation should succeed even if Claude config update fails
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
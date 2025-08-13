const path = require('path');
const { exec } = require('child_process');
const MessageSplitter = require('./MessageSplitter');

/**
 * Git Manager - Full Git Workflow Management for Telegram Bot
 * Handles comprehensive git operations with mobile-friendly interface
 */
class GitManager {
  constructor(bot, options, keyboardHandlers, mainBot) {
    this.bot = bot;
    this.options = options;
    this.keyboardHandlers = keyboardHandlers;
    this.mainBot = mainBot; // Reference to main bot for delegation
    this.untrackedFilePagination = null; // For pagination state
    this.messageSplitter = new MessageSplitter();
    
    // Enhanced state management for full git operations
    this.gitState = {
      currentBranch: null,
      branches: [],
      stagedFiles: [],
      unstagedFiles: [],
      untrackedFiles: [],
      commitInProgress: false,
      commitMessageInProgress: false,
      commitMessageChatId: null,
      amendMessageInProgress: false,
      amendMessageChatId: null,
      lastCommitMessage: null,
      branchSwitchInProgress: false,
      branchCreationInProgress: false,
      branchCreationChatId: null
    };
    
    // Performance optimization: Cache git status and branch info
    this.gitStatusCache = {
      data: null,
      timestamp: 0,
      maxAge: 2000 // 2 seconds cache
    };
    
    this.branchInfoCache = {
      data: null,
      timestamp: 0,
      maxAge: 5000 // 5 seconds cache (branches change less frequently)
    };
  }

  /**
   * Invalidate caches when git state changes (performance optimization)
   */
  invalidateCache() {
    this.gitStatusCache.data = null;
    this.gitStatusCache.timestamp = 0;
    this.branchInfoCache.data = null;
    this.branchInfoCache.timestamp = 0;
  }

  /**
   * Get file type icon for better mobile UX (Phase 7.4 - UI/UX refinements)
   */
  getFileTypeIcon(extension) {
    const iconMap = {
      '.js': '🟨',
      '.ts': '🟦', 
      '.jsx': '⚛️',
      '.tsx': '⚛️',
      '.css': '🎨',
      '.scss': '🎨',
      '.html': '🌐',
      '.md': '📝',
      '.json': '📋',
      '.txt': '📄',
      '.py': '🐍',
      '.java': '☕',
      '.cpp': '⚙️',
      '.c': '⚙️',
      '.php': '🐘',
      '.sql': '🗃️',
      '.xml': '📄',
      '.yml': '⚙️',
      '.yaml': '⚙️',
      '.env': '🔧',
      '.config': '⚙️'
    };
    return iconMap[extension.toLowerCase()] || '📄';
  }

  /**
   * Analyze git command errors and provide user-friendly messages (Phase 7.3)
   */
  analyzeGitError(error, operation = 'git operation') {
    const errorMessage = error.message || error.toString();
    const errorLower = errorMessage.toLowerCase();

    // Authentication/Permission errors
    if (errorLower.includes('permission denied') || 
        errorLower.includes('authentication failed') ||
        errorLower.includes('access denied') ||
        errorLower.includes('fatal: could not read from remote repository')) {
      return {
        type: 'auth',
        userMessage: '🔐 **Authentication Error**',
        description: 'Git authentication failed. Please check your credentials.',
        solutions: [
          'Verify your Git username and email are configured',
          'Check if you have access to the repository',
          'Update your Git credentials or SSH keys',
          'Try using a personal access token if using HTTPS'
        ],
        technicalError: errorMessage
      };
    }

    // Network/Connection errors
    if (errorLower.includes('network') || 
        errorLower.includes('connection') ||
        errorLower.includes('timeout') ||
        errorLower.includes('could not resolve host') ||
        errorLower.includes('failed to connect')) {
      return {
        type: 'network',
        userMessage: '🌐 **Network Error**',
        description: 'Unable to connect to the remote repository.',
        solutions: [
          'Check your internet connection',
          'Verify the repository URL is correct',
          'Try again in a moment',
          'Check if the remote server is accessible'
        ],
        technicalError: errorMessage
      };
    }

    // Merge conflicts
    if (errorLower.includes('merge conflict') ||
        errorLower.includes('conflict') ||
        errorLower.includes('automatic merge failed')) {
      return {
        type: 'conflict',
        userMessage: '⚔️ **Merge Conflict**',
        description: 'There are conflicting changes that need to be resolved.',
        solutions: [
          'Resolve conflicts manually in the affected files',
          'Use git status to see which files have conflicts',
          'After resolving, stage the files and commit',
          'Consider using git mergetool for complex conflicts'
        ],
        technicalError: errorMessage
      };
    }

    // Branch related errors
    if (errorLower.includes('branch') && 
        (errorLower.includes('already exists') || errorLower.includes('not found'))) {
      const isBranchExists = errorLower.includes('already exists');
      return {
        type: 'branch',
        userMessage: isBranchExists ? '🌿 **Branch Already Exists**' : '🌿 **Branch Not Found**',
        description: isBranchExists ? 
          'A branch with this name already exists.' : 
          'The specified branch could not be found.',
        solutions: isBranchExists ? [
          'Choose a different branch name',
          'Delete the existing branch if no longer needed',
          'Switch to the existing branch instead'
        ] : [
          'Check the branch name spelling',
          'List available branches to see what exists',
          'Create the branch if it should exist'
        ],
        technicalError: errorMessage
      };
    }

    // Uncommitted changes
    if (errorLower.includes('uncommitted changes') ||
        errorLower.includes('working tree clean') ||
        errorLower.includes('please commit') ||
        errorLower.includes('stash')) {
      return {
        type: 'uncommitted',
        userMessage: '📝 **Uncommitted Changes**',
        description: 'You have uncommitted changes that prevent this operation.',
        solutions: [
          'Commit your current changes first',
          'Stash changes temporarily: git stash',
          'Discard changes if they are not needed',
          'Stage and commit specific files'
        ],
        technicalError: errorMessage
      };
    }

    // Repository not found/not a git repository
    if (errorLower.includes('not a git repository') ||
        errorLower.includes('no such file or directory')) {
      return {
        type: 'repository',
        userMessage: '📁 **Repository Error**',
        description: 'This directory is not a Git repository or cannot be accessed.',
        solutions: [
          'Navigate to a valid Git repository',
          'Initialize a new repository with git init',
          'Clone an existing repository',
          'Check if the directory path is correct'
        ],
        technicalError: errorMessage
      };
    }

    // File not found or permission issues
    if (errorLower.includes('no such file') ||
        errorLower.includes('file not found') ||
        errorLower.includes('cannot access')) {
      return {
        type: 'file',
        userMessage: '📄 **File Error**',
        description: 'The specified file could not be found or accessed.',
        solutions: [
          'Check if the file exists in the working directory',
          'Verify file permissions',
          'Refresh the file list and try again',
          'Ensure the file has not been deleted'
        ],
        technicalError: errorMessage
      };
    }

    // Generic git command errors
    if (errorLower.includes('fatal:') || errorLower.includes('error:')) {
      return {
        type: 'git',
        userMessage: `⚠️ **${operation.charAt(0).toUpperCase() + operation.slice(1)} Error**`,
        description: 'A Git command failed to execute properly.',
        solutions: [
          'Check the repository state',
          'Ensure all prerequisites are met',
          'Try refreshing and attempting again',
          'Check Git configuration'
        ],
        technicalError: errorMessage
      };
    }

    // Default/unknown error
    return {
      type: 'unknown',
      userMessage: `❌ **${operation.charAt(0).toUpperCase() + operation.slice(1)} Failed**`,
      description: 'An unexpected error occurred.',
      solutions: [
        'Try the operation again',
        'Check the repository state',
        'Restart the application if needed',
        'Contact support if the problem persists'
      ],
      technicalError: errorMessage
    };
  }

  /**
   * Format error analysis for user display (Phase 7.3)
   * Handles both old errorAnalysis format and new parsedError format
   */
  formatErrorMessage(errorData, includeRecovery = true) {
    // Handle new parsedError format (from parseGitError)
    if (errorData.title && errorData.suggestions) {
      let message = `${errorData.title}\n\n`;
      message += `**Problem:** ${errorData.message}\n\n`;
      
      if (includeRecovery && errorData.suggestions.length > 0) {
        message += '**💡 Possible Solutions:**\n';
        errorData.suggestions.forEach(suggestion => {
          message += `• ${suggestion}\n`;
        });
        message += '\n';
      }
      
      if (errorData.recoverable) {
        message += '🔄 This issue can usually be resolved. Try the suggestions above.';
      } else {
        message += '⚠️ This may require manual intervention or setup changes.';
      }
      
      return message;
    }
    
    // Handle old errorAnalysis format (backward compatibility)
    let message = `${errorData.userMessage}\n\n`;
    message += `**Problem:** ${errorData.description}\n\n`;
    
    message += '**💡 Solutions:**\n';
    errorData.solutions.forEach((solution, index) => {
      message += `${index + 1}. ${solution}\n`;
    });
    
    if (includeRecovery && errorData.technicalError) {
      message += `\n**🔧 Technical Details:**\n\`${errorData.technicalError}\``;
    }
    
    return message;
  }

  /**
   * Enhanced error handling with user-friendly messages and recovery suggestions
   */
  parseGitError(error, operation = 'git operation') {
    const errorMessage = error.message || error.toString();
    const lowercaseError = errorMessage.toLowerCase();
    
    // Authentication errors
    if (lowercaseError.includes('authentication failed') || 
        lowercaseError.includes('permission denied') ||
        lowercaseError.includes('access denied') ||
        lowercaseError.includes('credential')) {
      return {
        type: 'auth',
        title: '🔐 Authentication Error',
        message: 'Git authentication failed.',
        suggestions: [
          'Check your Git credentials (username/password or SSH key)',
          'Verify repository access permissions',
          'Try: git config --global credential.helper store',
          'For SSH: ensure your SSH key is added to your Git provider'
        ],
        recoverable: true
      };
    }
    
    // Network errors
    if (lowercaseError.includes('network') || 
        lowercaseError.includes('connection') ||
        lowercaseError.includes('timeout') ||
        lowercaseError.includes('could not resolve host') ||
        lowercaseError.includes('failed to connect')) {
      return {
        type: 'network',
        title: '🌐 Network Error',
        message: 'Unable to connect to remote repository.',
        suggestions: [
          'Check your internet connection',
          'Verify the repository URL is correct',
          'Try again in a few moments',
          'Check if the Git provider is experiencing issues'
        ],
        recoverable: true
      };
    }
    
    // Merge conflicts
    if (lowercaseError.includes('merge conflict') || 
        lowercaseError.includes('conflict') ||
        lowercaseError.includes('automatic merge failed')) {
      return {
        type: 'conflict',
        title: '⚔️ Merge Conflict',
        message: 'Git detected conflicting changes.',
        suggestions: [
          'Resolve conflicts manually using your preferred editor',
          'Use git status to see conflicted files',
          'After resolving: git add <files> then git commit',
          'Or use git merge --abort to cancel the merge'
        ],
        recoverable: true
      };
    }
    
    // Repository not found
    if (lowercaseError.includes('not a git repository') ||
        lowercaseError.includes('not found') ||
        lowercaseError.includes('does not exist')) {
      return {
        type: 'repository',
        title: '📁 Repository Error',
        message: 'Git repository not found or inaccessible.',
        suggestions: [
          'Ensure you\'re in a Git repository directory',
          'Initialize with: git init',
          'Clone the repository if it\'s remote',
          'Check directory permissions'
        ],
        recoverable: false
      };
    }
    
    // Branch errors
    if (lowercaseError.includes('branch') && 
        (lowercaseError.includes('already exists') || lowercaseError.includes('not found'))) {
      return {
        type: 'branch',
        title: '🌿 Branch Error',
        message: 'Branch operation failed.',
        suggestions: [
          'Check if branch name already exists: git branch -a',
          'Use a different branch name',
          'Delete existing branch: git branch -d <name>',
          'Ensure branch name follows Git naming rules'
        ],
        recoverable: true
      };
    }
    
    // Working directory not clean
    if (lowercaseError.includes('working tree clean') ||
        lowercaseError.includes('uncommitted changes') ||
        lowercaseError.includes('working directory')) {
      return {
        type: 'dirty',
        title: '📝 Uncommitted Changes',
        message: 'Repository has uncommitted changes.',
        suggestions: [
          'Commit your changes: git add . && git commit',
          'Stash changes: git stash',
          'Discard changes: git checkout -- .',
          'Check status: git status'
        ],
        recoverable: true
      };
    }
    
    // Push/pull specific errors
    if (lowercaseError.includes('rejected') || lowercaseError.includes('non-fast-forward')) {
      return {
        type: 'rejected',
        title: '⚠️ Push Rejected',
        message: 'Push was rejected by remote repository.',
        suggestions: [
          'Pull latest changes first: git pull',
          'Merge or rebase your changes',
          'Use force push with caution: git push --force',
          'Check if someone else pushed changes'
        ],
        recoverable: true
      };
    }
    
    // Generic git error
    return {
      type: 'generic',
      title: '❌ Git Error',
      message: `${operation} failed: ${errorMessage}`,
      suggestions: [
        'Check git status for repository state',
        'Ensure all files are saved',
        'Try the operation again',
        'Check Git documentation for this error'
      ],
      recoverable: true
    };
  }

  /**
   * Main entry point - Show git overview with full workflow options
   */
  async showGitOverview(chatId, options = {}) {
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
        await this.mainBot.safeSendMessage(chatId, 
          '❌ **Not a Git Repository**\n\n' +
          'This directory is not a git repository.\n' +
          'Use `📂 Projects` to navigate to a git project.',
          { 
            reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup(this.mainBot.getUserIdFromChat(chatId))
          }
        );
        return;
      }

      // Get comprehensive git status including branch info
      const gitStatus = await this.getGitStatus();
      
      if (mode === 'overview') {
        await this.showMainGitInterface(chatId, gitStatus);
      } else if (mode === 'files') {
        await this.showFileList(chatId, gitStatus, page);
      } else if (mode === 'file') {
        await this.showDiffFile(chatId, gitStatus, fileIndex, contextLines, wordDiff);
      } else if (mode === 'branches') {
        await this.showBranchManagement(chatId);
      } else if (mode === 'staging') {
        await this.showStagingInterface(chatId);
      } else if (mode === 'commit') {
        await this.showCommitInterface(chatId);
      }
      
    } catch (error) {
      console.error('[Git Manager] Error:', error);
      
      // Use enhanced error handling
      const parsedError = this.parseGitError(error, 'Git Manager');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, errorMessage, { 
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Try Again', callback_data: 'git:refresh' },
              { text: '📊 Check Status', callback_data: 'git:overview' }
            ],
            [
              { text: '🏠 Main Menu', callback_data: 'main_menu' }
            ]
          ]
        }
      });
    }
  }

  /**
   * Legacy method for backward compatibility with existing /diff command
   */
  async showGitDiff(chatId, options = {}) {
    return await this.showGitOverview(chatId, options);
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
    } catch {
      return false;
    }
  }

  /**
   * Get comprehensive git status including branch information (with caching)
   */
  async getGitStatus() {
    // Check cache first for performance optimization
    const now = Date.now();
    if (this.gitStatusCache.data && 
        (now - this.gitStatusCache.timestamp) < this.gitStatusCache.maxAge) {
      return this.gitStatusCache.data;
    }
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const cwd = this.options.workingDirectory;

    try {
      // Get current branch and ahead/behind info
      let currentBranch = 'main';
      const aheadBehind = { ahead: 0, behind: 0 };
      
      try {
        const branchResult = await execAsync('git branch --show-current', { cwd });
        currentBranch = branchResult.stdout.trim() || 'main';
        
        // Get ahead/behind info
        const statusResult = await execAsync('git status --porcelain -b', { cwd });
        const statusLines = statusResult.stdout.split('\n');
        const branchLine = statusLines.find(line => line.startsWith('##'));
        
        if (branchLine) {
          const aheadMatch = branchLine.match(/ahead (\d+)/);
          const behindMatch = branchLine.match(/behind (\d+)/);
          
          if (aheadMatch) aheadBehind.ahead = parseInt(aheadMatch[1]);
          if (behindMatch) aheadBehind.behind = parseInt(behindMatch[1]);
        }
      } catch (branchError) {
        console.log('[Git] Branch info error (using defaults):', branchError.message);
      }

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
      const stagedFiles = [];
      const unstagedFiles = [];
      const untrackedFiles = [];
      
      modifiedFiles.forEach(line => {
        // Git status --porcelain format: XY filename
        // X and Y are status codes, followed by space(s), then filename
        const status = line.substring(0, 2);
        // Find the first non-space character after the status to get the filename
        let filenameStart = 2;
        while (filenameStart < line.length && line.charAt(filenameStart) === ' ') {
          filenameStart++;
        }
        const filename = line.substring(filenameStart);
        
        // Categorize files by staging status
        const xStatus = status.charAt(0); // Staged status
        const yStatus = status.charAt(1); // Unstaged status
        
        if (status.includes('??')) {
          // Untracked file
          untrackedFiles.push(filename);
          allFiles.push(`??\t${filename}`);
          // For untracked files, count lines and show as all added
          try {
            const fs = require('fs');
            const filePath = path.join(cwd, filename);
            const content = fs.readFileSync(filePath, 'utf8');
            const lineCount = content.split('\n').length;
            allNumStats.push(`${lineCount}\t0\t${filename}`);
          } catch {
            allNumStats.push(`0\t0\t${filename}`);
          }
        } else {
          // Tracked file - check staging status
          if (xStatus !== ' ' && xStatus !== '?') {
            stagedFiles.push(filename);
          }
          if (yStatus !== ' ' && yStatus !== '?') {
            unstagedFiles.push(filename);
          }
          
          if (status.includes('A')) {
            // Added file (staged)
            allFiles.push(`A\t${filename}`);
          } else if (status.includes('M')) {
            // Modified file - use 'M' regardless of position
            allFiles.push(`M\t${filename}`);
          } else if (status.includes('D')) {
            // Deleted file
            allFiles.push(`D\t${filename}`);
          } else if (status.includes('R')) {
            // Renamed file
            allFiles.push(`R\t${filename}`);
          } else {
            // Other status, use first non-space character
            const statusChar = status.trim() || status.charAt(0);
            allFiles.push(`${statusChar}\t${filename}`);
          }
        }
      });
      
      // Use combined file list (git diff + untracked files) as nameStatus
      const nameStatus = allFiles.length > 0 ? allFiles : gitDiffNameStatus;
      
      // Combine numStats from git diff with untracked file stats
      const combinedNumStats = [...numStats, ...allNumStats];
      
      const hasChanges = modifiedFiles.length > 0 || (diffStats.length > 0 && diffStats.trim() !== '');
      
      // Update internal state
      this.gitState = {
        ...this.gitState,
        currentBranch,
        stagedFiles,
        unstagedFiles,
        untrackedFiles
      };
      
      const result = {
        modifiedFiles,
        diffStats,
        nameStatus,
        numStats: combinedNumStats,
        hasChanges,
        currentBranch,
        aheadBehind,
        stagedFiles,
        unstagedFiles,
        untrackedFiles
      };
      
      // Cache the result for performance optimization
      this.gitStatusCache = {
        data: result,
        timestamp: Date.now(),
        maxAge: this.gitStatusCache.maxAge
      };
      
      return result;
      
    } catch (error) {
      throw new Error(`Git status failed: ${error.message}`);
    }
  }

  /**
   * Show main git interface with comprehensive workflow options
   */
  async showMainGitInterface(chatId, gitStatus) {
    const { currentBranch, aheadBehind, stagedFiles, untrackedFiles } = gitStatus;
    
    // Enhanced mobile-optimized status display (Phase 7.4 - UI/UX refinements)
    let text = '🌿 **Git Repository Manager**\n\n';
    
    // Compact directory display - show only project name for better mobile readability
    const projectName = path.basename(this.options.workingDirectory);
    text += `📁 ${this.escapeMarkdown(projectName)}\n`;
    
    // Enhanced branch display with visual status indicators
    text += `🌿 **${this.escapeMarkdown(currentBranch)}**`;
    
    // Add ahead/behind indicators with better mobile formatting
    if (aheadBehind.ahead > 0 || aheadBehind.behind > 0) {
      const indicators = [];
      if (aheadBehind.ahead > 0) indicators.push(`↗️${aheadBehind.ahead}`);
      if (aheadBehind.behind > 0) indicators.push(`↘️${aheadBehind.behind}`);
      text += ` (${indicators.join(' ')})`;
    }
    text += '\n\n';

    // Enhanced mobile-friendly file status summary with icons and compact layout
    const totalChanged = gitStatus.nameStatus.length;
    const totalStaged = stagedFiles.length;
    const totalUntracked = untrackedFiles.length;
    
    // Visual status indicators for quick scanning
    if (gitStatus.hasChanges) {
      text += '📊 **Status:**\n';
      if (totalChanged > 0) text += `📝 Changed: **${totalChanged}**\n`;
      if (totalStaged > 0) text += `✅ Staged: **${totalStaged}**\n`;
      if (totalUntracked > 0) text += `🔍 Untracked: **${totalUntracked}**\n`;
      text += '\n';
    } else {
      text += '✅ **Working directory is clean**\n\n';
    }

    // Smart action suggestions based on repository state
    if (totalStaged > 0) {
      text += '💡 *Ready to commit staged changes*\n';
    } else if (totalChanged > 0) {
      text += '💡 *Stage files to prepare for commit*\n';
    } else if (aheadBehind.ahead > 0) {
      text += '💡 *Local commits ready to push*\n';
    } else if (aheadBehind.behind > 0) {
      text += '💡 *Remote updates available to pull*\n';
    }
    text += '\n**Choose action:**';

    // Mobile-optimized keyboard layout with contextual actions
    const keyboard = {
      inline_keyboard: []
    };
    
    // Priority actions in first row based on repository state
    if (totalStaged > 0) {
      // Ready to commit - prioritize commit action
      keyboard.inline_keyboard.push([
        { text: '📝 Commit', callback_data: 'git:commit:prepare' },
        { text: '📦 Staging', callback_data: 'git:staging:overview' }
      ]);
    } else if (totalChanged > 0) {
      // Has changes - prioritize staging
      keyboard.inline_keyboard.push([
        { text: '📦 Staging', callback_data: 'git:staging:overview' },
        { text: '📂 Files', callback_data: 'git:files:0' }
      ]);
    } else {
      // Clean or remote actions needed
      keyboard.inline_keyboard.push([
        { text: '📊 Overview', callback_data: 'git:overview' },
        { text: '📂 Files', callback_data: 'git:files:0' }
      ]);
    }
    
    // Branch and remote operations row
    keyboard.inline_keyboard.push([
      { text: '🌿 Branches', callback_data: 'git:branch:list' },
      { text: '🔄 History', callback_data: 'git:commit:history' }
    ]);
    
    // Remote operations row with contextual emphasis
    const remoteRow = [];
    if (aheadBehind.ahead > 0) {
      remoteRow.push({ text: '⬆️ Push', callback_data: 'git:push' });
    } else {
      remoteRow.push({ text: '⬆️ Push', callback_data: 'git:push' });
    }
    
    if (aheadBehind.behind > 0) {
      remoteRow.push({ text: '🔄 Pull', callback_data: 'git:pull' });
    } else {
      remoteRow.push({ text: '⬇️ Fetch', callback_data: 'git:fetch' });
    }
    
    keyboard.inline_keyboard.push(remoteRow);
    
    // Refresh button row
    keyboard.inline_keyboard.push([
      { text: '🔄 Refresh', callback_data: 'git:refresh' }
    ]);

    // Send markdown text directly - MarkdownHtmlConverter will handle conversion
    await this.mainBot.safeSendMessage(chatId, text, {
      reply_markup: keyboard
    });
  }

  /**
   * Get comprehensive branch information (with caching)
   */
  async getBranchInfo() {
    // Check cache first for performance optimization
    const now = Date.now();
    if (this.branchInfoCache.data && 
        (now - this.branchInfoCache.timestamp) < this.branchInfoCache.maxAge) {
      return this.branchInfoCache.data;
    }
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const cwd = this.options.workingDirectory;

    try {
      // Get current branch
      const currentBranchResult = await execAsync('git branch --show-current', { cwd });
      const currentBranch = currentBranchResult.stdout.trim() || 'main';

      // Get all local branches with verbose info
      const branchListResult = await execAsync('git branch -v', { cwd });
      const branchLines = branchListResult.stdout.trim().split('\n');

      const branches = [];
      let currentBranchInfo = null;

      for (const line of branchLines) {
        // Parse branch line: "* main abc1234 commit message" or "  develop def5678 commit message"
        const match = line.match(/^(\*?\s*)([^\s]+)\s+([a-f0-9]+)\s+(.*)$/);
        if (match) {
          const [, marker, branchName, hash, message] = match;
          const isCurrent = marker.includes('*');

          // Get ahead/behind info only for current branch (performance optimization)
          let ahead = 0;
          let behind = 0;

          if (isCurrent) {
            try {
              // Check if branch has upstream
              const upstreamResult = await execAsync(`git rev-list --count --left-right ${branchName}...origin/${branchName}`, { cwd });
              const counts = upstreamResult.stdout.trim().split('\t');
              if (counts.length === 2) {
                ahead = parseInt(counts[0]) || 0;
                behind = parseInt(counts[1]) || 0;
              }
            } catch (upstreamError) {
              // No upstream or other error - ignore
              console.log(`[Branch] No upstream for ${branchName}: ${upstreamError.message}`);
            }
          }

          const branchInfo = {
            name: branchName,
            hash,
            message,
            current: isCurrent,
            ahead,
            behind
          };

          branches.push(branchInfo);

          if (isCurrent) {
            currentBranchInfo = branchInfo;
          }
        }
      }

      const result = {
        currentBranch,
        currentBranchInfo,
        branches
      };
      
      // Cache the result for performance optimization
      this.branchInfoCache = {
        data: result,
        timestamp: Date.now(),
        maxAge: this.branchInfoCache.maxAge
      };
      
      return result;

    } catch (error) {
      throw new Error(`Failed to get branch info: ${error.message}`);
    }
  }

  /**
   * Show branch switching interface
   */
  async showBranchSwitchList(chatId) {
    try {
      const branchInfo = await this.getBranchInfo();
      
      // Filter out current branch from switch options
      const availableBranches = branchInfo.branches.filter(branch => !branch.current);
      
      if (availableBranches.length === 0) {
        await this.mainBot.safeSendMessage(chatId, 
          '🌿 **Branch Switching**\n\n' +
          'No other branches available to switch to.\n' +
          `Currently on: \`${branchInfo.currentBranch}\``,
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '🆕 Create New Branch', callback_data: 'git:branch:create' },
                { text: '🔙 Back', callback_data: 'git:branch:list' }
              ]]
            }
          }
        );
        return;
      }

      let text = '🌿 **Switch Branch**\n\n';
      text += `**Current:** ${branchInfo.currentBranch}\n\n`;
      text += '**Available Branches:**\n';

      const keyboard = {
        inline_keyboard: []
      };

      // Add branch buttons (max 5 per page for mobile-friendly interface)
      const branchesPerPage = 5;
      const displayBranches = availableBranches.slice(0, branchesPerPage);

      displayBranches.forEach((branch) => {
        text += `🌿 ${branch.name}`;
        if (branch.ahead > 0 || branch.behind > 0) {
          const indicators = [];
          if (branch.ahead > 0) indicators.push(`↗️ ${branch.ahead}`);
          if (branch.behind > 0) indicators.push(`↘️ ${branch.behind}`);
          text += ` (${indicators.join(', ')})`;
        }
        text += '\n';

        // Add button for this branch (shorten name if too long)
        const buttonText = branch.name.length > 25 ? branch.name.substring(0, 22) + '...' : branch.name;
        keyboard.inline_keyboard.push([{
          text: `➡️ ${buttonText}`,
          callback_data: `git:branch:switch:${encodeURIComponent(branch.name)}`
        }]);
      });

      // Navigation buttons
      keyboard.inline_keyboard.push([
        { text: '🔙 Back to Branches', callback_data: 'git:branch:list' }
      ]);

      await this.mainBot.safeSendMessage(chatId, text, {
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('[Branch Switch List] Error:', error);
      const parsedError = this.parseGitError(error, 'branch listing');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, 
        errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Branches', callback_data: 'git:branch:list' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Switch to a specific branch
   */
  async switchBranch(chatId, branchName) {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Check for uncommitted changes first
      const statusResult = await execAsync('git status --porcelain', { cwd });
      const hasChanges = statusResult.stdout.trim().length > 0;

      if (hasChanges) {
        await this.mainBot.safeSendMessage(chatId, 
          '⚠️ **Uncommitted Changes Detected**\n\n' +
          'You have uncommitted changes that would be lost.\n\n' +
          '💡 **Options:**\n' +
          '• Commit your changes first\n' +
          '• Stash your changes (coming soon)\n' +
          '• Force switch (will lose changes)',
          { 
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🚨 Force Switch', callback_data: `git:branch:force_switch:${encodeURIComponent(branchName)}` },
                  { text: '📝 Go to Commit', callback_data: 'git:commit:prepare' }
                ],
                [
                  { text: '🔙 Cancel', callback_data: 'git:branch:switch_list' }
                ]
              ]
            }
          }
        );
        return;
      }

      // Perform the branch switch
      await this.performBranchSwitch(chatId, branchName, false);

    } catch (error) {
      console.error('[Branch Switch] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        `❌ **Branch Switch Error**\n\n\`${error.message}\``,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Branches', callback_data: 'git:branch:list' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Perform the actual branch switch operation
   */
  async performBranchSwitch(chatId, branchName, force = false) {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Build checkout command
      let checkoutCommand = `git checkout "${branchName}"`;
      if (force) {
        checkoutCommand = `git checkout --force "${branchName}"`;
      }

      // Execute checkout
      await execAsync(checkoutCommand, { cwd });
      
      // Verify switch was successful
      const currentBranchResult = await execAsync('git branch --show-current', { cwd });
      const currentBranch = currentBranchResult.stdout.trim();

      if (currentBranch === branchName) {
        // Success! Update our state and show confirmation
        this.gitState.currentBranch = currentBranch;

        await this.mainBot.safeSendMessage(chatId, 
          '✅ **Branch Switch Successful**\n\n' +
          `**Switched to:** \`${branchName}\`\n\n` +
          '💡 **Next steps:**\n' +
          '• View file changes\n' +
          '• Check branch status\n' +
          '• Return to git overview',
          { 
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📂 View Files', callback_data: 'git:files:0' },
                  { text: '🌿 Branch Info', callback_data: 'git:branch:list' }
                ],
                [
                  { text: '🏠 Git Overview', callback_data: 'git:overview' }
                ]
              ]
            }
          }
        );
      } else {
        throw new Error(`Branch switch verification failed. Expected ${branchName}, got ${currentBranch}`);
      }

    } catch (error) {
      console.error('[Perform Branch Switch] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Branch Switch Failed**\n\n' +
        `**Target Branch:** \`${branchName}\`\n` +
        `**Error:** \`${error.message}\`\n\n` +
        '💡 This might happen if:\n' +
        '• The branch doesn\'t exist\n' +
        '• There are conflicting changes\n' +
        '• Git repository is in an invalid state',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Branches', callback_data: 'git:branch:list' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show branch management interface with full branch listing
   */
  async showBranchManagement(chatId) {
    try {
      const branchInfo = await this.getBranchInfo();
      
      // Enhanced mobile-optimized branch display (Phase 7.4 - UI/UX refinements)
      let text = '🌿 **Branch Management**\n\n';
      
      // Current branch with enhanced visual styling
      text += '**Current Branch:**\n';
      text += `🌿 **${branchInfo.currentBranch}**`;
      
      // Add ahead/behind info for current branch with compact mobile formatting
      if (branchInfo.currentBranchInfo) {
        const { ahead, behind } = branchInfo.currentBranchInfo;
        if (ahead > 0 || behind > 0) {
          const indicators = [];
          if (ahead > 0) indicators.push(`↗️${ahead}`);
          if (behind > 0) indicators.push(`↘️${behind}`);
          text += ` (${indicators.join(' ')})`;
        }
      }
      text += '\n\n';
      
      // Mobile-optimized branch list with improved readability
      if (branchInfo.branches.length > 1) {
        text += '📋 **Other Branches:**\n';
        const otherBranches = branchInfo.branches.filter(branch => !branch.current);
        
        // Limit display to prevent message overflow on mobile
        const maxDisplay = 8;
        const displayBranches = otherBranches.slice(0, maxDisplay);
        
        displayBranches.forEach(branch => {
          let branchLine = `🌿 \`${branch.name}\``;
          
          // Add compact tracking info
          if (branch.ahead > 0 || branch.behind > 0) {
            const indicators = [];
            if (branch.ahead > 0) indicators.push(`↗️${branch.ahead}`);
            if (branch.behind > 0) indicators.push(`↘️${branch.behind}`);
            branchLine += ` (${indicators.join(' ')})`;
          }
          
          text += branchLine + '\n';
        });
        
        if (otherBranches.length > maxDisplay) {
          text += `\n*... and ${otherBranches.length - maxDisplay} more branches*\n`;
        }
      } else {
        text += '📋 **Other Branches:** None found\n';
      }
      
      text += '\n**Choose action:**';
      
      // Enhanced mobile-friendly keyboard layout
      const keyboard = {
        inline_keyboard: []
      };
      
      // Primary actions with better mobile touch targets
      if (branchInfo.branches.length > 1) {
        keyboard.inline_keyboard.push([
          { text: '↔️ Switch Branch', callback_data: 'git:branch:switch_list' }
        ]);
      }
      
      keyboard.inline_keyboard.push([
        { text: '🆕 Create Branch', callback_data: 'git:branch:create' }
      ]);
      
      // Additional branch operations
      keyboard.inline_keyboard.push([
        { text: '🔍 Branch Info', callback_data: 'git:remote:info' },
        { text: '🔄 Refresh', callback_data: 'git:branch:list' }
      ]);
      
      // Navigation
      keyboard.inline_keyboard.push([
        { text: '🔙 Back to Git', callback_data: 'git:overview' }
      ]);
      
      await this.mainBot.safeSendMessage(chatId, text, {
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('[Branch Management] Error:', error);
      const parsedError = this.parseGitError(error, 'branch management');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, 
        errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show staging interface with real staging operations
   */
  async showStagingInterface(chatId) {
    try {
      // Get current git status
      const gitStatus = await this.getGitStatus();
      const { stagedFiles, unstagedFiles, untrackedFiles } = gitStatus;

      // Enhanced mobile-optimized staging display (Phase 7.4 - UI/UX refinements)
      let text = '📦 **Staging Area**\n\n';

      // Quick status overview for mobile scanning
      const totalModified = unstagedFiles.length;
      const totalStaged = stagedFiles.length;
      const totalUntracked = untrackedFiles.length;
      
      text += '📊 **Quick Status:**\n';
      text += `✅ Staged: **${totalStaged}** | `;
      text += `📝 Modified: **${totalModified}** | `;
      text += `🔍 Untracked: **${totalUntracked}**\n\n`;

      // Enhanced staged files display
      if (stagedFiles.length > 0) {
        text += '✅ **Ready to Commit** (' + stagedFiles.length + '):\n';
        const maxDisplay = 6; // Increased for better mobile visibility
        stagedFiles.slice(0, maxDisplay).forEach(file => {
          const shortName = path.basename(file);
          // Add file type indicators for better recognition
          const extension = path.extname(file);
          const typeIcon = this.getFileTypeIcon(extension);
          text += `${typeIcon} \`${shortName}\`\n`;
        });
        if (stagedFiles.length > maxDisplay) {
          text += `   *... and ${stagedFiles.length - maxDisplay} more files*\n`;
        }
        text += '\n';
      } else {
        text += '✅ **Staged**: No files\n\n';
      }

      // Enhanced modified files display
      const modifiedFiles = unstagedFiles.filter(file => !untrackedFiles.includes(file));
      if (modifiedFiles.length > 0) {
        text += '📝 **Modified** (' + modifiedFiles.length + '):\n';
        const maxDisplay = 6;
        modifiedFiles.slice(0, maxDisplay).forEach(file => {
          const shortName = path.basename(file);
          const extension = path.extname(file);
          const typeIcon = this.getFileTypeIcon(extension);
          text += `${typeIcon} \`${shortName}\` (modified)\n`;
        });
        if (modifiedFiles.length > maxDisplay) {
          text += `   *... and ${modifiedFiles.length - maxDisplay} more modified*\n`;
        }
        text += '\n';
      }

      // Enhanced untracked files display
      if (untrackedFiles.length > 0) {
        text += '🔍 **Untracked** (' + untrackedFiles.length + '):\n';
        const maxDisplay = 6;
        untrackedFiles.slice(0, maxDisplay).forEach(file => {
          const shortName = path.basename(file);
          const extension = path.extname(file);
          const typeIcon = this.getFileTypeIcon(extension);
          text += `${typeIcon} \`${shortName}\` (new)\n`;
        });
        if (untrackedFiles.length > 5) {
          text += `   ... and ${untrackedFiles.length - 5} more\n`;
        }
        text += '\n';
      }

      if (stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0) {
        text += '✨ **Working directory is clean**\n\n';
      }

      text += '\n**Choose action:**';

      // Enhanced mobile-optimized staging keyboard (Phase 7.4 - UI/UX refinements)
      const keyboard = {
        inline_keyboard: []
      };

      // Primary action row - contextual based on staging state
      if (stagedFiles.length > 0) {
        // Ready to commit - prioritize commit action
        keyboard.inline_keyboard.push([
          { text: '📝 Commit', callback_data: 'git:commit:prepare' }
        ]);
      }

      // Smart staging operations with better touch targets
      if (totalModified > 0 || totalUntracked > 0) {
        if (totalModified + totalUntracked <= 3) {
          // Few files - show individual staging buttons
          keyboard.inline_keyboard.push([
            { text: '➕ Stage Files', callback_data: 'git:stage:select' }
          ]);
        } else {
          // Many files - show bulk and individual options
          keyboard.inline_keyboard.push([
            { text: '➕ Stage All', callback_data: 'git:stage:all' },
            { text: '➕ Stage Some', callback_data: 'git:stage:select' }
          ]);
        }
      }

      if (stagedFiles.length > 0) {
        if (stagedFiles.length <= 3) {
          keyboard.inline_keyboard.push([
            { text: '➖ Unstage Files', callback_data: 'git:unstage:select' }
          ]);
        } else {
          keyboard.inline_keyboard.push([
            { text: '➖ Unstage All', callback_data: 'git:unstage:all' },
            { text: '➖ Unstage Some', callback_data: 'git:unstage:select' }
          ]);
        }
      }

      // Secondary actions row
      const secondaryRow = [];
      secondaryRow.push({ text: '📂 View Files', callback_data: 'git:files:0' });
      secondaryRow.push({ text: '🔄 Refresh', callback_data: 'git:staging:overview' });
      keyboard.inline_keyboard.push(secondaryRow);

      // Navigation row
      keyboard.inline_keyboard.push([
        { text: '🔙 Back to Git', callback_data: 'git:overview' }
      ]);

      await this.mainBot.safeSendMessage(chatId, text, {
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('[Staging Interface] Error:', error);
      const parsedError = this.parseGitError(error, 'staging interface');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, 
        errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Stage all unstaged and untracked files
   */
  async stageAll(chatId) {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Stage all files (including untracked)
      await execAsync('git add .', { cwd });
      
      // Invalidate cache after git state change
      this.invalidateCache();

      // Update our state
      const gitStatus = await this.getGitStatus();
      this.gitState = {
        ...this.gitState,
        stagedFiles: gitStatus.stagedFiles,
        unstagedFiles: gitStatus.unstagedFiles,
        untrackedFiles: gitStatus.untrackedFiles
      };

      await this.mainBot.safeSendMessage(chatId, 
        '✅ **Stage All Complete**\n\n' +
        `Staged ${gitStatus.stagedFiles.length} files\n\n` +
        '💡 **Next steps:**\n' +
        '• Review staged files\n' +
        '• Create commit\n' +
        '• Return to staging area',
        { 
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📝 Commit', callback_data: 'git:commit:prepare' },
                { text: '📦 Staging', callback_data: 'git:staging:overview' }
              ],
              [
                { text: '🏠 Git Overview', callback_data: 'git:overview' }
              ]
            ]
          }
        }
      );

    } catch (error) {
      console.error('[Stage All] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Stage All Failed**\n\n' +
        `**Error:** \`${error.message}\`\n\n` +
        '💡 This might happen if:\n' +
        '• Git repository is in an invalid state\n' +
        '• Permission issues\n' +
        '• No files to stage',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Unstage all staged files
   */
  async unstageAll(chatId) {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Unstage all files
      await execAsync('git reset HEAD', { cwd });
      
      // Invalidate cache after git state change
      this.invalidateCache();

      // Update our state
      const gitStatus = await this.getGitStatus();
      this.gitState = {
        ...this.gitState,
        stagedFiles: gitStatus.stagedFiles,
        unstagedFiles: gitStatus.unstagedFiles,
        untrackedFiles: gitStatus.untrackedFiles
      };

      const totalFiles = gitStatus.unstagedFiles.length + gitStatus.untrackedFiles.length;

      await this.mainBot.safeSendMessage(chatId, 
        '✅ **Unstage All Complete**\n\n' +
        `Unstaged files, now ${totalFiles} files are unstaged\n\n` +
        '💡 **Next steps:**\n' +
        '• Review unstaged files\n' +
        '• Stage specific files\n' +
        '• Return to staging area',
        { 
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Stage Some', callback_data: 'git:stage:select' },
                { text: '📦 Staging', callback_data: 'git:staging:overview' }
              ],
              [
                { text: '🏠 Git Overview', callback_data: 'git:overview' }
              ]
            ]
          }
        }
      );

    } catch (error) {
      console.error('[Unstage All] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Unstage All Failed**\n\n' +
        `**Error:** \`${error.message}\`\n\n` +
        '💡 This might happen if:\n' +
        '• No files are staged\n' +
        '• Git repository is in an invalid state\n' +
        '• Permission issues',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show file selection interface for staging
   */
  async showStageFileSelection(chatId, page = 0) {
    try {
      const gitStatus = await this.getGitStatus();
      const availableFiles = [...gitStatus.unstagedFiles, ...gitStatus.untrackedFiles];
      
      if (availableFiles.length === 0) {
        await this.mainBot.safeSendMessage(chatId, 
          '✅ **No Files to Stage**\n\n' +
          'All files are already staged or the working directory is clean.',
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
              ]]
            }
          }
        );
        return;
      }

      const filesPerPage = 6;
      const startIndex = page * filesPerPage;
      const endIndex = startIndex + filesPerPage;
      const files = availableFiles.slice(startIndex, endIndex);
      const totalPages = Math.ceil(availableFiles.length / filesPerPage);

      let text = `➕ **Stage Files** (Page ${page + 1}/${totalPages})\n\n`;
      text += `**Available files** (${availableFiles.length} total):\n\n`;

      // Show files with selection buttons
      files.forEach((file) => {
        const shortName = path.basename(file);
        const isUntracked = gitStatus.untrackedFiles.includes(file);
        const icon = isUntracked ? '🆕' : '📝';
        text += `${icon} \`${shortName}\`\n`;
      });

      text += '\n💡 **Select files to stage:**';

      // Create file selection keyboard
      const keyboard = {
        inline_keyboard: []
      };

      // File selection buttons (2 per row)
      for (let i = 0; i < files.length; i += 2) {
        const row = [];
        
        // First file
        const index1 = startIndex + i;
        const file1 = files[i];
        const shortName1 = path.basename(file1);
        row.push({
          text: `${i + 1}. ${shortName1.length > 20 ? shortName1.substring(0, 17) + '...' : shortName1}`,
          callback_data: `git:stage:file:${index1}`
        });
        
        // Second file (if exists)
        if (i + 1 < files.length) {
          const index2 = startIndex + i + 1;
          const file2 = files[i + 1];
          const shortName2 = path.basename(file2);
          row.push({
            text: `${i + 2}. ${shortName2.length > 20 ? shortName2.substring(0, 17) + '...' : shortName2}`,
            callback_data: `git:stage:file:${index2}`
          });
        }
        
        keyboard.inline_keyboard.push(row);
      }

      // Navigation row
      const navRow = [];
      if (page > 0) {
        navRow.push({ text: '⬅️ Prev', callback_data: `git:stage:select:${page - 1}` });
      }
      if (page < totalPages - 1) {
        navRow.push({ text: 'Next ➡️', callback_data: `git:stage:select:${page + 1}` });
      }
      if (navRow.length > 0) {
        keyboard.inline_keyboard.push(navRow);
      }

      // Action buttons
      keyboard.inline_keyboard.push([
        { text: '➕ Stage All', callback_data: 'git:stage:all' },
        { text: '🔙 Back', callback_data: 'git:staging:overview' }
      ]);

      await this.mainBot.safeSendMessage(chatId, text, {
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('[Stage File Selection] Error:', error);
      const parsedError = this.parseGitError(error, 'file staging selection');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, 
        errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show file selection interface for unstaging
   */
  async showUnstageFileSelection(chatId, page = 0) {
    try {
      const gitStatus = await this.getGitStatus();
      const availableFiles = gitStatus.stagedFiles;
      
      if (availableFiles.length === 0) {
        await this.mainBot.safeSendMessage(chatId, 
          '❌ **No Files to Unstage**\n\n' +
          'No files are currently staged.',
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
              ]]
            }
          }
        );
        return;
      }

      const filesPerPage = 6;
      const startIndex = page * filesPerPage;
      const endIndex = startIndex + filesPerPage;
      const files = availableFiles.slice(startIndex, endIndex);
      const totalPages = Math.ceil(availableFiles.length / filesPerPage);

      let text = `➖ **Unstage Files** (Page ${page + 1}/${totalPages})\n\n`;
      text += `**Staged files** (${availableFiles.length} total):\n\n`;

      // Show files with selection buttons
      files.forEach((file) => {
        const shortName = path.basename(file);
        text += `✅ \`${shortName}\`\n`;
      });

      text += '\n💡 **Select files to unstage:**';

      // Create file selection keyboard
      const keyboard = {
        inline_keyboard: []
      };

      // File selection buttons (2 per row)
      for (let i = 0; i < files.length; i += 2) {
        const row = [];
        
        // First file
        const index1 = startIndex + i;
        const file1 = files[i];
        const shortName1 = path.basename(file1);
        row.push({
          text: `${i + 1}. ${shortName1.length > 20 ? shortName1.substring(0, 17) + '...' : shortName1}`,
          callback_data: `git:unstage:file:${index1}`
        });
        
        // Second file (if exists)
        if (i + 1 < files.length) {
          const index2 = startIndex + i + 1;
          const file2 = files[i + 1];
          const shortName2 = path.basename(file2);
          row.push({
            text: `${i + 2}. ${shortName2.length > 20 ? shortName2.substring(0, 17) + '...' : shortName2}`,
            callback_data: `git:unstage:file:${index2}`
          });
        }
        
        keyboard.inline_keyboard.push(row);
      }

      // Navigation row
      const navRow = [];
      if (page > 0) {
        navRow.push({ text: '⬅️ Prev', callback_data: `git:unstage:select:${page - 1}` });
      }
      if (page < totalPages - 1) {
        navRow.push({ text: 'Next ➡️', callback_data: `git:unstage:select:${page + 1}` });
      }
      if (navRow.length > 0) {
        keyboard.inline_keyboard.push(navRow);
      }

      // Action buttons
      keyboard.inline_keyboard.push([
        { text: '➖ Unstage All', callback_data: 'git:unstage:all' },
        { text: '🔙 Back', callback_data: 'git:staging:overview' }
      ]);

      await this.mainBot.safeSendMessage(chatId, text, {
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('[Unstage File Selection] Error:', error);
      const parsedError = this.parseGitError(error, 'file unstaging selection');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, 
        errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Stage a specific file by index
   */
  async stageFile(chatId, fileIndex) {
    try {
      const gitStatus = await this.getGitStatus();
      const availableFiles = [...gitStatus.unstagedFiles, ...gitStatus.untrackedFiles];
      
      if (fileIndex >= availableFiles.length) {
        await this.mainBot.safeSendMessage(chatId, '❌ File not found');
        return;
      }

      const filename = availableFiles[fileIndex];
      const shortName = path.basename(filename);

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Stage the specific file
      await execAsync(`git add "${filename}"`, { cwd });
      
      // Invalidate cache after git state change
      this.invalidateCache();

      // Update our state
      const newGitStatus = await this.getGitStatus();
      this.gitState = {
        ...this.gitState,
        stagedFiles: newGitStatus.stagedFiles,
        unstagedFiles: newGitStatus.unstagedFiles,
        untrackedFiles: newGitStatus.untrackedFiles
      };

      await this.mainBot.safeSendMessage(chatId, 
        '✅ **File Staged**\n\n' +
        `**Staged:** \`${shortName}\`\n\n` +
        '💡 **Next steps:**\n' +
        '• Stage more files\n' +
        '• Create commit\n' +
        '• Return to staging area',
        { 
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Stage More', callback_data: 'git:stage:select' },
                { text: '📝 Commit', callback_data: 'git:commit:prepare' }
              ],
              [
                { text: '📦 Staging', callback_data: 'git:staging:overview' }
              ]
            ]
          }
        }
      );

    } catch (error) {
      console.error('[Stage File] Error:', error);
      const parsedError = this.parseGitError(error, 'file staging');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, 
        errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to File Selection', callback_data: 'git:stage:select' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Unstage a specific file by index
   */
  async unstageFile(chatId, fileIndex) {
    try {
      const gitStatus = await this.getGitStatus();
      const availableFiles = gitStatus.stagedFiles;
      
      if (fileIndex >= availableFiles.length) {
        await this.mainBot.safeSendMessage(chatId, '❌ File not found');
        return;
      }

      const filename = availableFiles[fileIndex];
      const shortName = path.basename(filename);

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Unstage the specific file
      await execAsync(`git reset HEAD "${filename}"`, { cwd });
      
      // Invalidate cache after git state change
      this.invalidateCache();

      // Update our state
      const newGitStatus = await this.getGitStatus();
      this.gitState = {
        ...this.gitState,
        stagedFiles: newGitStatus.stagedFiles,
        unstagedFiles: newGitStatus.unstagedFiles,
        untrackedFiles: newGitStatus.untrackedFiles
      };

      await this.mainBot.safeSendMessage(chatId, 
        '✅ **File Unstaged**\n\n' +
        `**Unstaged:** \`${shortName}\`\n\n` +
        '💡 **Next steps:**\n' +
        '• Unstage more files\n' +
        '• Stage different files\n' +
        '• Return to staging area',
        { 
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➖ Unstage More', callback_data: 'git:unstage:select' },
                { text: '➕ Stage Files', callback_data: 'git:stage:select' }
              ],
              [
                { text: '📦 Staging', callback_data: 'git:staging:overview' }
              ]
            ]
          }
        }
      );

    } catch (error) {
      console.error('[Unstage File] Error:', error);
      const parsedError = this.parseGitError(error, 'file unstaging');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, 
        errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to File Selection', callback_data: 'git:unstage:select' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Stage a specific file by its index in the git status nameStatus array
   */
  async stageFileByIndex(chatId, fileIndex) {
    try {
      const gitStatus = await this.getGitStatus();
      
      if (fileIndex >= gitStatus.nameStatus.length) {
        await this.mainBot.safeSendMessage(chatId, '❌ File not found');
        return;
      }

      const [, filename] = gitStatus.nameStatus[fileIndex].split('\t');
      const shortName = path.basename(filename);

      // Check if file is already staged
      if (gitStatus.stagedFiles.includes(filename)) {
        await this.mainBot.safeSendMessage(chatId, 
          `✅ **File Already Staged**\n\n\`${shortName}\` is already staged.`,
          { 
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📦 Staging', callback_data: 'git:staging:overview' },
                  { text: '📂 Files', callback_data: 'git:files:0' }
                ]
              ]
            }
          }
        );
        return;
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Stage the specific file
      await execAsync(`git add "${filename}"`, { cwd });
      
      // Invalidate cache after git state change
      this.invalidateCache();

      // Update our state
      const newGitStatus = await this.getGitStatus();
      this.gitState = {
        ...this.gitState,
        stagedFiles: newGitStatus.stagedFiles,
        unstagedFiles: newGitStatus.unstagedFiles,
        untrackedFiles: newGitStatus.untrackedFiles
      };

      await this.mainBot.safeSendMessage(chatId, 
        '✅ **File Staged**\n\n' +
        `**Staged:** \`${shortName}\`\n\n` +
        '💡 **Next steps:**\n' +
        '• View file changes\n' +
        '• Manage staging area\n' +
        '• Create commit',
        { 
          reply_markup: {
            inline_keyboard: [
              [
                { text: '👀 View File', callback_data: `git:file:${fileIndex}` },
                { text: '📦 Staging', callback_data: 'git:staging:overview' }
              ],
              [
                { text: '📝 Commit', callback_data: 'git:commit:prepare' },
                { text: '📂 Files', callback_data: 'git:files:0' }
              ]
            ]
          }
        }
      );

    } catch (error) {
      console.error('[Stage File By Index] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Stage File Failed**\n\n' +
        `**Error:** \`${error.message}\`\n\n` +
        '💡 This might happen if:\n' +
        '• File does not exist\n' +
        '• Permission issues\n' +
        '• Git repository is in an invalid state',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Files', callback_data: 'git:files:0' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Unstage a specific file by its index in the git status nameStatus array
   */
  async unstageFileByIndex(chatId, fileIndex) {
    try {
      const gitStatus = await this.getGitStatus();
      
      if (fileIndex >= gitStatus.nameStatus.length) {
        await this.mainBot.safeSendMessage(chatId, '❌ File not found');
        return;
      }

      const [, filename] = gitStatus.nameStatus[fileIndex].split('\t');
      const shortName = path.basename(filename);

      // Check if file is actually staged
      if (!gitStatus.stagedFiles.includes(filename)) {
        await this.mainBot.safeSendMessage(chatId, 
          `❌ **File Not Staged**\n\n\`${shortName}\` is not currently staged.`,
          { 
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📦 Staging', callback_data: 'git:staging:overview' },
                  { text: '📂 Files', callback_data: 'git:files:0' }
                ]
              ]
            }
          }
        );
        return;
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Unstage the specific file
      await execAsync(`git reset HEAD "${filename}"`, { cwd });
      
      // Invalidate cache after git state change
      this.invalidateCache();

      // Update our state
      const newGitStatus = await this.getGitStatus();
      this.gitState = {
        ...this.gitState,
        stagedFiles: newGitStatus.stagedFiles,
        unstagedFiles: newGitStatus.unstagedFiles,
        untrackedFiles: newGitStatus.untrackedFiles
      };

      await this.mainBot.safeSendMessage(chatId, 
        '✅ **File Unstaged**\n\n' +
        `**Unstaged:** \`${shortName}\`\n\n` +
        '💡 **Next steps:**\n' +
        '• View file changes\n' +
        '• Manage staging area\n' +
        '• Stage other files',
        { 
          reply_markup: {
            inline_keyboard: [
              [
                { text: '👀 View File', callback_data: `git:file:${fileIndex}` },
                { text: '📦 Staging', callback_data: 'git:staging:overview' }
              ],
              [
                { text: '➕ Stage Files', callback_data: 'git:stage:select' },
                { text: '📂 Files', callback_data: 'git:files:0' }
              ]
            ]
          }
        }
      );

    } catch (error) {
      console.error('[Unstage File By Index] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        '❌ **Unstage File Failed**\n\n' +
        `**Error:** \`${error.message}\`\n\n` +
        '💡 This might happen if:\n' +
        '• File is not staged\n' +
        '• Permission issues\n' +
        '• Git repository is in an invalid state',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Files', callback_data: 'git:files:0' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show commit interface (placeholder for Phase 4)
   */
  async showCommitInterface(chatId) {
    const stagedFiles = this.gitState.stagedFiles || [];
    const hasStaged = stagedFiles.length > 0;
    
    if (!hasStaged) {
      await this.mainBot.safeSendMessage(chatId,
        '📝 **Commit Changes**\n\n' +
        '❌ **No files staged**\n\n' +
        'Stage some files first before creating a commit.\n\n' +
        'Use the staging interface to select files for your commit.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📦 Go to Staging', callback_data: 'git:staging:overview' }],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        }
      );
      return;
    }

    // Enhanced mobile-optimized commit interface (Phase 7.4 - UI/UX refinements)
    let text = '📝 **Commit Changes**\n\n';
    text += `✅ **Ready to Commit** (${stagedFiles.length} files):\n`;
    
    // Mobile-friendly file list with type icons
    const maxDisplay = 6;
    stagedFiles.slice(0, maxDisplay).forEach(file => {
      const shortName = path.basename(file);
      const extension = path.extname(file);
      const typeIcon = this.getFileTypeIcon(extension);
      text += `${typeIcon} \`${shortName}\`\n`;
    });
    
    if (stagedFiles.length > maxDisplay) {
      text += `   *... and ${stagedFiles.length - maxDisplay} more files*\n`;
    }
    
    text += '🎯 **Next Step:** Write your commit message\n';
    text += '💡 *Send a message with your commit description*\n\n';
    text += '**Choose action:**';
    
    // Enhanced mobile-optimized commit keyboard
    const keyboard = {
      inline_keyboard: [
        [{ text: '✍️ Write Commit Message', callback_data: 'git:commit:create' }],
        [{ text: '🔄 Amend Last Commit', callback_data: 'git:commit:amend' }],
        [
          { text: '🔍 Validate', callback_data: 'git:validation:check' },
          { text: '📜 History', callback_data: 'git:commit:history' }
        ],
        [{ text: '📦 Back to Staging', callback_data: 'git:staging:overview' }],
        [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
      ]
    };
    
    await this.mainBot.safeSendMessage(chatId, text, {
      reply_markup: keyboard
    });
  }

  /**
   * Show paginated file list with status (enhanced from GitDiffManager)
   */
  async showFileList(chatId, gitStatus, page = 0) {
    const filesPerPage = 6;
    const startIndex = page * filesPerPage;
    const endIndex = startIndex + filesPerPage;
    const files = gitStatus.nameStatus.slice(startIndex, endIndex);
    const totalPages = Math.ceil(gitStatus.nameStatus.length / filesPerPage);
    
    let text = `📋 **Changed Files** (Page ${page + 1}/${totalPages})\n\n`;
    
    // Show files with enhanced status info
    for (let i = 0; i < files.length; i++) {
      const [status, filename] = files[i].split('\t');
      const globalIndex = startIndex + i;
      const numStatLine = gitStatus.numStats[globalIndex] || '';
      const [added = '0', removed = '0'] = numStatLine.split('\t');
      
      const icon = status === 'M' ? '📝' : status === 'A' ? '➕' : status === 'D' ? '➖' : status === '??' ? '🆕' : '🔄';
      const shortName = path.basename(filename);
      
      // Enhanced status display
      let statusText = '';
      if (gitStatus.stagedFiles.includes(filename)) statusText += '✅ ';
      if (gitStatus.unstagedFiles.includes(filename)) statusText += '📝 ';
      if (gitStatus.untrackedFiles.includes(filename)) statusText += '❓ ';
      
      text += `${icon} ${statusText}\`${shortName}\`\n`;
      if (added !== '-' && removed !== '-') {
        text += `   +${added} -${removed} lines\n`;
      }
      text += '\n';
    }
    
    // Create enhanced navigation keyboard with staging options
    const keyboard = {
      inline_keyboard: []
    };
    
    // File selection buttons (2 per row)
    for (let i = 0; i < files.length; i += 2) {
      const row = [];
      
      // First file
      const index1 = startIndex + i;
      const file1 = files[i].split('\t')[1];
      const shortName1 = path.basename(file1);
      row.push({
        text: `${i + 1}. ${shortName1.length > 20 ? shortName1.substring(0, 17) + '...' : shortName1}`,
        callback_data: `git:file:${index1}`
      });
      
      // Second file (if exists)
      if (i + 1 < files.length) {
        const index2 = startIndex + i + 1;
        const file2 = files[i + 1].split('\t')[1];
        const shortName2 = path.basename(file2);
        row.push({
          text: `${i + 2}. ${shortName2.length > 20 ? shortName2.substring(0, 17) + '...' : shortName2}`,
          callback_data: `git:file:${index2}`
        });
      }
      
      keyboard.inline_keyboard.push(row);
    }
    
    // Navigation buttons
    const navRow = [];
    if (page > 0) {
      navRow.push({ text: '⬅️ Prev', callback_data: `git:files:${page - 1}` });
    }
    navRow.push({ text: '🏠 Overview', callback_data: 'git:overview' });
    if (page < totalPages - 1) {
      navRow.push({ text: 'Next ➡️', callback_data: `git:files:${page + 1}` });
    }
    keyboard.inline_keyboard.push(navRow);
    
    await this.mainBot.safeSendMessage(chatId, text, {
      reply_markup: keyboard
    });
  }

  // ====== PRESERVED METHODS FROM GitDiffManager ======
  // The following methods are preserved from GitDiffManager for backward compatibility
  
  /**
   * Show detailed diff for a specific file (preserved from GitDiffManager)
   */
  async showDiffFile(chatId, gitStatus, fileIndex = 0, contextLines = 3, wordDiff = false) {
    if (fileIndex >= gitStatus.nameStatus.length) {
      await this.mainBot.safeSendMessage(chatId, '❌ File not found');
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
        formattedDiff = this.formatDiffForTelegram(diffOutput, filename);
      }

      // Split into chunks if too long (Telegram limit ~4096 chars)
      const chunks = this.messageSplitter.splitIntoChunks(formattedDiff, 3800);

      // Show first chunk with enhanced navigation
      await this.sendDiffChunk(chatId, chunks, 0, {
        filename,
        fileIndex,
        contextLines,
        wordDiff,
        status,
        totalFiles: gitStatus.nameStatus.length
      });

    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Error reading diff for ${path.basename(filename)}**\n\n\`${error.message}\``
      );
    }
  }

  /**
   * Format untracked file content with pagination support (preserved from GitDiffManager)
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
      
      let formattedDiff = `🆕 **${this.escapeMarkdown(shortName)}** (new file)\n`;
      
      // Add pagination info if multiple pages
      if (totalPages > 1) {
        formattedDiff += `📄 *Page ${page + 1} of ${totalPages} (lines ${startLine + 1}-${endLine} of ${lines.length})*\n`;
      } else {
        formattedDiff += `📄 *${lines.length} lines*\n`;
      }
      
      formattedDiff += '\n```\n';
      
      displayLines.forEach((line, index) => {
        const lineNumber = startLine + index + 1;
        formattedDiff += `${lineNumber}: ${line}\n`;
      });
      
      formattedDiff += '```';
      
      return {
        content: formattedDiff,
        totalPages,
        currentPage: page,
        totalLines: lines.length
      };
      
    } catch (readError) {
      return {
        content: `❌ **Cannot read file: ${this.escapeMarkdown(path.basename(filename))}**\n\nError: ${readError.message}`,
        totalPages: 1,
        currentPage: 0,
        totalLines: 0
      };
    }
  }

  /**
   * Format git diff output for Telegram display (preserved from GitDiffManager)
   */
  formatDiffForTelegram(diffOutput, filename) {
    const lines = diffOutput.split('\n');
    const shortName = path.basename(filename);
    
    // Safely escape filename for markdown
    const escapedFilename = this.escapeMarkdown(shortName);
    let formatted = `📄 *${escapedFilename}*\n\n`;
    let inHunk = false;
    
    for (const line of lines) {
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
   * Send diff chunk with enhanced navigation (enhanced from GitDiffManager)
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
    const shortName = path.basename(filename);

    // Create enhanced navigation keyboard
    const keyboard = {
      inline_keyboard: []
    };

    // Chunk navigation (if multiple chunks)
    if (chunks.length > 1) {
      const chunkRow = [];
      if (chunkIndex > 0) {
        chunkRow.push({
          text: '⬅️ Prev Chunk',
          callback_data: `git:chunk:${fileIndex}:${chunkIndex - 1}:${contextLines}:${wordDiff}` 
        });
      }
      chunkRow.push({
        text: `${chunkIndex + 1}/${chunks.length}`,
        callback_data: 'noop'
      });
      if (chunkIndex < chunks.length - 1) {
        chunkRow.push({
          text: 'Next Chunk ➡️',
          callback_data: `git:chunk:${fileIndex}:${chunkIndex + 1}:${contextLines}:${wordDiff}` 
        });
      }
      keyboard.inline_keyboard.push(chunkRow);
    }

    // Untracked file pagination (if applicable)
    if (status === '??' && this.untrackedFilePagination) {
      const { totalPages, currentPage } = this.untrackedFilePagination;
      if (totalPages > 1) {
        const pageRow = [];
        if (currentPage > 0) {
          pageRow.push({
            text: '⬅️ Prev Page',
            callback_data: `git:untracked_page:${fileIndex}:${currentPage - 1}:${contextLines}:${wordDiff}` 
          });
        }
        pageRow.push({
          text: `Page ${currentPage + 1}/${totalPages}`,
          callback_data: 'noop'
        });
        if (currentPage < totalPages - 1) {
          pageRow.push({
            text: 'Next Page ➡️',
            callback_data: `git:untracked_page:${fileIndex}:${currentPage + 1}:${contextLines}:${wordDiff}` 
          });
        }
        keyboard.inline_keyboard.push(pageRow);
      }
    }

    // Enhanced file actions (staging options)
    const actionRow = [];
    
    // Get current git status to determine staging state
    try {
      const currentGitStatus = await this.getGitStatus();
      const [, currentFilename] = currentGitStatus.nameStatus[fileIndex].split('\t');
      
      if (currentGitStatus.stagedFiles.includes(currentFilename)) {
        // File is staged - show unstage option
        actionRow.push({
          text: '➖ Unstage',
          callback_data: `git:file:${fileIndex}:unstage`
        });
      } else {
        // File is not staged - show stage option
        actionRow.push({
          text: '➕ Stage',
          callback_data: `git:file:${fileIndex}:stage`
        });
      }
      
      // Add staging area button for easy access
      actionRow.push({
        text: '📦 Staging',
        callback_data: 'git:staging:overview'
      });
      
    } catch {
      // Fallback: just show stage button
      actionRow.push({
        text: '➕ Stage',
        callback_data: `git:file:${fileIndex}:stage`
      });
    }
    
    if (actionRow.length > 0) {
      keyboard.inline_keyboard.push(actionRow);
    }

    // File navigation
    const fileRow = [];
    if (fileIndex > 0) {
      fileRow.push({ text: '⬅️ Prev File', callback_data: `git:file:${fileIndex - 1}` });
    }
    if (fileIndex < totalFiles - 1) {
      fileRow.push({ text: 'Next File ➡️', callback_data: `git:file:${fileIndex + 1}` });
    }
    if (fileRow.length > 0) {
      keyboard.inline_keyboard.push(fileRow);
    }

    // Context options
    if (status !== '??') {
      keyboard.inline_keyboard.push([
        {
          text: `Context: ${contextLines === 1 ? '✅' : ''}1`,
          callback_data: `git:file:${fileIndex}:1:${wordDiff}` 
        },
        {
          text: `Context: ${contextLines === 3 ? '✅' : ''}3`,
          callback_data: `git:file:${fileIndex}:3:${wordDiff}` 
        },
        {
          text: `Context: ${contextLines === 5 ? '✅' : ''}5`,
          callback_data: `git:file:${fileIndex}:5:${wordDiff}` 
        }
      ]);
    }

    // Navigation back
    keyboard.inline_keyboard.push([
      { text: '📋 File List', callback_data: 'git:files:0' },
      { text: '🏠 Overview', callback_data: 'git:overview' }
    ]);

    // Send with appropriate parse mode
    let parseMode = 'HTML';
    try {
      await this.mainBot.safeSendMessage(chatId, chunk, {
        reply_markup: keyboard
      });
    } catch (error) {
      // If Markdown fails, try HTML
      console.error(`[Git] ${parseMode} parsing error:`, error.message);
      parseMode = 'HTML';
      
      // Clean the chunk for HTML if Markdown failed
      const cleanChunk = chunk
        .replace(/```[\s\S]*?```/g, '[Diff content - formatting error]'); // Replace code blocks
        
      try {
        await this.mainBot.safeSendMessage(chatId, 
          'There was an issue displaying the diff with formatting.\n' +
          'Raw diff content:\n\n' +
          cleanChunk, 
          { 
            reply_markup: keyboard 
          }
        );
      } catch (fallbackError) {
        await this.mainBot.safeSendMessage(chatId, 
          `❌ Error displaying diff for ${shortName}: ${fallbackError.message}`,
          { reply_markup: keyboard }
        );
      }
    }
  }

  /**
   * Handle git callback queries - Enhanced from handleDiffCallback
   */
  async handleGitCallback(data, chatId, messageId) {
    const parts = data.split(':');
    const action = parts[1];

    try {
      if (action === 'refresh' || action === 'overview') {
        await this.showGitOverview(chatId);
        
      } else if (action === 'files') {
        const page = parseInt(parts[2]) || 0;
        const gitStatus = await this.getGitStatus();
        await this.showFileList(chatId, gitStatus, page);
        
      } else if (action === 'file') {
        const fileIndex = parseInt(parts[2]) || 0;
        
        // Check if this is a staging operation: git:file:index:stage or git:file:index:unstage
        if (parts[3] === 'stage') {
          await this.stageFileByIndex(chatId, fileIndex);
          
        } else if (parts[3] === 'unstage') {
          await this.unstageFileByIndex(chatId, fileIndex);
          
        } else {
          // Regular file diff view
          const contextLines = parseInt(parts[3]) || 3;
          const wordDiff = parts[4] === 'true';
          
          const gitStatus = await this.getGitStatus();
          await this.showDiffFile(chatId, gitStatus, fileIndex, contextLines, wordDiff);
        }
        
      } else if (action === 'branch') {
        await this.handleBranchCallback(parts, chatId);
        
      } else if (action === 'staging') {
        await this.handleStagingCallback(parts, chatId);
        
      } else if (action === 'stage' || action === 'unstage') {
        await this.handleStagingCallback(parts, chatId);
        
      } else if (action === 'commit') {
        await this.handleCommitCallback(parts, chatId);
        
      } else if (action === 'history') {
        await this.handleHistoryCallback(parts, chatId);
        
      } else if (action === 'amend') {
        await this.handleAmendCallback(parts, chatId);
        
      } else if (action === 'validation') {
        await this.handleValidationCallback(parts, chatId);
        
      } else if (action === 'push' || action === 'pull' || action === 'fetch') {
        await this.handleRemoteCallback(parts, chatId, messageId);
        
      } else if (action === 'remote') {
        const remoteAction = parts[2];
        await this.handleRemoteInfoCallback(chatId, messageId, remoteAction);
        
      } else if (action === 'upstream') {
        const upstreamAction = parts[2];
        const remoteName = parts[3];
        await this.handleUpstreamCallback(chatId, messageId, upstreamAction, remoteName);
        
      } else if (action === 'force') {
        await this.handleForceCallback(parts, chatId, messageId);
        
      } else if (action === 'chunk') {
        // Handle chunk navigation (preserved from GitDiffManager)
        const fileIndex = parseInt(parts[2]) || 0;
        const chunkIndex = parseInt(parts[3]) || 0;
        const contextLines = parseInt(parts[4]) || 3;
        const wordDiff = parts[5] === 'true';
        
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const gitStatus = await this.getGitStatus();
        
        // Get diff and show specific chunk
        const [status, filename] = gitStatus.nameStatus[fileIndex].split('\t');
        let formattedDiff;
        
        if (status === '??') {
          // For untracked files
          const untrackedResult = await this.formatUntrackedFileContent(filename, this.options.workingDirectory, 0);
          formattedDiff = untrackedResult.content;
          
          // Store pagination info
          this.untrackedFilePagination = {
            fileIndex,
            filename,
            totalPages: untrackedResult.totalPages,
            currentPage: untrackedResult.currentPage,
            totalLines: untrackedResult.totalLines
          };
        } else {
          // For tracked files, use git diff
          const diffCommand = `git diff HEAD --color=never --unified=${contextLines} -- "${filename}"`;
          const diffResult = await execAsync(diffCommand, { 
            cwd: this.options.workingDirectory 
          });
          
          formattedDiff = this.formatDiffForTelegram(diffResult.stdout, filename);
        }
        
        const chunks = this.messageSplitter.splitIntoChunks(formattedDiff, 3800);
        
        await this.sendDiffChunk(chatId, chunks, chunkIndex, {
          filename,
          fileIndex,
          contextLines,
          wordDiff,
          status,
          totalFiles: gitStatus.nameStatus.length
        });
        
      } else if (action === 'untracked_page') {
        // Handle untracked file pagination (preserved from GitDiffManager)
        const fileIndex = parseInt(parts[2]) || 0;
        const page = parseInt(parts[3]) || 0;
        const contextLines = parseInt(parts[4]) || 3;
        const wordDiff = parts[5] === 'true';
        
        const gitStatus = await this.getGitStatus();
        
        // Get untracked file content for specific page
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
        
        const chunks = this.messageSplitter.splitIntoChunks(untrackedResult.content, 3800);
        
        await this.sendDiffChunk(chatId, chunks, 0, {
          filename,
          fileIndex,
          contextLines,
          wordDiff,
          status,
          totalFiles: gitStatus.nameStatus.length
        });
        
      } else if (action === 'stats') {
        // Handle stats display (preserved from GitDiffManager)
        const gitStatus = await this.getGitStatus();
        
        let text = '📊 **Git Diff Statistics**\n\n';
        text += '```\n' + gitStatus.diffStats + '\n```\n\n';
        text += '💡 Choose another view:';
        
        await this.mainBot.safeSendMessage(chatId, text, {
          reply_markup: {
            inline_keyboard: [[
              { text: '🏠 Overview', callback_data: 'git:overview' },
              { text: '🔄 Refresh', callback_data: 'git:refresh' }
            ]]
          }
        });
      }
      
    } catch (error) {
      console.error('[Git Callback] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        `❌ Error: ${error.message}`
      );
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async handleDiffCallback(data, chatId, messageId, userId) {
    // Convert legacy 'diff:' callbacks to 'git:' callbacks
    const gitData = data.replace('diff:', 'git:');
    return await this.handleGitCallback(gitData, chatId, messageId, userId);
  }

  // ====== PLACEHOLDER METHODS FOR FUTURE PHASES ======

  /**
   * Handle branch-related callbacks
   */
  async handleBranchCallback(parts, chatId) {
    const action = parts[2]; // git:branch:action
    
    try {
      if (action === 'list') {
        await this.showBranchManagement(chatId);
        
      } else if (action === 'switch_list') {
        await this.showBranchSwitchList(chatId);
        
      } else if (action === 'switch') {
        const branchName = decodeURIComponent(parts[3]);
        await this.switchBranch(chatId, branchName);
        
      } else if (action === 'force_switch') {
        const branchName = decodeURIComponent(parts[3]);
        await this.performBranchSwitch(chatId, branchName, true);
        
      } else if (action === 'create') {
        await this.showBranchCreation(chatId);
        
      } else {
        await this.mainBot.safeSendMessage(chatId, 
          `❌ Unknown branch action: ${action}`,
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Branches', callback_data: 'git:branch:list' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Branch Callback] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        `❌ Branch operation error: ${error.message}`,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show branch creation interface
   */
  async showBranchCreation(chatId) {
    await this.mainBot.safeSendMessage(chatId, 
      '🆕 **Create New Branch**\n\n' +
      '💡 **Instructions:**\n' +
      '1. Type a branch name (letters, numbers, hyphens, underscores only)\n' +
      '2. Branch will be created from current branch\n' +
      '3. You will automatically switch to the new branch\n\n' +
      '**Enter branch name:**',
      { 
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Cancel', callback_data: 'git:branch:list' }
          ]]
        }
      }
    );

    // Set state to capture next text message as branch name
    this.gitState.branchCreationInProgress = true;
    this.gitState.branchCreationChatId = chatId;
  }

  /**
   * Create a new branch with validation
   */
  async createBranch(chatId, branchName) {
    try {
      // Validate branch name
      const validationError = this.validateBranchName(branchName);
      if (validationError) {
        await this.mainBot.safeSendMessage(chatId, 
          `❌ **Invalid Branch Name**\n\n${validationError}\n\nPlease try again with a valid name.`,
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '🔄 Try Again', callback_data: 'git:branch:create' },
                { text: '🔙 Cancel', callback_data: 'git:branch:list' }
              ]]
            }
          }
        );
        return;
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const cwd = this.options.workingDirectory;

      // Check if branch already exists
      try {
        await execAsync(`git show-ref --verify refs/heads/${branchName}`, { cwd });
        // If we reach here, branch exists
        await this.mainBot.safeSendMessage(chatId, 
          '❌ **Branch Already Exists**\n\n' +
          `Branch \`${branchName}\` already exists.\n\n` +
          '💡 **Options:**',
          { 
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '➡️ Switch to Existing', callback_data: `git:branch:switch:${encodeURIComponent(branchName)}` }
                ],
                [
                  { text: '🔄 Try Different Name', callback_data: 'git:branch:create' },
                  { text: '🔙 Cancel', callback_data: 'git:branch:list' }
                ]
              ]
            }
          }
        );
        return;
      } catch {
        // Branch doesn't exist - good to proceed
      }

      // Create and checkout new branch
      await execAsync(`git checkout -b "${branchName}"`, { cwd });
      
      // Verify creation was successful
      const currentBranchResult = await execAsync('git branch --show-current', { cwd });
      const currentBranch = currentBranchResult.stdout.trim();

      if (currentBranch === branchName) {
        // Success! Update our state
        this.gitState.currentBranch = currentBranch;

        await this.mainBot.safeSendMessage(chatId, 
          '✅ **Branch Created Successfully**\n\n' +
          `**Created:** \`${branchName}\`\n` +
          '**Status:** Switched to new branch\n\n' +
          '💡 **Next steps:**\n' +
          '• Make your changes\n' +
          '• Commit when ready\n' +
          '• Push to set upstream',
          { 
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📂 View Files', callback_data: 'git:files:0' },
                  { text: '📝 Commit', callback_data: 'git:commit:prepare' }
                ],
                [
                  { text: '🌿 Branch Info', callback_data: 'git:branch:list' },
                  { text: '🏠 Git Overview', callback_data: 'git:overview' }
                ]
              ]
            }
          }
        );
      } else {
        throw new Error(`Branch creation verification failed. Expected ${branchName}, got ${currentBranch}`);
      }

    } catch (error) {
      console.error('[Create Branch] Error:', error);
      
      // Use enhanced error handling for branch creation
      const parsedError = this.parseGitError(error, 'Branch Creation');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId, errorMessage,
        { 
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Try Again', callback_data: 'git:branch:create' },
                { text: '🔙 Back to Branches', callback_data: 'git:branch:list' }
              ]
            ]
          }
        }
      );
    }
  }

  /**
   * Validate branch name according to git rules
   */
  validateBranchName(branchName) {
    if (!branchName || branchName.trim().length === 0) {
      return 'Branch name cannot be empty';
    }

    const trimmed = branchName.trim();

    // Git branch name rules
    if (trimmed.length > 250) {
      return 'Branch name too long (max 250 characters)';
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9_/-]*[a-zA-Z0-9]$/.test(trimmed)) {
      return 'Branch name must:\n• Start and end with letter/number\n• Contain only letters, numbers, hyphens, underscores, slashes\n• Not contain spaces or special characters';
    }

    if (trimmed.includes('..') || trimmed.includes('//')) {
      return 'Branch name cannot contain consecutive dots (..) or slashes (//)';
    }

    if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
      return 'Branch name cannot start or end with a dot (.)';
    }

    if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
      return 'Branch name cannot start or end with a slash (/)';
    }

    if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
      return 'Branch name cannot start or end with a hyphen (-)';
    }

    // Reserved names
    const reserved = ['HEAD', 'head', 'master', 'main'];
    if (reserved.includes(trimmed.toLowerCase())) {
      return `"${trimmed}" is a reserved branch name`;
    }

    return null; // Valid
  }

  /**
   * Handle staging-related callbacks
   */
  async handleStagingCallback(parts, chatId) {
    const action = parts[2]; // git:stage:action or git:unstage:action
    
    try {
      if (parts[1] === 'stage') {
        // Handle staging operations: git:stage:action
        if (action === 'all') {
          await this.stageAll(chatId);
          
        } else if (action === 'select') {
          const page = parseInt(parts[3]) || 0;
          await this.showStageFileSelection(chatId, page);
          
        } else if (action === 'file') {
          const fileIndex = parseInt(parts[3]);
          await this.stageFile(chatId, fileIndex);
          
        } else {
          await this.mainBot.safeSendMessage(chatId, 
            `❌ Unknown staging action: ${action}`,
            { 
              reply_markup: {
                inline_keyboard: [[
                  { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
                ]]
              }
            }
          );
        }
        
      } else if (parts[1] === 'unstage') {
        // Handle unstaging operations: git:unstage:action
        if (action === 'all') {
          await this.unstageAll(chatId);
          
        } else if (action === 'select') {
          const page = parseInt(parts[3]) || 0;
          await this.showUnstageFileSelection(chatId, page);
          
        } else if (action === 'file') {
          const fileIndex = parseInt(parts[3]);
          await this.unstageFile(chatId, fileIndex);
          
        } else {
          await this.mainBot.safeSendMessage(chatId, 
            `❌ Unknown unstaging action: ${action}`,
            { 
              reply_markup: {
                inline_keyboard: [[
                  { text: '🔙 Back to Staging', callback_data: 'git:staging:overview' }
                ]]
              }
            }
          );
        }
        
      } else if (parts[1] === 'staging' && action === 'overview') {
        // Handle staging overview: git:staging:overview
        await this.showStagingInterface(chatId);
        
      } else {
        await this.mainBot.safeSendMessage(chatId, 
          `❌ Unknown staging operation: ${parts[1]}:${action}`,
          { 
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Staging Callback] Error:', error);
      await this.mainBot.safeSendMessage(chatId, 
        `❌ Staging operation error: ${error.message}`,
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Handle commit-related callbacks (Phase 4)
   */
  async handleCommitCallback(parts, chatId) {
    try {
      const action = parts[2];
      
      if (action === 'create' || action === 'prepare') {
        // Check if there are staged files
        if (!this.gitState.stagedFiles || this.gitState.stagedFiles.length === 0) {
          await this.mainBot.safeSendMessage(chatId,
            '❌ **No files staged**\n\n' +
            'Stage some files first before creating a commit.\n\n' +
            'Use the staging interface to select files for your commit.',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📦 Go to Staging', callback_data: 'git:staging:overview' }],
                  [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
                ]
              }
            }
          );
          return;
        }
        
        // Start commit message input
        console.log(`[GitManager DEBUG] Setting commitMessageInProgress = true for chatId ${chatId}`);
        this.gitState.commitMessageInProgress = true;
        this.gitState.commitMessageChatId = chatId;
        console.log('[GitManager DEBUG] gitState after setting:', {
          commitMessageInProgress: this.gitState.commitMessageInProgress,
          commitMessageChatId: this.gitState.commitMessageChatId
        });
        
        await this.mainBot.safeSendMessage(chatId,
          '✍️ **Enter Commit Message**\n\n' +
          `**Staged Files** (${this.gitState.stagedFiles.length}):\n` +
          this.gitState.stagedFiles.slice(0, 3).map(file => `✅ ${file}`).join('\n') +
          (this.gitState.stagedFiles.length > 3 ? `\n... and ${this.gitState.stagedFiles.length - 3} more files` : '') +
          '\n\n💬 **Please type your commit message:**\n\n' +
          '📝 Tips:\n' +
          '• Keep it under 72 characters\n' +
          '• Use present tense (e.g., "Add feature" not "Added feature")\n' +
          '• Be descriptive but concise',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Cancel', callback_data: 'git:commit:cancel' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        
      } else if (action === 'history') {
        await this.showCommitHistory(chatId);
        
      } else if (action === 'amend') {
        await this.showAmendInterface(chatId);
        
      } else if (action === 'cancel') {
        // Cancel commit message input
        this.gitState.commitMessageInProgress = false;
        this.gitState.commitMessageChatId = null;
        
        await this.mainBot.safeSendMessage(chatId,
          '❌ **Commit Cancelled**\n\n' +
          'Commit operation has been cancelled.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Back to Commit', callback_data: 'git:commit' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown commit operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Commit Callback] Error:', error);
      await this.mainBot.safeSendMessage(chatId,
        `❌ Commit operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Handle enhanced force push callbacks (Phase 5.4)
   */
  async handleForceCallback(parts, chatId, messageId) {
    try {
      const action = parts[2];
      
      if (action === 'warning') {
        await this.showEnhancedForcePushWarning(chatId, messageId);
        
      } else if (action === 'summary') {
        await this.showForcePushSummary(chatId, messageId);
        
      } else if (action === 'execute') {
        await this.executeEnhancedForcePush(chatId, messageId);
        
      } else {
        await this.mainBot.safeEditMessage(chatId, messageId,
          `❌ Unknown force push operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Push', callback_data: 'git:push' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Force Callback] Error:', error);
      await this.mainBot.safeEditMessage(chatId, messageId,
        `❌ Force push operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Push', callback_data: 'git:push' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Handle remote operations callbacks (Phase 5)
   */
  async handleRemoteCallback(parts, chatId, messageId) {
    try {
      const action = parts[1];
      
      if (action === 'push') {
        await this.handlePushCallback(parts, chatId);
        
      } else if (action === 'fetch') {
        const fetchAction = parts[2] || 'interface';
        await this.handleFetchCallback(chatId, messageId, fetchAction);
        
      } else if (action === 'pull') {
        const pullAction = parts[2] || 'interface';
        await this.handlePullCallback(chatId, messageId, pullAction);
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown remote operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ Remote operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Phase 5.1: Push Operations Methods
   */

  /**
   * Handle push-related callbacks
   */
  async handlePushCallback(parts, chatId) {
    try {
      const action = parts[2] || 'overview'; // Default to overview if no action specified
      
      if (action === 'overview') {
        await this.showPushInterface(chatId);
        
      } else if (action === 'execute') {
        await this.executePushFlow(chatId, false);
        
      } else if (action === 'force_confirm') {
        await this.showForcePushConfirmation(chatId);
        
      } else if (action === 'force_execute') {
        await this.executePushFlow(chatId, true);
        
      } else if (action === 'setup_upstream') {
        await this.showUpstreamSetup(chatId);
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown push operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ Push operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show push interface with current branch status
   */
  async showPushInterface(chatId) {
    try {
      const branchInfo = await this.getBranchInfo();
      const prerequisites = await this.checkPushPrerequisites();
      
      let message = '⬆️ **Push Changes**\n\n';
      message += `**Current Branch:** ${branchInfo.currentBranch}\n`;
      
      if (branchInfo.ahead > 0) {
        message += `📈 **${branchInfo.ahead} commits ahead** of remote\n`;
      } else {
        message += '📊 **Up to date** with remote\n';
      }
      
      if (branchInfo.behind > 0) {
        message += `📉 **${branchInfo.behind} commits behind** remote\n`;
      }
      
      message += '\n';
      
      // Check for issues
      if (!prerequisites.canPush) {
        message += '❌ **Cannot Push:**\n';
        for (const issue of prerequisites.issues) {
          message += `• ${issue}\n`;
        }
        message += '\n';
      }
      
      // Upstream is handled automatically during push
      
      // Warning for behind status
      if (branchInfo.behind > 0) {
        message += '🚨 **Warning:** Your branch is behind the remote.\n';
        message += 'Consider pulling changes first to avoid conflicts.\n\n';
      }
      
      message += '💡 Choose an action:';
      
      const buttons = [];
      
      if (prerequisites.canPush && (branchInfo.ahead > 0 || !branchInfo.hasUpstream)) {
        buttons.push([{ text: '⬆️ Push', callback_data: 'git:push:execute' }]);
      }
      
      if (branchInfo.behind > 0) {
        buttons.push([
          { text: '⚠️ Force Push', callback_data: 'git:push:force_confirm' },
          { text: '⬇️ Pull First', callback_data: 'git:pull' }
        ]);
      } else if (branchInfo.ahead > 0 && branchInfo.hasUpstream) {
        buttons.push([{ text: '⚠️ Force Push', callback_data: 'git:push:force_confirm' }]);
      }
      
      buttons.push([
        { text: '🔄 Refresh Status', callback_data: 'git:push:overview' },
        { text: '🌐 Remote Info', callback_data: 'git:remote:info' }
      ]);
      
      buttons.push([{ text: '🔙 Back to Git', callback_data: 'git:overview' }]);
      
      await this.mainBot.safeSendMessage(chatId, message, {
        reply_markup: { inline_keyboard: buttons }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Push Interface Error**\n\n${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show force push confirmation dialog
   */
  async showForcePushConfirmation(chatId) {
    const message = '⚠️ **Force Push Warning**\n\n' +
      '🚨 **Danger:** Force push will overwrite remote history!\n\n' +
      '**This can:**\n' +
      '• Lose commits from other contributors\n' +
      '• Break other people\'s local repositories\n' +
      '• Cause data loss if not careful\n\n' +
      '**Only proceed if:**\n' +
      '• You\'re working on a personal branch\n' +
      '• You\'re certain no one else is using this branch\n' +
      '• You understand the consequences\n\n' +
      '💡 **Options:**\n' +
      '• **Enhanced**: Risk analysis + safety backup\n' +
      '• **Basic**: Immediate force push\n' +
      '• **Alternative**: Pull changes first';
    
    await this.mainBot.safeSendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🛡️ Enhanced Force Push', callback_data: 'git:force:warning' }
          ],
          [
            { text: '🚨 Basic Force Push', callback_data: 'git:push:force_execute' },
            { text: '⬇️ Pull Instead', callback_data: 'git:pull' }
          ],
          [
            { text: '❌ Cancel', callback_data: 'git:push:overview' },
            { text: '🔙 Back to Git', callback_data: 'git:overview' }
          ]
        ]
      }
    });
  }

  /**
   * Execute push flow with safety checks
   */
  async executePushFlow(chatId, force = false) {
    try {
      // Show loading message
      const loadingMsg = await this.mainBot.safeSendMessage(chatId, 
        '⬆️ **Pushing changes...**\n\n🔄 Please wait...'
      );
      
      const branchInfo = await this.getBranchInfo();
      const setUpstream = !branchInfo.hasUpstream;
      
      const result = await this.executePush(force, setUpstream);
      
      let message;
      if (result.success) {
        message = '✅ **Push Successful**\n\n';
        message += `🌿 Branch: ${branchInfo.currentBranch}\n`;
        
        if (result.pushedCommits > 0) {
          message += `📈 Pushed ${result.pushedCommits} commit(s)\n`;
        } else {
          message += '📊 Everything up-to-date\n';
        }
        
        message += '\n💡 Your changes are now available on the remote repository.';
        
        // Refresh git state
        await this.refreshGitState();
        
      } else {
        message = '❌ **Push Failed**\n\n';
        message += `**Error:** ${result.error}\n\n`;
        
        if (result.needsPull) {
          message += '💡 **Solution:** Pull changes first, then try again.';
        } else if (result.needsForce) {
          message += '💡 **Solution:** Use force push if you\'re sure, or check for conflicts.';
        } else if (result.authError) {
          message += '💡 **Solution:** Check your Git credentials and permissions.';
        } else {
          message += '💡 **Solution:** Check your network connection and repository settings.';
        }
      }
      
      await this.mainBot.safeEditMessage(chatId, loadingMsg.message_id, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Try Again', callback_data: 'git:push:overview' },
              { text: '📊 Check Status', callback_data: 'git:overview' }
            ],
            [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
          ]
        }
      });
      
    } catch (error) {
      // Use enhanced error analysis
      const errorAnalysis = this.analyzeGitError(error, 'push');
      const errorMessage = this.formatErrorMessage(errorAnalysis, true);
      
      await this.mainBot.safeSendMessage(chatId, errorMessage,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Execute git push command
   */
  async executePush(force = false, setUpstream = false) {
    return new Promise((resolve) => {
      const branchInfo = this.gitState.currentBranch;
      let command = 'git push';
      
      if (setUpstream) {
        command += ` --set-upstream origin ${branchInfo}`;
      }
      
      if (force) {
        command += ' --force';
      }
      
      exec(command, { cwd: this.options.workingDirectory }, (error, stdout, stderr) => {
        if (error) {
          const errorMsg = stderr || error.message;
          
          // Analyze error type
          let needsPull = false;
          let needsForce = false;
          let authError = false;
          
          if (errorMsg.includes('rejected') && errorMsg.includes('non-fast-forward')) {
            needsPull = true;
          } else if (errorMsg.includes('rejected') && errorMsg.includes('behind')) {
            needsPull = true;
          } else if (errorMsg.includes('force')) {
            needsForce = true;
          } else if (errorMsg.includes('authentication') || errorMsg.includes('permission') || errorMsg.includes('403')) {
            authError = true;
          }
          
          resolve({
            success: false,
            error: errorMsg,
            needsPull,
            needsForce,
            authError
          });
        } else {
          // Parse success output
          const output = stdout.trim();
          let pushedCommits = 0;
          
          // Count commits from output like "abc1234..def5678"
          const commitRange = output.match(/([a-f0-9]+)\.\.([a-f0-9]+)/);
          if (commitRange) {
            pushedCommits = 1; // Simplified - could use git rev-list to count accurately
          }
          
          resolve({
            success: true,
            output,
            pushedCommits
          });
        }
      });
    });
  }

  /**
   * Check prerequisites for push operation
   */
  async checkPushPrerequisites() {
    const issues = [];
    
    try {
      // Check if working directory is clean
      const statusResult = await this.getGitStatus();
      if (statusResult && (statusResult.unstagedFiles.length > 0 || statusResult.stagedFiles.length > 0)) {
        issues.push('Working directory has uncommitted changes');
      }
      
      // Check if there are commits to push
      const branchInfo = await this.getBranchInfo();
      if (branchInfo.ahead === 0 && branchInfo.hasUpstream) {
        issues.push('No commits to push');
      }
      
      // Check repository health
      const repoCheck = await this.checkGitRepository();
      if (!repoCheck) {
        issues.push('Not a git repository');
      }
      
      return {
        canPush: issues.length === 0,
        issues,
        hasUpstream: branchInfo.hasUpstream,
        ahead: branchInfo.ahead,
        behind: branchInfo.behind
      };
      
    } catch (error) {
      return {
        canPush: false,
        issues: [`Error checking prerequisites: ${error.message}`],
        hasUpstream: false,
        ahead: 0,
        behind: 0
      };
    }
  }

  /**
   * Setup upstream tracking for current branch
   */
  async setupUpstream(remoteName = 'origin', branchName = null) {
    return new Promise((resolve) => {
      const currentBranch = branchName || this.gitState.currentBranch;
      const command = `git branch --set-upstream-to=${remoteName}/${currentBranch} ${currentBranch}`;
      
      exec(command, { cwd: this.options.workingDirectory }, (error, _stdout, _stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message
          });
        } else {
          resolve({
            success: true,
            message: `Branch '${currentBranch}' set up to track '${remoteName}/${currentBranch}'.`
          });
        }
      });
    });
  }

  /**
   * Phase 5.2: Fetch and Pull Operations Methods
   */

  /**
   * Handle fetch-related callbacks
   */
  async handleFetchCallback(chatId, messageId, action) {
    try {
      if (action === 'interface') {
        await this.showFetchInterface(chatId);
        
      } else if (action === 'execute') {
        await this.executeFetch(chatId, messageId);
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown fetch operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Fetch Operation] Error:', error);
      const parsedError = this.parseGitError(error, 'fetch operation');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId,
        errorMessage,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Handle pull-related callbacks
   */
  async handlePullCallback(chatId, messageId, action) {
    try {
      if (action === 'interface') {
        await this.showPullInterface(chatId);
        
      } else if (action === 'merge') {
        await this.executePull(chatId, messageId, 'merge');
        
      } else if (action === 'rebase') {
        await this.executePull(chatId, messageId, 'rebase');
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown pull operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Pull Operation] Error:', error);
      const parsedError = this.parseGitError(error, 'pull operation');
      const errorMessage = this.formatErrorMessage(parsedError);
      
      await this.mainBot.safeSendMessage(chatId,
        errorMessage,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show fetch interface with current branch status
   */
  async showFetchInterface(chatId) {
    try {
      const branchInfo = await this.getBranchInfo();
      
      let message = '🔄 **Fetch Updates**\n\n';
      message += `**Current Branch:** ${branchInfo.currentBranch}\n`;
      
      if (branchInfo.upstream) {
        message += `**Upstream:** ${branchInfo.upstream}\n`;
      } else {
        message += '⚠️ **No upstream** branch configured\n';
      }
      
      if (branchInfo.behind > 0) {
        message += `📉 **${branchInfo.behind} commits behind** remote\n`;
      } else {
        message += '📊 **Up to date** with remote\n';
      }
      
      message += '\n🔄 **Fetch** downloads the latest changes from the remote repository without merging them.\n\n';
      message += '💡 This allows you to see what updates are available before deciding to merge or rebase.\n\n';
      message += '**Choose an action:**';
      
      const buttons = [];
      
      if (branchInfo.upstream) {
        buttons.push([{ text: '🔄 Fetch Updates', callback_data: 'git:fetch:execute' }]);
      } else {
        buttons.push([{ text: '⚠️ No Upstream Set', callback_data: 'git:remote:info' }]);
      }
      
      buttons.push([
        { text: '🔄 Refresh Status', callback_data: 'git:fetch:interface' },
        { text: '🌐 Remote Info', callback_data: 'git:remote:info' }
      ]);
      
      buttons.push([{ text: '🔙 Back to Git', callback_data: 'git:overview' }]);
      
      await this.mainBot.safeSendMessage(chatId, message, {
        reply_markup: { inline_keyboard: buttons }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Fetch Interface Error**\n\n${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show pull interface with merge options
   */
  async showPullInterface(chatId) {
    try {
      const branchInfo = await this.getBranchInfo();
      const prerequisites = await this.checkPullPrerequisites();
      
      let message = '⬇️ **Pull Changes**\n\n';
      message += `**Current Branch:** ${branchInfo.currentBranch}\n`;
      
      if (branchInfo.upstream) {
        message += `**Upstream:** ${branchInfo.upstream}\n`;
      } else {
        message += '⚠️ **No upstream** branch configured\n';
      }
      
      if (branchInfo.ahead > 0) {
        message += `📈 **${branchInfo.ahead} commits ahead** of remote\n`;
      }
      
      if (branchInfo.behind > 0) {
        message += `📉 **${branchInfo.behind} commits behind** remote\n`;
      } else {
        message += '📊 **Up to date** with remote\n';
      }
      
      message += '\n';
      
      // Check for issues
      if (!prerequisites.canPull) {
        message += '❌ **Cannot Pull:**\n';
        message += `• ${prerequisites.reason}\n\n`;
        message += '💡 **Solution:** Clean your working directory first.\n\n';
      }
      
      if (branchInfo.behind === 0) {
        message += '✅ **Already up to date** - no need to pull.\n\n';
      }
      
      message += '**Pull Strategies:**\n';
      message += '• **Merge:** Creates a merge commit\n';
      message += '• **Rebase:** Replays your commits on top of remote changes\n\n';
      message += '💡 Choose your preferred strategy:';
      
      const buttons = [];
      
      if (prerequisites.canPull && branchInfo.behind > 0) {
        buttons.push([
          { text: '🔀 Pull (Merge)', callback_data: 'git:pull:merge' },
          { text: '📈 Pull (Rebase)', callback_data: 'git:pull:rebase' }
        ]);
      }
      
      if (!prerequisites.canPull) {
        buttons.push([
          { text: '🧹 Clean Working Dir', callback_data: 'git:staging:overview' },
          { text: '📦 View Staged', callback_data: 'git:staging:overview' }
        ]);
      }
      
      buttons.push([
        { text: '🔄 Refresh Status', callback_data: 'git:pull:interface' },
        { text: '⬇️ Fetch First', callback_data: 'git:fetch:interface' }
      ]);
      
      buttons.push([{ text: '🔙 Back to Git', callback_data: 'git:overview' }]);
      
      await this.mainBot.safeSendMessage(chatId, message, {
        reply_markup: { inline_keyboard: buttons }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Pull Interface Error**\n\n${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Execute fetch operation
   */
  async executeFetch(chatId, messageId) {
    try {
      // Show loading message
      await this.mainBot.safeEditMessage(chatId, messageId, 
        '🔄 **Fetching...**\n\n⏳ Downloading updates from remote...'
      );
      
      const result = await this.performFetch();
      
      let message;
      if (result.success) {
        message = '✅ **Fetch Completed Successfully**\n\n';
        message += '📥 **Downloaded latest updates from remote**\n\n';
        
        if (result.output && result.output.trim()) {
          // Parse fetch output for useful information
          const lines = result.output.trim().split('\n');
          const relevantLines = lines.filter(line => 
            line.includes('->') || line.includes('From') || line.includes('remote:')
          );
          
          if (relevantLines.length > 0) {
            message += '**Updates found:**\n';
            for (const line of relevantLines.slice(0, 3)) { // Limit to avoid long messages
              message += `• ${line.trim()}\n`;
            }
            message += '\n';
          }
        }
        
        message += '💡 Use **Pull** to merge these updates into your branch.';
        
        // Refresh git state
        await this.refreshGitState();
        
      } else {
        message = '❌ **Fetch Failed**\n\n';
        message += `**Error:** ${result.error}\n\n`;
        
        if (result.networkError) {
          message += '💡 **Solution:** Check your internet connection.';
        } else if (result.authError) {
          message += '💡 **Solution:** Check your Git credentials and permissions.';
        } else {
          message += '💡 **Solution:** Check your remote repository settings.';
        }
      }
      
      await this.mainBot.safeEditMessage(chatId, messageId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⬇️ Pull Changes', callback_data: 'git:pull:interface' },
              { text: '📊 Check Status', callback_data: 'git:overview' }
            ],
            [
              { text: '🔄 Try Again', callback_data: 'git:fetch:interface' },
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]
          ]
        }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Fetch execution error:** ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Execute pull operation with specified strategy
   */
  async executePull(chatId, messageId, strategy = 'merge') {
    try {
      // Check prerequisites first
      const prerequisites = await this.checkPullPrerequisites();
      if (!prerequisites.canPull) {
        await this.mainBot.safeEditMessage(chatId, messageId,
          `❌ **Cannot Pull**\n\n${prerequisites.reason}\n\n` +
          '💡 Clean your working directory first.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📦 View Staging', callback_data: 'git:staging:overview' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        return;
      }
      
      // Show loading message
      await this.mainBot.safeEditMessage(chatId, messageId, 
        `⬇️ **Pulling changes...**\n\n🔄 Using ${strategy} strategy...`
      );
      
      const result = await this.performPull(strategy);
      
      let message;
      if (result.success) {
        message = '✅ **Pull Completed Successfully**\n\n';
        message += `🔀 **Strategy:** ${strategy}\n`;
        
        if (result.upToDate) {
          message += '📊 **Already up to date** - no changes to merge\n';
        } else {
          message += '📥 **Changes merged successfully**\n';
          
          if (result.filesChanged > 0) {
            message += `📁 Files changed: ${result.filesChanged}\n`;
          }
          
          if (result.insertions > 0 || result.deletions > 0) {
            message += `📈 Insertions: ${result.insertions || 0}, `;
            message += `📉 Deletions: ${result.deletions || 0}\n`;
          }
        }
        
        message += '\n💡 Your branch is now up to date with the remote.';
        
        // Refresh git state
        await this.refreshGitState();
        
      } else {
        message = '❌ **Pull Failed**\n\n';
        message += `**Error:** ${result.error}\n\n`;
        
        if (result.conflictError) {
          message += '💡 **Solution:** Resolve merge conflicts manually, then complete the merge.';
        } else if (result.networkError) {
          message += '💡 **Solution:** Check your internet connection and try again.';
        } else if (result.authError) {
          message += '💡 **Solution:** Check your Git credentials and permissions.';
        } else {
          message += '💡 **Solution:** Check your repository state and remote settings.';
        }
      }
      
      await this.mainBot.safeEditMessage(chatId, messageId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Check Status', callback_data: 'git:overview' },
              { text: '📝 View Changes', callback_data: 'git:files:0' }
            ],
            [
              { text: '🔄 Try Again', callback_data: 'git:pull:interface' },
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]
          ]
        }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Pull execution error:** ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Check prerequisites for pull operation
   */
  async checkPullPrerequisites() {
    try {
      const statusResult = await this.getGitStatus();
      const branchInfo = await this.getBranchInfo();
      
      // Check for uncommitted changes
      if (statusResult.stagedFiles.length > 0 || statusResult.unstagedFiles.length > 0) {
        return {
          canPull: false,
          reason: 'You have uncommitted changes. Commit or stash them first.'
        };
      }
      
      // Check for upstream branch
      if (!branchInfo.upstream) {
        return {
          canPull: false,
          reason: 'No upstream branch configured for this branch.'
        };
      }
      
      return {
        canPull: true,
        upstream: branchInfo.upstream,
        behind: branchInfo.behind
      };
      
    } catch (error) {
      return {
        canPull: false,
        reason: `Error checking prerequisites: ${error.message}`
      };
    }
  }

  /**
   * Execute git fetch command
   */
  async performFetch() {
    return new Promise((resolve) => {
      exec('git fetch --all', { cwd: this.options.workingDirectory }, (error, stdout, stderr) => {
        if (error) {
          const errorMsg = stderr || error.message;
          
          // Analyze error type
          let networkError = false;
          let authError = false;
          
          if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('connection')) {
            networkError = true;
          } else if (errorMsg.includes('authentication') || errorMsg.includes('permission') || errorMsg.includes('403')) {
            authError = true;
          }
          
          resolve({
            success: false,
            error: errorMsg,
            networkError,
            authError
          });
        } else {
          resolve({
            success: true,
            output: stdout.trim() || stderr.trim() // Fetch might output to stderr even on success
          });
        }
      });
    });
  }

  /**
   * Execute git pull command with specified strategy
   */
  async performPull(strategy = 'merge') {
    return new Promise((resolve) => {
      let command = 'git pull';
      
      if (strategy === 'rebase') {
        command += ' --rebase';
      }
      
      exec(command, { cwd: this.options.workingDirectory }, (error, stdout, stderr) => {
        if (error) {
          const errorMsg = stderr || error.message;
          
          // Analyze error type
          let conflictError = false;
          let networkError = false;
          let authError = false;
          
          if (errorMsg.includes('conflict') || errorMsg.includes('CONFLICT')) {
            conflictError = true;
          } else if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('connection')) {
            networkError = true;
          } else if (errorMsg.includes('authentication') || errorMsg.includes('permission') || errorMsg.includes('403')) {
            authError = true;
          }
          
          resolve({
            success: false,
            error: errorMsg,
            conflictError,
            networkError,
            authError
          });
        } else {
          // Parse success output
          const output = stdout.trim();
          
          // Check if already up to date
          const upToDate = output.includes('Already up to date') || output.includes('Already up-to-date');
          
          // Parse changes information
          let filesChanged = 0;
          let insertions = 0;
          let deletions = 0;
          
          // Look for patterns like "2 files changed, 10 insertions(+), 5 deletions(-)"
          const changeMatch = output.match(/(\d+) files? changed/);
          if (changeMatch) {
            filesChanged = parseInt(changeMatch[1]);
          }
          
          const insertMatch = output.match(/(\d+) insertions?\(\+\)/);
          if (insertMatch) {
            insertions = parseInt(insertMatch[1]);
          }
          
          const deleteMatch = output.match(/(\d+) deletions?\(-\)/);
          if (deleteMatch) {
            deletions = parseInt(deleteMatch[1]);
          }
          
          resolve({
            success: true,
            output,
            upToDate,
            filesChanged,
            insertions,
            deletions
          });
        }
      });
    });
  }

  /**
   * Phase 5.3: Remote Management and Upstream Tracking Methods
   */

  /**
   * Show remote repository information
   */
  async showRemoteInfo(chatId) {
    try {
      const remoteInfo = await this.getRemoteInfo();
      const branchInfo = await this.getBranchInfo();
      
      let message = '🌐 **Remote Repository Information**\n\n';
      
      if (!remoteInfo.success || remoteInfo.remotes.length === 0) {
        message += '❌ **No remotes configured**\n\n';
        message += 'This repository has no remote repositories configured.\n';
        message += 'You can add a remote using git commands.';
        
        await this.mainBot.safeSendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        });
        return;
      }
      
      // Group remotes by name
      const remoteGroups = {};
      for (const remote of remoteInfo.remotes) {
        if (!remoteGroups[remote.name]) {
          remoteGroups[remote.name] = { fetch: null, push: null };
        }
        remoteGroups[remote.name][remote.type] = remote.url;
      }
      
      message += '**Current Branch:** ' + branchInfo.currentBranch + '\n';
      if (branchInfo.upstream) {
        message += '**Upstream:** ' + branchInfo.upstream + '\n';
      } else {
        message += '⚠️ **No upstream** configured\n';
      }
      message += '\n';
      
      message += '**Configured Remotes:**\n';
      for (const [name, urls] of Object.entries(remoteGroups)) {
        message += `\n**${name}**\n`;
        if (urls.fetch) {
          message += `📥 Fetch: ${this.truncateUrl(urls.fetch)}\n`;
        }
        if (urls.push && urls.push !== urls.fetch) {
          message += `📤 Push: ${this.truncateUrl(urls.push)}\n`;
        }
      }
      
      message += '\n💡 Choose an action:';
      
      const buttons = [];
      
      if (!branchInfo.upstream) {
        buttons.push([{ text: '🔗 Setup Upstream', callback_data: 'git:remote:upstream' }]);
      }
      
      buttons.push([
        { text: '🔄 Refresh', callback_data: 'git:remote:refresh' },
        { text: '⬇️ Fetch', callback_data: 'git:fetch:interface' }
      ]);
      
      buttons.push([{ text: '🔙 Back to Git', callback_data: 'git:overview' }]);
      
      await this.mainBot.safeSendMessage(chatId, message, {
        reply_markup: { inline_keyboard: buttons }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Remote Info Error**\n\n${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show upstream setup interface
   */
  async showUpstreamSetup(chatId) {
    try {
      const branchInfo = await this.getBranchInfo();
      const remoteInfo = await this.getRemoteInfo();
      
      let message = '🔗 **Setup Upstream Tracking**\n\n';
      message += `**Current Branch:** ${branchInfo.currentBranch}\n`;
      
      if (branchInfo.upstream) {
        message += `**Current Upstream:** ${branchInfo.upstream}\n\n`;
        message += '✅ This branch already has upstream tracking configured.\n';
        message += 'You can change it by selecting a different remote below.\n\n';
      } else {
        message += '⚠️ **No upstream configured**\n\n';
        message += 'Setting up upstream tracking allows you to:\n';
        message += '• Use simple `git push` and `git pull` commands\n';
        message += '• See ahead/behind status in branch info\n';
        message += '• Track changes from the remote repository\n\n';
      }
      
      if (!remoteInfo.success || remoteInfo.remotes.length === 0) {
        message += '❌ **No remotes available**\n\n';
        message += 'You need to add a remote repository first.';
        
        await this.mainBot.safeSendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        });
        return;
      }
      
      // Get unique remote names
      const remoteNames = [...new Set(remoteInfo.remotes.map(r => r.name))];
      
      message += '**Available Remotes:**\n';
      for (const name of remoteNames) {
        const remote = remoteInfo.remotes.find(r => r.name === name);
        message += `• **${name}**: ${this.truncateUrl(remote.url)}\n`;
      }
      
      message += '\n💡 Choose a remote to set as upstream:';
      
      const buttons = [];
      
      // Add buttons for each remote
      for (const name of remoteNames) {
        buttons.push([{ 
          text: `🔗 Set ${name}/${branchInfo.currentBranch}`, 
          callback_data: `git:upstream:setup:${name}` 
        }]);
      }
      
      buttons.push([
        { text: '🔄 Refresh', callback_data: 'git:remote:upstream' },
        { text: '🌐 Remote Info', callback_data: 'git:remote:info' }
      ]);
      
      buttons.push([{ text: '🔙 Back to Git', callback_data: 'git:overview' }]);
      
      await this.mainBot.safeSendMessage(chatId, message, {
        reply_markup: { inline_keyboard: buttons }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Upstream Setup Error**\n\n${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Handle remote info callbacks
   */
  async handleRemoteInfoCallback(chatId, messageId, action) {
    try {
      if (action === 'info' || action === 'refresh') {
        await this.showRemoteInfo(chatId);
        
      } else if (action === 'upstream') {
        await this.showUpstreamSetup(chatId);
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown remote info operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ Remote info operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Handle upstream callbacks
   */
  async handleUpstreamCallback(chatId, messageId, action, remoteName) {
    try {
      if (action === 'setup' && remoteName) {
        await this.executeUpstreamSetup(chatId, messageId, remoteName);
        
      } else if (action === 'interface') {
        await this.showUpstreamSetup(chatId);
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown upstream operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ Upstream operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Execute upstream setup
   */
  async executeUpstreamSetup(chatId, messageId, remoteName, branchName) {
    try {
      // Show loading message
      await this.mainBot.safeEditMessage(chatId, messageId, 
        '🔗 **Setting up upstream...**\n\n⏳ Configuring branch tracking...'
      );
      
      const branchInfo = await this.getBranchInfo();
      const targetBranch = branchName || branchInfo.currentBranch;
      
      const result = await this.setupUpstream(remoteName, targetBranch);
      
      let message;
      if (result.success) {
        message = '✅ **Upstream Setup Complete**\n\n';
        message += `🔗 **Branch:** ${targetBranch}\n`;
        message += `🌐 **Remote:** ${remoteName}/${targetBranch}\n\n`;
        message += result.message + '\n\n';
        message += '💡 You can now use simple `git push` and `git pull` commands.';
        
        // Refresh git state
        await this.refreshGitState();
        
      } else {
        message = '❌ **Upstream Setup Failed**\n\n';
        message += `**Error:** ${result.error}\n\n`;
        message += '💡 **Solutions:**\n';
        message += '• Check that the remote repository exists\n';
        message += '• Verify your network connection\n';
        message += '• Ensure you have access to the remote repository';
      }
      
      await this.mainBot.safeEditMessage(chatId, messageId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Check Status', callback_data: 'git:overview' },
              { text: '🌐 Remote Info', callback_data: 'git:remote:info' }
            ],
            [
              { text: '🔄 Try Again', callback_data: 'git:remote:upstream' },
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]
          ]
        }
      });
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Upstream setup error:** ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Get remote repository information
   */
  async getRemoteInfo() {
    return new Promise((resolve) => {
      exec('git remote -v', { cwd: this.options.workingDirectory }, (error, stdout, _stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            remotes: []
          });
        } else {
          try {
            const lines = stdout.trim().split('\n').filter(line => line.trim());
            const remotes = [];
            
            for (const line of lines) {
              const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
              if (match) {
                const [, name, url, type] = match;
                remotes.push({ name, url, type });
              }
            }
            
            resolve({
              success: true,
              remotes
            });
          } catch (parseError) {
            resolve({
              success: false,
              error: `Error parsing remote info: ${parseError.message}`,
              remotes: []
            });
          }
        }
      });
    });
  }

  /**
   * Check upstream status for current branch
   */
  async checkUpstreamStatus() {
    try {
      const branchInfo = await this.getBranchInfo();
      
      return {
        hasUpstream: !!branchInfo.upstream,
        upstream: branchInfo.upstream,
        currentBranch: branchInfo.currentBranch,
        ahead: branchInfo.ahead || 0,
        behind: branchInfo.behind || 0,
        needsSetup: !branchInfo.upstream
      };
      
    } catch (error) {
      return {
        hasUpstream: false,
        upstream: null,
        currentBranch: 'unknown',
        ahead: 0,
        behind: 0,
        needsSetup: true,
        error: error.message
      };
    }
  }

  /**
   * Validate remote URL format
   */
  validateRemoteUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    // Check for common Git URL patterns
    const patterns = [
      /^https:\/\/[^\s]+\.git$/,           // HTTPS
      /^git@[^\s]+:[^\s]+\.git$/,         // SSH
      /^ssh:\/\/git@[^\s]+\/[^\s]+\.git$/, // SSH with protocol
      /^https:\/\/[^\s]+$/                 // HTTPS without .git
    ];
    
    return patterns.some(pattern => pattern.test(url));
  }

  /**
   * Truncate URL for display
   */
  truncateUrl(url, maxLength = 50) {
    if (!url || url.length <= maxLength) {
      return url;
    }
    
    // Try to keep the important parts
    if (url.includes('github.com') || url.includes('gitlab.com')) {
      const match = url.match(/([^/]+\/[^/]+\.git?)$/);
      if (match) {
        return '...' + match[1];
      }
    }
    
    return url.substring(0, maxLength - 3) + '...';
  }

  // ====== UTILITY METHODS (PRESERVED FROM GitDiffManager) ======

  /**
   * Escape markdown special characters
   */
  escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+=|{}!-])/g, '\\$1');
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
   * Escape text for code blocks (prevents breaking out of code blocks)
   */
  escapeForCodeBlock(text) {
    return text.replace(/```/g, '`‍`‍`'); // Use zero-width joiner to break the sequence
  }

  /**
   * Handle text input for branch creation
   * This should be called from the bot's text message handler
   */
  async handleTextInput(chatId, text) {
    console.log(`[GitManager DEBUG] handleTextInput called: chatId=${chatId}, text='${text}'`);
    console.log('[GitManager DEBUG] gitState:', {
      branchCreationInProgress: this.gitState.branchCreationInProgress,
      branchCreationChatId: this.gitState.branchCreationChatId,
      commitMessageInProgress: this.gitState.commitMessageInProgress,
      commitMessageChatId: this.gitState.commitMessageChatId
    });
    
    if (this.gitState.branchCreationInProgress && this.gitState.branchCreationChatId === chatId) {
      console.log('[GitManager DEBUG] Processing branch creation...');
      // Reset state
      this.gitState.branchCreationInProgress = false;
      this.gitState.branchCreationChatId = null;
      
      // Process branch creation
      await this.createBranch(chatId, text);
      return true; // Indicate that we handled this text input
    }
    
    if (this.gitState.commitMessageInProgress && this.gitState.commitMessageChatId === chatId) {
      console.log('[GitManager DEBUG] Processing commit message...');
      // Reset state
      this.gitState.commitMessageInProgress = false;
      this.gitState.commitMessageChatId = null;
      
      // Validate commit message
      if (!this.validateCommitMessage(text)) {
        await this.mainBot.safeSendMessage(chatId,
          '❌ **Invalid Commit Message**\n\n' +
          'Commit message is invalid:\n' +
          '• Must be 1-72 characters long\n' +
          '• Cannot be empty or only whitespace\n\n' +
          'Please try again.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✍️ Try Again', callback_data: 'git:commit:create' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        return false; // Return false to indicate validation failed
      }
      
      // Process commit creation
      console.log('[GitManager DEBUG] Calling processCommitCreation...');
      await this.processCommitCreation(chatId, text);
      console.log('[GitManager DEBUG] processCommitCreation completed');
      return true; // Indicate that we handled this text input
    }
    
    if (this.gitState.amendMessageInProgress && this.gitState.amendMessageChatId === chatId) {
      // Reset state
      this.gitState.amendMessageInProgress = false;
      this.gitState.amendMessageChatId = null;
      
      // Use previous message if new one is empty
      const amendMessage = text.trim() || this.gitState.lastCommitMessage;
      
      // Process amend creation
      await this.processAmendCreation(chatId, amendMessage);
      return true; // Indicate that we handled this text input
    }
    
    console.log('[GitManager DEBUG] No conditions matched, returning false');
    return false; // We didn't handle this input
  }

  /**
   * Validate commit message format
   */
  validateCommitMessage(message) {
    if (!message || typeof message !== 'string') {
      return false;
    }
    
    const trimmed = message.trim();
    if (trimmed.length === 0 || trimmed.length > 72) {
      return false;
    }
    
    return true;
  }

  /**
   * Process commit creation with the provided message
   */
  async processCommitCreation(chatId, message) {
    console.log(`[GitManager DEBUG] processCommitCreation called: chatId=${chatId}, message="${message}"`);
    try {
      console.log('[GitManager DEBUG] Calling createCommit...');
      const result = await this.createCommit(message);
      console.log('[GitManager DEBUG] createCommit result:', result);
      
      if (result.success) {
        // Refresh git status after successful commit
        await this.refreshGitState();
        
        await this.mainBot.safeSendMessage(chatId,
          '✅ **Commit Successful**\n\n' +
          `📝 **Message:** "${message}"\n\n` +
          '**Summary:**\n' +
          `${result.output}\n\n` +
          '🎉 Your changes have been committed!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 Git Overview', callback_data: 'git:overview' }],
                [{ text: '📝 View History', callback_data: 'git:commit:history' }]
              ]
            }
          }
        );
      } else {
        await this.mainBot.safeSendMessage(chatId,
          '❌ **Commit Failed**\n\n' +
          `Error: ${result.error}\n\n` +
          'Please check your staged files and try again.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📦 Back to Staging', callback_data: 'git:staging:overview' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Commit Creation] Error:', error);
      await this.mainBot.safeSendMessage(chatId,
        '❌ **Commit Failed**\n\n' +
        `Unexpected error: ${error.message}\n\n` +
        'Please check your repository state and try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📦 Back to Staging', callback_data: 'git:staging:overview' }],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        }
      );
    }
  }

  /**
   * Execute git commit command
   */
  async createCommit(message) {
    return new Promise((resolve) => {
      const command = `git commit -m "${message.replace(/"/g, '\\"')}"`;
      
      exec(command, { cwd: this.options.workingDirectory }, (error, stdout, _stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message
          });
        } else {
          resolve({
            success: true,
            output: stdout.trim()
          });
        }
      });
    });
  }

  /**
   * Show commit history with pagination
   */
  async showCommitHistory(chatId, page = 0) {
    try {
      const commitsPerPage = 5;
      const result = await this.getCommitHistory(page * commitsPerPage, commitsPerPage);
      
      if (!result.success) {
        await this.mainBot.safeSendMessage(chatId,
          '❌ **Error Loading History**\n\n' +
          `Error: ${result.error}\n\n` +
          'Please check if this is a valid git repository.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Back to Commit', callback_data: 'git:commit' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        return;
      }
      
      if (result.commits.length === 0) {
        await this.mainBot.safeSendMessage(chatId,
          '📝 **Commit History**\n\n' +
          '📭 **No commits found**\n\n' +
          'This repository has no commit history yet.\n' +
          'Create your first commit to see it here!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Back to Commit', callback_data: 'git:commit' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        return;
      }
      
      // Format commits for display
      const commitsList = result.commits.map((commit, index) => 
        this.formatCommitForDisplay(commit, page * commitsPerPage + index)
      ).join('\n\n');
      
      // Pagination info
      const totalCommits = result.totalCommits || result.commits.length;
      const currentStart = page * commitsPerPage + 1;
      const currentEnd = Math.min((page + 1) * commitsPerPage, totalCommits);
      const hasNext = result.hasMore || ((page + 1) * commitsPerPage < totalCommits);
      const hasPrev = page > 0;
      
      // Build navigation buttons
      const navigationButtons = [];
      if (hasPrev || hasNext) {
        const navRow = [];
        if (hasPrev) {
          navRow.push({ text: '⬅️ Previous', callback_data: `git:history:page:${page - 1}` });
        }
        if (hasNext) {
          navRow.push({ text: 'Next ➡️', callback_data: `git:history:page:${page + 1}` });
        }
        navigationButtons.push(navRow);
      }
      
      await this.mainBot.safeSendMessage(chatId,
        '📝 **Commit History**\n\n' +
        `📊 **Showing ${currentStart}-${currentEnd} of ${totalCommits} commits**\n\n` +
        `${commitsList}`,
        {
          reply_markup: {
            inline_keyboard: [
              ...navigationButtons,
              [{ text: '📝 Back to Commit', callback_data: 'git:commit' }],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('[Show Commit History] Error:', error);
      await this.mainBot.safeSendMessage(chatId,
        '❌ **Error Loading History**\n\n' +
        `Unexpected error: ${error.message}\n\n` +
        'Please try again or check the repository state.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Back to Commit', callback_data: 'git:commit' }],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        }
      );
    }
  }

  /**
   * Get commit history from git log
   */
  async getCommitHistory(skip = 0, limit = 10) {
    return new Promise((resolve) => {
      const command = `git log --oneline --pretty=format:"%H|%s|%an|%ad|%ar" --date=short --skip=${skip} --max-count=${limit}`;
      
      exec(command, { cwd: this.options.workingDirectory }, (error, stdout, _stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message
          });
        } else {
          try {
            const lines = stdout.trim().split('\n').filter(line => line.length > 0);
            const commits = lines.map(line => {
              const [hash, message, author, date, relativeDate] = line.split('|');
              return {
                hash: hash,
                shortHash: hash.substring(0, 7),
                message: message,
                author: author,
                date: date,
                relativeDate: relativeDate
              };
            });
            
            resolve({
              success: true,
              commits: commits,
              totalCommits: commits.length, // This is just current batch, real total would need separate command
              hasMore: commits.length === limit // Assume more if we got full batch
            });
          } catch (parseError) {
            resolve({
              success: false,
              error: `Error parsing git log: ${parseError.message}`
            });
          }
        }
      });
    });
  }

  /**
   * Format commit for mobile-friendly display
   */
  formatCommitForDisplay(commit, index) {
    // Truncate long commit messages for mobile display
    const maxMessageLength = 50;
    const displayMessage = commit.message.length > maxMessageLength 
      ? commit.message.substring(0, maxMessageLength) + '...'
      : commit.message;
    
    return `${index + 1}. **${commit.shortHash}** ${displayMessage}\n` +
           `👤 ${commit.author} • 📅 ${commit.relativeDate}`;
  }

  /**
   * Handle history-related callbacks
   */
  async handleHistoryCallback(parts, chatId) {
    try {
      const action = parts[2];
      
      if (action === 'page') {
        const page = parseInt(parts[3]) || 0;
        await this.showCommitHistory(chatId, page);
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown history operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[History Callback] Error:', error);
      await this.mainBot.safeSendMessage(chatId,
        `❌ History operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Show amend interface with last commit info
   */
  async showAmendInterface(chatId) {
    try {
      const lastCommitResult = await this.getLastCommit();
      
      if (!lastCommitResult.success || !lastCommitResult.commit) {
        await this.mainBot.safeSendMessage(chatId,
          '📭 **No Commits to Amend**\n\n' +
          'This repository has no commit history yet.\n' +
          'Create your first commit before you can amend it!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✍️ Create First Commit', callback_data: 'git:commit:create' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        return;
      }
      
      const commit = lastCommitResult.commit;
      const stagedFiles = this.gitState.stagedFiles || [];
      const hasStaged = stagedFiles.length > 0;
      
      let stagedInfo = '';
      if (hasStaged) {
        const filesList = stagedFiles.slice(0, 3).map(file => `✅ ${file}`).join('\n');
        const moreFiles = stagedFiles.length > 3 ? `\n... and ${stagedFiles.length - 3} more files` : '';
        stagedInfo = `\n\n**Additional Staged Files** (${stagedFiles.length}):\n${filesList}${moreFiles}`;
      }
      
      await this.mainBot.safeSendMessage(chatId,
        '🔄 **Amend Last Commit**\n\n' +
        `**Current Commit:** ${commit.shortHash}\n` +
        `📝 **Message:** "${commit.message}"\n` +
        `👤 **Author:** ${commit.author}\n` +
        `📅 **Date:** ${commit.date}${stagedInfo}\n\n` +
        '💡 Choose what to amend:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✍️ Change Message Only', callback_data: 'git:amend:message' }],
              ...(hasStaged ? [[{ text: '📁 Add Staged Files', callback_data: 'git:amend:files' }]] : []),
              [{ text: '📝 Back to Commit', callback_data: 'git:commit' }],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('[Show Amend Interface] Error:', error);
      await this.mainBot.safeSendMessage(chatId,
        '❌ **Error Loading Commit**\n\n' +
        `Unexpected error: ${error.message}\n\n` +
        'Please check the repository state and try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Back to Commit', callback_data: 'git:commit' }],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        }
      );
    }
  }

  /**
   * Handle amend-related callbacks
   */
  async handleAmendCallback(parts, chatId) {
    try {
      const action = parts[2];
      
      if (action === 'message') {
        // Start amend message input
        const lastCommitResult = await this.getLastCommit();
        if (!lastCommitResult.success || !lastCommitResult.commit) {
          await this.mainBot.safeSendMessage(chatId,
            '❌ **No Commit to Amend**\n\n' +
            'Cannot find the last commit to amend.',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
                ]
              }
            }
          );
          return;
        }
        
        this.gitState.amendMessageInProgress = true;
        this.gitState.amendMessageChatId = chatId;
        this.gitState.lastCommitMessage = lastCommitResult.commit.message;
        
        await this.mainBot.safeSendMessage(chatId,
          '✍️ **Edit Commit Message**\n\n' +
          `**Current Message:** "${lastCommitResult.commit.message}"\n\n` +
          '💬 **Type your new commit message:**\n\n' +
          '📝 Tips:\n' +
          '• Keep it under 72 characters\n' +
          '• Use present tense\n' +
          '• Leave empty to keep current message\n' +
          '• Be descriptive but concise',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Cancel', callback_data: 'git:amend:cancel' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        
      } else if (action === 'files') {
        // Add staged files to last commit
        const result = await this.amendCommit(null, true);
        
        if (result.success) {
          await this.refreshGitState();
          
          await this.mainBot.safeSendMessage(chatId,
            '✅ **Commit Amended**\n\n' +
            'Successfully added staged files to the last commit.\n\n' +
            '**Summary:**\n' +
            `${result.output}\n\n` +
            '🎉 Your changes have been added to the previous commit!',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📊 Git Overview', callback_data: 'git:overview' }],
                  [{ text: '📝 View History', callback_data: 'git:commit:history' }]
                ]
              }
            }
          );
        } else {
          await this.mainBot.safeSendMessage(chatId,
            '❌ **Amend Failed**\n\n' +
            `Error: ${result.error}\n\n` +
            'Please check your repository state and try again.',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Try Again', callback_data: 'git:commit:amend' }],
                  [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
                ]
              }
            }
          );
        }
        
      } else if (action === 'cancel') {
        // Cancel amend message input
        this.gitState.amendMessageInProgress = false;
        this.gitState.amendMessageChatId = null;
        this.gitState.lastCommitMessage = null;
        
        await this.mainBot.safeSendMessage(chatId,
          '❌ **Amend Cancelled**\n\n' +
          'Amend operation has been cancelled.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Back to Amend', callback_data: 'git:commit:amend' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown amend operation: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Amend Callback] Error:', error);
      await this.mainBot.safeSendMessage(chatId,
        `❌ Amend operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Process amend creation with the provided message
   */
  async processAmendCreation(chatId, message) {
    try {
      const result = await this.amendCommit(message, false);
      
      if (result.success) {
        // Refresh git status after successful amend
        await this.refreshGitState();
        
        await this.mainBot.safeSendMessage(chatId,
          '✅ **Commit Amended**\n\n' +
          `📝 **New Message:** "${message}"\n\n` +
          '**Summary:**\n' +
          `${result.output}\n\n` +
          '🎉 Your commit has been amended!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 Git Overview', callback_data: 'git:overview' }],
                [{ text: '📝 View History', callback_data: 'git:commit:history' }]
              ]
            }
          }
        );
      } else {
        await this.mainBot.safeSendMessage(chatId,
          '❌ **Amend Failed**\n\n' +
          `Error: ${result.error}\n\n` +
          'Please check your repository state and try again.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: 'git:commit:amend' }],
                [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
              ]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('[Amend Creation] Error:', error);
      await this.mainBot.safeSendMessage(chatId,
        '❌ **Amend Failed**\n\n' +
        `Unexpected error: ${error.message}\n\n` +
        'Please check your repository state and try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'git:commit:amend' }],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        }
      );
    }
  }

  /**
   * Get last commit information
   */
  async getLastCommit() {
    return new Promise((resolve) => {
      const command = 'git log -1 --pretty=format:"%H|%s|%an|%ad" --date=short';
      
      exec(command, { cwd: this.options.workingDirectory }, (error, stdout, _stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message
          });
        } else {
          try {
            const line = stdout.trim();
            if (!line) {
              resolve({
                success: true,
                commit: null
              });
              return;
            }
            
            const [hash, message, author, date] = line.split('|');
            resolve({
              success: true,
              commit: {
                hash: hash,
                shortHash: hash.substring(0, 7),
                message: message,
                author: author,
                date: date
              }
            });
          } catch (parseError) {
            resolve({
              success: false,
              error: `Error parsing last commit: ${parseError.message}`
            });
          }
        }
      });
    });
  }

  /**
   * Execute git commit --amend command
   */
  async amendCommit(message = null, addFiles = false) {
    return new Promise((resolve) => {
      let command = 'git commit --amend';
      
      if (message) {
        command += ` -m "${message.replace(/"/g, '\\"')}"`;
      } else if (!addFiles) {
        command += ' --no-edit';
      }
      
      exec(command, { cwd: this.options.workingDirectory }, (error, stdout, _stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message
          });
        } else {
          resolve({
            success: true,
            output: stdout.trim()
          });
        }
      });
    });
  }

  /**
   * Refresh git state after operations
   */
  async refreshGitState() {
    try {
      // Invalidate cache before refreshing to get fresh data
      this.invalidateCache();
      
      const gitStatus = await this.getGitStatus();
      if (gitStatus) {
        this.gitState.stagedFiles = gitStatus.stagedFiles || [];
        this.gitState.unstagedFiles = gitStatus.unstagedFiles || [];
        this.gitState.untrackedFiles = gitStatus.untrackedFiles || [];
        this.gitState.currentBranch = gitStatus.currentBranch || null;
      }
    } catch (error) {
      console.error('[Refresh Git State] Error:', error);
    }
  }

  /**
   * Phase 4.4: Commit Validation Methods
   */

  /**
   * Validate repository readiness for commit operations
   */
  async validateCommitReadiness() {
    const issues = [];
    
    try {
      // Check if this is a git repository
      const repoCheck = await this.checkGitRepository();
      if (!repoCheck) {
        issues.push('Not a git repository');
      }
      
      // Check if there are staged files
      if (!this.gitState.stagedFiles || this.gitState.stagedFiles.length === 0) {
        issues.push('No files staged for commit');
      }
      
      // Check for merge conflicts
      try {
        const mergeCheck = await this.checkForMergeConflicts();
        if (mergeCheck.hasConflicts) {
          issues.push('Repository has uncommitted merge conflicts');
        }
      } catch {
        // Non-critical error, continue
      }
      
      // Check if working directory is clean of other issues
      try {
        const statusCheck = await this.checkWorkingDirectoryStatus();
        if (statusCheck.isDirty) {
          issues.push('Working directory is dirty');
        }
      } catch {
        // Non-critical error, continue
      }
      
      return {
        isValid: issues.length === 0,
        issues
      };
      
    } catch (error) {
      return {
        isValid: false,
        issues: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Validate that staged files exist on disk
   */
  async validateCommitFiles() {
    const fs = require('fs').promises;
    const path = require('path');
    
    const missingFiles = [];
    const validFiles = [];
    
    for (const file of this.gitState.stagedFiles || []) {
      try {
        const filePath = path.join(this.options.workingDirectory, file);
        await fs.access(filePath);
        validFiles.push(file);
      } catch {
        missingFiles.push(file);
      }
    }
    
    return {
      isValid: missingFiles.length === 0,
      missingFiles,
      validFiles
    };
  }

  /**
   * Check for merge conflicts in the repository
   */
  async checkForMergeConflicts() {
    return new Promise((resolve) => {
      exec('git status --porcelain', { cwd: this.options.workingDirectory }, (error, stdout) => {
        if (error) {
          resolve({ hasConflicts: false });
          return;
        }
        
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        const hasConflicts = lines.some(line => line.startsWith('UU') || line.startsWith('AA'));
        
        resolve({ hasConflicts });
      });
    });
  }

  /**
   * Check working directory status for issues
   */
  async checkWorkingDirectoryStatus() {
    return new Promise((resolve) => {
      exec('git status --porcelain', { cwd: this.options.workingDirectory }, (error, stdout) => {
        if (error) {
          resolve({ isDirty: false });
          return;
        }
        
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        const isDirty = lines.some(line => {
          const status = line.substring(0, 2);
          // Check for problematic statuses beyond normal modifications
          return status.includes('D') && !status.includes('A'); // Deleted files not staged
        });
        
        resolve({ isDirty });
      });
    });
  }

  /**
   * Show commit validation results interface
   */
  async showCommitValidation(chatId) {
    try {
      const readinessResult = await this.validateCommitReadiness();
      const filesResult = await this.validateCommitFiles();
      
      let message = '🔍 **Commit Validation**\n\n';
      
      if (readinessResult.isValid && filesResult.isValid) {
        // All validations passed
        message += '✅ **All Validations Passed**\n\n';
        message += `📁 Ready to commit ${filesResult.validFiles.length} files staged\n\n`;
        message += '💡 Your repository is ready for commit operations.';
        
        await this.mainBot.safeSendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📝 Create Commit', callback_data: 'git:commit:create' },
                { text: '📋 View Files', callback_data: 'git:staging:overview' }
              ],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        });
        
      } else {
        // Validation issues found
        message += '❌ **Validation Issues Found**\n\n';
        
        if (!readinessResult.isValid) {
          message += '🔴 **Repository Issues:**\n';
          for (const issue of readinessResult.issues) {
            message += `• ${issue}\n`;
          }
          message += '\n';
        }
        
        if (!filesResult.isValid) {
          message += '📂 **File Issues:**\n';
          message += `• Missing files: ${filesResult.missingFiles.join(', ')}\n`;
          if (filesResult.validFiles.length > 0) {
            message += `• Valid files: ${filesResult.validFiles.length}\n`;
          }
          message += '\n';
        }
        
        message += '💡 Fix these issues before committing.';
        
        await this.mainBot.safeSendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔧 Fix Issues', callback_data: 'git:validation:fix' },
                { text: '🔄 Refresh', callback_data: 'git:validation:check' }
              ],
              [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
            ]
          }
        });
      }
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ **Validation Error**\n\n${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Handle validation-related callbacks
   */
  async handleValidationCallback(parts, chatId) {
    try {
      const action = parts[2];
      
      if (action === 'check') {
        await this.showCommitValidation(chatId);
        
      } else if (action === 'fix') {
        let message = '🔧 **Fix Commit Issues**\n\n';
        message += '**Common solutions:**\n';
        message += '• Refresh files to update status\n';
        message += '• Unstage invalid files and re-add them\n';
        message += '• Resolve merge conflicts if present\n';
        message += '• Check file permissions and existence\n\n';
        message += '💡 Use the buttons below to address issues.';
        
        await this.mainBot.safeSendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Refresh Files', callback_data: 'git:staging:overview' },
                { text: '📊 Check Status', callback_data: 'git:overview' }
              ],
              [
                { text: '➖ Unstage All', callback_data: 'git:unstage:all' },
                { text: '➕ Re-stage All', callback_data: 'git:stage:all' }
              ],
              [{ text: '🔙 Back to Validation', callback_data: 'git:validation:check' }]
            ]
          }
        });
        
      } else {
        await this.mainBot.safeSendMessage(chatId,
          `❌ Unknown validation action: ${action}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Git', callback_data: 'git:overview' }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      await this.mainBot.safeSendMessage(chatId,
        `❌ Validation operation error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Back to Git', callback_data: 'git:overview' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Perform comprehensive pre-commit validation
   */
  async performPreCommitValidation(message) {
    const errors = [];
    
    try {
      // Repository readiness check
      const readinessResult = await this.validateCommitReadiness();
      if (!readinessResult.isValid) {
        errors.push(...readinessResult.issues);
      }
      
      // File validation check
      const filesResult = await this.validateCommitFiles();
      if (!filesResult.isValid) {
        errors.push(`Missing files: ${filesResult.missingFiles.join(', ')}`);
      }
      
      // Message validation check
      const messageValid = this.validateCommitMessage(message);
      if (!messageValid) {
        errors.push('Invalid commit message format');
      }
      
      return {
        isValid: errors.length === 0,
        canProceed: errors.length === 0,
        errors
      };
      
    } catch (error) {
      return {
        isValid: false,
        canProceed: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }

  // ===============================
  // PHASE 5.4: Enhanced Force Push
  // ===============================

  /**
   * Analyze force push risk factors
   */
  async analyzeForcePushRisk() {
    try {
      const branchInfo = await this.getBranchInfo();
      const contributors = await this.getRecentContributors();
      const sharedBranch = await this.checkBranchSharing();
      
      let riskLevel = 'low';
      const riskFactors = [];
      
      // Check if branch is shared
      if (sharedBranch.isShared) {
        riskLevel = 'high';
        riskFactors.push('Branch appears to be shared with other contributors');
      }
      
      // Check commit count behind
      if (branchInfo.behind > 5) {
        riskLevel = riskLevel === 'high' ? 'high' : 'medium';
        riskFactors.push(`Branch is ${branchInfo.behind} commits behind remote`);
      }
      
      // Check recent contributors
      if (contributors.length > 2) {
        riskLevel = riskLevel === 'high' ? 'high' : 'medium';
        riskFactors.push(`${contributors.length} recent contributors detected`);
      }
      
      return {
        riskLevel,
        riskFactors,
        canProceed: true, // Allow with warnings
        contributors,
        sharedBranch: sharedBranch.isShared
      };
      
    } catch (error) {
      console.error('[Force Push Risk Analysis] Error:', error);
      return {
        riskLevel: 'unknown',
        riskFactors: ['Could not analyze repository risk'],
        canProceed: true,
        contributors: [],
        sharedBranch: false
      };
    }
  }

  /**
   * Show enhanced force push warning with comprehensive risk information
   */
  async showEnhancedForcePushWarning(chatId, messageId) {
    try {
      const riskAnalysis = await this.analyzeForcePushRisk();
      
      let message = '⚠️ **Enhanced Force Push Warning**\n\n';
      
      // Risk level indicator
      const riskEmoji = {
        'low': '🟢',
        'medium': '🟡', 
        'high': '🔴',
        'unknown': '⚪'
      };
      
      message += `${riskEmoji[riskAnalysis.riskLevel]} **Risk Level:** ${riskAnalysis.riskLevel.toUpperCase()}\n\n`;
      
      // Risk factors
      if (riskAnalysis.riskFactors.length > 0) {
        message += '**⚠️ Risk Factors:**\n';
        riskAnalysis.riskFactors.forEach(factor => {
          message += `• ${factor}\n`;
        });
        message += '\n';
      }
      
      // Contributors warning
      if (riskAnalysis.contributors.length > 1) {
        message += '**👥 Recent Contributors:**\n';
        riskAnalysis.contributors.slice(0, 3).forEach(contributor => {
          message += `• ${contributor}\n`;
        });
        if (riskAnalysis.contributors.length > 3) {
          message += `• ... and ${riskAnalysis.contributors.length - 3} more\n`;
        }
        message += '\n';
      }
      
      // Safety recommendations
      message += '**🛡️ Safety Recommendations:**\n';
      message += '• Create backup branch before proceeding\n';
      message += '• Verify no one else is working on this branch\n';
      message += '• Consider pulling and merging changes instead\n';
      message += '• Coordinate with team members if needed\n\n';
      
      message += '**⚡ Force push will rewrite history and cannot be undone!**\n\n';
      message += 'Would you like to proceed with safety measures?';
      
      const keyboard = [
        [
          { text: '🔧 Create Summary & Backup', callback_data: 'git:force:summary' }
        ],
        [
          { text: '⚡ Force Push Now (Risky)', callback_data: 'git:force:execute' }
        ],
        [
          { text: '❌ Cancel', callback_data: 'git:push' },
          { text: '🔙 Back to Push', callback_data: 'git:push' }
        ]
      ];
      
      await this.mainBot.safeEditMessage(chatId, messageId, message, {
        reply_markup: { inline_keyboard: keyboard }
      });
      
    } catch (error) {
      console.error('[Enhanced Force Push Warning] Error:', error);
      await this.mainBot.safeEditMessage(chatId, messageId,
        '❌ **Error analyzing force push risk**\n\n' +
        `Error: ${error.message}\n\n` +
        'Falling back to basic force push confirmation.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Basic Force Push', callback_data: 'git:push:force' }],
              [{ text: '❌ Cancel', callback_data: 'git:push' }]
            ]
          }
        }
      );
    }
  }

  /**
   * Check if branch is shared with other contributors
   */
  async checkBranchSharing() {
    try {
      const contributors = await this.getRecentContributors();
      const currentUser = await this.getCurrentGitUser();
      
      // Filter out current user from contributors
      const otherContributors = contributors.filter(
        contributor => contributor !== currentUser
      );
      
      return {
        isShared: otherContributors.length > 0,
        contributors: otherContributors,
        totalContributors: contributors.length
      };
      
    } catch (error) {
      console.error('[Branch Sharing Check] Error:', error);
      return {
        isShared: false,
        contributors: [],
        totalContributors: 0
      };
    }
  }

  /**
   * Create safety backup before force push
   */
  async createForcePushBackup() {
    try {
      const branchInfo = await this.getBranchInfo();
      const result = await this.createBackupBranch(branchInfo.currentBranch);
      
      return {
        success: result.success,
        backupBranch: result.backupBranch,
        originalBranch: branchInfo.currentBranch
      };
      
    } catch (error) {
      console.error('[Force Push Backup] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Show comprehensive force push summary with all safety checks
   */
  async showForcePushSummary(chatId, messageId) {
    try {
      // Show loading message
      await this.mainBot.safeEditMessage(chatId, messageId,
        '🔍 **Analyzing Force Push Impact...**\n\n' +
        'Please wait while we:\n' +
        '• Analyze repository risk factors\n' +
        '• Create safety backup branch\n' +
        '• Prepare comprehensive summary\n\n' +
        '⏳ This may take a moment...'
      );
      
      // Perform analysis and backup
      const riskAnalysis = await this.analyzeForcePushRisk();
      const backupResult = await this.createForcePushBackup();
      
      let message = '🔍 **Force Push Summary**\n\n';
      
      // Risk overview
      const riskEmoji = {
        'low': '🟢',
        'medium': '🟡',
        'high': '🔴',
        'unknown': '⚪'
      };
      
      message += `${riskEmoji[riskAnalysis.riskLevel]} **Risk Assessment:** ${riskAnalysis.riskLevel.toUpperCase()}\n`;
      
      // Backup status
      if (backupResult.success) {
        message += `✅ **Backup Created:** ${backupResult.backupBranch}\n`;
      } else {
        message += `❌ **Backup Failed:** ${backupResult.error || 'Unknown error'}\n`;
      }
      
      message += '\n';
      
      // Branch information
      const branchInfo = await this.getBranchInfo();
      message += '📊 **Branch Status:**\n';
      message += `• Current: ${branchInfo.currentBranch}\n`;
      if (branchInfo.ahead > 0) {
        message += `• Ahead: ${branchInfo.ahead} commits\n`;
      }
      if (branchInfo.behind > 0) {
        message += `• Behind: ${branchInfo.behind} commits\n`;
      }
      message += '\n';
      
      // Risk factors
      if (riskAnalysis.riskFactors.length > 0) {
        message += '⚠️ **Risk Factors:**\n';
        riskAnalysis.riskFactors.forEach(factor => {
          message += `• ${factor}\n`;
        });
        message += '\n';
      }
      
      // Contributors
      if (riskAnalysis.contributors.length > 1) {
        message += '👥 **Recent Contributors:**\n';
        riskAnalysis.contributors.slice(0, 2).forEach(contributor => {
          message += `• ${contributor}\n`;
        });
        if (riskAnalysis.contributors.length > 2) {
          message += `• ... and ${riskAnalysis.contributors.length - 2} more\n`;
        }
        message += '\n';
      }
      
      // Final safety notice
      message += '🛡️ **Safety Measures Active:**\n';
      if (backupResult.success) {
        message += `• Backup branch created: ${backupResult.backupBranch}\n`;
      }
      message += '• Repository state analyzed\n';
      message += '• Risk factors identified\n\n';
      
      message += '**⚡ Ready to force push with enhanced safety measures.**';
      
      const keyboard = [
        [{ text: '⚡ Execute Enhanced Force Push', callback_data: 'git:force:execute' }],
        [
          { text: '❌ Cancel', callback_data: 'git:push' },
          { text: '🔄 Re-analyze', callback_data: 'git:force:summary' }
        ]
      ];
      
      await this.mainBot.safeEditMessage(chatId, messageId, message, {
        reply_markup: { inline_keyboard: keyboard }
      });
      
    } catch (error) {
      console.error('[Force Push Summary] Error:', error);
      await this.mainBot.safeEditMessage(chatId, messageId,
        '❌ **Error creating force push summary**\n\n' +
        `Error: ${error.message}\n\n` +
        'You can still proceed with basic force push.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Basic Force Push', callback_data: 'git:push:force' }],
              [{ text: '❌ Cancel', callback_data: 'git:push' }]
            ]
          }
        }
      );
    }
  }

  /**
   * Execute enhanced force push with comprehensive safety measures
   */
  async executeEnhancedForcePush(chatId, messageId) {
    try {
      // Show progress
      await this.mainBot.safeEditMessage(chatId, messageId,
        '⚡ **Executing Enhanced Force Push...**\n\n' +
        'Step 1/3: Creating final backup...\n' +
        '⏳ Please wait...'
      );
      
      // Create final backup
      const backupResult = await this.createForcePushBackup();
      
      await this.mainBot.safeEditMessage(chatId, messageId,
        '⚡ **Executing Enhanced Force Push...**\n\n' +
        'Step 2/3: Performing force push...\n' +
        '⏳ Please wait...'
      );
      
      // Execute force push
      const pushResult = await this.executePush(true, false); // force=true, setUpstream=false
      
      await this.mainBot.safeEditMessage(chatId, messageId,
        '⚡ **Executing Enhanced Force Push...**\n\n' +
        'Step 3/3: Updating repository state...\n' +
        '⏳ Please wait...'
      );
      
      // Refresh git state
      await this.refreshGitState();
      
      // Show final result
      let message = '';
      
      if (pushResult.success) {
        message = '✅ **Force Push Completed Successfully**\n\n';
        message += '🎉 **Operation Summary:**\n';
        message += `• Force pushed ${pushResult.pushedCommits || 'commits'} successfully\n`;
        
        if (backupResult.success) {
          message += `• Safety backup: ${backupResult.backupBranch}\n`;
        }
        
        message += '• Repository state updated\n';
        message += '• Remote history rewritten\n\n';
        
        message += '**⚡ Your force push is complete!**\n\n';
        
        if (backupResult.success) {
          message += '💡 **Recovery Info:**\n';
          message += 'If needed, restore with:\n';
          message += `\`git reset --hard ${backupResult.backupBranch}\``;
        }
        
      } else {
        message = '❌ **Force Push Failed**\n\n';
        message += `**Error:** ${pushResult.error}\n\n`;
        
        if (backupResult.success) {
          message += `✅ **Backup Available:** ${backupResult.backupBranch}\n`;
          message += 'Your local changes are safe.\n\n';
        }
        
        message += '**Possible solutions:**\n';
        message += '• Check network connection\n';
        message += '• Verify repository permissions\n';
        message += '• Try again in a moment\n';
        message += '• Check if remote branch exists';
      }
      
      const keyboard = [
        [{ text: '📊 Refresh Status', callback_data: 'git:overview' }],
        [{ text: '🔙 Back to Git', callback_data: 'git:overview' }]
      ];
      
      await this.mainBot.safeEditMessage(chatId, messageId, message, {
        reply_markup: { inline_keyboard: keyboard }
      });
      
    } catch (error) {
      console.error('[Enhanced Force Push Execution] Error:', error);
      await this.mainBot.safeEditMessage(chatId, messageId,
        '❌ **Enhanced Force Push Failed**\n\n' +
        `Error: ${error.message}\n\n` +
        'The operation was aborted for safety.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'git:force:summary' }],
              [{ text: '🔙 Back to Push', callback_data: 'git:push' }]
            ]
          }
        }
      );
    }
  }

  /**
   * Get recent contributors from git history
   */
  async getRecentContributors() {
    try {
      const result = await this.execCommand('git log --format="%ae" -n 20');
      
      if (result.success) {
        // Get unique email addresses
        const contributors = [...new Set(
          result.output
            .split('\n')
            .filter(line => line.trim() && line.includes('@'))
            .map(line => line.trim().replace(/"/g, ''))
        )];
        
        return contributors;
      }
      
      return [];
      
    } catch (error) {
      console.error('[Get Recent Contributors] Error:', error);
      return [];
    }
  }

  /**
   * Get current git user
   */
  async getCurrentGitUser() {
    try {
      const result = await this.execCommand('git config user.email');
      
      if (result.success && result.output.trim()) {
        return result.output.trim();
      }
      
      return 'unknown@example.com';
      
    } catch (error) {
      console.error('[Get Current Git User] Error:', error);
      return 'unknown@example.com';
    }
  }

  /**
   * Create timestamped backup branch
   */
  async createBackupBranch(sourceBranch) {
    try {
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .substring(0, 19); // YYYY-MM-DDTHH-MM-SS
      
      const backupBranch = `backup/${sourceBranch}-${timestamp}`;
      
      const result = await this.execCommand(`git branch ${backupBranch}`);
      
      return {
        success: result.success,
        backupBranch,
        command: `git branch ${backupBranch}`,
        error: result.error
      };
      
    } catch (error) {
      console.error('[Create Backup Branch] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GitManager;
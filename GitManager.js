const path = require('path');
const MessageSplitter = require('./MessageSplitter');

/**
 * Git Manager - Full Git Workflow Management for Telegram Bot
 * Handles comprehensive git operations with mobile-friendly interface
 */
class GitManager {
  constructor(bot, options, keyboardHandlers) {
    this.bot = bot;
    this.options = options;
    this.keyboardHandlers = keyboardHandlers;
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
      branchSwitchInProgress: false
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
        await this.bot.sendMessage(chatId, 
          '❌ *Not a Git Repository*\n\n' +
          'This directory is not a git repository.\n' +
          'Use `📂 Projects` to navigate to a git project.',
          { 
            parse_mode: 'Markdown',
            reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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
      await this.bot.sendMessage(chatId, 
        `❌ *Git Manager Error*\n\n\`${error.message}\``,
        { 
          parse_mode: 'Markdown',
          reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
        }
      );
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
    } catch (error) {
      return false;
    }
  }

  /**
   * Get comprehensive git status including branch information
   */
  async getGitStatus() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const cwd = this.options.workingDirectory;

    try {
      // Get current branch and ahead/behind info
      let currentBranch = 'main';
      let aheadBehind = { ahead: 0, behind: 0 };
      
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
          } catch (error) {
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
      
      return {
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
      
    } catch (error) {
      throw new Error(`Git status failed: ${error.message}`);
    }
  }

  /**
   * Show main git interface with comprehensive workflow options
   */
  async showMainGitInterface(chatId, gitStatus) {
    const { currentBranch, aheadBehind, stagedFiles, unstagedFiles, untrackedFiles } = gitStatus;
    
    // Build status summary
    let text = '🌿 *Git Repository Manager*\n\n';
    text += `📁 *Directory:* ${path.basename(this.options.workingDirectory)}\n`;
    text += `🌿 *Branch:* ${currentBranch}`;
    
    // Add ahead/behind indicators
    if (aheadBehind.ahead > 0 || aheadBehind.behind > 0) {
      const indicators = [];
      if (aheadBehind.ahead > 0) indicators.push(`↗️ ahead ${aheadBehind.ahead}`);
      if (aheadBehind.behind > 0) indicators.push(`↘️ behind ${aheadBehind.behind}`);
      text += ` (${indicators.join(', ')})`;
    }
    text += '\n';

    // File status summary
    const totalChanged = gitStatus.nameStatus.length;
    const totalStaged = stagedFiles.length;
    const totalUntracked = untrackedFiles.length;
    
    text += `📋 *Files changed:* ${totalChanged} | `;
    text += `✅ *Staged:* ${totalStaged} | `;
    text += `❓ *Untracked:* ${totalUntracked}\n\n`;

    if (!gitStatus.hasChanges) {
      text += '✅ Working directory is clean\n\n';
    }

    text += '💡 *Choose action:*';

    // Create comprehensive action keyboard
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 Overview', callback_data: 'git:overview' },
          { text: '📂 Files', callback_data: 'git:files:0' }
        ],
        [
          { text: '🌿 Branches', callback_data: 'git:branch:list' },
          { text: '📝 Commit', callback_data: 'git:commit:prepare' }
        ],
        [
          { text: '⬆️ Push', callback_data: 'git:push' },
          { text: '⬇️ Fetch', callback_data: 'git:fetch' },
          { text: '🔄 Pull', callback_data: 'git:pull' }
        ],
        [
          { text: '🔄 Refresh', callback_data: 'git:refresh' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Get comprehensive branch information
   */
  async getBranchInfo() {
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

          // Get ahead/behind info for each branch
          let ahead = 0;
          let behind = 0;

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

      return {
        currentBranch,
        currentBranchInfo,
        branches
      };

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
        await this.bot.sendMessage(chatId, 
          '🌿 *Branch Switching*\n\n' +
          'No other branches available to switch to.\n' +
          `Currently on: \`${branchInfo.currentBranch}\``,
          { 
            parse_mode: 'Markdown',
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

      let text = '🌿 *Switch Branch*\n\n';
      text += `*Current:* ${branchInfo.currentBranch}\n\n`;
      text += '*Available Branches:*\n';

      const keyboard = {
        inline_keyboard: []
      };

      // Add branch buttons (max 5 per page for mobile-friendly interface)
      const branchesPerPage = 5;
      const displayBranches = availableBranches.slice(0, branchesPerPage);

      displayBranches.forEach((branch, index) => {
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

      await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('[Branch Switch List] Error:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Branch Switch Error*\n\n\`${error.message}\``,
        { 
          parse_mode: 'Markdown',
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
        await this.bot.sendMessage(chatId, 
          '⚠️ *Uncommitted Changes Detected*\n\n' +
          'You have uncommitted changes that would be lost.\n\n' +
          '💡 *Options:*\n' +
          '• Commit your changes first\n' +
          '• Stash your changes (coming soon)\n' +
          '• Force switch (will lose changes)',
          { 
            parse_mode: 'Markdown',
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
      await this.bot.sendMessage(chatId, 
        `❌ *Branch Switch Error*\n\n\`${error.message}\``,
        { 
          parse_mode: 'Markdown',
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
      const checkoutResult = await execAsync(checkoutCommand, { cwd });
      
      // Verify switch was successful
      const currentBranchResult = await execAsync('git branch --show-current', { cwd });
      const currentBranch = currentBranchResult.stdout.trim();

      if (currentBranch === branchName) {
        // Success! Update our state and show confirmation
        this.gitState.currentBranch = currentBranch;

        await this.bot.sendMessage(chatId, 
          `✅ *Branch Switch Successful*\n\n` +
          `*Switched to:* \`${branchName}\`\n\n` +
          '💡 *Next steps:*\n' +
          '• View file changes\n' +
          '• Check branch status\n' +
          '• Return to git overview',
          { 
            parse_mode: 'Markdown',
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
      await this.bot.sendMessage(chatId, 
        `❌ *Branch Switch Failed*\n\n` +
        `*Target Branch:* \`${branchName}\`\n` +
        `*Error:* \`${error.message}\`\n\n` +
        '💡 This might happen if:\n' +
        '• The branch doesn\'t exist\n' +
        '• There are conflicting changes\n' +
        '• Git repository is in an invalid state',
        { 
          parse_mode: 'Markdown',
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
      
      let text = '🌿 *Branch Management*\n\n';
      text += `*Current:* ${branchInfo.currentBranch}*`;
      
      // Add ahead/behind info for current branch
      if (branchInfo.currentBranchInfo) {
        const { ahead, behind } = branchInfo.currentBranchInfo;
        if (ahead > 0 || behind > 0) {
          const indicators = [];
          if (ahead > 0) indicators.push(`↗️ ahead ${ahead}`);
          if (behind > 0) indicators.push(`↘️ behind ${behind}`);
          text += ` (${indicators.join(', ')})`;
        }
      }
      text += '\n\n';
      
      // List all branches
      if (branchInfo.branches.length > 0) {
        text += '📋 *Available Branches:*\n';
        branchInfo.branches.forEach(branch => {
          const icon = branch.current ? '🌿' : '🌿';
          const marker = branch.current ? '*' : '';
          let branchLine = `${icon} ${branch.name}${marker}`;
          
          // Add tracking info
          if (branch.ahead > 0 || branch.behind > 0) {
            const indicators = [];
            if (branch.ahead > 0) indicators.push(`↗️ ${branch.ahead}`);
            if (branch.behind > 0) indicators.push(`↘️ ${branch.behind}`);
            branchLine += ` (${indicators.join(', ')})`;
          }
          
          text += branchLine + '\n';
        });
      } else {
        text += '📋 *Available Branches:* Only current branch found\n';
      }
      
      text += '\n💡 *Actions:*';
      
      // Create branch management keyboard
      const keyboard = {
        inline_keyboard: []
      };
      
      // Branch action buttons
      keyboard.inline_keyboard.push([
        { text: '➡️ Switch Branch', callback_data: 'git:branch:switch_list' },
        { text: '🆕 Create Branch', callback_data: 'git:branch:create' }
      ]);
      
      // Back button
      keyboard.inline_keyboard.push([
        { text: '🔙 Back to Git', callback_data: 'git:overview' }
      ]);
      
      await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('[Branch Management] Error:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Branch Management Error*\n\n\`${error.message}\``,
        { 
          parse_mode: 'Markdown',
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
   * Show staging interface (placeholder for Phase 3)
   */
  async showStagingInterface(chatId) {
    await this.bot.sendMessage(chatId, 
      '📦 *Staging Area*\n\n' +
      'Staging features coming in Phase 3!\n\n' +
      `Staged: ${this.gitState.stagedFiles.length} files\n` +
      `Unstaged: ${this.gitState.unstagedFiles.length} files\n` +
      `Untracked: ${this.gitState.untrackedFiles.length} files`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Back to Git', callback_data: 'git:overview' }
          ]]
        }
      }
    );
  }

  /**
   * Show commit interface (placeholder for Phase 4)
   */
  async showCommitInterface(chatId) {
    await this.bot.sendMessage(chatId, 
      '📝 *Commit Changes*\n\n' +
      'Commit features coming in Phase 4!\n\n' +
      `Staged files: ${this.gitState.stagedFiles.length}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Back to Git', callback_data: 'git:overview' }
          ]]
        }
      }
    );
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
    
    let text = `📋 *Changed Files* (Page ${page + 1}/${totalPages})\n\n`;
    
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
    
    await this.bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
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
      await this.bot.sendMessage(chatId,
        `❌ *Error reading diff for ${path.basename(filename)}*\n\n\`${error.message}\``,
        { parse_mode: 'Markdown' }
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
   * Format git diff output for Telegram display (preserved from GitDiffManager)
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

    // Enhanced file actions (staging options for Phase 3)
    if (status !== '??') {
      const actionRow = [];
      
      // Add staging actions (placeholder for Phase 3)
      actionRow.push({
        text: '➕ Stage',
        callback_data: `git:file:${fileIndex}:stage`
      });
      
      if (actionRow.length > 0) {
        keyboard.inline_keyboard.push(actionRow);
      }
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
    let parseMode = 'Markdown';
    try {
      await this.bot.sendMessage(chatId, chunk, {
        parse_mode: parseMode,
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
        await this.bot.sendMessage(chatId, 
          'There was an issue displaying the diff with formatting.\n' +
          'Raw diff content:\n\n' +
          cleanChunk, 
          { 
            reply_markup: keyboard 
          }
        );
      } catch (fallbackError) {
        await this.bot.sendMessage(chatId, 
          `❌ Error displaying diff for ${shortName}: ${fallbackError.message}`,
          { reply_markup: keyboard }
        );
      }
    }
  }

  /**
   * Handle git callback queries - Enhanced from handleDiffCallback
   */
  async handleGitCallback(data, chatId, messageId, userId) {
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
        const contextLines = parseInt(parts[3]) || 3;
        const wordDiff = parts[4] === 'true';
        
        const gitStatus = await this.getGitStatus();
        await this.showDiffFile(chatId, gitStatus, fileIndex, contextLines, wordDiff);
        
      } else if (action === 'branch') {
        await this.handleBranchCallback(parts, chatId, messageId, userId);
        
      } else if (action === 'stage' || action === 'unstage') {
        await this.handleStagingCallback(parts, chatId, messageId, userId);
        
      } else if (action === 'commit') {
        await this.handleCommitCallback(parts, chatId, messageId, userId);
        
      } else if (action === 'push' || action === 'pull' || action === 'fetch') {
        await this.handleRemoteCallback(parts, chatId, messageId, userId);
        
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
          
          formattedDiff = this.formatDiffForTelegram(diffResult.stdout, filename, contextLines);
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
        
        let text = '📊 *Git Diff Statistics*\n\n';
        text += '```\n' + gitStatus.diffStats + '\n```\n\n';
        text += '💡 Choose another view:';
        
        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
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
      await this.bot.sendMessage(chatId, 
        `❌ Error: ${error.message}`,
        { parse_mode: 'Markdown' }
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
  async handleBranchCallback(parts, chatId, messageId, userId) {
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
        await this.bot.sendMessage(chatId, 
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
      await this.bot.sendMessage(chatId, 
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
   * Show branch creation interface (placeholder for Phase 2.2)
   */
  async showBranchCreation(chatId) {
    await this.bot.sendMessage(chatId, 
      '🆕 *Create New Branch*\n\n' +
      'Branch creation features coming in Phase 2.2!\n\n' +
      '💡 *Planned features:*\n' +
      '• Enter branch name via text input\n' +
      '• Validate branch name format\n' +
      '• Create and switch to new branch\n' +
      '• Handle naming conflicts',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Back to Branches', callback_data: 'git:branch:list' }
          ]]
        }
      }
    );
  }

  /**
   * Handle staging-related callbacks (Phase 3)
   */
  async handleStagingCallback(parts, chatId, messageId, userId) {
    await this.bot.sendMessage(chatId, 
      '📦 Staging operations coming in Phase 3!',
      { 
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Back to Git', callback_data: 'git:overview' }
          ]]
        }
      }
    );
  }

  /**
   * Handle commit-related callbacks (Phase 4)
   */
  async handleCommitCallback(parts, chatId, messageId, userId) {
    await this.bot.sendMessage(chatId, 
      '📝 Commit operations coming in Phase 4!',
      { 
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Back to Git', callback_data: 'git:overview' }
          ]]
        }
      }
    );
  }

  /**
   * Handle remote operations callbacks (Phase 5)
   */
  async handleRemoteCallback(parts, chatId, messageId, userId) {
    await this.bot.sendMessage(chatId, 
      '🌐 Remote operations coming in Phase 5!',
      { 
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Back to Git', callback_data: 'git:overview' }
          ]]
        }
      }
    );
  }

  // ====== UTILITY METHODS (PRESERVED FROM GitDiffManager) ======

  /**
   * Escape markdown special characters
   */
  escapeMarkdown(text) {
    return text.replace(/([_*\[\]()~`>#+=|{}!-])/g, '\\$1');
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
}

module.exports = GitManager;
const fs = require('fs');
const path = require('path');
const MessageSplitter = require('./MessageSplitter');

/**
 * Git Diff Manager - Extracted from StreamTelegramBot
 * Handles all git diff functionality with mobile-friendly pagination
 */
class GitDiffManager {
  constructor(bot, options, keyboardHandlers) {
    this.bot = bot;
    this.options = options;
    this.keyboardHandlers = keyboardHandlers;
    this.untrackedFilePagination = null; // For pagination state
    this.messageSplitter = new MessageSplitter();
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
            reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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
          reply_markup: this.keyboardHandlers.getReplyKeyboardMarkup()
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
        } else if (status.includes('A')) {
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
      const chunks = this.messageSplitter.splitIntoChunks(formattedDiff, 3800);

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
    const shortName = path.basename(filename);

    // Create navigation keyboard
    const keyboard = {
      inline_keyboard: []
    };

    // Chunk navigation (if multiple chunks)
    if (chunks.length > 1) {
      const chunkRow = [];
      if (chunkIndex > 0) {
        chunkRow.push({
          text: '⬅️ Prev Chunk',
          callback_data: `diff:chunk:${fileIndex}:${chunkIndex - 1}:${contextLines}:${wordDiff}` 
        });
      }
      chunkRow.push({
        text: `${chunkIndex + 1}/${chunks.length}`,
        callback_data: 'noop'
      });
      if (chunkIndex < chunks.length - 1) {
        chunkRow.push({
          text: 'Next Chunk ➡️',
          callback_data: `diff:chunk:${fileIndex}:${chunkIndex + 1}:${contextLines}:${wordDiff}` 
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
            callback_data: `diff:untracked_page:${fileIndex}:${currentPage - 1}:${contextLines}:${wordDiff}` 
          });
        }
        pageRow.push({
          text: `Page ${currentPage + 1}/${totalPages}`,
          callback_data: 'noop'
        });
        if (currentPage < totalPages - 1) {
          pageRow.push({
            text: 'Next Page ➡️',
            callback_data: `diff:untracked_page:${fileIndex}:${currentPage + 1}:${contextLines}:${wordDiff}` 
          });
        }
        keyboard.inline_keyboard.push(pageRow);
      }
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

    // Context options
    if (status !== '??') {
      keyboard.inline_keyboard.push([
        {
          text: `Context: ${contextLines === 1 ? '✅' : ''}1`,
          callback_data: `diff:file:${fileIndex}:1:${wordDiff}` 
        },
        {
          text: `Context: ${contextLines === 3 ? '✅' : ''}3`,
          callback_data: `diff:file:${fileIndex}:3:${wordDiff}` 
        },
        {
          text: `Context: ${contextLines === 5 ? '✅' : ''}5`,
          callback_data: `diff:file:${fileIndex}:5:${wordDiff}` 
        }
      ]);
    }

    // Navigation back
    keyboard.inline_keyboard.push([
      { text: '📋 File List', callback_data: 'diff:files:0' },
      { text: '🏠 Overview', callback_data: 'diff:overview' }
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
      console.error(`[Diff] ${parseMode} parsing error:`, error.message);
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
   * Handle diff callback queries
   */
  async handleDiffCallback(data, chatId, messageId, userId) {
    const parts = data.split(':');
    const action = parts[1];

    try {
      if (action === 'refresh' || action === 'overview') {
        await this.showGitDiff(chatId);
        
      } else if (action === 'files') {
        const page = parseInt(parts[2]) || 0;
        const gitStatus = await this.getGitStatus();
        await this.showDiffFileList(chatId, gitStatus, page);
        
      } else if (action === 'file') {
        const fileIndex = parseInt(parts[2]) || 0;
        const contextLines = parseInt(parts[3]) || 3;
        const wordDiff = parts[4] === 'true';
        
        const gitStatus = await this.getGitStatus();
        await this.showDiffFile(chatId, gitStatus, fileIndex, contextLines, wordDiff);
        
      } else if (action === 'chunk') {
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
        const gitStatus = await this.getGitStatus();
        
        let text = '📊 *Git Diff Statistics*\n\n';
        text += '```\n' + gitStatus.diffStats + '\n```\n\n';
        text += '💡 Choose another view:';
        
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
        `❌ Error: ${error.message}`,
        { parse_mode: 'Markdown' }
      );
    }
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
   * Escape text for code blocks (prevents breaking out of code blocks)
   */
  escapeForCodeBlock(text) {
    return text.replace(/```/g, '`‍`‍`'); // Use zero-width joiner to break the sequence
  }
}

module.exports = GitDiffManager;
/**
 * Telegram Message Formatter
 * Converts Claude tool calls and results to Telegram-friendly format
 */

// const MarkdownHtmlConverter = require('./utils/markdown-html-converter');

class TelegramFormatter {
  constructor(_options = {}) {
    // Always HTML mode now - no more dual mode
    this.mode = 'html';
    
    // Status icons for todos
    this.statusIcons = {
      completed: '✅',
      in_progress: '🔄',
      pending: '⭕',
      blocked: '🚧'
    };
    
    // Priority badges
    this.priorityBadges = {
      high: '🔴',
      medium: '🟡',
      low: '🟢',
      critical: '🚨'
    };
    
    // Tool icons
    this.toolIcons = {
      todowrite: '📋',
      todoread: '📖',
      edit: '✏️',
      write: '📝',
      read: '👀',
      bash: '💻',
      task: '🤖',
      mcp: '🔌',
      grep: '🔍',
      glob: '📁',
      ls: '📂'
    };
  }

  /**
   * Escape HTML special characters for Telegram HTML mode
   */
  escapeHTML(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')  // Must be first to avoid double-escaping
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Format assistant text message (returns Markdown text)
   */
  formatAssistantText(text) {
    // Return plain text - safeSendMessage will handle conversion
    if (!text) return '';
    return text;
  }

  /**
   * Format thinking message (returns Markdown text)
   */
  formatThinking(thinking, _signature) {
    const text = `🤔 **Claude is thinking...**\n\n\`\`\`\n${thinking}\n\`\`\``;
    return text;
  }

  /**
   * Format TodoWrite tool call and result (returns Markdown text)
   */
  formatTodoWrite(todos, _toolResult = null) {
    let text = `${this.toolIcons.todowrite} **Todo List**\n\n`;
    
    // Count todos by status
    const counts = {
      completed: 0,
      in_progress: 0,
      pending: 0,
      blocked: 0
    };
    
    todos.forEach(todo => {
      counts[todo.status] = (counts[todo.status] || 0) + 1;
    });
    
    // Add progress overview
    const total = todos.length;
    const completedPercent = Math.round((counts.completed / total) * 100);
    
    text += `📊 **Progress**: ${counts.completed}/${total} (${completedPercent}%)\n`;
    text += `✅ ${counts.completed} | 🔄 ${counts.in_progress} | ⭕ ${counts.pending}`;
    if (counts.blocked > 0) {
      text += ` | 🚧 ${counts.blocked}`;
    }
    text += '\n\n';
    
    // List todos by status
    const statusOrder = ['in_progress', 'pending', 'blocked', 'completed'];
    
    statusOrder.forEach(status => {
      const statusTodos = todos.filter(todo => todo.status === status);
      if (statusTodos.length === 0) return;
      
      const statusNames = {
        completed: '✅ Completed',
        in_progress: '🔄 In Progress', 
        pending: '⭕ Pending',
        blocked: '🚧 Blocked'
      };
      
      text += `**${statusNames[status]}** (${statusTodos.length})\n`;
      
      statusTodos.forEach((todo) => {
        const priority = todo.priority ? ` ${this.priorityBadges[todo.priority]}` : '';
        const content = todo.content;
        
        if (todo.status === 'completed') {
          // For completed todos: strikethrough content
          text += `✅ ~~${content}~~${priority}\n`;
        } else {
          // For other statuses: normal content
          text += `${this.statusIcons[todo.status]} ${content}${priority}\n`;
        }
      });
      
      text += '\n';
    });
    
    return text.trim();
  }

  /**
   * Format file operations (returns Markdown text)
   */
  formatFileEdit(filePath, oldString, newString, toolResult = null) {
    let text = `${this.toolIcons.edit} **File Edit**\n\n`;
    text += `📄 \`${filePath}\`\n\n`;
    
    // Show a preview of the change
    const oldPreview = oldString.length > 100 ? 
      oldString.substring(0, 100) + '...' : oldString;
    const newPreview = newString.length > 100 ? 
      newString.substring(0, 100) + '...' : newString;
    
    text += `**Before:**\n\`\`\`\n${oldPreview}\n\`\`\`\n\n`;
    text += `**After:**\n\`\`\`\n${newPreview}\n\`\`\``;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} **Result:** ${toolResult.isError ? 'Failed' : 'Success'}`;
    }
    
    return text;
  }

  /**
   * Format file write (returns Markdown text)
   */
  formatFileWrite(filePath, content, toolResult = null) {
    let text = `${this.toolIcons.write} **File Write**\n\n`;
    text += `📄 \`${filePath}\`\n\n`;
    
    // Content preview
    const contentPreview = content.length > 200 ? 
      content.substring(0, 200) + '...' : content;
    
    text += `**Content:**\n\`\`\`\n${contentPreview}\n\`\`\``;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} **Result:** ${toolResult.isError ? 'Failed' : 'Success'}`;
    }
    
    return text;
  }

  /**
   * Format file read (returns Markdown text)
   */
  formatFileRead(filePath, toolResult = null) {
    let text = `${this.toolIcons.read} **File Read**\n\n`;
    text += `📄 \`${filePath}\``;
    
    if (toolResult && !toolResult.isError) {
      const content = typeof toolResult.content === 'string' ? 
        toolResult.content : JSON.stringify(toolResult.content);
      
      const contentPreview = content.length > 500 ? 
        content.substring(0, 500) + '...' : content;
      
      text += `\n\n**Content:**\n\`\`\`\n${contentPreview}\n\`\`\``;
    } else if (toolResult && toolResult.isError) {
      text += '\n\n❌ **Error reading file**';
    }
    
    return text;
  }

  /**
   * Format bash command (returns Markdown text)
   */
  formatBashCommand(command, description, toolResult = null) {
    let text = `${this.toolIcons.bash} **Terminal Command**\n\n`;
    
    if (description) {
      text += `📝 **Description:** ${description}\n\n`;
    }
    
    // Use Markdown formatting
    if (command.length > 100 || command.includes('\n')) {
      // Use code block for complex/multiline commands
      text += `💻 **Command:**\n\`\`\`\n${command}\n\`\`\``;
    } else {
      // Use inline code for simple commands
      text += `💻 \`${command}\``;
    }
    
    if (toolResult) {
      const success = !toolResult.isError;
      text += `\n\n${success ? '✅' : '❌'} **Result:** ${success ? 'Success' : 'Failed'}`;
      
      if (toolResult.content) {
        const output = typeof toolResult.content === 'string' ? 
          toolResult.content : JSON.stringify(toolResult.content);
        
        const outputPreview = output.length > 300 ? 
          output.substring(0, 300) + '...' : output;
        
        text += `\n\n**Output:**\n\`\`\`\n${outputPreview}\n\`\`\``;
      }
    }
    
    return text;
  }

  /**
   * Format task spawn (sub-agent) (returns Markdown text)
   */
  formatTaskSpawn(description, prompt, subagentType, toolResult = null) {
    let text = `${this.toolIcons.task} **Task Agent**\n\n`;
    text += `🤖 **Type:** ${subagentType}\n`;
    text += `📋 **Description:** ${description}\n\n`;
    
    const promptPreview = prompt.length > 200 ? 
      prompt.substring(0, 200) + '...' : prompt;
    
    text += `**Prompt:**\n\`\`\`\n${promptPreview}\n\`\`\``;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} **Status:** ${toolResult.isError ? 'Failed' : 'Running'}`;
    }
    
    return text;
  }

  /**
   * Format MCP tool calls (returns Markdown text)
   */
  formatMCPTool(toolName, input, toolResult = null) {
    let text = `${this.toolIcons.mcp} **MCP Tool**\n\n`;
    text += `🔌 **Tool:** \`${toolName}\`\n\n`;
    
    // Format input parameters
    if (input && Object.keys(input).length > 0) {
      text += '**Parameters:**\n';
      Object.entries(input).forEach(([key, value]) => {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const valuePreview = valueStr.length > 100 ? 
          valueStr.substring(0, 100) + '...' : valueStr;
        text += `• **${key}:** \`${valuePreview}\`\n`;
      });
    }
    
    if (toolResult) {
      text += `\n${toolResult.isError ? '❌' : '✅'} **Result:** ${toolResult.isError ? 'Failed' : 'Success'}`;
      
      if (toolResult.content) {
        const content = typeof toolResult.content === 'string' ? 
          toolResult.content : JSON.stringify(toolResult.content);
        
        const contentPreview = content.length > 200 ? 
          content.substring(0, 200) + '...' : content;
        
        text += `\n\n**Output:**\n\`\`\`\n${contentPreview}\n\`\`\``;
      }
    }
    
    return text;
  }

  /**
   * Format session initialization (returns Markdown text)
   */
  formatSessionInit(sessionData) {
    const { sessionId, model, cwd, tools, permissionMode, thinkingMode, isContinuation, sessionTitle } = sessionData;
    
    // Determine session type and add appropriate hashtag
    const sessionType = isContinuation ? 'Continued' : 'New';
    const hashtag = '#session_started';
    
    let text = `🚀 **${sessionType} Session Started** ${hashtag}\n\n`;
    
    // Add session title if this is a continued session and title is available
    if (isContinuation && sessionTitle) {
      text += `💡 **Session:** ${sessionTitle}\n\n`;
    }
    
    text += `🆔 **Session:** \`${sessionId ? sessionId.slice(-8) : 'Not started'}\`\n`;
    text += `🤖 **Model:** ${model || 'unknown'}\n`;
    
    // Add thinking mode information
    if (thinkingMode) {
      const thinkingDisplay = this.getThinkingModeDisplay(thinkingMode);
      text += `🧠 **Thinking Mode:** ${thinkingDisplay}\n`;
    }
    
    text += `📁 **Directory:** \`${cwd || 'unknown'}\`\n`;
    text += `🔒 **Permissions:** ${permissionMode || 'unknown'}\n`;
    text += `🛠 **Tools:** ${tools ? tools.length : 0} available`;
    
    // Add continuation indicator if this is a resumed session
    if (isContinuation) {
      text += '\n🔄 *Continuing from previous session*';
    }
    
    return text;
  }

  /**
   * Get thinking mode display string
   */
  getThinkingModeDisplay(thinkingMode) {
    const thinkingModes = {
      'none': '🚫 None',
      'light': '💡 Light',
      'medium': '🧠 Medium', 
      'deep': '🎯 Deep',
      'max': '🚀 Maximum'
    };
    
    return thinkingModes[thinkingMode] || `🤔 ${thinkingMode}`;
  }

  /**
   * Format execution result (returns Markdown text)
   */
  formatExecutionResult(result, sessionId = null) {
    const { success, cost, duration, usage } = result;
    
    const sessionIdText = sessionId ? sessionId.slice(-8) : 'unknown';
    let text = `${success ? '✅' : '❌'} ${success ? `**Session** \`${sessionIdText}\` **ended** #session_ended` : '**Execution Failed**'}\n\n`;
    
    if (duration) {
      text += `⏱ **Duration:** ${(duration / 1000).toFixed(2)}s\n`;
    }
    
    if (cost) {
      text += `💰 **Cost:** $${cost.toFixed(4)}\n`;
    }
    
    if (usage) {
      const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      text += `🎯 **Tokens:** ${totalTokens} (${usage.input_tokens || 0} in, ${usage.output_tokens || 0} out)`;
    }
    
    return text;
  }

  /**
   * Format error message (returns Markdown text)
   */
  formatError(error, context = '') {
    let text = '❌ **Error**';
    
    if (context) {
      text += ` in ${context}`;
    }
    
    text += `\n\n\`\`\`\n${error.message || error}\n\`\`\``;
    
    return text;
  }

  /**
   * Compare todos for live updating
   */
  todosChanged(oldTodos, newTodos) {
    if (!oldTodos || !newTodos) return true;
    if (oldTodos.length !== newTodos.length) return true;
    
    // Check if any todo changed status, content, or priority
    for (let i = 0; i < oldTodos.length; i++) {
      const old = oldTodos[i];
      const newTodo = newTodos[i];
      
      if (old.status !== newTodo.status || 
          old.content !== newTodo.content || 
          old.priority !== newTodo.priority) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Escape characters that might break code blocks or markdown
   */
  escapeForCodeBlock(text) {
    if (!text) return '';
    
    // Replace backticks and other problematic characters
    return text
      .replace(/`/g, '\'')  // Replace backticks with single quotes
      .replace(/\r/g, '')  // Remove carriage returns
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // eslint-disable-line no-control-regex
      .replace(/[\u{1F600}-\u{1F6FF}]/gu, '[emoji]') // Replace emojis that might break parsing
      .replace(/[\u{2600}-\u{26FF}]/gu, '[symbol]') // Replace symbols that might break parsing
      .trim(); // Remove leading/trailing whitespace
  }
}

module.exports = TelegramFormatter;
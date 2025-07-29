/**
 * Telegram Message Formatter
 * Converts Claude tool calls and results to Telegram-friendly format
 */

class TelegramFormatter {
  constructor(options = {}) {
    // Formatting mode: 'markdown' or 'html' (default: 'html' for better reliability)
    this.mode = options.mode || 'html';
    
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
   * Format assistant text message (auto-selects HTML or MarkdownV2 based on mode)
   */
  formatAssistantText(text) {
    return this.mode === 'html' ? this.formatAssistantTextHTML(text) : this.formatAssistantTextMarkdown(text);
  }

  /**
   * Format assistant text message (MarkdownV2 version)
   */
  formatAssistantTextMarkdown(text) {
    // Convert markdown to Telegram-compatible format
    let formatted = text
      // FIRST: Handle headers BEFORE bold conversion to prevent conflicts
      // Convert # headers to bold with stronger emphasis  
      .replace(/^# (.*$)/gim, '*📋 $1*')
      // Convert ## headers to bold with emphasis
      .replace(/^## (.*$)/gim, '*🔸 $1*')
      // Convert ### headers to bold (Telegram doesn't support headers)
      .replace(/^### (.*$)/gim, '*🔸 $1*')
      // THEN: Convert **bold** to *bold* (Telegram format) - but avoid double conversion
      .replace(/\*\*(.*?)\*\*/g, (match, content) => {
        // Check if this content is already inside a header bold wrapper
        // This prevents double-wrapping when headers contain bold text
        return `*${content}*`;
      })
      // Convert `code` to `code` (already correct)
      // Convert numbered lists to bullet points (more reliable)
      .replace(/^\d+\.\s+/gm, '• ')
      // Convert markdown links [text](url) to "text (url)" format
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      // Clean up any potential nested bold markers that might have been created
      .replace(/\*\*([^*]*)\*\*/g, '*$1*') // Convert any remaining ** to *
      .replace(/\*\*\*/g, '*') // Fix triple asterisks
      .replace(/\*\s*\*/g, '*') // Fix spaced asterisks
      // Keep line breaks but limit excessive ones
      .replace(/\n{4,}/g, '\n\n\n') // Max 3 line breaks
      .replace(/\n{3,}/g, '\n\n'); // Usually max 2 line breaks
    
    return {
      type: 'text',
      text: formatted,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format assistant text message (HTML version)
   */
  formatAssistantTextHTML(text) {
    // First escape HTML characters
    let formatted = this.escapeHTML(text);
    
    // Convert markdown to HTML format
    formatted = formatted
      // Convert headers to bold with icons
      .replace(/^# (.*$)/gim, '<b>📋 $1</b>')
      .replace(/^## (.*$)/gim, '<b>🔸 $1</b>')
      .replace(/^### (.*$)/gim, '<b>🔸 $1</b>')
      // Convert **bold** to <b>bold</b>
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      // Convert *italic* to <i>italic</i>
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      // Convert `code` to <code>code</code>
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Convert numbered lists to bullet points
      .replace(/^\d+\.\s+/gm, '• ')
      // Convert markdown links [text](url) to HTML links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Keep line breaks but limit excessive ones
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/\n{3,}/g, '\n\n');
    
    return {
      type: 'text',
      text: formatted,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format thinking message (auto-selects HTML or MarkdownV2 based on mode)
   */
  formatThinking(thinking, signature) {
    return this.mode === 'html' ? this.formatThinkingHTML(thinking, signature) : this.formatThinkingMarkdown(thinking, signature);
  }

  /**
   * Format thinking message (Claude's internal thoughts) - MarkdownV2 version
   */
  formatThinkingMarkdown(thinking, signature) {
    const text = `🤔 *Claude is thinking...*\n\n\`\`\`\n${thinking}\n\`\`\``;
    
    return {
      type: 'thinking',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format thinking message (Claude's internal thoughts) - HTML version
   */
  formatThinkingHTML(thinking, signature) {
    const escapedThinking = this.escapeHTML(thinking);
    const text = `🤔 <b>Claude is thinking...</b>\n\n<pre>${escapedThinking}</pre>`;
    
    return {
      type: 'thinking',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format TodoWrite tool call and result (auto-selects HTML or MarkdownV2 based on mode)
   */
  formatTodoWrite(todos, toolResult = null) {
    return this.mode === 'html' ? this.formatTodoWriteHTML(todos, toolResult) : this.formatTodoWriteMarkdown(todos, toolResult);
  }

  /**
   * Format TodoWrite tool call and result (MarkdownV2 version)
   */
  formatTodoWriteMarkdown(todos, toolResult = null) {
    let text = `${this.toolIcons.todowrite} *Todo List*\n\n`;
    
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
    
    text += `📊 *Progress*: ${counts.completed}/${total} (${completedPercent}%)\n`;
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
      
      text += `*${statusNames[status]}* (${statusTodos.length})\n`;
      
      statusTodos.forEach((todo, idx) => {
        const priority = todo.priority ? ` ${this.priorityBadges[todo.priority]}` : '';
        
        if (todo.status === 'completed') {
          // For completed todos: no icon (already in section header), strikethrough content
          text += `✅ ~${todo.content}~${priority}\n`;
        } else {
          // For other statuses: no icon (already in section header), normal content
          text += `${this.statusIcons[todo.status]} ${todo.content}${priority}\n`;
        }
      });
      
      text += '\n';
    });
    
    return {
      type: 'todo',
      text: text.trim(),
      // parse_mode will be set by sanitizer,
      todos: todos, // Store for comparison
      canEdit: true // This message can be edited
    };
  }

  /**
   * Format TodoWrite tool call and result (HTML version)
   */
  formatTodoWriteHTML(todos, toolResult = null) {
    let text = `${this.toolIcons.todowrite} <b>Todo List</b>\n\n`;
    
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
    
    text += `📊 <b>Progress</b>: ${counts.completed}/${total} (${completedPercent}%)\n`;
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
      
      text += `<b>${statusNames[status]}</b> (${statusTodos.length})\n`;
      
      statusTodos.forEach((todo, idx) => {
        const priority = todo.priority ? ` ${this.priorityBadges[todo.priority]}` : '';
        const escapedContent = this.escapeHTML(todo.content);
        
        if (todo.status === 'completed') {
          // For completed todos: strikethrough content
          text += `✅ <s>${escapedContent}</s>${priority}\n`;
        } else {
          // For other statuses: normal content
          text += `${this.statusIcons[todo.status]} ${escapedContent}${priority}\n`;
        }
      });
      
      text += '\n';
    });
    
    return {
      type: 'todo',
      text: text.trim(),
      parse_mode: 'HTML',
      todos: todos, // Store for comparison
      canEdit: true // This message can be edited
    };
  }

  /**
   * Format file operations
   */
  formatFileEdit(filePath, oldString, newString, toolResult = null) {
    let text = `${this.toolIcons.edit} *File Edit*\n\n`;
    text += `📄 \`${filePath}\`\n\n`;
    
    // Show a preview of the change
    const oldPreview = oldString.length > 100 ? 
      oldString.substring(0, 100) + '...' : oldString;
    const newPreview = newString.length > 100 ? 
      newString.substring(0, 100) + '...' : newString;
    
    text += `*Before:*\n\`\`\`\n${oldPreview}\n\`\`\`\n\n`;
    text += `*After:*\n\`\`\`\n${newPreview}\n\`\`\``;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} *Result:* ${toolResult.isError ? 'Failed' : 'Success'}`;
    }
    
    return {
      type: 'file_edit',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format file write
   */
  formatFileWrite(filePath, content, toolResult = null) {
    let text = `${this.toolIcons.write} *File Write*\n\n`;
    text += `📄 \`${filePath}\`\n\n`;
    
    // Safely escape content for code block
    const cleanContent = this.escapeForCodeBlock(content);
    const contentPreview = cleanContent.length > 200 ? 
      cleanContent.substring(0, 200) + '...' : cleanContent;
    
    text += `*Content:*\n\`\`\`\n${contentPreview}\n\`\`\``;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} *Result:* ${toolResult.isError ? 'Failed' : 'Success'}`;
    }
    
    return {
      type: 'file_write',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format file read
   */
  formatFileRead(filePath, toolResult = null) {
    let text = `${this.toolIcons.read} *File Read*\n\n`;
    text += `📄 \`${filePath}\``;
    
    if (toolResult && !toolResult.isError) {
      const content = typeof toolResult.content === 'string' ? 
        toolResult.content : JSON.stringify(toolResult.content);
      
      const contentPreview = content.length > 500 ? 
        content.substring(0, 500) + '...' : content;
      
      text += `\n\n*Content:*\n\`\`\`\n${contentPreview}\n\`\`\``;
    } else if (toolResult && toolResult.isError) {
      text += `\n\n❌ *Error reading file*`;
    }
    
    return {
      type: 'file_read',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format bash command
   */
  formatBashCommand(command, description, toolResult = null) {
    let text = `${this.toolIcons.bash} *Terminal Command*\n\n`;
    
    if (description) {
      text += `📝 *Description:* ${description}\n\n`;
    }
    
    // Keep original rich formatting - sanitizer will handle escaping
    if (command.length > 100 || command.includes('\n')) {
      // Use code block for complex/multiline commands
      text += `💻 *Command:*\n\`\`\`bash\n${command}\n\`\`\``;
    } else {
      // Use inline code for simple commands
      text += `💻 \`${command}\``;
    }
    
    if (toolResult) {
      const success = !toolResult.isError;
      text += `\n\n${success ? '✅' : '❌'} *Result:* ${success ? 'Success' : 'Failed'}`;
      
      if (toolResult.content) {
        const output = typeof toolResult.content === 'string' ? 
          toolResult.content : JSON.stringify(toolResult.content);
        
        const outputPreview = output.length > 300 ? 
          output.substring(0, 300) + '...' : output;
        
        text += `\n\n*Output:*\n\`\`\`\n${outputPreview}\n\`\`\``;
      }
    }
    
    return {
      type: 'bash_command',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format task spawn (sub-agent)
   */
  formatTaskSpawn(description, prompt, subagentType, toolResult = null) {
    let text = `${this.toolIcons.task} *Task Agent*\n\n`;
    text += `🤖 *Type:* ${subagentType}\n`;
    text += `📋 *Description:* ${description}\n\n`;
    
    const promptPreview = prompt.length > 200 ? 
      prompt.substring(0, 200) + '...' : prompt;
    
    text += `*Prompt:*\n\`\`\`\n${promptPreview}\n\`\`\``;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} *Status:* ${toolResult.isError ? 'Failed' : 'Running'}`;
    }
    
    return {
      type: 'task_spawn',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format MCP tool calls
   */
  formatMCPTool(toolName, input, toolResult = null) {
    let text = `${this.toolIcons.mcp} *MCP Tool*\n\n`;
    text += `🔌 *Tool:* \`${toolName}\`\n\n`;
    
    // Format input parameters
    if (input && Object.keys(input).length > 0) {
      text += `*Parameters:*\n`;
      Object.entries(input).forEach(([key, value]) => {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const valuePreview = valueStr.length > 100 ? 
          valueStr.substring(0, 100) + '...' : valueStr;
        text += `• *${key}:* \`${valuePreview}\`\n`;
      });
    }
    
    if (toolResult) {
      text += `\n${toolResult.isError ? '❌' : '✅'} *Result:* ${toolResult.isError ? 'Failed' : 'Success'}`;
      
      if (toolResult.content) {
        const content = typeof toolResult.content === 'string' ? 
          toolResult.content : JSON.stringify(toolResult.content);
        
        const contentPreview = content.length > 200 ? 
          content.substring(0, 200) + '...' : content;
        
        text += `\n\n*Output:*\n\`\`\`\n${contentPreview}\n\`\`\``;
      }
    }
    
    return {
      type: 'mcp_tool',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format session initialization
   */
  formatSessionInit(sessionData) {
    const { sessionId, model, cwd, tools, permissionMode } = sessionData;
    
    let text = `🚀 *Session Started*\n\n`;
    text += `🆔 *Session:* \`${sessionId ? sessionId.slice(-8) : 'Not started'}\`\n`;
    text += `🤖 *Model:* ${model || 'unknown'}\n`;
    text += `📁 *Directory:* \`${cwd || 'unknown'}\`\n`;
    text += `🔒 *Permissions:* ${permissionMode || 'unknown'}\n`;
    text += `🛠 *Tools:* ${tools ? tools.length : 0} available`;
    
    return {
      type: 'session_init',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format execution result
   */
  formatExecutionResult(result, sessionId = null) {
    const { success, cost, duration, usage } = result;
    
    const sessionIdText = sessionId ? sessionId.slice(-8) : 'unknown';
    let text = `${success ? '✅' : '❌'} ${success ? `*Session* \`${sessionIdText}\` *ended*` : '*Execution Failed*'}\n\n`;
    
    if (duration) {
      text += `⏱ *Duration:* ${(duration / 1000).toFixed(2)}s\n`;
    }
    
    if (cost) {
      text += `💰 *Cost:* $${cost.toFixed(4)}\n`;
    }
    
    if (usage) {
      const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      text += `🎯 *Tokens:* ${totalTokens} (${usage.input_tokens || 0} in, ${usage.output_tokens || 0} out)`;
    }
    
    return {
      type: 'execution_result',
      text,
      // parse_mode will be set by sanitizer
    };
  }

  /**
   * Format error message
   */
  formatError(error, context = '') {
    let text = `❌ *Error*`;
    
    if (context) {
      text += ` in ${context}`;
    }
    
    text += `\n\n\`\`\`\n${error.message || error}\n\`\`\``;
    
    return {
      type: 'error',
      text,
      // parse_mode will be set by sanitizer
    };
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
      .replace(/`/g, "'")  // Replace backticks with single quotes
      .replace(/\r/g, '')  // Remove carriage returns
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove control characters
      .replace(/[\u{1F600}-\u{1F6FF}]/gu, '[emoji]') // Replace emojis that might break parsing
      .replace(/[\u{2600}-\u{26FF}]/gu, '[symbol]') // Replace symbols that might break parsing
      .trim(); // Remove leading/trailing whitespace
  }
}

module.exports = TelegramFormatter;
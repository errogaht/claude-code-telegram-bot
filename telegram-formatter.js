/**
 * Telegram Message Formatter
 * Converts Claude tool calls and results to Telegram-friendly format
 */

const MarkdownHtmlConverter = require('./utils/markdown-html-converter');

class TelegramFormatter {
  constructor(options = {}) {
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
   * Format assistant text message (always HTML now)
   */
  formatAssistantText(text) {
    return this.formatAssistantTextHTML(text);
  }


  /**
   * Format assistant text message (HTML version)
   */
  formatAssistantTextHTML(text) {
    const converter = new MarkdownHtmlConverter();
    const formatted = converter.convert(text);
    
    return {
      type: 'text',
      text: formatted,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format thinking message (always HTML now)
   */
  formatThinking(thinking, signature) {
    return this.formatThinkingHTML(thinking, signature);
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
   * Format TodoWrite tool call and result (always HTML now)
   */
  formatTodoWrite(todos, toolResult = null) {
    return this.formatTodoWriteHTML(todos, toolResult);
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
    const converter = new MarkdownHtmlConverter();
    let text = `${this.toolIcons.edit} <b>File Edit</b>\n\n`;
    text += `📄 <code>${this.escapeHTML(filePath)}</code>\n\n`;
    
    // Show a preview of the change
    const oldPreview = oldString.length > 100 ? 
      oldString.substring(0, 100) + '...' : oldString;
    const newPreview = newString.length > 100 ? 
      newString.substring(0, 100) + '...' : newString;
    
    text += `<b>Before:</b>\n<pre>${this.escapeHTML(oldPreview)}</pre>\n\n`;
    text += `<b>After:</b>\n<pre>${this.escapeHTML(newPreview)}</pre>`;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} <b>Result:</b> ${toolResult.isError ? 'Failed' : 'Success'}`;
    }
    
    return {
      type: 'file_edit',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format file write
   */
  formatFileWrite(filePath, content, toolResult = null) {
    let text = `${this.toolIcons.write} <b>File Write</b>\n\n`;
    text += `📄 <code>${this.escapeHTML(filePath)}</code>\n\n`;
    
    // Safely escape content for code block
    const contentPreview = content.length > 200 ? 
      content.substring(0, 200) + '...' : content;
    
    text += `<b>Content:</b>\n<pre>${this.escapeHTML(contentPreview)}</pre>`;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} <b>Result:</b> ${toolResult.isError ? 'Failed' : 'Success'}`;
    }
    
    return {
      type: 'file_write',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format file read
   */
  formatFileRead(filePath, toolResult = null) {
    let text = `${this.toolIcons.read} <b>File Read</b>\n\n`;
    text += `📄 <code>${this.escapeHTML(filePath)}</code>`;
    
    if (toolResult && !toolResult.isError) {
      const content = typeof toolResult.content === 'string' ? 
        toolResult.content : JSON.stringify(toolResult.content);
      
      const contentPreview = content.length > 500 ? 
        content.substring(0, 500) + '...' : content;
      
      text += `\n\n<b>Content:</b>\n<pre>${this.escapeHTML(contentPreview)}</pre>`;
    } else if (toolResult && toolResult.isError) {
      text += `\n\n❌ <b>Error reading file</b>`;
    }
    
    return {
      type: 'file_read',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format bash command
   */
  formatBashCommand(command, description, toolResult = null) {
    let text = `${this.toolIcons.bash} <b>Terminal Command</b>\n\n`;
    
    if (description) {
      text += `📝 <b>Description:</b> ${this.escapeHTML(description)}\n\n`;
    }
    
    // Use HTML formatting
    if (command.length > 100 || command.includes('\n')) {
      // Use code block for complex/multiline commands
      text += `💻 <b>Command:</b>\n<pre>${this.escapeHTML(command)}</pre>`;
    } else {
      // Use inline code for simple commands
      text += `💻 <code>${this.escapeHTML(command)}</code>`;
    }
    
    if (toolResult) {
      const success = !toolResult.isError;
      text += `\n\n${success ? '✅' : '❌'} <b>Result:</b> ${success ? 'Success' : 'Failed'}`;
      
      if (toolResult.content) {
        const output = typeof toolResult.content === 'string' ? 
          toolResult.content : JSON.stringify(toolResult.content);
        
        const outputPreview = output.length > 300 ? 
          output.substring(0, 300) + '...' : output;
        
        text += `\n\n<b>Output:</b>\n<pre>${this.escapeHTML(outputPreview)}</pre>`;
      }
    }
    
    return {
      type: 'bash_command',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format task spawn (sub-agent)
   */
  formatTaskSpawn(description, prompt, subagentType, toolResult = null) {
    let text = `${this.toolIcons.task} <b>Task Agent</b>\n\n`;
    text += `🤖 <b>Type:</b> ${this.escapeHTML(subagentType)}\n`;
    text += `📋 <b>Description:</b> ${this.escapeHTML(description)}\n\n`;
    
    const promptPreview = prompt.length > 200 ? 
      prompt.substring(0, 200) + '...' : prompt;
    
    text += `<b>Prompt:</b>\n<pre>${this.escapeHTML(promptPreview)}</pre>`;
    
    if (toolResult) {
      text += `\n\n${toolResult.isError ? '❌' : '✅'} <b>Status:</b> ${toolResult.isError ? 'Failed' : 'Running'}`;
    }
    
    return {
      type: 'task_spawn',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format MCP tool calls
   */
  formatMCPTool(toolName, input, toolResult = null) {
    let text = `${this.toolIcons.mcp} <b>MCP Tool</b>\n\n`;
    text += `🔌 <b>Tool:</b> <code>${this.escapeHTML(toolName)}</code>\n\n`;
    
    // Format input parameters
    if (input && Object.keys(input).length > 0) {
      text += `<b>Parameters:</b>\n`;
      Object.entries(input).forEach(([key, value]) => {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const valuePreview = valueStr.length > 100 ? 
          valueStr.substring(0, 100) + '...' : valueStr;
        text += `• <b>${this.escapeHTML(key)}:</b> <code>${this.escapeHTML(valuePreview)}</code>\n`;
      });
    }
    
    if (toolResult) {
      text += `\n${toolResult.isError ? '❌' : '✅'} <b>Result:</b> ${toolResult.isError ? 'Failed' : 'Success'}`;
      
      if (toolResult.content) {
        const content = typeof toolResult.content === 'string' ? 
          toolResult.content : JSON.stringify(toolResult.content);
        
        const contentPreview = content.length > 200 ? 
          content.substring(0, 200) + '...' : content;
        
        text += `\n\n<b>Output:</b>\n<pre>${this.escapeHTML(contentPreview)}</pre>`;
      }
    }
    
    return {
      type: 'mcp_tool',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format session initialization
   */
  formatSessionInit(sessionData) {
    const { sessionId, model, cwd, tools, permissionMode } = sessionData;
    
    let text = `🚀 <b>Session Started</b>\n\n`;
    text += `🆔 <b>Session:</b> <code>${sessionId ? sessionId.slice(-8) : 'Not started'}</code>\n`;
    text += `🤖 <b>Model:</b> ${this.escapeHTML(model || 'unknown')}\n`;
    text += `📁 <b>Directory:</b> <code>${this.escapeHTML(cwd || 'unknown')}</code>\n`;
    text += `🔒 <b>Permissions:</b> ${this.escapeHTML(permissionMode || 'unknown')}\n`;
    text += `🛠 <b>Tools:</b> ${tools ? tools.length : 0} available`;
    
    return {
      type: 'session_init',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format execution result
   */
  formatExecutionResult(result, sessionId = null) {
    const { success, cost, duration, usage } = result;
    
    const sessionIdText = sessionId ? sessionId.slice(-8) : 'unknown';
    let text = `${success ? '✅' : '❌'} ${success ? `<b>Session</b> <code>${sessionIdText}</code> <b>ended</b>` : '<b>Execution Failed</b>'}\n\n`;
    
    if (duration) {
      text += `⏱ <b>Duration:</b> ${(duration / 1000).toFixed(2)}s\n`;
    }
    
    if (cost) {
      text += `💰 <b>Cost:</b> $${cost.toFixed(4)}\n`;
    }
    
    if (usage) {
      const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      text += `🎯 <b>Tokens:</b> ${totalTokens} (${usage.input_tokens || 0} in, ${usage.output_tokens || 0} out)`;
    }
    
    return {
      type: 'execution_result',
      text,
      parse_mode: 'HTML'
    };
  }

  /**
   * Format error message
   */
  formatError(error, context = '') {
    let text = `❌ <b>Error</b>`;
    
    if (context) {
      text += ` in ${this.escapeHTML(context)}`;
    }
    
    text += `\n\n<pre>${this.escapeHTML(error.message || error)}</pre>`;
    
    return {
      type: 'error',
      text,
      parse_mode: 'HTML'
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
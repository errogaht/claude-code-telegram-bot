/**
 * Claude CLI Stream-JSON Processor
 * Based on Claudia's architecture - processes Claude CLI JSONL stream
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class ClaudeStreamProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      model: 'sonnet',
      workingDirectory: process.cwd(),
      verbose: true,
      skipPermissions: true,
      ...options
    };
    
    this.currentProcess = null;
    this.sessionId = null;
    this.isProcessing = false;
    this.messageBuffer = '';
  }

  /**
   * Start new conversation
   */
  async startNewConversation(prompt) {
    const args = [
      '-p', prompt,
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions'
    ];
    
    return this._spawnClaudeProcess(args);
  }

  /**
   * Continue conversation with session ID (RECOMMENDED)
   */
  async continueConversation(prompt, sessionId = null) {
    // If we have a session ID, use --resume for precise control
    if (sessionId) {
      return this.resumeSession(sessionId, prompt);
    }
    
    // Fallback to -c flag (continues last session in working directory)
    const args = [
      '-c', // 🔑 Continue flag - maintains session history
      '-p', prompt,
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions'
    ];
    
    return this._spawnClaudeProcess(args);
  }

  /**
   * Resume specific session by ID
   */
  async resumeSession(sessionId, prompt) {
    const args = [
      '-r', sessionId,  // Use -r flag instead of --resume
      '-p', prompt,
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions'
    ];
    
    console.log(`[ClaudeStream] Resuming session: ${sessionId}`);
    return this._spawnClaudeProcess(args);
  }

  /**
   * Internal method to spawn Claude process
   */
  _spawnClaudeProcess(args) {
    return new Promise((resolve, reject) => {
      if (this.isProcessing) {
        return reject(new Error('Already processing a request'));
      }

      this.isProcessing = true;
      this.messageBuffer = '';
      
      console.log('[ClaudeStream] Spawning Claude with args:', args);
      
      // Spawn Claude CLI process
      this.currentProcess = spawn('claude', args, {
        cwd: this.options.workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe'] // stdin ignored, capture stdout/stderr
      });

      let hasStarted = false;

      // Handle stdout - JSONL stream
      this.currentProcess.stdout.on('data', (data) => {
        this.messageBuffer += data.toString();
        this._processBuffer();
        
        if (!hasStarted) {
          hasStarted = true;
          resolve();
        }
      });

      // Handle stderr - errors
      this.currentProcess.stderr.on('data', (data) => {
        const errorText = data.toString();
        console.error('[ClaudeStream] stderr:', errorText);
        this.emit('error', new Error(errorText));
      });

      // Handle process completion
      this.currentProcess.on('close', (code) => {
        console.log('[ClaudeStream] Process completed with code:', code);
        this.isProcessing = false;
        this.currentProcess = null;
        
        this.emit('complete', {
          success: code === 0,
          sessionId: this.sessionId
        });
      });

      // Handle spawn errors
      this.currentProcess.on('error', (error) => {
        console.error('[ClaudeStream] Process error:', error);
        this.isProcessing = false;
        this.currentProcess = null;
        
        if (!hasStarted) {
          reject(error);
        } else {
          this.emit('error', error);
        }
      });
    });
  }

  /**
   * Process JSONL buffer - split by lines and parse each
   */
  _processBuffer() {
    const lines = this.messageBuffer.split('\n');
    
    // Keep the last potentially incomplete line in buffer
    this.messageBuffer = lines.pop() || '';
    
    // Process complete lines
    lines.forEach(line => {
      if (line.trim()) {
        this._processJsonlLine(line.trim());
      }
    });
  }

  /**
   * Process single JSONL line - parse and emit events
   */
  _processJsonlLine(jsonlLine) {
    try {
      const message = JSON.parse(jsonlLine);
      
      // Extract session ID from system init message
      if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
        this.sessionId = message.session_id;
        console.log('[ClaudeStream] Session ID:', this.sessionId);
      }
      
      // Emit raw message
      this.emit('message', message);
      
      // Emit specific event types
      this._emitSpecificEvents(message);
      
    } catch (error) {
      console.error('[ClaudeStream] JSON parse error:', error, 'Line:', jsonlLine);
      this.emit('parse-error', { error, line: jsonlLine });
    }
  }

  /**
   * Emit specific events based on message type
   */
  _emitSpecificEvents(message) {
    const { type, subtype } = message;
    
    // System events
    if (type === 'system') {
      if (subtype === 'init') {
        this.emit('session-init', {
          sessionId: message.session_id,
          model: message.model,
          cwd: message.cwd,
          tools: message.tools,
          permissionMode: message.permissionMode
        });
      }
    }
    
    // Assistant messages - thoughts and tool calls
    else if (type === 'assistant' && message.message) {
      const content = message.message.content;
      
      if (Array.isArray(content)) {
        content.forEach((item, index) => {
          if (item.type === 'text') {
            // Claude's thoughts/text
            this.emit('assistant-text', {
              text: item.text,
              messageId: message.message.id,
              sessionId: message.session_id
            });
          }
          
          else if (item.type === 'thinking') {
            // Claude's internal thinking
            this.emit('assistant-thinking', {
              thinking: item.thinking,
              signature: item.signature,
              sessionId: message.session_id
            });
          }
          
          else if (item.type === 'tool_use') {
            // Tool calls
            this.emit('tool-call', {
              toolName: item.name,
              toolId: item.id,
              input: item.input,
              sessionId: message.session_id
            });
            
            // Specific tool events
            this._emitToolSpecificEvents(item, message.session_id);
          }
        });
      }
    }
    
    // User messages - tool results
    else if (type === 'user' && message.message) {
      const content = message.message.content;
      
      if (Array.isArray(content)) {
        content.forEach(item => {
          if (item.type === 'tool_result') {
            this.emit('tool-result', {
              toolUseId: item.tool_use_id,
              content: item.content,
              isError: item.is_error,
              sessionId: message.session_id
            });
          }
        });
      }
    }
    
    // Result messages - final completion
    else if (type === 'result') {
      this.emit('execution-result', {
        success: !message.is_error,
        result: message.result,
        error: message.error,
        cost: message.cost_usd || message.total_cost_usd,
        duration: message.duration_ms,
        usage: message.usage,
        sessionId: message.session_id
      });
    }
  }

  /**
   * Emit specific events for different tools
   */
  _emitToolSpecificEvents(toolCall, sessionId) {
    const { name: toolName, input, id: toolId } = toolCall;
    
    switch (toolName.toLowerCase()) {
      case 'todowrite':
        this.emit('todo-write', {
          todos: input.todos,
          toolId,
          sessionId
        });
        break;
        
      case 'todoread':
        this.emit('todo-read', {
          toolId,
          sessionId
        });
        break;
        
      case 'edit':
        this.emit('file-edit', {
          filePath: input.file_path,
          oldString: input.old_string,
          newString: input.new_string,
          replaceAll: input.replace_all,
          toolId,
          sessionId
        });
        break;
        
      case 'write':
        this.emit('file-write', {
          filePath: input.file_path,
          content: input.content,
          toolId,
          sessionId
        });
        break;
        
      case 'read':
        this.emit('file-read', {
          filePath: input.file_path,
          offset: input.offset,
          limit: input.limit,
          toolId,
          sessionId
        });
        break;
        
      case 'bash':
        this.emit('bash-command', {
          command: input.command,
          description: input.description,
          toolId,
          sessionId
        });
        break;
        
      case 'task':
        this.emit('task-spawn', {
          description: input.description,
          prompt: input.prompt,
          subagentType: input.subagent_type,
          toolId,
          sessionId
        });
        break;
        
      default:
        // MCP tools or unknown tools
        if (toolName.startsWith('mcp__')) {
          this.emit('mcp-tool', {
            toolName,
            input,
            toolId,
            sessionId
          });
        } else {
          this.emit('unknown-tool', {
            toolName,
            input,
            toolId,
            sessionId
          });
        }
    }
  }

  /**
   * Cancel current process
   */
  cancel() {
    if (this.currentProcess) {
      console.log('[ClaudeStream] Cancelling process');
      this.currentProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId() {
    return this.sessionId;
  }

  /**
   * Check if currently processing
   */
  isActive() {
    return this.isProcessing;
  }
}

module.exports = ClaudeStreamProcessor;
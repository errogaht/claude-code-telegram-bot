/**
 * Claude CLI Stream-JSON Processor
 * Based on Claudia's architecture - processes Claude CLI JSONL stream
 */

const { spawn: originalSpawn } = require('child_process');
const { EventEmitter } = require('events');

// GLOBAL TEST PROTECTION: Wrap spawn to prevent any real claude process in tests
const spawn = (command, args, options) => {
  // If we're trying to spawn 'claude' in a test environment, throw an error
  if (command === 'claude' && (
    process.env.NODE_ENV === 'test' || 
    process.env.JEST_WORKER_ID !== undefined ||
    global.JEST_WORKER_ID !== undefined ||
    typeof jest !== 'undefined'
  )) {
    console.error('[GLOBAL PROTECTION] Blocked attempt to spawn real claude process in test environment!');
    throw new Error('GLOBAL SAFETY VIOLATION: Real claude process spawn blocked in test environment');
  }
  
  // For non-claude commands or production environment, use original spawn
  return originalSpawn(command, args, options);
};

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
    
    // Test support: Store last Claude arguments for validation
    this.lastClaudeArgs = null;
    this.lastClaudeOptions = null;
  }

  /**
   * Test helper methods for argument validation
   */
  getLastClaudeArgs() {
    return this.lastClaudeArgs;
  }

  getLastClaudeOptions() {
    return this.lastClaudeOptions;
  }

  static getClaudeTestRegistry() {
    return global.claudeTestRegistry || [];
  }

  static clearClaudeTestRegistry() {
    global.claudeTestRegistry = [];
  }

  /**
   * Start new conversation
   */
  async startNewConversation(prompt) {
    const args = [
      '-p',
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      prompt  // Prompt as positional argument at the end
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
      '-p',
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      prompt  // Prompt as positional argument at the end
    ];
    
    return this._spawnClaudeProcess(args);
  }

  /**
   * Resume specific session by ID
   */
  async resumeSession(sessionId, prompt) {
    const args = [
      '-r', sessionId,  // Use -r flag instead of --resume
      '-p',
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      prompt  // Prompt as positional argument at the end
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
      
      console.log('[ClaudeStream] Working directory:', this.options.workingDirectory);
      console.log('[ClaudeStream] Spawning Claude with args:', args);
      
      // Build copyable command line
      const quotedArgs = args.map(arg => {
        // Quote arguments that contain spaces or special characters
        if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      });
      const copyableCommand = `claude ${quotedArgs.join(' ')}`;
      console.log('[ClaudeStream] Copyable command:', copyableCommand);
      
      console.log('[ClaudeStream] Environment check: NODE_ENV =', process.env.NODE_ENV, ', JEST_WORKER_ID =', process.env.JEST_WORKER_ID);
      
      // BULLETPROOF TEST PROTECTION: Check if we're in test environment
      // Multiple layers of protection to ensure real claude process NEVER runs in tests
      const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                                process.env.JEST_WORKER_ID !== undefined ||
                                process.env.CI === 'true' ||
                                process.env.npm_lifecycle_event?.includes('test') ||
                                global.JEST_WORKER_ID !== undefined ||
                                global.JEST_CLAUDE_PROTECTION_ACTIVE === true ||
                                typeof jest !== 'undefined';

      console.log('[ClaudeStream] Is test environment:', isTestEnvironment);
      
      // ABSOLUTE PROTECTION: If ANY test indicator is detected, use mock process
      if (isTestEnvironment) {
        console.log('[ClaudeStream] Test environment detected, using mock Claude process');
        
        // Store arguments for test validation
        this.lastClaudeArgs = args;
        this.lastClaudeOptions = {
          cwd: this.options.workingDirectory,
          stdio: ['ignore', 'pipe', 'pipe']
        };
        
        // Create global test registry for argument validation
        if (!global.claudeTestRegistry) {
          global.claudeTestRegistry = [];
        }
        const registryEntry = {
          timestamp: Date.now(),
          args: [...args], // Deep copy
          options: { ...this.lastClaudeOptions },
          workingDirectory: this.options.workingDirectory
        };
        global.claudeTestRegistry.push(registryEntry);
        console.log('[ClaudeStream] Added entry to test registry. Total entries:', global.claudeTestRegistry.length);
        console.log('[ClaudeStream] Registry entry:', registryEntry);
        
        // Create a mock process that simulates Claude response
        const { EventEmitter } = require('events');
        
        this.currentProcess = new EventEmitter();
        this.currentProcess.stdout = new EventEmitter();
        this.currentProcess.stderr = new EventEmitter();
        this.currentProcess.kill = () => {
          console.log('[ClaudeStream] Mock process killed');
          this.currentProcess.emit('close', 0);
        };
        
        // Simulate Claude response after a short delay
        setTimeout(() => {
          const mockResponse = {
            type: 'message_part',
            content: '📱 **Test Bot Response**\n\nThis is a mock response for testing purposes. The bot is working correctly in test mode!\n\n✅ All systems operational'
          };
          
          // Check if process is still valid before emitting
          if (this.currentProcess && this.currentProcess.stdout) {
            this.currentProcess.stdout.emit('data', JSON.stringify(mockResponse) + '\n');
            
            // End the mock process
            setTimeout(() => {
              if (this.currentProcess) {
                this.currentProcess.emit('close', 0);
              }
            }, 100);
          }
        }, 500);
        
      } else {
        // FINAL SAFETY CHECK: Double-check test environment before spawning real process
        const finalSafetyCheck = process.env.NODE_ENV === 'test' || 
                                process.env.JEST_WORKER_ID !== undefined ||
                                global.JEST_WORKER_ID !== undefined ||
                                typeof jest !== 'undefined';
        
        if (finalSafetyCheck) {
          console.error('[ClaudeStream] CRITICAL ERROR: Test environment detected in production branch! Aborting real claude spawn.');
          throw new Error('SAFETY VIOLATION: Attempted to spawn real claude process in test environment');
        }
        
        // Only spawn real Claude CLI process if we're absolutely sure we're not in test
        console.log('[ClaudeStream] Production environment confirmed, spawning real Claude process');
        this.currentProcess = spawn('claude', args, {
          cwd: this.options.workingDirectory,
          stdio: ['ignore', 'pipe', 'pipe'] // stdin ignored, capture stdout/stderr
        });
      }

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
              sessionId: message.session_id,
              usage: message.message.usage // Include usage if present
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

  /**
   * Check if process is responsive
   */
  isResponsive() {
    // If no current process, consider it responsive (idle state)
    if (!this.currentProcess) {
      return true;
    }
    
    // If process exists but has been killed, not responsive
    if (this.currentProcess.killed) {
      return false;
    }
    
    // If process has exit code, it's no longer responsive
    if (this.currentProcess.exitCode !== null) {
      return false;
    }
    
    // Process is running and appears responsive
    return true;
  }
}

module.exports = ClaudeStreamProcessor;
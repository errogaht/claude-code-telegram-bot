/**
 * Unit Tests for SessionManager
 * Tests session handling, state persistence, and processor event management
 */

const SessionManager = require('../../SessionManager');
const EventEmitter = require('events');

// Mock dependencies
jest.mock('../../claude-stream-processor');
jest.mock('fs');

const createMockProcessor = () => {
  const processor = new EventEmitter();
  processor.isActive = jest.fn().mockReturnValue(false);
  processor.getCurrentSessionId = jest.fn().mockReturnValue('test-session-id');
  processor.cancel = jest.fn();
  return processor;
};

const createMockFormatter = () => ({
  formatSessionInit: jest.fn().mockReturnValue('Session started'),
  formatAssistantText: jest.fn().mockReturnValue('Assistant text'),
  formatThinking: jest.fn().mockReturnValue('Thinking...'),
  formatTodoWrite: jest.fn().mockReturnValue('Todo list'),
  formatFileEdit: jest.fn().mockReturnValue('File edited'),
  formatFileWrite: jest.fn().mockReturnValue('File written'),
  formatFileRead: jest.fn().mockReturnValue('File read'),
  formatBashCommand: jest.fn().mockReturnValue('Bash command'),
  formatTaskSpawn: jest.fn().mockReturnValue('Task spawned'),
  formatMCPTool: jest.fn().mockReturnValue('MCP tool'),
  formatExecutionResult: jest.fn().mockReturnValue('Execution complete'),
  formatError: jest.fn().mockReturnValue('Error occurred'),
  todosChanged: jest.fn().mockReturnValue(true)
});

const createMockBot = () => ({
  sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  editMessageText: jest.fn().mockResolvedValue(true),
  deleteMessage: jest.fn().mockResolvedValue(true)
});

const createMockActivityIndicator = () => ({
  stop: jest.fn().mockResolvedValue()
});

const createMockMainBot = () => ({
  safeSendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  safeEditMessage: jest.fn().mockResolvedValue(true),
  getUserIdFromChat: jest.fn().mockReturnValue('user123'),
  sendSessionInit: jest.fn().mockResolvedValue(),
  storeUserThinkingMode: jest.fn(),
  keyboardHandlers: {
    getReplyKeyboardMarkup: jest.fn().mockReturnValue({})
  }
});

describe('SessionManager', () => {
  let sessionManager;
  let mockFormatter;
  let mockBot;
  let mockActivityIndicator;
  let mockMainBot;
  let mockActiveProcessors;
  let mockOptions;

  beforeEach(() => {
    mockFormatter = createMockFormatter();
    mockBot = createMockBot();
    mockActivityIndicator = createMockActivityIndicator();
    mockMainBot = createMockMainBot();
    mockActiveProcessors = new Set();
    mockOptions = {
      model: 'claude-3',
      workingDirectory: '/test/dir',
      configFilePath: '/test/config.json'
    };

    sessionManager = new SessionManager(
      mockFormatter,
      mockOptions,
      mockBot,
      mockActiveProcessors,
      mockActivityIndicator,
      mockMainBot
    );

    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(sessionManager.formatter).toBe(mockFormatter);
      expect(sessionManager.options).toBe(mockOptions);
      expect(sessionManager.bot).toBe(mockBot);
      expect(sessionManager.activeProcessors).toBe(mockActiveProcessors);
      expect(sessionManager.activityIndicator).toBe(mockActivityIndicator);
      expect(sessionManager.mainBot).toBe(mockMainBot);
    });

    test('should initialize empty session storage', () => {
      expect(sessionManager.userSessions).toBeInstanceOf(Map);
      expect(sessionManager.sessionStorage).toBeInstanceOf(Map);
      expect(sessionManager.userSessions.size).toBe(0);
      expect(sessionManager.sessionStorage.size).toBe(0);
    });

    test('should store config file path', () => {
      expect(sessionManager.configFilePath).toBe('/test/config.json');
    });
  });

  describe('Create User Session', () => {
    test('should create new session with processor', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);

      const session = await sessionManager.createUserSession('user123', 'chat456');

      expect(session).toMatchObject({
        userId: 'user123',
        chatId: 'chat456',
        processor: mockProcessor,
        messageCount: 0,
        lastTodoMessageId: null,
        lastTodos: null
      });
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    test('should add processor to active processors set', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);

      await sessionManager.createUserSession('user123', 'chat456');

      expect(mockActiveProcessors.has(mockProcessor)).toBe(true);
    });

    test('should store session in userSessions map', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);

      await sessionManager.createUserSession('user123', 'chat456');

      expect(sessionManager.userSessions.has('user123')).toBe(true);
      expect(sessionManager.userSessions.get('user123').userId).toBe('user123');
    });

    test('should use user model preference if available', async () => {
      sessionManager.getUserModel = jest.fn().mockReturnValue('claude-2');
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockClaudeStreamProcessor.mockImplementation(() => createMockProcessor());

      await sessionManager.createUserSession('user123', 'chat456');

      expect(mockClaudeStreamProcessor).toHaveBeenCalledWith({
        model: 'claude-2',
        workingDirectory: '/test/dir'
      });
    });

    test('should fall back to default model', async () => {
      sessionManager.getUserModel = jest.fn().mockReturnValue(null);
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockClaudeStreamProcessor.mockImplementation(() => createMockProcessor());

      await sessionManager.createUserSession('user123', 'chat456');

      expect(mockClaudeStreamProcessor).toHaveBeenCalledWith({
        model: 'claude-3',
        workingDirectory: '/test/dir'
      });
    });
  });

  describe('Processor Event Handling', () => {
    let mockProcessor;
    let session;

    beforeEach(async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);

      session = await sessionManager.createUserSession('user123', 'chat456');
    });

    test('should handle session-init event', async () => {
      const sessionData = { sessionId: 'new-session-123' };

      mockProcessor.emit('session-init', sessionData);
      await new Promise(resolve => process.nextTick(resolve)); // Wait for async handlers

      // The formatter should be called with enhanced data including additional fields
      expect(mockFormatter.formatSessionInit).toHaveBeenCalledWith({
        sessionId: 'new-session-123',
        thinkingMode: 'auto', // default from getUserThinkingMode
        isContinuation: false,
        sessionTitle: null
      });
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'Session started'
      );
      expect(session.sessionId).toBe('new-session-123');
    });

    test('should handle assistant-text event', async () => {
      const textData = { text: 'Hello from Claude' };

      mockProcessor.emit('assistant-text', textData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockFormatter.formatAssistantText).toHaveBeenCalledWith('Hello from Claude');
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'Assistant text'
      );
    });

    test('should handle assistant-thinking event', async () => {
      const thinkingData = { thinking: 'Analyzing request', signature: 'sig' };

      mockProcessor.emit('assistant-thinking', thinkingData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockFormatter.formatThinking).toHaveBeenCalledWith('Analyzing request', 'sig');
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'Thinking...'
      );
    });

    test('should handle todo-write event', async () => {
      const todoData = { todos: [{ id: '1', content: 'Task 1', status: 'pending' }], toolId: 'tool1' };
      sessionManager.handleTodoWrite = jest.fn();

      mockProcessor.emit('todo-write', todoData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(sessionManager.handleTodoWrite).toHaveBeenCalledWith(
        session,
        todoData.todos,
        todoData.toolId
      );
    });

    test('should handle file operation events', async () => {
      const fileEditData = { filePath: '/test/file.js', oldString: 'old', newString: 'new' };
      const fileWriteData = { filePath: '/test/new.js', content: 'content' };
      const fileReadData = { filePath: '/test/read.js' };

      mockProcessor.emit('file-edit', fileEditData);
      mockProcessor.emit('file-write', fileWriteData);
      mockProcessor.emit('file-read', fileReadData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockFormatter.formatFileEdit).toHaveBeenCalledWith('/test/file.js', 'old', 'new');
      expect(mockFormatter.formatFileWrite).toHaveBeenCalledWith('/test/new.js', 'content');
      expect(mockFormatter.formatFileRead).toHaveBeenCalledWith('/test/read.js');
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledTimes(3);
    });

    test('should handle bash-command event', async () => {
      const bashData = { command: 'ls -la', description: 'List files' };

      mockProcessor.emit('bash-command', bashData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockFormatter.formatBashCommand).toHaveBeenCalledWith('ls -la', 'List files');
      expect(mockMainBot.safeSendMessage).toHaveBeenCalled();
    });

    test('should handle task-spawn event', async () => {
      const taskData = { description: 'Analyze code', prompt: 'Check quality', subagentType: 'analyzer' };

      mockProcessor.emit('task-spawn', taskData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockFormatter.formatTaskSpawn).toHaveBeenCalledWith('Analyze code', 'Check quality', 'analyzer');
      expect(mockMainBot.safeSendMessage).toHaveBeenCalled();
    });

    test('should handle mcp-tool event', async () => {
      const mcpData = { toolName: 'test_tool', input: { param: 'value' } };

      mockProcessor.emit('mcp-tool', mcpData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockFormatter.formatMCPTool).toHaveBeenCalledWith('test_tool', { param: 'value' });
      expect(mockMainBot.safeSendMessage).toHaveBeenCalled();
    });

    test('should handle execution-result event with token tracking', async () => {
      const executionData = { 
        success: true, 
        cost: 0.01, 
        duration: 5000,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 25,
          cache_creation_input_tokens: 10
        }
      };

      mockProcessor.emit('execution-result', executionData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockActivityIndicator.stop).toHaveBeenCalledWith('chat456');
      expect(mockFormatter.formatExecutionResult).toHaveBeenCalledWith(executionData, session.sessionId);
      expect(mockMainBot.safeSendMessage).toHaveBeenCalled();
      
      // Check token usage was updated
      expect(session.tokenUsage.totalInputTokens).toBe(125); // 100 + 25 cache
      expect(session.tokenUsage.totalOutputTokens).toBe(50);
      expect(session.tokenUsage.transactionCount).toBe(1);
    });

    test('should handle legacy complete event without token tracking', async () => {
      const completeData = { success: true };

      mockProcessor.emit('complete', completeData);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockActivityIndicator.stop).toHaveBeenCalledWith('chat456');
      // Should not call formatExecutionResult for legacy complete event
      expect(mockFormatter.formatExecutionResult).not.toHaveBeenCalled();
    });

    test('should handle error event', async () => {
      const error = new Error('Test error');
      sessionManager.sendError = jest.fn();

      mockProcessor.emit('error', error);
      await new Promise(resolve => process.nextTick(resolve));

      expect(mockActivityIndicator.stop).toHaveBeenCalledWith('chat456');
      expect(sessionManager.sendError).toHaveBeenCalledWith('chat456', error);
    });
  });

  describe('Session Storage Management', () => {
    test('should store session ID with metadata', () => {
      sessionManager.storeSessionId('user123', 'session-456');

      const storage = sessionManager.sessionStorage.get('user123');
      expect(storage.currentSessionId).toBe('session-456');
      expect(storage.sessionHistory).toContain('session-456');
      expect(storage.sessionAccessTimes.has('session-456')).toBe(true);
    });

    test('should add session to history', () => {
      sessionManager.addSessionToHistory('user123', 'session-1');
      sessionManager.addSessionToHistory('user123', 'session-2');

      const storage = sessionManager.sessionStorage.get('user123');
      expect(storage.sessionHistory).toEqual(['session-1', 'session-2']);
    });

    test('should limit session history to 50 sessions', () => {
      // Add 55 sessions
      for (let i = 1; i <= 55; i++) {
        sessionManager.addSessionToHistory('user123', `session-${i}`);
      }

      const storage = sessionManager.sessionStorage.get('user123');
      expect(storage.sessionHistory.length).toBe(50);
      expect(storage.sessionHistory[0]).toBe('session-6'); // First 5 should be removed
      expect(storage.sessionHistory[49]).toBe('session-55');
    });

    test('should not duplicate sessions in history', () => {
      sessionManager.addSessionToHistory('user123', 'session-1');
      sessionManager.addSessionToHistory('user123', 'session-1');

      const storage = sessionManager.sessionStorage.get('user123');
      expect(storage.sessionHistory).toEqual(['session-1']);
    });

    test('should clear current session ID', () => {
      sessionManager.storeSessionId('user123', 'session-456');
      sessionManager.clearCurrentSessionId('user123');

      const storage = sessionManager.sessionStorage.get('user123');
      expect(storage.currentSessionId).toBeNull();
    });

    test('should get session history sorted by access time', () => {
      const storage = {
        currentSessionId: null,
        sessionHistory: ['session-1', 'session-2', 'session-3'],
        sessionAccessTimes: new Map([
          ['session-1', 1000],
          ['session-2', 3000],
          ['session-3', 2000]
        ])
      };
      sessionManager.sessionStorage.set('user123', storage);

      const history = sessionManager.getSessionHistory('user123');
      expect(history).toEqual(['session-2', 'session-3', 'session-1']); // Sorted by access time, newest first
    });

    test('should return empty array for user with no history', () => {
      const history = sessionManager.getSessionHistory('nonexistent');
      expect(history).toEqual([]);
    });
  });

  describe('Config File Persistence', () => {
    beforeEach(() => {
      const fs = require('fs');
      fs.readFileSync.mockReturnValue(JSON.stringify({ existing: 'config' }));
      fs.writeFileSync = jest.fn();
    });

    test('should save session to config file', async () => {
      const fs = require('fs');
      await sessionManager.saveCurrentSessionToConfig('user123', 'session-456');

      expect(fs.readFileSync).toHaveBeenCalledWith('/test/config.json', 'utf8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/config.json',
        expect.stringContaining('"sessionId": "session-456"')
      );
    });

    test('should handle config file read errors', async () => {
      const fs = require('fs');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await sessionManager.saveCurrentSessionToConfig('user123', 'session-456');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error saving session to config'),
        'File not found'
      );

      consoleErrorSpy.mockRestore();
    });

    test('should skip saving if no config file path', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      sessionManager.configFilePath = null;

      await sessionManager.saveCurrentSessionToConfig('user123', 'session-456');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No config file path provided')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Todo Management', () => {
    let session;

    beforeEach(async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockClaudeStreamProcessor.mockImplementation(() => createMockProcessor());
      session = await sessionManager.createUserSession('user123', 'chat456');
    });

    test('should send new todo message if no previous message', async () => {
      const todos = [{ id: '1', content: 'Task 1', status: 'pending' }];

      await sessionManager.handleTodoWrite(session, todos, 'tool1');

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'Todo list'
      );
      expect(session.lastTodos).toBe(todos);
    });

    test('should edit existing todo message if available', async () => {
      const todos = [{ id: '1', content: 'Task 1', status: 'pending' }];
      session.lastTodoMessageId = 456;
      session.lastTodos = [];

      await sessionManager.handleTodoWrite(session, todos, 'tool1');

      expect(mockMainBot.safeEditMessage).toHaveBeenCalledWith(
        'chat456',
        456,
        'Todo list'
      );
      expect(session.lastTodos).toBe(todos);
    });

    test('should send new message if edit fails', async () => {
      const todos = [{ id: '1', content: 'Task 1', status: 'pending' }];
      session.lastTodoMessageId = 456;
      mockMainBot.safeEditMessage.mockRejectedValueOnce(new Error('Edit failed'));

      await sessionManager.handleTodoWrite(session, todos, 'tool1');

      expect(mockMainBot.safeEditMessage).toHaveBeenCalled();
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'Todo list'
      );
    });

    test('should skip update if todos unchanged', async () => {
      const todos = [{ id: '1', content: 'Task 1', status: 'pending' }];
      session.lastTodos = todos;
      mockFormatter.todosChanged.mockReturnValue(false);

      await sessionManager.handleTodoWrite(session, todos, 'tool1');

      expect(mockMainBot.safeSendMessage).not.toHaveBeenCalled();
      expect(mockMainBot.safeEditMessage).not.toHaveBeenCalled();
    });

    test('should handle todo update errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const todos = [{ id: '1', content: 'Task 1', status: 'pending' }];
      mockMainBot.safeSendMessage.mockRejectedValueOnce(new Error('Send failed'));

      await sessionManager.handleTodoWrite(session, todos, 'tool1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error updating todos'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Session Lifecycle Management', () => {
    test('should get user session', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockClaudeStreamProcessor.mockImplementation(() => createMockProcessor());
      const session = await sessionManager.createUserSession('user123', 'chat456');

      const retrievedSession = sessionManager.getUserSession('user123');
      expect(retrievedSession).toBe(session);
    });

    test('should delete user session', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);
      const session = await sessionManager.createUserSession('user123', 'chat456');
      session.sessionId = 'test-session';

      sessionManager.deleteUserSession('user123');

      expect(sessionManager.userSessions.has('user123')).toBe(false);
      expect(mockActiveProcessors.has(mockProcessor)).toBe(false);
      // Should add to history
      const storage = sessionManager.sessionStorage.get('user123');
      expect(storage.sessionHistory).toContain('test-session');
    });

    test('should cleanup all sessions', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockClaudeStreamProcessor.mockImplementation(() => createMockProcessor());
      
      const session1 = await sessionManager.createUserSession('user1', 'chat1');
      const session2 = await sessionManager.createUserSession('user2', 'chat2');
      session1.sessionId = 'session-1';
      session2.sessionId = 'session-2';

      sessionManager.cleanup();

      expect(sessionManager.userSessions.size).toBe(0);
      // Sessions should be preserved in history
      expect(sessionManager.sessionStorage.size).toBe(2);
    });

    test('should cancel user session', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);
      await sessionManager.createUserSession('user123', 'chat456');

      await sessionManager.cancelUserSession('chat456');

      expect(mockProcessor.cancel).toHaveBeenCalled();
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        '❌ **Session cancelled**'
      );
    });

    test('should handle cancel request with no active session', async () => {
      await sessionManager.cancelUserSession('chat456');

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        '⚠️ **No active session to cancel**'
      );
    });

    test('should show session status with active session', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockProcessor.isActive.mockReturnValue(true);
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);
      
      const session = await sessionManager.createUserSession('user123', 'chat456');
      session.sessionId = 'test-session-id';
      session.messageCount = 5;

      await sessionManager.showSessionStatus('chat456');

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        expect.stringContaining('📊 **Session Status**')
      );
    });

    test('should show session status with no session', async () => {
      await sessionManager.showSessionStatus('chat456');

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        '📋 **No active session**\n\nSend a message to start!',
        {}
      );
    });
  });

  describe('Error Handling', () => {
    test('should send error message with formatting', async () => {
      const error = new Error('Test error');

      await sessionManager.sendError('chat456', error);

      expect(mockFormatter.formatError).toHaveBeenCalledWith(error);
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'Error occurred',
        { forceNotification: true }
      );
    });

    test('should handle safeSendMessage errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockMainBot.safeSendMessage.mockRejectedValueOnce(new Error('Send failed'));

      await expect(sessionManager.safeSendMessage('chat456', 'test')).rejects.toThrow('Send failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send message'),
        'Send failed'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('User Model Preferences', () => {
    test('should return null for getUserModel placeholder', () => {
      const model = sessionManager.getUserModel('user123');
      expect(model).toBeNull();
    });
  });

  describe('Safe Send Message Wrapper', () => {
    test('should delegate to main bot safeSendMessage', async () => {
      await sessionManager.safeSendMessage('chat456', 'test message', { option: 'value' });

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'test message',
        { option: 'value' }
      );
    });

    test('should use empty options by default', async () => {
      await sessionManager.safeSendMessage('chat456', 'test message');

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        'test message',
        {}
      );
    });
  });

  describe('Session Statistics', () => {
    test('should return correct stats', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockClaudeStreamProcessor.mockImplementation(() => createMockProcessor());
      
      await sessionManager.createUserSession('user1', 'chat1');
      await sessionManager.createUserSession('user2', 'chat2');
      sessionManager.storeSessionId('user1', 'session-1');
      sessionManager.storeSessionId('user3', 'session-3'); // User with only stored session

      const stats = sessionManager.getStats();
      expect(stats.activeSessions).toBe(2);
      expect(stats.totalUsers).toBe(2); // Only users with active sessions are counted
    });
  });

  describe('Start New Session', () => {
    test('should start new session after canceling existing', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);
      
      // Create existing session
      const existingSession = await sessionManager.createUserSession('user123', 'chat456');
      existingSession.sessionId = 'old-session';

      await sessionManager.startNewSession('chat456');

      expect(mockProcessor.cancel).toHaveBeenCalled();
      expect(mockMainBot.sendSessionInit).toHaveBeenCalled();
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        expect.stringContaining('🆕 **New session started**'),
        expect.objectContaining({ 
          reply_markup: expect.anything()
        })
      );
    });

    test('should start new session when no existing session', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      mockClaudeStreamProcessor.mockImplementation(() => createMockProcessor());

      await sessionManager.startNewSession('chat456');

      expect(mockMainBot.sendSessionInit).toHaveBeenCalled();
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        expect.stringContaining('🆕 **New session started**'),
        expect.objectContaining({ 
          reply_markup: expect.anything()
        })
      );
    });
  });

  describe('End Session', () => {
    test('should end active session', async () => {
      const mockClaudeStreamProcessor = require('../../claude-stream-processor');
      const mockProcessor = createMockProcessor();
      mockClaudeStreamProcessor.mockImplementation(() => mockProcessor);
      
      const session = await sessionManager.createUserSession('user123', 'chat456');
      session.sessionId = 'test-session';
      session.messageCount = 10;

      await sessionManager.endSession('chat456');

      expect(mockProcessor.cancel).toHaveBeenCalled();
      expect(sessionManager.userSessions.has('user123')).toBe(false);
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        expect.stringContaining('🔚 **Session ended**'),
        expect.objectContaining({ 
          reply_markup: expect.anything()
        })
      );
    });

    test('should handle end session with no active session', async () => {
      await sessionManager.endSession('chat456');

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        'chat456',
        '⚠️ **No active session to end**',
        expect.objectContaining({ 
          reply_markup: expect.anything()
        })
      );
    });
  });

  describe('Session Storage Access', () => {
    beforeEach(() => {
      const fs = require('fs');
      // Mock fs to return a config structure that saveCurrentSessionToConfig creates
      fs.readFileSync.mockReturnValue(JSON.stringify({
        projectSessions: {
          '/test/dir': {
            userId: 'user123',
            sessionId: 'session-456'
          }
        }
      }));
      fs.writeFileSync = jest.fn();
    });

    test('should get stored session ID', () => {
      sessionManager.storeSessionId('user123', 'session-456');
      
      const storedId = sessionManager.getStoredSessionId('user123');
      expect(storedId).toBe('session-456');
    });

    test('should return null for non-existent user', () => {
      const storedId = sessionManager.getStoredSessionId('nonexistent');
      expect(storedId).toBeNull();
    });
  });

  describe('Time Formatting Utility', () => {
    test('should format recent times correctly', () => {
      const now = new Date();
      
      expect(sessionManager.getTimeAgo(now.toISOString())).toBe('just now');
      
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(sessionManager.getTimeAgo(fiveMinutesAgo.toISOString())).toBe('5m ago');
      
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(sessionManager.getTimeAgo(twoHoursAgo.toISOString())).toBe('2h ago');
      
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      expect(sessionManager.getTimeAgo(threeDaysAgo.toISOString())).toBe('3d ago');
    });
  });

  describe('Current Directory', () => {
    test('should return working directory', () => {
      const dir = sessionManager.getCurrentDirectory('user123');
      expect(dir).toBe('/test/dir');
    });
  });

  describe('Cumulative Token Tracking', () => {
    const mockSessionsDir = '/mock/sessions';
    
    beforeEach(() => {
      const fs = require('fs');
      
      // Mock file system for session files - using promises interface
      if (!fs.promises) {
        fs.promises = {};
      }
      fs.promises.access = jest.fn();
      fs.promises.readFile = jest.fn();
      
      // Clear token cache before each test
      sessionManager.cumulativeTokenCache.clear();
    });

    test('should parse parent session ID from JSONL file', async () => {
      const fs = require('fs');
      const testSessionId = 'child-session-id';
      const parentSessionId = 'parent-session-id';
      
      // Mock file access and read using promises interface
      fs.promises.access.mockResolvedValue();
      fs.promises.readFile.mockResolvedValue(`{"parentUuid":"${parentSessionId}","sessionId":"${testSessionId}"}\n`);
      
      const result = await sessionManager.getParentSessionId(testSessionId, mockSessionsDir);
      expect(result).toBe(parentSessionId);
    });

    test('should return null for session without parent', async () => {
      const fs = require('fs');
      const testSessionId = 'root-session-id';
      
      // Mock file access and read - no parentUuid using promises interface
      fs.promises.access.mockResolvedValue();
      fs.promises.readFile.mockResolvedValue(`{"sessionId":"${testSessionId}"}\n`);
      
      const result = await sessionManager.getParentSessionId(testSessionId, mockSessionsDir);
      expect(result).toBeNull();
    });

    test('should calculate cumulative tokens from session chain', async () => {
      // Mock sessions: child -> parent -> grandparent
      const childId = 'child-session';
      
      // Mock getSessionTokenUsage for each session
      sessionManager.getSessionTokenUsage = jest.fn()
        .mockImplementation((sessionId) => {
          const tokens = {
            'child-session': { totalInputTokens: 1000, totalOutputTokens: 500, cacheReadTokens: 100, cacheCreationTokens: 50, transactionCount: 5, totalTokens: 1500 },
            'parent-session': { totalInputTokens: 2000, totalOutputTokens: 800, cacheReadTokens: 200, cacheCreationTokens: 100, transactionCount: 8, totalTokens: 2800 },
            'grandparent-session': { totalInputTokens: 1500, totalOutputTokens: 600, cacheReadTokens: 150, cacheCreationTokens: 75, transactionCount: 6, totalTokens: 2100 }
          };
          return Promise.resolve(tokens[sessionId] || null);
        });

      // Mock getParentSessionId chain
      sessionManager.getParentSessionId = jest.fn()
        .mockImplementation((sessionId) => {
          const parents = {
            'child-session': 'parent-session',
            'parent-session': 'grandparent-session',
            'grandparent-session': null
          };
          return Promise.resolve(parents[sessionId] || null);
        });

      const result = await sessionManager.calculateCumulativeTokens(childId, mockSessionsDir);
      
      // Should sum all tokens from the chain
      expect(result.totalInputTokens).toBe(4500); // 1000 + 2000 + 1500
      expect(result.totalOutputTokens).toBe(1900); // 500 + 800 + 600
      expect(result.cacheReadTokens).toBe(450); // 100 + 200 + 150
      expect(result.cacheCreationTokens).toBe(225); // 50 + 100 + 75
      expect(result.transactionCount).toBe(19); // 5 + 8 + 6
      expect(result.totalTokens).toBe(6400); // 1500 + 2800 + 2100
    });

    test('should cache cumulative token results', async () => {
      const testSessionId = 'test-session';
      const mockTokens = {
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        cacheReadTokens: 100,
        cacheCreationTokens: 50,
        transactionCount: 5,
        totalTokens: 1500
      };

      // Mock single session without parents
      sessionManager.getSessionTokenUsage = jest.fn().mockResolvedValue(mockTokens);
      sessionManager.getParentSessionId = jest.fn().mockResolvedValue(null);

      // First call should calculate
      const result1 = await sessionManager.calculateCumulativeTokens(testSessionId, mockSessionsDir);
      expect(result1).toEqual(mockTokens);
      
      // Verify it's cached
      expect(sessionManager.cumulativeTokenCache.has(testSessionId)).toBe(true);
      
      // Second call should use cache
      const result2 = await sessionManager.getCumulativeTokens(testSessionId, mockSessionsDir);
      expect(result2).toEqual(mockTokens);
      
      // Should not have called calculation functions again
      expect(sessionManager.getSessionTokenUsage).toHaveBeenCalledTimes(1);
    });

    test('should handle empty token usage', async () => {
      const testSessionId = 'empty-session';
      
      sessionManager.getSessionTokenUsage = jest.fn().mockResolvedValue(null);
      sessionManager.getParentSessionId = jest.fn().mockResolvedValue(null);

      const result = await sessionManager.calculateCumulativeTokens(testSessionId, mockSessionsDir);
      
      expect(result).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        transactionCount: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      });
    });

    test('should prevent infinite loops in session chains', async () => {
      const sessionA = 'session-a';
      
      // Create circular reference: A -> B -> A
      sessionManager.getParentSessionId = jest.fn()
        .mockImplementation((sessionId) => {
          const parents = {
            'session-a': 'session-b',
            'session-b': 'session-a' // Circular!
          };
          return Promise.resolve(parents[sessionId] || null);
        });

      sessionManager.getSessionTokenUsage = jest.fn()
        .mockResolvedValue({ totalInputTokens: 100, totalOutputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 5, transactionCount: 1, totalTokens: 150 });

      const result = await sessionManager.calculateCumulativeTokens(sessionA, mockSessionsDir);
      
      // Should only process each session once
      expect(result.totalInputTokens).toBe(200); // 100 + 100 (each session counted once)
      expect(sessionManager.getSessionTokenUsage).toHaveBeenCalledTimes(2);
    });
  });
});
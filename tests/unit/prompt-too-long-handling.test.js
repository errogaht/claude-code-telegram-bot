/**
 * Unit Tests for Prompt Too Long Error Handling
 * Tests automatic compact triggering when Claude Code returns "prompt too long" errors
 */

const SessionManager = require('../../SessionManager');
const ClaudeStreamProcessor = require('../../claude-stream-processor');
const EventEmitter = require('events');
const { spawn } = require('child_process');

// Mock dependencies
jest.mock('fs');
jest.mock('child_process');

describe('Prompt Too Long Error Handling', () => {
  let sessionManager;
  let mockFormatter;
  let mockBot;
  let mockMainBot;
  let mockActivityIndicator;
  let mockOptions;
  
  beforeEach(() => {
    // Create mocks
    mockFormatter = {
      formatSessionInit: jest.fn().mockReturnValue('Session started'),
      formatAssistantText: jest.fn().mockReturnValue('Assistant text'),
      formatExecutionResult: jest.fn().mockReturnValue('Execution complete'),
      formatError: jest.fn().mockReturnValue('Error occurred'),
      todosChanged: jest.fn().mockReturnValue(true)
    };
    
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
      editMessageText: jest.fn().mockResolvedValue(true),
      deleteMessage: jest.fn().mockResolvedValue(true),
      pinChatMessage: jest.fn().mockResolvedValue(true)
    };
    
    mockMainBot = {
      safeSendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
      safeEditMessage: jest.fn().mockResolvedValue(true),
      getUserIdFromChat: jest.fn().mockReturnValue('user123'),
      keyboardHandlers: {
        getReplyKeyboardMarkup: jest.fn().mockReturnValue({})
      }
    };
    
    mockActivityIndicator = {
      stop: jest.fn().mockResolvedValue()
    };
    
    mockOptions = {
      configFilePath: '/test/config.json',
      workingDirectory: '/test/project',
      model: 'sonnet'
    };
    
    // Create SessionManager instance
    sessionManager = new SessionManager(
      mockFormatter,
      mockOptions,
      mockBot,
      new Set(),
      mockActivityIndicator,
      mockMainBot
    );
    
    // Clear any existing mocks
    jest.clearAllMocks();
  });

  describe('Error Detection', () => {
    test('should detect "prompt too long" error from Claude Code stderr', () => {
      const processor = new ClaudeStreamProcessor();
      let detectedError = null;
      
      // Listen for the new prompt-too-long event
      processor.on('prompt-too-long', (error) => {
        detectedError = error;
      });
      
      // Simulate stderr with prompt too long error
      const errorMessage = 'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"input length and max_tokens exceed context limit: 187254 + 20000 > 204798, decrease input length or max_tokens and try again"}}';
      
      // This should trigger the new event
      processor._handleStderrData(errorMessage);
      
      expect(detectedError).toBeDefined();
      expect(detectedError.type).toBe('prompt-too-long');
      expect(detectedError.message).toContain('context limit');
    });
    
    test('should detect "prompt too long" error from Claude Code text response with exit code 1', () => {
      const processor = new ClaudeStreamProcessor();
      let detectedError = null;
      
      // Listen for the new prompt-too-long event
      processor.on('prompt-too-long', (error) => {
        detectedError = error;
      });
      
      // Simulate process exit code 1
      processor.processExitCode = 1;
      
      // Simulate text response with "prompt too long" pattern
      const mockMessage = {
        type: 'assistant',
        message: {
          id: 'msg_123',
          content: [
            {
              type: 'text',
              text: 'Prompt is too long. Please reduce the input length and try again.'
            }
          ]
        },
        session_id: 'test-session'
      };
      
      // This should trigger the new event
      processor._emitSpecificEvents(mockMessage);
      
      expect(detectedError).toBeDefined();
      expect(detectedError.type).toBe('prompt-too-long');
      expect(detectedError.message).toContain('Prompt is too long');
      expect(detectedError.sessionId).toBe('test-session');
    });
    
    test('should NOT detect "prompt too long" text without exit code 1', () => {
      const processor = new ClaudeStreamProcessor();
      let detectedError = null;
      let textEvent = null;
      
      processor.on('prompt-too-long', (error) => {
        detectedError = error;
      });
      
      processor.on('assistant-text', (event) => {
        textEvent = event;
      });
      
      // Simulate process exit code 0 (success)
      processor.processExitCode = 0;
      
      // Simulate text response with "prompt too long" pattern
      const mockMessage = {
        type: 'assistant',
        message: {
          id: 'msg_123',
          content: [
            {
              type: 'text',
              text: 'Prompt is too long. Please reduce the input length and try again.'
            }
          ]
        },
        session_id: 'test-session'
      };
      
      // This should NOT trigger prompt-too-long event
      processor._emitSpecificEvents(mockMessage);
      
      expect(detectedError).toBeNull();
      expect(textEvent).toBeDefined();
      expect(textEvent.text).toContain('Prompt is too long');
    });
    
    test('should NOT detect regular errors as prompt too long', () => {
      const processor = new ClaudeStreamProcessor();
      let detectedError = null;
      let genericError = null;
      
      processor.on('prompt-too-long', (error) => {
        detectedError = error;
      });
      
      // Add generic error handler to prevent unhandled error
      processor.on('error', (error) => {
        genericError = error;
      });
      
      // Simulate regular error
      const errorMessage = 'Network error: Connection failed';
      processor._handleStderrData(errorMessage);
      
      expect(detectedError).toBeNull();
      expect(genericError).toBeDefined();
      expect(genericError.message).toBe('Network error: Connection failed');
    });
  });

  describe('Automatic Compact Trigger', () => {
    test('should trigger automatic compact when prompt too long error occurs', async () => {
      const userId = 'user123';
      const chatId = 'chat123';
      const sessionId = 'test-session-id';
      
      // Mock spawn for claude compact command
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      spawn.mockReturnValue(mockProcess);
      
      // Create a session
      const session = await sessionManager.createUserSession(userId, chatId);
      session.sessionId = sessionId;
      
      // Mock the compact command execution
      const compactSpy = jest.spyOn(sessionManager, '_executeClaudeCompact').mockResolvedValue(true);
      
      // Trigger the error handler
      await sessionManager.handleClaudeCodeError(sessionId, {
        type: 'prompt-too-long',
        message: 'context limit exceeded'
      });
      
      // Should send notification about auto-compact
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Auto-compact triggered')
      );
      
      // Should execute compact command
      expect(compactSpy).toHaveBeenCalledWith(sessionId);
    });
    
    test('should send continue button after successful compact', async () => {
      const userId = 'user123';
      const chatId = 'chat123';
      const sessionId = 'test-session-id';
      
      // Create a session
      const session = await sessionManager.createUserSession(userId, chatId);
      session.sessionId = sessionId;
      
      // Mock successful compact
      jest.spyOn(sessionManager, '_executeClaudeCompact').mockResolvedValue(true);
      
      // Trigger the error handler
      await sessionManager.handleClaudeCodeError(sessionId, {
        type: 'prompt-too-long',
        message: 'context limit exceeded'
      });
      
      // Should send message with continue button
      const lastCall = mockMainBot.safeSendMessage.mock.calls[mockMainBot.safeSendMessage.mock.calls.length - 1];
      expect(lastCall[1]).toContain('Auto-compact completed');
      expect(lastCall[2].reply_markup.inline_keyboard).toBeDefined();
      expect(lastCall[2].reply_markup.inline_keyboard[0][0].text).toBe('✅ Продолжить сессию');
    });
  });

  describe('Continue Button Handling', () => {
    test('should handle continue button callback', async () => {
      const userId = 'user123';
      const chatId = 'chat123';
      const messageId = 456;
      const sessionId = 'test-session-id';
      
      // Mock processor for sending continue message
      const mockProcessor = new EventEmitter();
      mockProcessor.continueConversation = jest.fn().mockResolvedValue();
      
      // Create session with processor
      const session = await sessionManager.createUserSession(userId, chatId);
      session.processor = mockProcessor;
      session.sessionId = sessionId;
      
      // Handle continue button callback
      await sessionManager.handleContinueAfterCompact(sessionId, chatId, messageId, userId);
      
      // Should send continue message to Claude
      expect(mockProcessor.continueConversation).toHaveBeenCalledWith('continue', sessionId);
      
      // Should update the button message
      expect(mockBot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Session resumed'),
        expect.objectContaining({
          chat_id: chatId,
          message_id: messageId
        })
      );
    });
  });

  describe('Tool Results Size Calculation', () => {
    test('should calculate tool results size from JSONL content', async () => {
      const sessionId = 'test-session-id';
      
      // Mock fs to return sample JSONL content with tool results
      const fs = require('fs');
      const sampleJsonl = `
        {"type":"user","message":{"content":[{"type":"tool_result","content":"Large tool result content here..."}]}}
        {"type":"assistant","message":{"content":[{"type":"text","text":"Response"}]}}
        {"type":"user","message":{"content":[{"type":"tool_result","content":"Another large result..."}]}}
      `.trim();
      
      fs.readFileSync = jest.fn().mockReturnValue(sampleJsonl);
      fs.promises = {
        ...fs.promises,
        access: jest.fn().mockResolvedValue(),
        readFile: jest.fn().mockResolvedValue(sampleJsonl)
      };
      
      const toolResultsSize = await sessionManager.calculateToolResultsSize(sessionId);
      
      // Should return estimated token count (chars/4)
      expect(toolResultsSize).toBeGreaterThan(0);
      expect(typeof toolResultsSize).toBe('number');
    });
    
    test('should cache tool results size calculation', async () => {
      const sessionId = 'test-session-id';
      
      const fs = require('fs');
      fs.promises = {
        access: jest.fn().mockResolvedValue(),
        readFile: jest.fn().mockResolvedValue('{"type":"user","message":{"content":[{"type":"tool_result","content":"test"}]}}')
      };
      
      // First call
      const size1 = await sessionManager.calculateToolResultsSize(sessionId);
      
      // Second call - should use cache
      const size2 = await sessionManager.calculateToolResultsSize(sessionId);
      
      expect(size1).toBe(size2);
      // File should only be read once due to caching
      expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('Real Context Usage Display', () => {
    test('should show real context usage including tool results', async () => {
      const userId = 'user123';
      const chatId = 'chat123';
      const sessionId = 'test-session-id';
      
      // Create session
      const session = await sessionManager.createUserSession(userId, chatId);
      session.sessionId = sessionId;
      session.tokenUsage = {
        totalInputTokens: 5000,
        totalOutputTokens: 3000,
        cacheReadTokens: 1000,
        transactionCount: 5
      };
      
      // Mock tool results size calculation
      jest.spyOn(sessionManager, 'calculateToolResultsSize').mockResolvedValue(2000);
      
      // Call showSessionStatus
      await sessionManager.showSessionStatus(chatId);
      
      // Should display real context usage
      const statusMessage = mockMainBot.safeSendMessage.mock.calls[0][1];
      expect(statusMessage).toContain('Tool Results:');
      expect(statusMessage).toContain('2,000 tokens');
      
      // Should show higher percentage than just core tokens
      expect(statusMessage).toMatch(/\d+\.\d+%/); // Should show percentage
    });
  });
});
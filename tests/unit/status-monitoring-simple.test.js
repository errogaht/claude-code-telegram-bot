/**
 * Simple Unit Tests for Status Monitoring Features
 * Focused tests for the core functionality
 */

const SessionManager = require('../../SessionManager');

// Mock dependencies
jest.mock('../../claude-stream-processor');
jest.mock('fs');

describe('Status Monitoring - Core Features', () => {
  let sessionManager;
  let mockOptions;
  let mockMainBot;

  beforeEach(() => {
    mockOptions = {
      workingDirectory: '/test/dir',
      model: 'sonnet'
    };

    mockMainBot = {
      safeSendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
      safeEditMessage: jest.fn().mockResolvedValue(true),
      getUserIdFromChat: jest.fn().mockReturnValue('user123'),
      getStoredSessionId: jest.fn().mockReturnValue(null)
    };

    sessionManager = new SessionManager(
      {}, // formatter (not used in these tests)
      mockOptions,
      {}, // bot (not used)
      new Set(), // activeProcessors
      {}, // activityIndicator  
      mockMainBot
    );
  });

  describe('Token Usage Tracking', () => {
    test('should initialize session with token tracking fields', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      
      expect(session.tokenUsage).toBeDefined();
      expect(session.tokenUsage.totalInputTokens).toBe(0);
      expect(session.tokenUsage.totalOutputTokens).toBe(0);
      expect(session.tokenUsage.totalTokens).toBe(0);
      expect(session.tokenUsage.transactionCount).toBe(0);
    });

    test('should update token usage when updateTokenUsage called', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      
      const executionData = {
        usage: {
          input_tokens: 150,
          output_tokens: 300,
          cache_read_input_tokens: 50
        }
      };

      sessionManager.updateTokenUsage(session, executionData);
      
      expect(session.tokenUsage.totalInputTokens).toBe(200); // 150 + 50 cache read
      expect(session.tokenUsage.totalOutputTokens).toBe(300);
      expect(session.tokenUsage.totalTokens).toBe(500);
      expect(session.tokenUsage.transactionCount).toBe(1);
    });

    test('should handle malformed usage data gracefully', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      
      const badData = {
        usage: {
          input_tokens: 'invalid',
          output_tokens: null
        }
      };

      sessionManager.updateTokenUsage(session, badData);
      
      expect(session.tokenUsage.totalTokens).toBe(0);
      expect(session.tokenUsage.transactionCount).toBe(0);
    });
  });

  describe('Activity Tracking', () => {
    test('should initialize session with activity tracking fields', async () => {
      const beforeTime = Date.now();
      const session = await sessionManager.createUserSession('user123', 'chat123');
      const afterTime = Date.now();
      
      expect(session.lastActivityTime).toBeGreaterThanOrEqual(beforeTime);
      expect(session.lastActivityTime).toBeLessThanOrEqual(afterTime);
      expect(session.isStreamActive).toBe(false);
      expect(session.isHealthy).toBe(true);
    });

    test('should update activity when updateSessionActivity called', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      const initialTime = session.lastActivityTime;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      sessionManager.updateSessionActivity(session);
      
      expect(session.lastActivityTime).toBeGreaterThan(initialTime);
      expect(session.isStreamActive).toBe(true);
    });
  });

  describe('Health Monitoring', () => {
    test('should check session health correctly', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      
      // Mock processor as responsive
      session.processor.isResponsive = jest.fn().mockReturnValue(true);
      
      const healthStatus = sessionManager.checkSessionHealth(session);
      
      expect(healthStatus.isHealthy).toBe(true);
      expect(healthStatus.reason).toBe('active and responsive');
      expect(session.isHealthy).toBe(true);
    });

    test('should detect stale activity', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      
      // Simulate old activity (5 minutes ago)
      session.lastActivityTime = Date.now() - (5 * 60 * 1000);
      
      const healthStatus = sessionManager.checkSessionHealth(session);
      
      expect(healthStatus.isHealthy).toBe(false);
      expect(healthStatus.reason).toContain('stale activity');
      expect(session.isHealthy).toBe(false);
    });
  });

  describe('Enhanced Status Display', () => {
    test('should include token usage in status display', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      
      // Add some token usage
      sessionManager.updateTokenUsage(session, {
        usage: { input_tokens: 150, output_tokens: 300 }
      });

      await sessionManager.showSessionStatus('chat123');
      
      const statusCall = mockMainBot.safeSendMessage.mock.calls[0];
      const statusText = statusCall[1];
      
      expect(statusText).toContain('🎯 **Context:**');
      expect(statusText).toContain('450'); // Total tokens
      expect(statusText).toContain('150 in'); // Input tokens
      expect(statusText).toContain('300 out'); // Output tokens
    });

    test('should show health and activity information', async () => {
      await sessionManager.createUserSession('user123', 'chat123');
      
      await sessionManager.showSessionStatus('chat123');
      
      const statusCall = mockMainBot.safeSendMessage.mock.calls[0];
      const statusText = statusCall[1];
      
      expect(statusText).toContain('💚 **Health:**');
      expect(statusText).toContain('⏰ **Last Activity:**');
      expect(statusText).toContain('🔄 **Stream:**');
    });

    test('should work during active processes', async () => {
      const session = await sessionManager.createUserSession('user123', 'chat123');
      
      // Mock active processing
      session.processor.isActive = jest.fn().mockReturnValue(true);
      
      await sessionManager.showSessionStatus('chat123');
      
      // Should not interfere with processing
      expect(session.processor.isActive()).toBe(true);
      expect(mockMainBot.safeSendMessage).toHaveBeenCalled();
      
      const statusCall = mockMainBot.safeSendMessage.mock.calls[0];
      const statusText = statusCall[1];
      expect(statusText).toContain('🔄 Processing');
    });
  });
});
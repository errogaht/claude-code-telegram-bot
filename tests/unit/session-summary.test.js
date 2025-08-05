const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const SessionManager = require('../../SessionManager');

describe('SessionManager - Session Summary Feature', () => {
  let sessionManager;
  let tempSessionsDir;
  let testWorkingDir;

  beforeEach(async () => {
    // Create simple mocks
    const mockBot = {
      safeSendMessage: jest.fn(),
      getUserIdFromChat: jest.fn()
    };
    
    const mockFormatter = {
      formatSessionInit: jest.fn(),
      formatAssistantText: jest.fn(),
      formatTodoWrite: jest.fn(),
      todosChanged: jest.fn()
    };
    
    // Create temporary test directories
    testWorkingDir = '/home/test/project';
    const claudeProjectDir = testWorkingDir.replace(/\//g, '-').replace(/^-/, '');
    tempSessionsDir = path.join(os.tmpdir(), 'claude-test', 'projects', `-${claudeProjectDir}`);
    
    // Ensure test directory exists
    await fs.mkdir(tempSessionsDir, { recursive: true });
    
    sessionManager = new SessionManager(
      mockFormatter,
      { 
        workingDirectory: testWorkingDir,
        model: 'claude-3-sonnet'
      },
      mockBot,
      new Set(),
      { stop: jest.fn() },
      mockBot
    );
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(path.dirname(tempSessionsDir), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getSessionSummary', () => {
    it('should extract summary from Claude Code session file', async () => {
      const sessionId = 'test-session-123';
      const sessionFilePath = path.join(tempSessionsDir, `${sessionId}.jsonl`);
      
      // Create mock session file with summary
      const sessionData = [
        '{"type":"summary","summary":"Fix authentication bug in user login","leafUuid":"12345"}',
        '{"type":"user","message":{"role":"user","content":"I need help fixing a login bug"},"uuid":"67890"}'
      ].join('\n');
      
      await fs.writeFile(sessionFilePath, sessionData);
      
      
      const summary = await sessionManager.getSessionSummary(sessionId, tempSessionsDir);
      expect(summary).toBe('Fix authentication bug in user login');
    });

    it('should fall back to first user message if no summary exists', async () => {
      const sessionId = 'test-session-456';
      const sessionFilePath = path.join(tempSessionsDir, `${sessionId}.jsonl`);
      
      // Create mock session file without summary
      const sessionData = [
        '{"type":"user","message":{"role":"user","content":"Help me implement a new feature for handling user preferences"},"uuid":"67890"}'
      ].join('\n');
      
      await fs.writeFile(sessionFilePath, sessionData);
      
      const summary = await sessionManager.getSessionSummary(sessionId, tempSessionsDir);
      expect(summary).toBe('Help me implement a new feature for handling user preference...');
    });

    it('should skip command metadata messages', async () => {
      const sessionId = 'test-session-789';
      const sessionFilePath = path.join(tempSessionsDir, `${sessionId}.jsonl`);
      
      // Create mock session file with command metadata first
      const sessionData = [
        '{"type":"user","message":{"role":"user","content":"<command-name>/status</command-name>"},"uuid":"111"}',
        '{"type":"user","message":{"role":"user","content":"Debug the payment processing issue"},"uuid":"222"}'
      ].join('\n');
      
      await fs.writeFile(sessionFilePath, sessionData);
      
      const summary = await sessionManager.getSessionSummary(sessionId, tempSessionsDir);
      expect(summary).toBe('Debug the payment processing issue');
    });

    it('should handle array content in user messages', async () => {
      const sessionId = 'test-session-array';
      const sessionFilePath = path.join(tempSessionsDir, `${sessionId}.jsonl`);
      
      // Create mock session file with array content
      const sessionData = [
        '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Analyze this code structure"}]},"uuid":"333"}'
      ].join('\n');
      
      await fs.writeFile(sessionFilePath, sessionData);
      
      const summary = await sessionManager.getSessionSummary(sessionId, tempSessionsDir);
      expect(summary).toBe('Analyze this code structure');
    });

    it('should return null if session file does not exist', async () => {
      const summary = await sessionManager.getSessionSummary('non-existent-session');
      expect(summary).toBeNull();
    });

    it('should return null for empty or invalid session ID', async () => {
      expect(await sessionManager.getSessionSummary('')).toBeNull();
      expect(await sessionManager.getSessionSummary(null)).toBeNull();
      expect(await sessionManager.getSessionSummary(undefined)).toBeNull();
    });
  });

  // Status display tests removed for now - focus on core functionality
});
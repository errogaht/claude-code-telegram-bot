/**
 * Input Summary Service Tests
 */

const InputSummaryService = require('../../InputSummaryService');

// Mock the ClaudeStreamProcessor
jest.mock('../../claude-stream-processor', () => {
  return jest.fn().mockImplementation(() => ({
    startNewConversation: jest.fn(),
    on: jest.fn(),
    options: { model: 'sonnet', verbose: false }
  }));
});

describe('InputSummaryService', () => {
  let summaryService;
  let mockProcessor;

  beforeEach(() => {
    summaryService = new InputSummaryService();
    mockProcessor = summaryService.processor;
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct options', () => {
      expect(summaryService.processor).toBeDefined();
      expect(summaryService.processor.options).toEqual({
        model: 'sonnet',
        verbose: false
      });
    });
  });

  describe('createSummaryPrompt', () => {
    it('should create proper prompt with context', () => {
      const userInput = 'Please help me fix this bug in my React component';
      const prompt = summaryService.createSummaryPrompt(userInput);
      
      expect(prompt).toContain('Telegram bot create summaries');
      expect(prompt).toContain(userInput);
      expect(prompt).toContain('JSON format');
      expect(prompt).toContain('"summary"');
    });

    it('should handle multiline user input', () => {
      const userInput = `I have a problem with my code:
      
function test() {
  return null;
}

Can you help me fix this?`;
      
      const prompt = summaryService.createSummaryPrompt(userInput);
      expect(prompt).toContain(userInput);
    });
  });

  describe('fallbackSummary', () => {
    it('should return short messages as-is', () => {
      const shortInput = 'Fix bug';
      const summary = summaryService.fallbackSummary(shortInput);
      
      expect(summary).toBe(shortInput);
    });

    it('should return first line for medium messages', () => {
      const mediumInput = 'Please help me fix this React component that has multiple issues with state management';
      const summary = summaryService.fallbackSummary(mediumInput);
      
      expect(summary).toBe(mediumInput); // Single line, so returns first line (which is the whole message)
    });

    it('should return first non-empty line for long messages', () => {
      const longInput = 'First line here\n\nSecond line with more details\nThird line';
      const summary = summaryService.fallbackSummary(longInput);
      
      expect(summary).toBe('First line here');
    });

    it('should handle very long single line messages', () => {
      const veryLongInput = Array(300).fill('a').join('');
      const summary = summaryService.fallbackSummary(veryLongInput);
      
      expect(summary.length).toBeLessThanOrEqual(200);
    });
  });

  describe('generateSummary', () => {
    it('should handle successful Claude response with JSON', async () => {
      const userInput = 'Help me debug this React component';
      const mockResponse = '{"summary": "User needs help debugging a React component"}';
      
      // Mock successful process
      mockProcessor.startNewConversation.mockResolvedValue({});
      
      // Mock event listeners - simulate successful response
      let outputCallback, exitCallback;
      mockProcessor.on.mockImplementation((event, callback) => {
        if (event === 'output') outputCallback = callback;
        if (event === 'exit') exitCallback = callback;
      });
      
      const summaryPromise = summaryService.generateSummary(userInput);
      
      // Simulate Claude response
      setTimeout(() => {
        outputCallback({ type: 'text', content: mockResponse });
        exitCallback(0);
      }, 10);
      
      const result = await summaryPromise;
      expect(result).toBe('User needs help debugging a React component');
    });

    it('should handle Claude response without JSON', async () => {
      const userInput = 'Help with CSS';
      const mockResponse = 'User needs help with CSS styling issues';
      
      mockProcessor.startNewConversation.mockResolvedValue({});
      
      let outputCallback, exitCallback;
      mockProcessor.on.mockImplementation((event, callback) => {
        if (event === 'output') outputCallback = callback;
        if (event === 'exit') exitCallback = callback;
      });
      
      const summaryPromise = summaryService.generateSummary(userInput);
      
      setTimeout(() => {
        outputCallback({ type: 'text', content: mockResponse });
        exitCallback(0);
      }, 10);
      
      const result = await summaryPromise;
      expect(result).toBe(mockResponse);
    });

    it('should fallback on Claude process error', async () => {
      const userInput = 'Test error handling';
      
      mockProcessor.startNewConversation.mockResolvedValue({});
      
      let errorCallback;
      mockProcessor.on.mockImplementation((event, callback) => {
        if (event === 'error') errorCallback = callback;
      });
      
      const summaryPromise = summaryService.generateSummary(userInput);
      
      setTimeout(() => {
        errorCallback(new Error('Claude process failed'));
      }, 10);
      
      const result = await summaryPromise;
      expect(result).toBe('Test error handling');
    });

    it('should fallback on timeout', async () => {
      const userInput = 'Test timeout';
      
      mockProcessor.startNewConversation.mockResolvedValue({});
      mockProcessor.on.mockImplementation(() => {}); // No callbacks triggered
      
      // Mock setTimeout to trigger immediately for testing
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = (fn) => fn();
      
      const result = await summaryService.generateSummary(userInput);
      
      global.setTimeout = originalSetTimeout;
      expect(result).toBe('Test timeout');
    });

    it('should fallback on startNewConversation error', async () => {
      const userInput = 'Test start error';
      
      mockProcessor.startNewConversation.mockRejectedValue(new Error('Start failed'));
      
      const result = await summaryService.generateSummary(userInput);
      expect(result).toBe('Test start error');
    });
  });
});
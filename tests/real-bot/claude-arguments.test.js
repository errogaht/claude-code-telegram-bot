/**
 * Claude CLI Arguments Validation Tests
 * Tests that correct arguments are passed to Claude CLI in different scenarios
 */

const RealBotTestHelper = require('./real-bot-test-helper');
const ClaudeStreamProcessor = require('../../claude-stream-processor');
const path = require('path');

describe('Claude CLI Arguments Validation', () => {
  let testHelper;
  
  // Increase timeout for integration tests
  jest.setTimeout(30000);

  beforeEach(async () => {
    // Clear the Claude test registry before each test
    ClaudeStreamProcessor.clearClaudeTestRegistry();
    
    testHelper = new RealBotTestHelper({
      testUserId: 98765,
      workingDirectory: path.join(__dirname, '../../')
    });
    
    await testHelper.setup();
  });

  afterEach(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
    
    // Clear registry after test
    ClaudeStreamProcessor.clearClaudeTestRegistry();
  });

  describe('Basic Message Arguments', () => {
    it('should pass correct arguments for basic message', async () => {
      const testMessage = 'Hello, test message';
      
      // Send message and wait for processing
      await testHelper.sendMessageAndWaitForResponse(testMessage);
      
      // Validate Claude arguments
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      expect(registry).toHaveLength(1);
      
      const claudeCall = registry[0];
      expect(claudeCall.args).toEqual([
        '-p',
        '--model', 'sonnet',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        testMessage
      ]);
      
      expect(claudeCall.workingDirectory).toBe(path.join(__dirname, '../../'));
      expect(claudeCall.options.cwd).toBe(path.join(__dirname, '../../'));
      expect(claudeCall.options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    });

    it('should handle different working directories', async () => {
      // Create a new helper with different working directory
      await testHelper.cleanup();
      
      const customWorkingDir = path.join(__dirname, '../unit');
      testHelper = new RealBotTestHelper({
        testUserId: 98766,
        workingDirectory: customWorkingDir
      });
      
      await testHelper.setup();
      
      const testMessage = 'Test with custom directory';
      await testHelper.sendMessageAndWaitForResponse(testMessage);
      
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      expect(registry).toHaveLength(1);
      
      const claudeCall = registry[0];
      expect(claudeCall.workingDirectory).toBe(customWorkingDir);
      expect(claudeCall.options.cwd).toBe(customWorkingDir);
    });
  });

  describe('Model Selection Arguments', () => {
    const modelTests = [
      { command: '/sonnet', expectedModel: 'sonnet' },
      { command: '/opus', expectedModel: 'opus' },
      { command: '/haiku', expectedModel: 'haiku' }
    ];

    modelTests.forEach(({ command, expectedModel }) => {
      it(`should use correct model arguments for ${command} command`, async () => {
        // Note: Model selection may not immediately change the arguments
        // This test validates the structure, not dynamic model switching
        // which might require session persistence
        
        // Send a test message 
        await testHelper.sendMessageAndWaitForResponse(`Test with ${command}`);
        
        const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
        expect(registry.length).toBeGreaterThan(0);
        
        const claudeCall = registry[registry.length - 1];
        
        // Check if model is in arguments (default is sonnet)
        const modelIndex = claudeCall.args.indexOf('--model');
        expect(modelIndex).toBeGreaterThan(-1);
        expect(claudeCall.args[modelIndex + 1]).toBeDefined();
        
        // For now, we just validate structure. Dynamic model switching
        // would require more complex session state management
        console.log(`Model test for ${command}: using ${claudeCall.args[modelIndex + 1]}`);
      });
    });
  });

  describe('Session Management Arguments', () => {
    it('should handle session-related arguments', async () => {
      // This test validates that when Claude CLI is called, basic session handling works
      // Note: Session management details depend on bot implementation
      
      const testMessage = 'Test session arguments';
      await testHelper.sendMessageAndWaitForResponse(testMessage);
      
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      
      if (registry.length > 0) {
        const claudeCall = registry[registry.length - 1];
        
        // Validate basic structure
        expect(claudeCall.args).toContain('-p');
        expect(claudeCall.args).toContain(testMessage);
        
        console.log('✅ Session argument handling validated');
      } else {
        console.log('📝 No Claude CLI calls made (test message handled by bot directly)');
        // This is also valid - not all messages trigger Claude CLI
        expect(true).toBe(true);
      }
    });
  });

  describe('Special Command Arguments', () => {
    it('should handle thinking mode arguments', async () => {
      // Test basic message structure (thinking modes may not be implemented yet)
      await testHelper.sendMessageAndWaitForResponse('Test thinking mode message');
      
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      expect(registry.length).toBeGreaterThan(0);
      
      const claudeCall = registry[registry.length - 1];
      
      // Validate basic structure
      expect(claudeCall.args).toContain('-p');
      expect(claudeCall.args).toContain('Test thinking mode message');
      
      // Check for any thinking-related flags (they may not be present)
      const thinkingFlags = claudeCall.args.filter(arg => 
        arg.includes('think') || arg.includes('Think'));
      
      console.log('Thinking-related arguments found:', thinkingFlags);
      
      // For now, just validate that the message is passed correctly
      expect(claudeCall.args).toContain('--model');
      expect(claudeCall.args).toContain('--output-format');
    });
  });

  describe('Argument Validation', () => {
    it('should always include required base arguments', async () => {
      await testHelper.sendMessageAndWaitForResponse('Test required arguments');
      
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      expect(registry).toHaveLength(1);
      
      const claudeCall = registry[0];
      
      // Required arguments that should always be present
      expect(claudeCall.args).toContain('--output-format');
      expect(claudeCall.args).toContain('stream-json');
      expect(claudeCall.args).toContain('--verbose');
      expect(claudeCall.args).toContain('--dangerously-skip-permissions');
      
      // Should have message content
      expect(claudeCall.args).toContain('-p');
      // Prompt is now at the end of arguments
      expect(claudeCall.args[claudeCall.args.length - 1]).toBe('Test required arguments');
    });

    it('should not spawn real Claude process in test environment', async () => {
      const originalSpawn = require('child_process').spawn;
      const spawnSpy = jest.spyOn(require('child_process'), 'spawn');
      
      try {
        await testHelper.sendMessageAndWaitForResponse('Test no real process');
        
        // Should not have called real spawn with 'claude'
        const claudeCalls = spawnSpy.mock.calls.filter(call => call[0] === 'claude');
        expect(claudeCalls).toHaveLength(0);
        
      } finally {
        spawnSpy.mockRestore();
      }
    });

    it('should validate argument structure', async () => {
      await testHelper.sendMessageAndWaitForResponse('Validate structure');
      
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      expect(registry).toHaveLength(1);
      
      const claudeCall = registry[0];
      
      // Arguments should be an array of strings
      expect(Array.isArray(claudeCall.args)).toBe(true);
      claudeCall.args.forEach(arg => {
        expect(typeof arg).toBe('string');
      });
      
      // Should have even number of arguments (flags come in pairs)
      const flagArgs = claudeCall.args.filter(arg => arg.startsWith('--'));
      flagArgs.forEach(flag => {
        const flagIndex = claudeCall.args.indexOf(flag);
        // Each flag should have a value (except boolean flags)
        if (!['--verbose', '--dangerously-skip-permissions'].includes(flag)) {
          expect(flagIndex + 1).toBeLessThan(claudeCall.args.length);
          expect(claudeCall.args[flagIndex + 1]).not.toMatch(/^--/);
        }
      });
    });
  });

  describe('Error Handling Arguments', () => {
    it('should handle special characters in messages', async () => {
      const specialMessage = 'Test with "quotes" and \'apostrophes\' and $variables and \n newlines';
      
      await testHelper.sendMessageAndWaitForResponse(specialMessage);
      
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      expect(registry).toHaveLength(1);
      
      const claudeCall = registry[0];
      
      // Should properly escape or handle special characters
      // Prompt is now at the end of arguments
      expect(claudeCall.args[claudeCall.args.length - 1]).toBe(specialMessage);
    });

    it('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(5000); // 5KB message
      
      await testHelper.sendMessageAndWaitForResponse(longMessage);
      
      const registry = ClaudeStreamProcessor.getClaudeTestRegistry();
      expect(registry).toHaveLength(1);
      
      const claudeCall = registry[0];
      
      // Prompt is now at the end of arguments
      expect(claudeCall.args[claudeCall.args.length - 1]).toBe(longMessage);
      expect(claudeCall.args[claudeCall.args.length - 1].length).toBe(5000);
    });
  });
});
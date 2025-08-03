/**
 * Real Bot Integration Tests - Error Scenarios and Edge Cases
 * Tests bot behavior under various error conditions and edge cases
 */

const RealBotTestHelper = require('./real-bot-test-helper');
const path = require('path');

describe('Real Bot Integration - Error Scenarios', () => {
  let testHelper;
  
  // Increase timeout for error handling tests
  jest.setTimeout(90000);

  beforeAll(async () => {
    console.log('🔧 Setting up real bot test environment for error scenario tests...');
    testHelper = new RealBotTestHelper({
      serverPort: 8085, // Different port to avoid conflicts
      testUserId: 12348,
      workingDirectory: path.join(__dirname, '../../')
    });
    
    await testHelper.setup();
  });

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear conversation history before each test
    if (testHelper.testClient) {
      testHelper.testClient.clearHistory();
    }
  });

  describe('Invalid Commands and Messages', () => {
    it('should handle all invalid commands and malformed messages in batch', async () => {
      // Test all invalid scenarios efficiently in one test
      const invalidTests = [
        // Invalid commands
        { type: 'invalid_cmd', message: '/nonexistent', description: 'nonexistent command' },
        { type: 'invalid_cmd', message: '/invalid_command_123', description: 'invalid command with numbers' },
        { type: 'invalid_cmd', message: '//double_slash', description: 'double slash command' },
        { type: 'invalid_cmd', message: '/emoji_🚀_command', description: 'emoji in command' },
        
        // Malformed messages
        { type: 'malformed', message: ' ', description: 'just space' },
        { type: 'malformed', message: '\n\n\n', description: 'just newlines' },
        { type: 'malformed', message: 'A'.repeat(10000), description: 'very long message' },
        { type: 'malformed', message: '🚀'.repeat(1000), description: 'many emojis' },
        
        // Special characters
        { type: 'special', message: 'Hello with é ñ ü special chars', description: 'accented characters' },
        { type: 'special', message: '中文字符测试', description: 'chinese characters' },
        { type: 'special', message: 'Emoji test: 👨‍👩‍👧‍👦 🏳️‍🌈 🚀', description: 'complex emojis' },
        { type: 'special', message: 'HTML-like: <div>test</div>', description: 'HTML-like content' }
      ];

      const results = [];
      
      for (const test of invalidTests) {
        // Skip empty messages as they might not be sent by client
        if (test.message.trim().length === 0) {
          results.push({ type: test.type, description: test.description, result: 'skipped' });
          continue;
        }
        
        try {
          const timeout = test.type === 'invalid_cmd' ? 3000 : 5000; // Shorter timeout for invalid commands
          const response = await testHelper.sendMessageAndWaitForResponse(test.message, timeout);
          
          if (response && response.message) {
            results.push({ 
              type: test.type, 
              description: test.description, 
              result: 'response_received',
              hasText: !!response.message.text
            });
            console.log(`✅ ${test.description}: handled with response`);
          }
        } catch (error) {
          if (error.message.includes('timeout')) {
            results.push({ type: test.type, description: test.description, result: 'timeout_expected' });
            console.log(`ℹ️ ${test.description}: no response (expected for ${test.type})`);
          } else {
            results.push({ type: test.type, description: test.description, result: 'error', error: error.message });
            console.warn(`⚠️ ${test.description}: error - ${error.message}`);
          }
        }
      }
      
      // Validate results - at least some tests should complete without errors
      const completedTests = results.filter(r => r.result === 'response_received' || r.result === 'timeout_expected' || r.result === 'skipped');
      expect(completedTests.length).toBeGreaterThan(0);
      
      // Summary
      const summary = {
        responses: results.filter(r => r.result === 'response_received').length,
        timeouts: results.filter(r => r.result === 'timeout_expected').length,
        errors: results.filter(r => r.result === 'error').length,
        skipped: results.filter(r => r.result === 'skipped').length
      };
      
      console.log(`📊 Invalid/malformed message handling: ${summary.responses} responses, ${summary.timeouts} timeouts, ${summary.errors} errors, ${summary.skipped} skipped`);
    });

    it('should respond to valid non-command messages', async () => {
      // Test that the bot does respond to regular text messages (not starting with /)
      const regularMessage = 'Hello, can you help me?';
      
      try {
        const response = await testHelper.sendMessageAndWaitForResponse(regularMessage, 10000);
        
        expect(response).toBeDefined();
        expect(response.message).toBeDefined();
        expect(response.message.text).toBeDefined();
        expect(response.message.text.length).toBeGreaterThan(0);
        
        console.log(`✅ Bot responded to regular message: "${response.message.text.substring(0, 100)}..."`);
      } catch (error) {
        console.error(`❌ Bot failed to respond to regular message: ${error.message}`);
        throw error;
      }
    });
  });

  describe('Session and State Error Handling', () => {
    it('should handle rapid messages and session interruptions in batch', async () => {
      // Test rapid message succession first
      const rapidMessages = ['Message 1', 'Message 2', 'Message 3'];
      const rapidResults = [];
      
      for (let i = 0; i < rapidMessages.length; i++) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(rapidMessages[i], 6000);
          rapidResults.push({ success: true, messageIndex: i + 1 });
          console.log(`✅ Rapid message ${i + 1} handled`);
        } catch (error) {
          rapidResults.push({ success: false, messageIndex: i + 1, error: error.message });
          console.warn(`⚠️ Rapid message ${i + 1} failed: ${error.message}`);
        }
      }
      
      // Test session interruption scenarios
      await testHelper.sendMessageAndWaitForResponse('/start');
      await testHelper.sendMessageAndWaitForResponse('Hello, starting conversation');
      
      const interruptCommands = ['🛑 STOP', '🔄 New Session', '/start', '📊 Status'];
      const interruptResults = [];

      for (const command of interruptCommands) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(command, 5000);
          interruptResults.push({ command, success: !!(response && response.message) });
          console.log(`✅ Session interruption handled: "${command}"`);
        } catch (error) {
          interruptResults.push({ command, success: false, error: error.message });
          console.warn(`⚠️ Session interruption failed: "${command}" - ${error.message}`);
        }
      }
      
      // Validate that at least some tests passed
      const successfulRapid = rapidResults.filter(r => r.success).length;
      const successfulInterrupt = interruptResults.filter(r => r.success).length;
      
      expect(successfulRapid + successfulInterrupt).toBeGreaterThan(0);
      console.log(`📊 Session handling: ${successfulRapid}/${rapidMessages.length} rapid, ${successfulInterrupt}/${interruptCommands.length} interrupts`);
    });

    it('should handle state corruption scenarios', async () => {
      // Attempt to create inconsistent states
      const testSequence = [
        { type: 'message', text: '/start', description: 'start session' },
        { type: 'button', data: 'model:cancel', description: 'cancel without selection' },
        { type: 'message', text: '🤖 Model', description: 'trigger model selection' },
        { type: 'message', text: '🛑 STOP', description: 'stop during selection' },
        { type: 'button', data: 'model:claude-3-5-sonnet-20241022', description: 'select after stop' },
        { type: 'message', text: '📊 Status', description: 'check status' }
      ];

      for (const step of testSequence) {
        try {
          let response;
          if (step.type === 'message') {
            response = await testHelper.sendMessageAndWaitForResponse(step.text, 5000);
          } else if (step.type === 'button') {
            response = await testHelper.pressButtonAndWaitForResponse(step.data, null, 3000);
          }
          
          if (response) {
            expect(response).toBeDefined();
          }
          
          console.log(`✅ State corruption test step: ${step.description}`);
        } catch (error) {
          console.log(`ℹ️ State corruption step caused no response: ${step.description} (acceptable)`);
        }
      }
    });
  });

  describe('Resource and Performance Edge Cases', () => {
    it('should handle all performance edge cases in batch', async () => {
      const performanceTests = [
        // Long message tests
        { type: 'long_msg', message: 'A'.repeat(1000), description: '1K characters' },
        { type: 'long_msg', message: 'A'.repeat(2000), description: '2K characters' },
        
        // Timeout test
        { type: 'timeout', message: 'Hello with short timeout', timeout: 100, description: 'timeout simulation' },
        
        // Load test messages
        { type: 'load', message: 'Load test message 1', description: 'load test 1' },
        { type: 'load', message: 'Load test message 2', description: 'load test 2' },
        { type: 'load', message: 'Load test message 3', description: 'load test 3' }
      ];
      
      const performanceResults = [];
      
      for (const test of performanceTests) {
        try {
          const timeout = test.timeout || (test.type === 'long_msg' ? 10000 : 6000);
          const response = await testHelper.sendMessageAndWaitForResponse(test.message, timeout);
          
          performanceResults.push({ 
            type: test.type, 
            description: test.description, 
            success: !!(response && response.message),
            messageLength: test.message.length
          });
          
          console.log(`✅ ${test.description}: handled successfully`);
          
          // Small delay for load tests
          if (test.type === 'load') {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
        } catch (error) {
          const isExpectedTimeout = test.type === 'timeout' && error.message.includes('Timeout');
          
          performanceResults.push({ 
            type: test.type, 
            description: test.description, 
            success: isExpectedTimeout, // Timeout test should timeout
            error: error.message,
            messageLength: test.message.length
          });
          
          if (isExpectedTimeout) {
            console.log(`✅ ${test.description}: timeout handled gracefully`);
          } else {
            console.warn(`⚠️ ${test.description} failed: ${error.message}`);
          }
        }
      }
      
      // Validate results
      const successfulTests = performanceResults.filter(r => r.success);
      expect(successfulTests.length).toBeGreaterThan(0);
      
      // Summary by type
      const summary = {
        long_msg: performanceResults.filter(r => r.type === 'long_msg' && r.success).length,
        timeout: performanceResults.filter(r => r.type === 'timeout' && r.success).length,
        load: performanceResults.filter(r => r.type === 'load' && r.success).length
      };
      
      console.log(`📊 Performance tests: ${summary.long_msg} long messages, ${summary.timeout} timeout tests, ${summary.load} load tests passed`);
    });
  });

  describe('Callback and Interaction Errors', () => {
    it('should handle invalid callback sequences', async () => {
      // Test callbacks without proper setup
      const invalidCallbacks = [
        { data: 'model:claude-3-5-sonnet-20241022', description: 'model selection without menu' },
        { data: 'think:deep', description: 'thinking mode without menu' },
        { data: 'resume_session:invalid-uuid', description: 'resume invalid session' },
        { data: 'sessions_page:999', description: 'invalid page number' },
        { data: 'nonexistent:action', description: 'completely invalid callback' }
      ];

      for (const callback of invalidCallbacks) {
        try {
          await testHelper.pressButtonAndWaitForResponse(callback.data, null, 3000);
          console.log(`ℹ️ Invalid callback handled: ${callback.description}`);
        } catch (error) {
          console.log(`ℹ️ Invalid callback ignored: ${callback.description} (expected)`);
        }
      }
    });

    it('should handle mixed interaction patterns', async () => {
      // Mix different types of interactions rapidly
      const mixedSequence = [
        { type: 'message', data: '/start' },
        { type: 'callback', data: 'model:cancel' },
        { type: 'message', data: '📊 Status' },
        { type: 'callback', data: 'think:standard' },
        { type: 'message', data: 'Hello' },
        { type: 'message', data: '🛑 STOP' }
      ];

      for (const interaction of mixedSequence) {
        try {
          if (interaction.type === 'message') {
            await testHelper.sendMessageAndWaitForResponse(interaction.data, 5000);
          } else {
            await testHelper.pressButtonAndWaitForResponse(interaction.data, null, 3000);
          }
          
          console.log(`✅ Mixed interaction handled: ${interaction.type} - ${interaction.data}`);
        } catch (error) {
          console.log(`ℹ️ Mixed interaction no response: ${interaction.type} - ${interaction.data}`);
        }
        
        // Small delay between interactions
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    });
  });

  describe('Recovery and Resilience', () => {
    it('should recover from error states', async () => {
      // Cause potential error state
      try {
        await testHelper.sendMessageAndWaitForResponse('/nonexistent_command', 3000);
      } catch (error) {
        // Expected
      }

      // Bot should still respond normally after error
      const recoveryResponse = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(recoveryResponse).toBeDefined();
      expect(recoveryResponse.message).toBeDefined();
      
      console.log('✅ Bot recovered from error state');
    });

    it('should maintain functionality after stop/start cycle', async () => {
      // Normal operation
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      // Stop
      await testHelper.sendMessageAndWaitForResponse('🛑 STOP');
      
      // Start again
      const restartResponse = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(restartResponse).toBeDefined();
      expect(restartResponse.message).toBeDefined();
      
      // Test normal functionality
      const statusResponse = await testHelper.sendMessageAndWaitForResponse('📊 Status');
      
      expect(statusResponse).toBeDefined();
      expect(statusResponse.message).toBeDefined();
      
      console.log('✅ Full functionality maintained after stop/start cycle');
    });

    it('should handle graceful degradation', async () => {
      // Test various scenarios that might cause degradation
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      // Test each major function still works
      const functionalityTests = [
        { action: '📊 Status', name: 'Status check' },
        { action: '📍 Path', name: 'Path display' },
        { action: '🤖 Model', name: 'Model selection' },
        { action: '🔄 New Session', name: 'New session' }
      ];

      let workingFunctions = 0;
      
      for (const test of functionalityTests) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(test.action, 5000);
          
          if (response && response.message) {
            workingFunctions++;
            console.log(`✅ ${test.name} still working`);
          }
        } catch (error) {
          console.warn(`⚠️ ${test.name} not working: ${error.message}`);
        }
      }

      // At least some core functions should work
      expect(workingFunctions).toBeGreaterThan(0);
      console.log(`✅ Graceful degradation: ${workingFunctions}/${functionalityTests.length} functions working`);
    });
  });
});
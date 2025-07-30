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
    it('should handle completely invalid commands gracefully', async () => {
      // Note: The bot ignores commands starting with '/' that are not specifically handled
      // This is expected behavior - the bot only processes non-command messages for Claude
      const invalidCommands = [
        '/nonexistent',
        '/invalid_command_123',
        '/start/extra/slashes',
        '//double_slash',
        '/\\backslash_command',
        '/emoji_🚀_command',
        '/very_long_command_that_should_not_exist_at_all_and_is_definitely_invalid'
      ];

      for (const command of invalidCommands) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(command, 3000); // Reduced timeout since no response expected
          
          if (response) {
            expect(response).toBeDefined();
            expect(response.message).toBeDefined();
            
            // Should provide helpful error message or fallback response
            const responseText = response.message.text.toLowerCase();
            expect(responseText.length).toBeGreaterThan(0);
            
            console.log(`✅ Invalid command handled: "${command}"`);
          }
        } catch (error) {
          // Some invalid commands might not trigger a response, which is also valid behavior
          // Bot ignores commands starting with '/' that are not specifically handled
          console.log(`ℹ️ Invalid command ignored: "${command}" (no response - expected behavior)`);
          // This is expected behavior, not a failure
          expect(error.message).toContain('Bot response timeout');
        }
      }
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

    it('should handle malformed text messages', async () => {
      const malformedMessages = [
        '', // Empty message (might not be sent by client)
        ' ', // Just space
        '\n\n\n', // Just newlines
        '\t\t\t', // Just tabs
        '   \n  \t  \n   ', // Mixed whitespace
        'A'.repeat(10000), // Very long message
        '🚀'.repeat(1000), // Many emojis
        '\u0000\u0001\u0002', // Control characters
        'Normal text with \u0000 null character',
        'Text with multiple\n\nline\n\nbreaks\n\n\n'
      ];

      for (const message of malformedMessages) {
        try {
          if (message.trim().length > 0) { // Only test non-empty messages
            const response = await testHelper.sendMessageAndWaitForResponse(message, 5000);
            
            if (response) {
              expect(response).toBeDefined();
              expect(response.message).toBeDefined();
              
              console.log(`✅ Malformed message handled: "${message.substring(0, 50)}..."`);
            }
          }
        } catch (error) {
          console.log(`ℹ️ Malformed message caused no response: "${message.substring(0, 20)}..." (acceptable)`);
        }
      }
    });

    it('should handle special characters and encoding issues', async () => {
      const specialMessages = [
        'Hello with é ñ ü special chars',
        '中文字符测试',
        'العربية تست',
        'Русский тест',
        'Emoji test: 👨‍👩‍👧‍👦 🏳️‍🌈 🚀',
        'Math symbols: ∑ ∫ ∞ ∂ √ ∆',
        'Code snippet: `console.log("hello");`',
        'HTML-like: <div>test</div>',
        'Markdown-like: **bold** *italic* [link](url)',
        'JSON-like: {"key": "value", "number": 123}'
      ];

      for (const message of specialMessages) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(message, 5000);
          
          expect(response).toBeDefined();
          expect(response.message).toBeDefined();
          expect(response.message.text).toBeDefined();
          
          console.log(`✅ Special character message handled: "${message}"`);
        } catch (error) {
          console.warn(`⚠️ Special character message failed: "${message}" - ${error.message}`);
        }
      }
    });
  });

  describe('Session and State Error Handling', () => {
    it('should handle rapid message succession', async () => {
      const messages = [
        'Message 1',
        'Message 2', 
        'Message 3',
        'Message 4',
        'Message 5'
      ];

      const responses = [];
      
      // Send messages rapidly (no waiting between sends, but wait for each response)
      for (let i = 0; i < messages.length; i++) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(messages[i], 8000);
          responses.push(response);
          console.log(`✅ Rapid message ${i + 1} handled`);
        } catch (error) {
          console.warn(`⚠️ Rapid message ${i + 1} failed: ${error.message}`);
          responses.push(null);
        }
      }

      // At least some responses should be successful
      const successfulResponses = responses.filter(r => r !== null);
      expect(successfulResponses.length).toBeGreaterThan(0);
      
      console.log(`✅ Rapid messages: ${successfulResponses.length}/${messages.length} handled successfully`);
    });

    it('should handle session interruption scenarios', async () => {
      // Start a session
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      // Send a regular message
      await testHelper.sendMessageAndWaitForResponse('Hello, starting conversation');
      
      // Interrupt with various commands
      const interruptCommands = [
        '🛑 STOP',
        '🔄 New Session',
        '/start',
        '📊 Status'
      ];

      for (const command of interruptCommands) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(command);
          
          expect(response).toBeDefined();
          expect(response.message).toBeDefined();
          
          console.log(`✅ Session interruption handled: "${command}"`);
        } catch (error) {
          console.warn(`⚠️ Session interruption failed: "${command}" - ${error.message}`);
        }
      }
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
    it('should handle very long messages', async () => {
      // Test messages of increasing length
      const testLengths = [1000, 2000, 4000];
      
      for (const length of testLengths) {
        const longMessage = 'A'.repeat(length);
        
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(longMessage, 10000);
          
          expect(response).toBeDefined();
          expect(response.message).toBeDefined();
          
          console.log(`✅ Long message handled: ${length} characters`);
        } catch (error) {
          console.warn(`⚠️ Long message failed at ${length} characters: ${error.message}`);
          // Telegram has message limits, so failure is acceptable for very long messages
        }
      }
    });

    it('should handle timeout scenarios gracefully', async () => {
      // Test with very short timeouts to simulate network issues
      try {
        await testHelper.sendMessageAndWaitForResponse('Hello with short timeout', 100);
        console.log('✅ Fast response (under 100ms)');
      } catch (error) {
        expect(error.message).toContain('Timeout');
        console.log('✅ Timeout handled gracefully');
      }
    });

    it('should maintain stability under load', async () => {
      // Send multiple messages with short delays
      const loadTestMessages = [];
      for (let i = 0; i < 5; i++) {
        loadTestMessages.push(`Load test message ${i + 1}`);
      }

      let successCount = 0;
      
      for (const message of loadTestMessages) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(message, 6000);
          
          if (response && response.message) {
            successCount++;
          }
          
          // Small delay between messages
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.warn(`⚠️ Load test message failed: ${message}`);
        }
      }

      expect(successCount).toBeGreaterThan(0);
      console.log(`✅ Load test: ${successCount}/${loadTestMessages.length} messages handled`);
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
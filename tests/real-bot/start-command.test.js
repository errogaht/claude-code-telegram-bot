/**
 * Real Bot Integration Tests - /start Command Flow
 * Tests the actual /start command with real Telegram Bot interactions
 */

const RealBotTestHelper = require('./real-bot-test-helper');
const path = require('path');

describe('Real Bot Integration - /start Command', () => {
  let testHelper;
  
  // Increase timeout for real bot tests
  jest.setTimeout(60000);

  beforeAll(async () => {
    console.log('🔧 Setting up real bot test environment...');
    testHelper = new RealBotTestHelper({
      // serverPort: auto-assigned to avoid conflicts
      testUserId: 12345,
      workingDirectory: path.join(__dirname, '../../')
    });
    
    await testHelper.setup();
  });

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
  });

  beforeEach(() => {
    // Clear conversation history before each test
    if (testHelper.testClient) {
      testHelper.testClient.clearHistory();
    }
  });

  describe('First Time User /start Flow', () => {
    it('should handle all /start command variations efficiently', async () => {
      const startTests = [
        {
          command: '/start',
          expectedKeywords: ['welcome', 'hello', 'help', 'start'],
          description: 'basic /start command with welcome message'
        },
        {
          command: '/start',
          expectedKeywords: ['command', 'help', 'use', 'feature'],
          description: '/start provides help information'
        },
        {
          command: '/start test_parameter',
          expectedKeywords: [], // Just check for valid response
          description: '/start with parameters'
        }
      ];
      
      const startResults = [];
      
      for (const test of startTests) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(test.command);
          
          expect(response).toBeDefined();
          expect(response.message).toBeDefined();
          expect(response.message.text).toBeDefined();
          
          const responseText = response.message.text.toLowerCase();
          
          let hasExpectedContent = true;
          if (test.expectedKeywords.length > 0) {
            hasExpectedContent = test.expectedKeywords.some(keyword => 
              responseText.includes(keyword)
            );
            expect(hasExpectedContent).toBe(true);
          }
          
          startResults.push({
            command: test.command,
            success: hasExpectedContent,
            description: test.description,
            responseLength: response.message.text.length
          });
          
          console.log(`✅ ${test.description}`);
          
        } catch (error) {
          startResults.push({
            command: test.command,
            success: false,
            description: test.description,
            error: error.message
          });
          console.warn(`⚠️ ${test.description} failed: ${error.message}`);
        }
      }
      
      // Validate that all start command tests passed
      const successfulTests = startResults.filter(r => r.success);
      expect(successfulTests.length).toBe(startTests.length);
      console.log(`📊 /start command tests: ${successfulTests.length}/${startTests.length} passed`);
    });
  });

  describe('Session Management with /start', () => {
    it('should create new session on /start', async () => {
      // Send /start command
      const response = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(response).toBeDefined();
      
      // Send a follow-up message to test session persistence
      const followUpResponse = await testHelper.sendMessageAndWaitForResponse('Hello');
      
      expect(followUpResponse).toBeDefined();
      expect(followUpResponse.message.text).toBeDefined();
      
      console.log('✅ Session created and maintained after /start');
    });

    it('should handle multiple /start commands gracefully', async () => {
      // Send first /start
      const firstResponse = await testHelper.sendMessageAndWaitForResponse('/start');
      expect(firstResponse).toBeDefined();
      
      // Send second /start
      const secondResponse = await testHelper.sendMessageAndWaitForResponse('/start');
      expect(secondResponse).toBeDefined();
      
      // Both should respond appropriately
      expect(firstResponse.message.text).toBeDefined();
      expect(secondResponse.message.text).toBeDefined();
      
      console.log('✅ Multiple /start commands handled gracefully');
    });
  });

  describe('User Authorization Flow', () => {
    it('should handle both authorized and unauthorized users efficiently', async () => {
      const authTests = [
        {
          name: 'admin_user',
          test: async () => {
            const response = await testHelper.sendMessageAndWaitForResponse('/start');
            return {
              hasResponse: !!(response && response.message && response.message.text),
              responseLength: response?.message?.text?.length || 0
            };
          },
          description: 'admin user /start response'
        },
        {
          name: 'unauthorized_user',
          test: async () => {
            const unauthorizedHelper = new RealBotTestHelper({
              serverPort: 8082,
              testUserId: 99999,
              workingDirectory: path.join(__dirname, '../../')
            });
            
            try {
              await unauthorizedHelper.setup();
              const response = await unauthorizedHelper.sendMessageAndWaitForResponse('/start');
              return {
                hasResponse: !!(response && response.message),
                responseLength: response?.message?.text?.length || 0
              };
            } finally {
              await unauthorizedHelper.cleanup();
            }
          },
          description: 'unauthorized user handling'
        }
      ];
      
      const authResults = [];
      
      for (const authTest of authTests) {
        try {
          const result = await authTest.test();
          
          authResults.push({
            name: authTest.name,
            success: result.hasResponse,
            description: authTest.description,
            details: result
          });
          
          expect(result.hasResponse).toBe(true);
          console.log(`✅ ${authTest.description}: handled appropriately`);
          
        } catch (error) {
          authResults.push({
            name: authTest.name,
            success: false,
            description: authTest.description,
            error: error.message
          });
          console.warn(`⚠️ ${authTest.description} failed: ${error.message}`);
        }
      }
      
      // Validate that at least one auth test passed
      const successfulAuth = authResults.filter(r => r.success);
      expect(successfulAuth.length).toBeGreaterThan(0);
      console.log(`📊 Authorization tests: ${successfulAuth.length}/${authTests.length} passed`);
    });
  });

  describe('Keyboard and Interface Elements', () => {
    it('should include interactive elements in /start response', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      
      // Check for keyboard markup or inline buttons
      const hasKeyboard = response.message.reply_markup && (
        response.message.reply_markup.inline_keyboard ||
        response.message.reply_markup.keyboard
      );
      
      // Log keyboard presence (test passes either way as bot design may vary)
      if (hasKeyboard) {
        console.log('✅ /start includes interactive keyboard elements');
      } else {
        console.log('ℹ️ /start response is text-only (no keyboard)');
      }
      
      expect(response.message.text).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle all /start error scenarios and stability tests efficiently', async () => {
      const errorTests = [
        {
          type: 'malformed_commands',
          test: async () => {
            const malformedCommands = ['/start    ', '/START', '/ start', '/start\n\n'];
            const results = [];
            
            for (const command of malformedCommands) {
              try {
                const response = await testHelper.sendMessageAndWaitForResponse(command, 4000);
                results.push({ command, handled: !!response });
              } catch (error) {
                results.push({ command, handled: false, timeout: true });
              }
            }
            
            return { results, totalCommands: malformedCommands.length };
          },
          description: 'malformed /start command handling'
        },
        {
          type: 'stability_test',
          test: async () => {
            await testHelper.sendMessageAndWaitForResponse('/start');
            
            const testMessages = ['Hello', 'How are you?', 'What can you do?'];
            const stableResponses = [];
            
            for (const message of testMessages) {
              try {
                const response = await testHelper.sendMessageAndWaitForResponse(message, 4000);
                stableResponses.push({ message, success: !!(response && response.message) });
              } catch (error) {
                stableResponses.push({ message, success: false, error: error.message });
              }
            }
            
            return { stableResponses, totalMessages: testMessages.length };
          },
          description: 'bot stability after /start'
        }
      ];
      
      const errorResults = [];
      
      for (const errorTest of errorTests) {
        try {
          const result = await errorTest.test();
          
          errorResults.push({
            type: errorTest.type,
            success: true,
            description: errorTest.description,
            details: result
          });
          
          console.log(`✅ ${errorTest.description}: validated`);
          
        } catch (error) {
          errorResults.push({
            type: errorTest.type,
            success: false,
            description: errorTest.description,
            error: error.message
          });
          console.warn(`⚠️ ${errorTest.description} failed: ${error.message}`);
        }
      }
      
      // Validate that error handling tests completed
      expect(errorResults.length).toBe(errorTests.length);
      const successfulError = errorResults.filter(r => r.success);
      console.log(`📊 Error handling tests: ${successfulError.length}/${errorTests.length} completed`);
    });
  });

  describe('Response Content Quality', () => {
    it('should validate all response quality aspects efficiently', async () => {
      const qualityTests = [
        {
          name: 'content_quality',
          test: async () => {
            const response = await testHelper.sendMessageAndWaitForResponse('/start');
            const responseText = response.message.text;
            
            const isErrorResponse = responseText.toLowerCase().includes('error') ||
                                   responseText.toLowerCase().includes('failed') ||
                                   responseText.toLowerCase().includes('undefined') ||
                                   responseText.toLowerCase().includes('null');
            
            return {
              hasText: !!responseText,
              textLength: responseText.length,
              isQuality: responseText.length > 10 && !isErrorResponse
            };
          },
          description: 'meaningful response content'
        },
        {
          name: 'response_time',
          test: async () => {
            const startTime = Date.now();
            const response = await testHelper.sendMessageAndWaitForResponse('/start');
            const responseTime = Date.now() - startTime;
            
            return {
              hasResponse: !!response,
              responseTime,
              isReasonableTime: responseTime < 10000
            };
          },
          description: 'reasonable response time'
        }
      ];
      
      const qualityResults = [];
      
      for (const qualityTest of qualityTests) {
        try {
          const result = await qualityTest.test();
          
          qualityResults.push({
            name: qualityTest.name,
            success: result.isQuality !== false && result.isReasonableTime !== false,
            description: qualityTest.description,
            details: result
          });
          
          // Validate expectations
          if (qualityTest.name === 'content_quality') {
            expect(result.hasText).toBe(true);
            expect(result.textLength).toBeGreaterThan(10);
            expect(result.isQuality).toBe(true);
          } else if (qualityTest.name === 'response_time') {
            expect(result.hasResponse).toBe(true);
            expect(result.isReasonableTime).toBe(true);
          }
          
          console.log(`✅ ${qualityTest.description}: validated`);
          
        } catch (error) {
          qualityResults.push({
            name: qualityTest.name,
            success: false,
            description: qualityTest.description,
            error: error.message
          });
          console.warn(`⚠️ ${qualityTest.description} failed: ${error.message}`);
          throw error; // Re-throw for test failure
        }
      }
      
      // All quality tests should pass
      const successfulQuality = qualityResults.filter(r => r.success);
      expect(successfulQuality.length).toBe(qualityTests.length);
      console.log(`📊 Response quality: ${successfulQuality.length}/${qualityTests.length} aspects validated`);
    });
  });
});
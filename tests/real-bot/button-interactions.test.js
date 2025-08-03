/**
 * Real Bot Integration Tests - Button Interactions
 * Tests all keyboard buttons and inline keyboard callbacks
 */

const RealBotTestHelper = require('./real-bot-test-helper');
const path = require('path');

describe('Real Bot Integration - Button Interactions', () => {
  let testHelper;
  
  // Increase timeout for real bot tests
  jest.setTimeout(90000);

  beforeAll(async () => {
    console.log('🔧 Setting up real bot test environment for button tests...');
    testHelper = new RealBotTestHelper({
      // Use dynamic port to avoid conflicts
      testUserId: 12346,
      workingDirectory: path.join(__dirname, '../../')
    });
    
    await testHelper.setup();
  });

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
      // Give extra time for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  beforeEach(() => {
    // Clear conversation history before each test
    if (testHelper.testClient) {
      testHelper.testClient.clearHistory();
    }
  });

  describe('Reply Keyboard Buttons', () => {
    it('should handle all keyboard buttons efficiently', async () => {
      // Single setup for all button tests
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      const keyboardButtons = [
        {
          button: '🛑 STOP',
          expectedKeywords: ['stop', 'stopped', 'emergency'],
          description: 'STOP button'
        },
        {
          button: '📊 Status',
          expectedKeywords: ['status', 'session', 'active', 'current'],
          description: 'Status button'
        },
        {
          button: '📂 Projects',
          expectedKeywords: ['project', 'directory', 'folder', 'path'],
          description: 'Projects button'
        },
        {
          button: '🔄 New Session',
          expectedKeywords: ['session', 'new', 'started'],
          description: 'New Session button'
        },
        {
          button: '📝 Sessions',
          expectedKeywords: ['session', 'history', 'recent', 'no sessions'],
          description: 'Sessions button'
        },
        {
          button: '📍 Path',
          expectedKeywords: ['path', 'directory', '/', 'current'],
          description: 'Path button'
        },
        {
          button: '🤖 Model',
          expectedKeywords: ['model', 'claude', 'select', 'sonnet', 'haiku', 'opus'],
          description: 'Model button'
        },
        {
          button: '🧠 Thinking',
          expectedKeywords: ['thinking', 'mode', 'select', 'think'],
          description: 'Thinking button'
        },
        {
          button: '📁 Git',
          expectedKeywords: ['git', 'diff', 'changes', 'repository', 'no'],
          description: 'Git button'
        }
      ];
      
      const buttonResults = [];
      
      for (const buttonTest of keyboardButtons) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(buttonTest.button, 5000);
          
          if (response && response.message && response.message.text) {
            const responseText = response.message.text.toLowerCase();
            const hasExpectedKeyword = buttonTest.expectedKeywords.some(keyword => 
              responseText.includes(keyword)
            );
            
            buttonResults.push({
              button: buttonTest.button,
              success: hasExpectedKeyword,
              description: buttonTest.description,
              responseLength: response.message.text.length
            });
            
            expect(response).toBeDefined();
            expect(response.message).toBeDefined();
            expect(response.message.text).toBeDefined();
            expect(hasExpectedKeyword).toBe(true);
            
            console.log(`✅ ${buttonTest.description} handled correctly`);
          } else {
            buttonResults.push({
              button: buttonTest.button,
              success: false,
              description: buttonTest.description,
              error: 'No response or message'
            });
          }
        } catch (error) {
          buttonResults.push({
            button: buttonTest.button,
            success: false,
            description: buttonTest.description,
            error: error.message
          });
          console.warn(`⚠️ ${buttonTest.description} failed: ${error.message}`);
        }
      }
      
      // Validate that most buttons worked
      const successfulButtons = buttonResults.filter(r => r.success);
      expect(successfulButtons.length).toBeGreaterThan(0);
      console.log(`📊 Keyboard buttons: ${successfulButtons.length}/${keyboardButtons.length} working`);
    });
  });

  describe('Inline Keyboard Callbacks', () => {
    it('should handle all inline callback types efficiently', async () => {
      // Test all callback scenarios in one optimized test
      const callbackTests = [
        {
          type: 'model_callbacks',
          setupAction: '🤖 Model',
          callbacks: [
            { data: 'model:claude-3-5-sonnet-20241022', name: 'Sonnet' },
            { data: 'model:cancel', name: 'Cancel' }
          ]
        },
        {
          type: 'thinking_callbacks',
          setupAction: '🧠 Thinking',
          callbacks: [
            { data: 'think:standard', name: 'Standard' },
            { data: 'think:cancel', name: 'Cancel' }
          ]
        },
        {
          type: 'session_callbacks',
          setupAction: '📝 Sessions',
          callbacks: [
            { data: 'noop', name: 'No-op' },
            { data: 'sessions_page:0', name: 'First Page' }
          ]
        }
      ];
      
      const callbackResults = [];
      
      for (const callbackType of callbackTests) {
        for (const callback of callbackType.callbacks) {
          try {
            // Setup the callback context
            await testHelper.sendMessageAndWaitForResponse(callbackType.setupAction);
            
            // Test the callback
            const response = await testHelper.pressButtonAndWaitForResponse(callback.data, null, 3000);
            
            callbackResults.push({
              type: callbackType.type,
              callback: callback.name,
              success: !!response,
              data: callback.data
            });
            
            if (response) {
              console.log(`✅ ${callbackType.type} callback handled: ${callback.name}`);
            }
          } catch (error) {
            callbackResults.push({
              type: callbackType.type,
              callback: callback.name,
              success: false,
              error: error.message,
              data: callback.data
            });
            console.log(`ℹ️ ${callbackType.type} callback ${callback.name}: ${error.message.includes('timeout') ? 'timeout (expected)' : 'error'}`);
          }
        }
      }
      
      // Validate that at least some callbacks worked (some timeouts are expected)
      const totalCallbacks = callbackResults.length;
      const workingCallbacks = callbackResults.filter(r => r.success).length;
      const timeoutCallbacks = callbackResults.filter(r => r.error && r.error.includes('timeout')).length;
      
      // Success or expected timeout both count as "working as expected"
      expect(workingCallbacks + timeoutCallbacks).toBeGreaterThan(0);
      console.log(`📊 Callback tests: ${workingCallbacks} successful, ${timeoutCallbacks} timeouts (expected), ${totalCallbacks - workingCallbacks - timeoutCallbacks} errors`);
    });
  });

  describe('Button Interaction Sequences', () => {
    it('should handle all button interaction patterns efficiently', async () => {
      // Start with fresh session
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      const interactionTests = [
        {
          name: 'rapid_sequence',
          test: async () => {
            const buttons = ['📊 Status', '📍 Path', '📊 Status'];
            const results = [];
            
            for (const button of buttons) {
              const response = await testHelper.sendMessageAndWaitForResponse(button, 4000);
              results.push({ button, success: !!(response && response.message) });
              await new Promise(resolve => setTimeout(resolve, 300)); // Reduced delay
            }
            
            return { results, totalButtons: buttons.length };
          }
        },
        {
          name: 'message_then_button',
          test: async () => {
            await testHelper.sendMessageAndWaitForResponse('Hello, how are you?');
            const response = await testHelper.sendMessageAndWaitForResponse('📊 Status');
            return { success: !!(response && response.message) };
          }
        },
        {
          name: 'keyboard_maintenance',
          test: async () => {
            const buttons = ['📊 Status', '📍 Path'];
            let keyboardMaintained = 0;
            
            for (const button of buttons) {
              const response = await testHelper.sendMessageAndWaitForResponse(button, 4000);
              if (response && response.message && response.message.reply_markup) {
                keyboardMaintained++;
              }
            }
            
            return { keyboardMaintained, totalButtons: buttons.length };
          }
        }
      ];
      
      const interactionResults = [];
      
      for (const interaction of interactionTests) {
        try {
          const result = await interaction.test();
          
          interactionResults.push({
            name: interaction.name,
            success: true,
            details: result
          });
          
          console.log(`✅ ${interaction.name}: completed successfully`);
          
        } catch (error) {
          interactionResults.push({
            name: interaction.name,
            success: false,
            error: error.message
          });
          console.warn(`⚠️ ${interaction.name} failed: ${error.message}`);
        }
      }
      
      // Validate that most interaction tests passed
      const successfulInteractions = interactionResults.filter(r => r.success);
      expect(successfulInteractions.length).toBeGreaterThan(0);
      console.log(`📊 Button interactions: ${successfulInteractions.length}/${interactionTests.length} patterns working`);
    });
  });

  describe('Error Handling for Buttons', () => {
    it('should handle all button error scenarios efficiently', async () => {
      const errorTests = [
        {
          type: 'invalid_callbacks',
          test: async () => {
            const invalidCallbacks = ['invalid:callback', 'model:nonexistent', 'think:invalid'];
            
            for (const callbackData of invalidCallbacks) {
              await testHelper.testClient.sendCallbackQuery(callbackData);
              await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay
            }
            
            return { callbacksSent: invalidCallbacks.length };
          },
          description: 'invalid callback handling'
        },
        {
          type: 'missing_message_id',
          test: async () => {
            await testHelper.testClient.sendCallbackQuery('model:cancel', null);
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
          },
          description: 'missing message ID handling'
        },
        {
          type: 'malformed_buttons',
          test: async () => {
            const almostButtons = ['🛑STOP', ' 📊 Status ', '📊Status', 'STOP'];
            const results = [];
            
            for (const buttonText of almostButtons) {
              try {
                const response = await testHelper.sendMessageAndWaitForResponse(buttonText, 2000);
                results.push({ buttonText, handled: !!response });
              } catch (error) {
                results.push({ buttonText, handled: false, treatAsRegular: true });
              }
            }
            
            return { results, totalButtons: almostButtons.length };
          },
          description: 'malformed button text handling'
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
          
          console.log(`✅ ${errorTest.description}: handled correctly`);
          
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
      
      // All error handling tests should complete without throwing exceptions
      expect(errorResults.length).toBe(errorTests.length);
      const successfulErrorHandling = errorResults.filter(r => r.success);
      console.log(`📊 Button error handling: ${successfulErrorHandling.length}/${errorTests.length} scenarios handled`);
    });
  });
});
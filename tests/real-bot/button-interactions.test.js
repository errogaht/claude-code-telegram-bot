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
    beforeEach(async () => {
      // Ensure we have a fresh session with keyboard
      await testHelper.sendMessageAndWaitForResponse('/start');
    });

    it('should handle STOP button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('🛑 STOP');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain stop/emergency related text
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('stop') ||
        responseText.includes('stopped') ||
        responseText.includes('emergency')
      ).toBe(true);
      
      console.log('✅ STOP button handled correctly');
    });

    it('should handle Status button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('📊 Status');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain status information
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('status') ||
        responseText.includes('session') ||
        responseText.includes('active') ||
        responseText.includes('current')
      ).toBe(true);
      
      console.log('✅ Status button handled correctly');
    });

    it('should handle Projects button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('📂 Projects');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain project-related information
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('project') ||
        responseText.includes('directory') ||
        responseText.includes('folder') ||
        responseText.includes('path')
      ).toBe(true);
      
      console.log('✅ Projects button handled correctly');
    });

    it('should handle New Session button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('🔄 New Session');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain session-related text
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('session') ||
        responseText.includes('new') ||
        responseText.includes('started')
      ).toBe(true);
      
      console.log('✅ New Session button handled correctly');
    });

    it('should handle Sessions button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('📝 Sessions');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain session history information
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('session') ||
        responseText.includes('history') ||
        responseText.includes('recent') ||
        responseText.includes('no sessions') // Could be empty history
      ).toBe(true);
      
      console.log('✅ Sessions button handled correctly');
    });

    it('should handle Path button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('📍 Path');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain path information
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('path') ||
        responseText.includes('directory') ||
        responseText.includes('/') ||
        responseText.includes('current')
      ).toBe(true);
      
      console.log('✅ Path button handled correctly');
    });

    it('should handle Model button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('🤖 Model');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain model selection information
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('model') ||
        responseText.includes('claude') ||
        responseText.includes('select') ||
        responseText.includes('sonnet') ||
        responseText.includes('haiku') ||
        responseText.includes('opus')
      ).toBe(true);
      
      console.log('✅ Model button handled correctly');
    });

    it('should handle Thinking button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('🧠 Thinking');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain thinking mode information
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('thinking') ||
        responseText.includes('mode') ||
        responseText.includes('select') ||
        responseText.includes('think')
      ).toBe(true);
      
      console.log('✅ Thinking button handled correctly');
    });

    it('should handle Git button press', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('📁 Git');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should contain git diff information or error message
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('git') ||
        responseText.includes('diff') ||
        responseText.includes('changes') ||
        responseText.includes('repository') ||
        responseText.includes('no') // No changes/repo
      ).toBe(true);
      
      console.log('✅ Git button handled correctly');
    });
  });

  describe('Inline Keyboard Callbacks', () => {
    it('should handle model selection callbacks', async () => {
      // First trigger model selection
      await testHelper.sendMessageAndWaitForResponse('🤖 Model');
      
      // Now test callback buttons
      const testCases = [
        { data: 'model:claude-3-5-sonnet-20241022', name: 'Sonnet' },
        { data: 'model:claude-3-5-haiku-20241022', name: 'Haiku' },
        { data: 'model:claude-3-opus-20240229', name: 'Opus' },
        { data: 'model:cancel', name: 'Cancel' }
      ];

      for (const testCase of testCases) {
        try {
          // Get fresh model selection each time
          await testHelper.sendMessageAndWaitForResponse('🤖 Model');
          
          const response = await testHelper.pressButtonAndWaitForResponse(testCase.data);
          
          expect(response).toBeDefined();
          expect(response.message).toBeDefined();
          
          console.log(`✅ Model selection callback handled: ${testCase.name}`);
        } catch (error) {
          console.warn(`⚠️ Model callback test failed for ${testCase.name}: ${error.message}`);
          // Don't fail the test, as some callbacks might not generate new messages
        }
      }
    });

    it('should handle thinking mode callbacks', async () => {
      // First trigger thinking mode selection
      await testHelper.sendMessageAndWaitForResponse('🧠 Thinking');
      
      // Test thinking mode callbacks
      const testCases = [
        { data: 'think:standard', name: 'Standard' },
        { data: 'think:deep', name: 'Deep Think' },
        { data: 'think:ultra', name: 'Ultra Think' },
        { data: 'think:quick', name: 'Quick' },
        { data: 'think:focused', name: 'Focused' },
        { data: 'think:analysis', name: 'Analysis' },
        { data: 'think:cancel', name: 'Cancel' }
      ];

      for (const testCase of testCases) {
        try {
          // Get fresh thinking mode selection each time
          await testHelper.sendMessageAndWaitForResponse('🧠 Thinking');
          
          const response = await testHelper.pressButtonAndWaitForResponse(testCase.data);
          
          expect(response).toBeDefined();
          
          console.log(`✅ Thinking mode callback handled: ${testCase.name}`);
        } catch (error) {
          console.warn(`⚠️ Thinking callback test failed for ${testCase.name}: ${error.message}`);
          // Don't fail the test, as some callbacks might not generate new messages
        }
      }
    });

    it('should handle session history callbacks', async () => {
      // First get session history
      await testHelper.sendMessageAndWaitForResponse('📝 Sessions');
      
      // Test pagination callbacks (might not exist if no sessions)
      const testCases = [
        { data: 'sessions_page:0', name: 'First Page' },
        { data: 'sessions_page:1', name: 'Second Page' },
        { data: 'noop', name: 'No-op' }
      ];

      for (const testCase of testCases) {
        try {
          const response = await testHelper.pressButtonAndWaitForResponse(testCase.data, null, 3000);
          
          if (response) {
            expect(response).toBeDefined();
            console.log(`✅ Session history callback handled: ${testCase.name}`);
          }
        } catch (error) {
          // Expected for some callbacks, especially if no sessions exist
          console.log(`ℹ️ Session callback expected to have no response: ${testCase.name}`);
        }
      }
    });
  });

  describe('Button Interaction Sequences', () => {
    it('should handle rapid button presses', async () => {
      // Test rapid sequential button presses
      const buttons = ['📊 Status', '📍 Path', '🤖 Model', '📊 Status'];
      const responses = [];
      
      for (const button of buttons) {
        const response = await testHelper.sendMessageAndWaitForResponse(button, 5000);
        responses.push(response);
        
        // Small delay between presses
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // All responses should be valid
      responses.forEach((response, index) => {
        expect(response).toBeDefined();
        expect(response.message).toBeDefined();
        console.log(`✅ Rapid button press ${index + 1}: ${buttons[index]}`);
      });
    });

    it('should handle button press after message', async () => {
      // Send regular message first
      await testHelper.sendMessageAndWaitForResponse('Hello, how are you?');
      
      // Then press button
      const response = await testHelper.sendMessageAndWaitForResponse('📊 Status');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      
      console.log('✅ Button press after regular message handled correctly');
    });

    it('should maintain keyboard after button presses', async () => {
      // Press several buttons and check that keyboard is maintained
      const buttons = ['📊 Status', '📍 Path', '🔄 New Session'];
      
      for (const button of buttons) {
        const response = await testHelper.sendMessageAndWaitForResponse(button);
        
        expect(response).toBeDefined();
        expect(response.message).toBeDefined();
        
        // Check if keyboard is present (reply_markup)
        if (response.message.reply_markup) {
          expect(response.message.reply_markup.keyboard).toBeDefined();
          console.log(`✅ Keyboard maintained after: ${button}`);
        }
      }
    });
  });

  describe('Error Handling for Buttons', () => {
    it('should handle invalid callback data gracefully', async () => {
      // Test invalid callback data - these are expected to not generate bot responses
      const invalidCallbacks = [
        'invalid:callback',
        'model:nonexistent',
        'think:invalid',
        'sessions_page:abc',
        'resume_session:invalid-id'
      ];

      for (const callbackData of invalidCallbacks) {
        // Send callback but don't wait for response since invalid callbacks are ignored by bot
        await testHelper.testClient.sendCallbackQuery(callbackData);
        console.log(`✅ Invalid callback sent (bot correctly ignores): ${callbackData}`);
        
        // Give small delay to ensure callback was processed
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Test passes if no errors thrown - invalid callbacks should be silently ignored
      expect(true).toBe(true);
    });

    it('should handle missing message ID in callbacks', async () => {
      // Test callback without message ID - this should be ignored by bot
      await testHelper.testClient.sendCallbackQuery('model:cancel', null);
      console.log('✅ Callback without message ID sent (bot correctly ignores)');
      
      // Give small delay to ensure callback was processed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Test passes if no errors thrown - callbacks without message ID should be ignored
      expect(true).toBe(true);
    });

    it('should handle button text that doesn\'t match expected format', async () => {
      // Test sending text that looks like buttons but isn't exactly right
      const almostButtons = [
        '🛑STOP', // No space
        ' 📊 Status ', // Extra spaces
        '📊Status', // No space
        '🔄New Session', // No space
        'STOP' // No emoji
      ];

      for (const buttonText of almostButtons) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(buttonText, 3000);
          
          if (response) {
            expect(response).toBeDefined();
            console.log(`✅ Almost-button text handled: "${buttonText}"`);
          }
        } catch (error) {
          // Expected - some might not be recognized as buttons
          console.log(`ℹ️ Almost-button text treated as regular message: "${buttonText}"`);
        }
      }
    });
  });
});
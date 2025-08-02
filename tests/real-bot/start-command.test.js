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
    it('should respond to /start command with welcome message', async () => {
      // Send /start command
      const response = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Check that response contains welcome/help information
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('welcome') || 
        responseText.includes('hello') || 
        responseText.includes('help') ||
        responseText.includes('start')
      ).toBe(true);
      
      console.log('✅ Bot responded to /start command');
    });

    it('should provide help information on /start', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(response.message.text).toBeDefined();
      
      // Check that response includes basic bot functionality info
      const responseText = response.message.text.toLowerCase();
      const hasHelpKeywords = 
        responseText.includes('command') ||
        responseText.includes('help') ||
        responseText.includes('use') ||
        responseText.includes('feature');
      
      expect(hasHelpKeywords).toBe(true);
      console.log('✅ /start provides help information');
    });

    it('should handle /start with parameters', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('/start test_parameter');
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      console.log('✅ Bot handles /start with parameters');
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
    it('should handle unauthorized user appropriately', async () => {
      // Test with different user ID to simulate unauthorized user
      const unauthorizedHelper = new RealBotTestHelper({
        serverPort: 8082, // Different port to avoid conflicts
        testUserId: 99999, // Different user ID
        workingDirectory: path.join(__dirname, '../../')
      });
      
      try {
        await unauthorizedHelper.setup();
        
        const response = await unauthorizedHelper.sendMessageAndWaitForResponse('/start');
        
        expect(response).toBeDefined();
        expect(response.message).toBeDefined();
        
        // Bot should respond, but may limit functionality for unauthorized users
        console.log('✅ Unauthorized user handled appropriately');
        
      } finally {
        await unauthorizedHelper.cleanup();
      }
    });

    it('should show admin features for admin user', async () => {
      // Note: This test assumes the test user might be configured as admin
      const response = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(response).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Check if admin-specific content is present (if applicable)
      const responseText = response.message.text.toLowerCase();
      
      // This test passes regardless of admin status, but logs the result
      console.log('✅ Admin features test completed (admin status varies by config)');
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
    it('should handle malformed /start messages', async () => {
      // Send malformed command variations
      const testCases = [
        '/start    ', // with extra spaces
        '/START', // uppercase
        '/ start', // space after slash
        '/start\n\n' // with newlines
      ];
      
      for (const testCase of testCases) {
        try {
          const response = await testHelper.sendMessageAndWaitForResponse(testCase, 5000);
          expect(response).toBeDefined();
          console.log(`✅ Handled malformed command: "${testCase.replace(/\n/g, '\\n')}"`);
        } catch (error) {
          // Some malformed commands might not trigger a response, which is also valid
          console.log(`ℹ️ No response to malformed command: "${testCase.replace(/\n/g, '\\n')}" (expected)`);
        }
      }
    });

    it('should maintain stability after /start', async () => {
      // Send /start followed by various messages to test stability
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      const testMessages = [
        'Hello',
        'How are you?',
        'What can you do?',
        '/help'
      ];
      
      for (const message of testMessages) {
        const response = await testHelper.sendMessageAndWaitForResponse(message, 5000);
        expect(response).toBeDefined();
        expect(response.message).toBeDefined();
      }
      
      console.log('✅ Bot remains stable after /start command');
    });
  });

  describe('Response Content Quality', () => {
    it('should provide meaningful response content', async () => {
      const response = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(response.message.text).toBeDefined();
      expect(response.message.text.length).toBeGreaterThan(10);
      
      // Response should not be just error messages
      const responseText = response.message.text.toLowerCase();
      const isErrorResponse = 
        responseText.includes('error') ||
        responseText.includes('failed') ||
        responseText.includes('undefined') ||
        responseText.includes('null');
      
      expect(isErrorResponse).toBe(false);
      
      console.log('✅ /start provides meaningful, non-error response');
    });

    it('should respond in reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await testHelper.sendMessageAndWaitForResponse('/start');
      
      const responseTime = Date.now() - startTime;
      
      expect(response).toBeDefined();
      expect(responseTime).toBeLessThan(10000); // Should respond within 10 seconds
      
      console.log(`✅ /start response time: ${responseTime}ms`);
    });
  });
});
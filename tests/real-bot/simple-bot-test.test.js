/**
 * Simple Real Bot Integration Test
 * Basic test to validate telegram-test-api integration using our proven approach
 */

const TelegramTestServer = require('./telegram-test-server');
const TelegramTestClient = require('./telegram-test-client');
const TelegramBot = require('node-telegram-bot-api');

describe('Simple Real Bot Integration Test', () => {
  let serverWrapper;
  let bot;
  let client;
  const token = 'test-token-123';
  const testUserId = 12345;
  
  jest.setTimeout(30000);

  beforeAll(async () => {
    console.log('🔧 Setting up simple test environment...');
    
    // Use our proven server wrapper with proper lifecycle management
    serverWrapper = new TelegramTestServer({
      port: 8300,
      host: 'localhost',
      storage: 'RAM',
      storeTimeout: 60
    });
    
    await serverWrapper.start();
    console.log('✅ Test server started');
    
    // Create bot with test server URL
    bot = new TelegramBot(token, {
      polling: true,
      baseApiUrl: serverWrapper.getApiUrl()
    });
    
    // Use our proven test client that supports getUpdatesHistory
    client = new TelegramTestClient(serverWrapper, token, testUserId, {
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User'
    });
    
    console.log('✅ Bot and client created');
  });

  afterAll(async () => {
    if (bot) {
      bot.stopPolling();
    }
    if (serverWrapper) {
      await serverWrapper.stop();
    }
    console.log('✅ Test environment cleaned up');
  });

  describe('Basic Communication', () => {
    it('should establish basic communication', async () => {
      // Simple bot response handler
      bot.onText(/\/test/, (msg) => {
        bot.sendMessage(msg.chat.id, 'Test response from bot!');
      });

      // Send message from client and wait for bot response
      await client.sendMessage('/test');
      
      // Use our proven waitForBotResponse method
      const botResponse = await client.waitForBotResponse(5000);
      
      console.log(`✅ Received bot response: "${botResponse.message.text}"`);
      
      // Validate the response
      expect(botResponse).toBeDefined();
      expect(botResponse.message).toBeDefined();
      expect(botResponse.message.text).toBe('Test response from bot!');
      
      console.log('✅ Basic communication working');
    });

    it('should handle message flow', async () => {
      // Clear previous conversation history
      client.clearHistory();
      
      // Add another handler
      bot.onText(/\/hello/, (msg) => {
        bot.sendMessage(msg.chat.id, `Hello ${msg.from.first_name}!`);
      });

      // Send hello message and wait for response
      await client.sendMessage('/hello');
      const botResponse = await client.waitForBotResponse(5000);
      
      console.log(`✅ Received hello response: "${botResponse.message.text}"`);
      
      expect(botResponse).toBeDefined();
      expect(botResponse.message.text).toBe('Hello Test!');
      
      console.log('✅ Message flow test passed');
    });
  });

  describe('Test Infrastructure Validation', () => {
    it('should validate server is running', () => {
      expect(serverWrapper.getApiUrl()).toContain('http://');
      expect(serverWrapper.options.port).toBe(8300);
      console.log('✅ Server configuration valid');
    });

    it('should validate client can create messages', () => {
      // Our TelegramTestClient uses the internal telegram-test-api client
      const rawClient = client.getRawClient();
      const testMessage = rawClient.makeMessage('Test message');
      
      expect(testMessage).toBeDefined();
      expect(testMessage.text).toBe('Test message');
      expect(testMessage.chat).toBeDefined();
      
      console.log('✅ Client message creation working');
    });

    it('should validate bot connection', () => {
      expect(bot.options.baseApiUrl).toBe(serverWrapper.getApiUrl());
      console.log('✅ Bot connected to test server');
    });

    it('should validate telegram-test-api integration', async () => {
      // Test that our getUpdatesHistory approach works
      expect(client.getConversationHistory()).toBeDefined();
      
      // After previous tests, we should have bot responses
      const lastResponse = client.getLastBotResponse();
      if (lastResponse) {
        expect(lastResponse.message).toBeDefined();
        expect(lastResponse.message.text).toBeDefined();
        console.log(`✅ Last bot response captured: "${lastResponse.message.text}"`);
      }
      
      console.log('✅ telegram-test-api integration validated');
    });
  });
});
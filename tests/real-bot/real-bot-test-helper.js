/**
 * Real Bot Test Helper
 * Utilities for setting up and managing real bot integration tests
 */

const TelegramTestServer = require('./telegram-test-server');
const TelegramTestClient = require('./telegram-test-client');
const StreamTelegramBot = require('../../bot');
const path = require('path');
const fs = require('fs');
const net = require('net');

class RealBotTestHelper {
  constructor(options = {}) {
    // Generate unique test identifiers to avoid collisions
    const testId = Date.now() + Math.floor(Math.random() * 1000);
    
    this.options = {
      serverPort: options.serverPort || null, // Will be auto-assigned
      serverHost: 'localhost',
      testUserId: options.testUserId || (12345 + (testId % 1000)),
      botConfigName: 'test-bot',
      workingDirectory: process.cwd(),
      ...options
    };

    this.testServer = null;
    this.testClient = null;
    this.bot = null;
    this.testToken = null;
    this.cleanupTasks = [];
    
    // Register global cleanup handler for unexpected exits
    this.setupGlobalCleanup();
  }

  // Find an available port to avoid collisions with improved logic
  async findAvailablePort(startPort = 8090) {
    const checkPort = (port) => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, '127.0.0.1', () => {
          server.once('close', () => {
            // Add small delay to ensure port is fully released
            setTimeout(() => resolve(true), 50);
          });
          server.close();
        });
        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            resolve(false);
          } else {
            console.warn(`Port check error for ${port}:`, err.message);
            resolve(false);
          }
        });
      });
    };

    // Try multiple attempts with different ranges to avoid collisions
    for (let attempt = 0; attempt < 3; attempt++) {
      const rangeStart = startPort + (attempt * 200) + Math.floor(Math.random() * 100);
      
      for (let port = rangeStart; port < rangeStart + 50; port++) {
        if (await checkPort(port)) {
          console.log(`📡 Found available port: ${port} (attempt ${attempt + 1})`);
          return port;
        }
      }
    }
    
    throw new Error('No available ports found after multiple attempts');
  }
  
  // Setup global cleanup handlers to prevent port leaks
  setupGlobalCleanup() {
    const cleanup = async () => {
      if (this.testServer) {
        try {
          await this.testServer.stop();
        } catch (err) {
          console.warn('Emergency cleanup warning:', err.message);
        }
      }
    };
    
    // Store cleanup handler reference for later removal
    this.globalCleanupHandler = cleanup;
    
    // Only set up handlers once per process, with increased listener limit
    if (!global.realBotCleanupRegistered) {
      // Increase max listeners to accommodate multiple test instances
      process.setMaxListeners(50);
      
      process.on('exit', cleanup);
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      global.realBotCleanupRegistered = true;
      global.realBotCleanupHandler = cleanup;
    }
  }

  // Set up the complete test environment
  async setup() {
    console.log('🚀 Setting up real bot test environment...');

    try {
      // Always find an available port to avoid collisions with improved randomization
      if (!this.options.serverPort) {
        // Use wider range and better randomization to avoid conflicts
        const randomStart = 8200 + Math.floor(Math.random() * 800); // Random port between 8200-8999
        this.options.serverPort = await this.findAvailablePort(randomStart);
        console.log(`📡 Auto-assigned available port: ${this.options.serverPort} (started search from ${randomStart})`);
      }

      // 1. Start the telegram-test-api server
      await this.startTestServer();

      // 2. Create test client
      await this.createTestClient();

      // 3. Create and start the bot with test configuration
      await this.startTestBot();

      console.log('✅ Real bot test environment ready!');
      console.log(`📡 Test server: ${this.testServer.getWebUrl()}`);
      console.log(`🤖 Bot token: ${this.testToken}`);
      console.log(`👤 Test user ID: ${this.options.testUserId}`);

    } catch (error) {
      console.error('❌ Failed to setup test environment:', error);
      await this.cleanup();
      throw error;
    }
  }

  // Start the telegram-test-api server
  async startTestServer() {
    console.log('Starting telegram test server...');
    this.testServer = new TelegramTestServer({
      port: this.options.serverPort,
      host: this.options.serverHost,
      logLevel: 'error' // Reduce noise in tests
    });

    await this.testServer.start();
    this.cleanupTasks.push(() => this.testServer.stop());
  }

  // Create the test client
  async createTestClient() {
    console.log('Creating test client...');
    // Will be created after we have the token and bot setup
  }

  // Start the bot with test configuration
  async startTestBot() {
    console.log('Starting test bot...');
    
    // Create a test token
    this.testToken = this.testServer.createTestToken('123456789');
    console.log(`🔑 Created test token: ${this.testToken}`);
    
    // Get the API URL from test server
    const apiUrl = this.testServer.getApiUrl();
    console.log(`🌐 Test server API URL: ${apiUrl}`);
    
    // Create temporary config file for testing
    const testConfigPath = path.join(__dirname, `test-config-${Date.now()}.json`);
    const testConfig = {
      token: this.testToken,
      workingDirectory: this.options.workingDirectory,
      model: 'sonnet',
      adminUserId: this.options.testUserId
    };
    fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
    
    // Add cleanup for the temporary config file
    this.cleanupTasks.push(() => {
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }
    });
    
    // Create the bot instance with test server API URL and config file path
    this.bot = new StreamTelegramBot(this.testToken, {
      workingDirectory: this.options.workingDirectory,
      model: 'sonnet',
      maxConcurrentSessions: 1,
      polling: false, // Start polling after API URL setup
      baseApiUrl: apiUrl, // Use test server API URL
      configFilePath: testConfigPath, // Provide config file path for saving admin ID
      adminUserId: this.options.testUserId // Set admin user ID
    });
    
    // Add debugging to see if bot is actually sending messages
    const originalSendMessage = this.bot.bot.sendMessage.bind(this.bot.bot);
    this.bot.bot.sendMessage = async (...args) => {
      console.log(`🚀 Bot attempting to send message to chat ${args[0]}: "${args[1]?.substring(0, 50)}..."`);
      console.log(`🚀 Bot API URL: ${this.bot.bot.options.baseApiUrl}`);
      try {
        const result = await originalSendMessage(...args);
        console.log(`✅ Message sent successfully, message_id: ${result.message_id}`);
        return result;
      } catch (error) {
        console.error('❌ Failed to send message:', error.message);
        throw error;
      }
    };
    
    // Ensure the underlying bot instance uses the test server
    if (this.bot.bot) {
      // Set the base API URL before starting polling
      this.bot.bot.options.baseApiUrl = apiUrl;
      console.log(`🔧 Bot API URL configured: ${this.bot.bot.options.baseApiUrl}`);
      
      // Start polling
      this.bot.bot.startPolling({ 
        polling: {
          timeout: 10,
          limit: 100
        }
      });
      console.log('📡 Bot polling started');
    } else {
      throw new Error('Bot instance not properly initialized');
    }

    // Add cleanup task with improved error handling
    this.cleanupTasks.push(async () => {
      if (this.bot && this.bot.bot) {
        try {
          // Stop polling more gracefully
          await this.bot.bot.stopPolling({ cancel: true, reason: 'Test cleanup' });
          console.log('🛑 Bot polling stopped');
          
          // Give time for polling to stop completely
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          // Ignore EFATAL socket hang up errors during cleanup - these are expected
          if (!error.message.includes('EFATAL') && !error.message.includes('socket hang up')) {
            console.warn('Warning stopping bot polling:', error.message);
          }
        }
      }
    });

    // Create the test client now that we have the server and token
    this.testClient = new TelegramTestClient(this.testServer, this.testToken, this.options.testUserId, {
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User'
    });
    console.log('👤 Test client created');

    // Give the bot a moment to initialize and start polling
    console.log('⏳ Waiting for bot initialization...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Send a message and wait for response
  async sendMessageAndWaitForResponse(message, timeoutMs = 10000) {
    console.log(`💬 Sending message: "${message}"`);
    
    // Send the message
    await this.testClient.sendMessage(message);
    
    // Wait for bot response
    try {
      const response = await this.testClient.waitForBotResponse(timeoutMs);
      return response;
    } catch (error) {
      console.error(`⏰ Timeout or error waiting for response: ${error.message}`);
      throw error;
    }
  }

  // Press a button and wait for response
  async pressButtonAndWaitForResponse(callbackData, messageId = null, timeoutMs = 10000) {
    console.log(`🔘 Pressing button: "${callbackData}"`);
    
    // Send callback query
    await this.testClient.sendCallbackQuery(callbackData, messageId);
    
    // Wait for bot response
    try {
      const response = await this.testClient.waitForBotResponse(timeoutMs);
      return response;
    } catch (error) {
      console.error(`⏰ Timeout or error waiting for button response: ${error.message}`);
      throw error;
    }
  }

  // Send voice message and wait for response
  async sendVoiceAndWaitForResponse(voiceFilePath, timeoutMs = 15000) {
    console.log(`🎤 Sending voice message: ${path.basename(voiceFilePath)}`);
    
    // Send voice message
    await this.testClient.sendVoiceMessage(voiceFilePath);
    
    // Wait for bot response (voice processing takes longer)
    try {
      const response = await this.testClient.waitForBotResponse(timeoutMs);
      return response;
    } catch (error) {
      console.error(`⏰ Timeout or error waiting for voice response: ${error.message}`);
      throw error;
    }
  }

  // Test a complete conversation flow
  async testConversationFlow(steps) {
    const results = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`📋 Step ${i + 1}/${steps.length}: ${step.description || step.type}`);
      
      let response;
      
      try {
        switch (step.type) {
        case 'message':
          response = await this.sendMessageAndWaitForResponse(step.text, step.timeout);
          break;
        case 'button':
          response = await this.pressButtonAndWaitForResponse(step.callbackData, step.messageId, step.timeout);
          break;
        case 'voice':
          response = await this.sendVoiceAndWaitForResponse(step.filePath, step.timeout);
          break;
        case 'wait':
          await new Promise(resolve => setTimeout(resolve, step.duration || 1000));
          response = { type: 'wait', duration: step.duration };
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
        }
        
        results.push({
          step: i + 1,
          type: step.type,
          success: true,
          response: response,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ Step ${i + 1} failed:`, error.message);
        results.push({
          step: i + 1,
          type: step.type,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        if (step.required !== false) {
          throw error; // Stop on required step failure
        }
      }
    }
    
    return results;
  }

  // Create a test voice file for testing
  createTestVoiceFile() {
    const testVoicePath = path.join(__dirname, 'test-voice.ogg');
    
    // Create a minimal OGG file (dummy data for testing)
    const dummyOggData = Buffer.from([
      0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, // OGG header
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    
    fs.writeFileSync(testVoicePath, dummyOggData);
    this.cleanupTasks.push(() => {
      if (fs.existsSync(testVoicePath)) {
        fs.unlinkSync(testVoicePath);
      }
    });
    
    return testVoicePath;
  }

  // Get conversation history
  getConversationHistory() {
    return this.testClient ? this.testClient.getConversationHistory() : [];
  }

  // Get last bot response
  getLastBotResponse() {
    return this.testClient ? this.testClient.getLastBotResponse() : null;
  }

  // Clean up all resources
  async cleanup() {
    console.log('🧹 Cleaning up test environment...');
    
    // Stop bot polling first with improved error handling
    if (this.bot && this.bot.bot) {
      try {
        // Stop polling gracefully  
        await this.bot.bot.stopPolling({ cancel: true, reason: 'Test cleanup' });
        console.log('✅ Bot polling stopped');
        
        // Give time for polling to stop completely
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        // Ignore EFATAL socket hang up errors during cleanup - these are expected
        if (!error.message.includes('EFATAL') && !error.message.includes('socket hang up')) {
          console.warn('Warning stopping bot:', error.message);
        }
      }
    }
    
    // Run cleanup tasks in reverse order
    for (let i = this.cleanupTasks.length - 1; i >= 0; i--) {
      try {
        const cleanupTask = this.cleanupTasks[i];
        if (cleanupTask.constructor.name === 'AsyncFunction') {
          await cleanupTask();
        } else {
          cleanupTask();
        }
      } catch (error) {
        console.warn('Cleanup warning:', error.message);
      }
    }
    
    // Remove global cleanup handlers if this was the last instance
    if (this.globalCleanupHandler && global.realBotCleanupHandler === this.globalCleanupHandler) {
      try {
        process.removeListener('exit', this.globalCleanupHandler);
        process.removeListener('SIGINT', this.globalCleanupHandler);
        process.removeListener('SIGTERM', this.globalCleanupHandler);
        global.realBotCleanupRegistered = false;
        global.realBotCleanupHandler = null;
      } catch (error) {
        console.warn('Warning removing global cleanup handlers:', error.message);
      }
    }
    
    // Give some time for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.cleanupTasks = [];
    this.testServer = null;
    this.testClient = null;
    this.bot = null;
    this.globalCleanupHandler = null;
    
    console.log('✅ Test environment cleaned up');
  }
}

module.exports = RealBotTestHelper;
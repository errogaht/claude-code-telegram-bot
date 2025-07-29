#!/usr/bin/env node

/**
 * Test script to validate session persistence fixes
 */

const TelegramBot = require('./bot.js');

class SessionPersistenceTest {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
  }

  log(message) {
    console.log(`[TEST] ${message}`);
  }

  assert(condition, message) {
    if (condition) {
      this.log(`✅ PASS: ${message}`);
      this.testsPassed++;
    } else {
      this.log(`❌ FAIL: ${message}`);
      this.testsFailed++;
    }
  }

  async testStatusWithStoredSession() {
    this.log('Testing status command with stored session from config...');
    
    const mockConfig = {
      botToken: 'fake-token',
      adminUserId: '296224393',
      lastSession: {
        userId: '296224393',
        sessionId: 'test-session-id-12345678',
        timestamp: new Date().toISOString(),
        workingDirectory: '/test/directory',
        model: 'sonnet'
      }
    };

    try {
      // Create a bot instance for testing (won't actually connect to Telegram)
      const bot = new TelegramBot({
        config: mockConfig,
        workingDirectory: '/test/directory',
        model: 'sonnet'
      });

      // Simulate the startup restoration
      await bot.restoreLastSessionOnStartup();

      // Check if stored session ID is properly loaded
      const storedSessionId = bot.getStoredSessionId('296224393');
      
      this.assert(
        storedSessionId === 'test-session-id-12345678',
        'Stored session ID should be loaded from config'
      );

      // Test the showSessionStatus method logic
      const userId = '296224393';
      const session = bot.userSessions.get(userId);
      const storedId = bot.getStoredSessionId(userId);

      // Simulate the scenario: no active session but stored session exists
      this.assert(
        !session && storedId,
        'Should have stored session but no active session (after restart)'
      );

      this.log('Status command would now show stored session with resume option');
      
    } catch (error) {
      this.log(`❌ Test failed with error: ${error.message}`);
      this.testsFailed++;
    }
  }

  async testSessionPersistence() {
    this.log('Testing immediate session persistence to config...');
    
    const mockConfig = {
      botToken: 'fake-token',
      adminUserId: '296224393'
    };

    try {
      // Create temporary config file for testing
      const fs = require('fs');
      const testConfigPath = '/tmp/test-bot-config.json';
      fs.writeFileSync(testConfigPath, JSON.stringify(mockConfig, null, 2));

      const bot = new TelegramBot({
        config: mockConfig,
        configFilePath: testConfigPath,
        workingDirectory: '/test/directory',
        model: 'sonnet'
      });

      // Test storing session ID
      const testSessionId = 'test-session-abc123';
      await bot.saveCurrentSessionToConfig('296224393', testSessionId);

      // Verify it was saved
      const savedConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
      
      this.assert(
        savedConfig.lastSession && savedConfig.lastSession.sessionId === testSessionId,
        'Session ID should be immediately saved to config file'
      );

      this.assert(
        savedConfig.lastSession.userId === '296224393',
        'User ID should be saved with session'
      );

      // Clean up
      fs.unlinkSync(testConfigPath);
      
    } catch (error) {
      this.log(`❌ Test failed with error: ${error.message}`);
      this.testsFailed++;
    }
  }

  async runTests() {
    this.log('🧪 Starting Session Persistence Tests...');
    this.log('');

    await this.testStatusWithStoredSession();
    await this.testSessionPersistence();

    this.log('');
    this.log(`📊 Test Results:`);
    this.log(`✅ Passed: ${this.testsPassed}`);
    this.log(`❌ Failed: ${this.testsFailed}`);
    
    if (this.testsFailed === 0) {
      this.log('🎉 All tests passed! Session persistence is working correctly.');
      return true;
    } else {
      this.log('⚠️  Some tests failed. Check the implementation.');
      return false;
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new SessionPersistenceTest();
  test.runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = SessionPersistenceTest;
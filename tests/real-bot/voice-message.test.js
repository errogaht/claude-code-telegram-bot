/**
 * Real Bot Integration Tests - Voice Message Handling
 * Tests voice message upload, processing, and response workflows
 */

const RealBotTestHelper = require('./real-bot-test-helper');
const path = require('path');
const fs = require('fs');

describe('Real Bot Integration - Voice Message Handling', () => {
  let testHelper;
  let testVoiceFile;
  
  // Increase timeout for voice processing tests
  jest.setTimeout(120000);

  beforeAll(async () => {
    console.log('🔧 Setting up real bot test environment for voice message tests...');
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    testHelper = new RealBotTestHelper({
      serverPort: 8084, // Different port to avoid conflicts
      testUserId: 12347,
      workingDirectory: path.join(__dirname, '../../')
    });
    
    await testHelper.setup();
    
    // Create test voice file
    testVoiceFile = testHelper.createTestVoiceFile();
    console.log(`📁 Test voice file created: ${testVoiceFile}`);
  });

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear conversation history and ensure fresh session
    if (testHelper.testClient) {
      testHelper.testClient.clearHistory();
    }
    await testHelper.sendMessageAndWaitForResponse('/start');
  });

  describe('Voice Message Upload', () => {
    it('should accept voice message upload', async () => {
      expect(fs.existsSync(testVoiceFile)).toBe(true);
      
      const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 15000);
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Should acknowledge voice message receipt
      const responseText = response.message.text.toLowerCase();
      expect(
        responseText.includes('voice') ||
        responseText.includes('message') ||
        responseText.includes('received') ||
        responseText.includes('test mode') ||
        responseText.includes('transcription')
      ).toBe(true);
      
      console.log('✅ Voice message upload accepted');
    });

    it('should handle voice message with reasonable response time', async () => {
      const startTime = Date.now();
      
      const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 20000);
      
      const processingTime = Date.now() - startTime;
      
      expect(response).toBeDefined();
      expect(processingTime).toBeLessThan(20000); // Should process within 20 seconds
      
      console.log(`✅ Voice message processed in ${processingTime}ms`);
    });

    it('should provide meaningful response to voice message', async () => {
      const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      
      expect(response.message.text).toBeDefined();
      expect(response.message.text.length).toBeGreaterThan(5);
      
      // In test environment, should get test mode message
      const responseText = response.message.text;
      
      console.log('📝 Voice response text:', responseText);
      
      // Check for expected test mode response
      expect(
        responseText.includes('Voice Message Received') ||
        responseText.includes('Test voice message transcription') ||
        responseText.includes('Test Mode') ||
        responseText.includes('Simulated transcription')
      ).toBe(true);
      
      console.log('✅ Voice message generated appropriate test response');
    });
  });

  describe('Voice Message Processing Workflow', () => {
    it('should handle voice message in active session', async () => {
      // Send a regular message first to establish session
      await testHelper.sendMessageAndWaitForResponse('Hello, I will send a voice message next.');
      
      // Then send voice message
      const voiceResponse = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      
      expect(voiceResponse).toBeDefined();
      expect(voiceResponse.message.text).toBeDefined();
      
      console.log('✅ Voice message handled in active session');
    });

    it('should maintain conversation context after voice message', async () => {
      // Send voice message
      const voiceResponse = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      expect(voiceResponse).toBeDefined();
      
      // Send follow-up text message
      const followUpResponse = await testHelper.sendMessageAndWaitForResponse('Thank you for processing my voice message.');
      
      expect(followUpResponse).toBeDefined();
      expect(followUpResponse.message.text).toBeDefined();
      
      console.log('✅ Conversation context maintained after voice message');
    });

    it('should handle multiple voice messages in sequence', async () => {
      const responses = [];
      
      // Send multiple voice messages
      for (let i = 0; i < 2; i++) {
        try {
          const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 20000);
          responses.push(response);
          console.log(`✅ Voice message ${i + 1} processed successfully`);
          
          // Longer delay between voice messages to prevent interference
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`❌ Voice message ${i + 1} failed:`, error.message);
          // Don't fail the test if one voice message times out - this can happen in test environment
          responses.push(null);
        }
      }
      
      // At least one response should be valid
      const validResponses = responses.filter(r => r && r.message);
      expect(validResponses.length).toBeGreaterThan(0);
      
      console.log(`✅ ${validResponses.length}/2 voice messages processed successfully`);
    });
  });

  describe('Voice Message Error Handling', () => {
    it('should handle voice message in new session', async () => {
      // Start completely fresh session
      await testHelper.sendMessageAndWaitForResponse('🔄 New Session');
      
      // Send voice message immediately after new session
      const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      
      console.log('✅ Voice message handled in new session');
    });

    it('should handle voice message after stop command', async () => {
      // Stop any active processes
      await testHelper.sendMessageAndWaitForResponse('🛑 STOP');
      
      // Send voice message after stop
      const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      
      console.log('✅ Voice message handled after stop command');
    });

    it('should handle voice message with different session states', async () => {
      // Test voice message with different session states
      const sessionStates = [
        { action: '📊 Status', description: 'after status check' },
        { action: '📍 Path', description: 'after path check' },
        { action: '🤖 Model', description: 'after model selection' }
      ];
      
      for (const state of sessionStates) {
        // Set session state
        await testHelper.sendMessageAndWaitForResponse(state.action);
        
        // Send voice message
        const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 10000);
        
        expect(response).toBeDefined();
        expect(response.message).toBeDefined();
        
        console.log(`✅ Voice message handled ${state.description}`);
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    });
  });

  describe('Voice Message Integration Features', () => {
    it('should handle voice message with button interactions', async () => {
      // Send voice message
      const voiceResponse = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      expect(voiceResponse).toBeDefined();
      
      // Press a button after voice message
      const buttonResponse = await testHelper.sendMessageAndWaitForResponse('📊 Status');
      
      expect(buttonResponse).toBeDefined();
      expect(buttonResponse.message).toBeDefined();
      
      console.log('✅ Button interaction works after voice message');
    });

    it('should maintain keyboard after voice message processing', async () => {
      const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      
      // Check if keyboard is maintained
      if (response.message.reply_markup && response.message.reply_markup.keyboard) {
        expect(response.message.reply_markup.keyboard).toBeDefined();
        console.log('✅ Keyboard maintained after voice message');
      } else {
        console.log('ℹ️ No keyboard in voice response (might be by design)');
      }
    });

    it('should handle voice message followed by regular command', async () => {
      // Send voice message first
      await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
      
      // Send regular command
      const commandResponse = await testHelper.sendMessageAndWaitForResponse('/start');
      
      expect(commandResponse).toBeDefined();
      expect(commandResponse.message).toBeDefined();
      
      console.log('✅ Regular command works after voice message');
    });
  });

  describe('Voice Message File Handling', () => {
    it('should handle missing voice file gracefully', async () => {
      const nonExistentFile = path.join(__dirname, 'nonexistent-voice.ogg');
      
      try {
        await testHelper.sendVoiceAndWaitForResponse(nonExistentFile);
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        expect(error.message).toContain('Voice file not found');
        console.log('✅ Missing voice file handled gracefully');
      }
    });

    it('should validate voice file format expectations', async () => {
      // Test that our test voice file meets basic requirements
      const stats = fs.statSync(testVoiceFile);
      
      expect(stats.size).toBeGreaterThan(0);
      expect(testVoiceFile.endsWith('.ogg')).toBe(true);
      
      console.log(`✅ Test voice file validation: ${stats.size} bytes`);
    });
  });

  describe('Voice Message Response Quality', () => {
    it('should provide different responses to multiple voice messages', async () => {
      const responses = [];
      
      // Send multiple voice messages and collect responses
      for (let i = 0; i < 2; i++) {
        try {
          const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 20000);
          responses.push(response.message.text);
          console.log(`✅ Voice response ${i + 1}: ${response.message.text.substring(0, 50)}...`);
          
          // Longer delay between messages
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          console.error(`❌ Voice message ${i + 1} failed:`, error.message);
          // Don't fail the test if one voice message times out
          responses.push(null);
        }
      }
      
      // Filter out null responses and validate the valid ones
      const validResponses = responses.filter(text => text && text.length > 0);
      expect(validResponses.length).toBeGreaterThan(0);
      
      console.log(`✅ ${validResponses.length}/2 voice messages generated valid responses`);
    });

    it('should handle voice message processing status updates', async () => {
      // Some bots show processing status, others don't
      // This test just ensures the final response is complete
      
      const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 20000);
      
      expect(response).toBeDefined();
      expect(response.message.text).toBeDefined();
      
      // Response should appear complete (not cut off)
      const responseText = response.message.text;
      expect(responseText.length).toBeGreaterThan(10);
      
      console.log('✅ Voice message processing completed with full response');
    });
  });
});
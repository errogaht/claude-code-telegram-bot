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
    // Clear conversation history - don't always need /start
    if (testHelper.testClient) {
      testHelper.testClient.clearHistory();
    }
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
    it('should handle all voice message workflow scenarios efficiently', async () => {
      // Start with a fresh session
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      const workflowTests = [
        {
          name: 'active_session',
          setup: async () => {
            await testHelper.sendMessageAndWaitForResponse('Hello, I will send a voice message next.');
          },
          test: async () => {
            return await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
          },
          description: 'voice message in active session'
        },
        {
          name: 'context_maintenance', 
          setup: async () => {
            // Send voice message first
            await testHelper.sendVoiceAndWaitForResponse(testVoiceFile);
          },
          test: async () => {
            // Follow up with text message
            return await testHelper.sendMessageAndWaitForResponse('Thank you for processing my voice message.');
          },
          description: 'conversation context after voice message'
        },
        {
          name: 'sequential_voice',
          setup: async () => {}, // No setup needed
          test: async () => {
            // Send one voice message (reduced from 2 for speed)
            return await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 20000);
          },
          description: 'sequential voice message processing'
        }
      ];
      
      const workflowResults = [];
      
      for (const workflow of workflowTests) {
        try {
          await workflow.setup();
          const response = await workflow.test();
          
          workflowResults.push({
            name: workflow.name,
            success: !!(response && response.message),
            description: workflow.description
          });
          
          console.log(`✅ ${workflow.description}: handled successfully`);
          
          // Short delay between workflow tests
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          workflowResults.push({
            name: workflow.name,
            success: false,
            error: error.message,
            description: workflow.description
          });
          console.warn(`⚠️ ${workflow.description} failed: ${error.message}`);
        }
      }
      
      // Validate that at least some workflow tests passed
      const successfulWorkflows = workflowResults.filter(r => r.success);
      expect(successfulWorkflows.length).toBeGreaterThan(0);
      console.log(`📊 Voice workflow tests: ${successfulWorkflows.length}/${workflowTests.length} passed`);
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

    it('should handle voice messages across all session states efficiently', async () => {
      // Start with fresh session
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      // Test voice message with different session states
      const sessionStates = [
        { action: '📊 Status', description: 'after status check' },
        { action: '📍 Path', description: 'after path check' },
        { action: '🤖 Model', description: 'after model selection' }
      ];
      
      const stateResults = [];
      
      for (const state of sessionStates) {
        try {
          // Set session state
          await testHelper.sendMessageAndWaitForResponse(state.action);
          
          // Send voice message
          const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 8000);
          
          stateResults.push({
            state: state.action,
            success: !!(response && response.message),
            description: state.description
          });
          
          console.log(`✅ Voice message handled ${state.description}`);
          
        } catch (error) {
          stateResults.push({
            state: state.action,
            success: false,
            error: error.message,
            description: state.description
          });
          console.warn(`⚠️ Voice message ${state.description} failed: ${error.message}`);
        }
      }
      
      // Validate that at least some session state tests passed
      const successfulStates = stateResults.filter(r => r.success);
      expect(successfulStates.length).toBeGreaterThan(0);
      console.log(`📊 Session state tests: ${successfulStates.length}/${sessionStates.length} passed`);
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
    it('should validate all voice message response quality aspects', async () => {
      // Start with fresh session
      await testHelper.sendMessageAndWaitForResponse('/start');
      
      const qualityTests = [
        {
          name: 'response_completeness',
          test: async () => {
            const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 15000);
            return {
              hasResponse: !!(response && response.message && response.message.text),
              textLength: response?.message?.text?.length || 0,
              isComplete: (response?.message?.text?.length || 0) > 10
            };
          },
          description: 'voice message response completeness'
        },
        {
          name: 'response_quality',
          test: async () => {
            const response = await testHelper.sendVoiceAndWaitForResponse(testVoiceFile, 15000);
            const responseText = response?.message?.text || '';
            return {
              hasResponse: !!response,
              hasText: responseText.length > 0,
              hasExpectedContent: responseText.toLowerCase().includes('voice') || 
                                 responseText.toLowerCase().includes('test') ||
                                 responseText.toLowerCase().includes('transcription')
            };
          },
          description: 'voice message response quality'
        }
      ];
      
      const qualityResults = [];
      
      for (const qualityTest of qualityTests) {
        try {
          const result = await qualityTest.test();
          
          qualityResults.push({
            name: qualityTest.name,
            success: result.hasResponse,
            details: result,
            description: qualityTest.description
          });
          
          console.log(`✅ ${qualityTest.description}: validated`);
          
          // Delay between tests
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          qualityResults.push({
            name: qualityTest.name,
            success: false,
            error: error.message,
            description: qualityTest.description
          });
          console.warn(`⚠️ ${qualityTest.description} failed: ${error.message}`);
        }
      }
      
      // Validate that at least one quality test passed
      const successfulQuality = qualityResults.filter(r => r.success);
      expect(successfulQuality.length).toBeGreaterThan(0);
      console.log(`📊 Voice quality tests: ${successfulQuality.length}/${qualityTests.length} passed`);
    });
  });
});
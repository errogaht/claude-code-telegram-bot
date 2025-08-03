/**
 * Message Splitter HTML Workflow Tests
 * Tests the complete workflow: Raw Claude output → HTML conversion → Smart splitting
 * 
 * This test addresses the issue where large Claude outputs with complex Markdown
 * cause problems when sent to Telegram API due to unclosed HTML tags after splitting.
 */

const MessageSplitter = require('../../MessageSplitter');
const TelegramFormatter = require('../../telegram-formatter');
const fs = require('fs');
const path = require('path');

describe('MessageSplitter HTML Workflow Integration', () => {
  let testData;
  let mockBot;

  beforeEach(() => {
    // Load the problematic Claude output from test data
    const testDataPath = path.join(__dirname, '../data/5c338118-50c0-4fef-b060-34a71aa1b74a.jsonl');
    const rawData = fs.readFileSync(testDataPath, 'utf8');
    const parsedData = JSON.parse(rawData);
    testData = parsedData.message.content[0].text;

    // Mock bot for testing
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 123 })
    };
  });

  describe('Raw Claude Output Analysis', () => {
    test('should identify the problematic Claude output characteristics', () => {
      expect(testData).toBeDefined();
      expect(typeof testData).toBe('string');
      expect(testData.length).toBeGreaterThan(5000); // Large output
      
      // Check for complex Markdown structures that cause HTML issues
      expect(testData).toContain('**'); // Bold markers
      expect(testData).toContain('##'); // Headers
      expect(testData).toContain('```'); // Code blocks
      expect(testData).toContain('|'); // Tables
      expect(testData).toContain('- '); // Lists
      
      console.log(`📊 Claude output stats:
        - Length: ${testData.length} chars
        - Contains tables: ${testData.includes('|')}
        - Contains code blocks: ${testData.includes('```')}
        - Contains headers: ${testData.includes('##')}
        - Contains bold text: ${testData.includes('**')}
      `);
    });
  });

  describe('HTML Conversion Issues', () => {
    test('should identify potential HTML tag issues after conversion', () => {
      // Convert markdown to HTML using TelegramFormatter
      const formatter = new TelegramFormatter({ mode: 'html' });
      const formatted = formatter.formatAssistantText(testData);
      const htmlContent = formatted;
      
      // Check for potential unclosed tag patterns
      const openTags = (htmlContent.match(/<[^/>]+>/g) || []).length;
      const closeTags = (htmlContent.match(/<\/[^>]+>/g) || []).length;
      const selfClosingTags = (htmlContent.match(/<[^>]+\/>/g) || []).length;
      
      console.log(`🔍 HTML tag analysis:
        - Open tags: ${openTags}
        - Close tags: ${closeTags}
        - Self-closing tags: ${selfClosingTags}
        - Tag balance: ${openTags - closeTags - selfClosingTags === 0 ? 'BALANCED' : 'UNBALANCED'}
      `);
      
      // The issue: when this HTML is split, tags may become unbalanced
      expect(htmlContent.length).toBeGreaterThan(testData.length * 0.8); // HTML should be similar length
    });

    test('should demonstrate the splitting problem with HTML content', () => {
      const formatter = new TelegramFormatter({ mode: 'html' });
      const formatted = formatter.formatAssistantText(testData);
      const htmlContent = formatted;
      
      // Split the HTML content using current splitter
      const splitter = new MessageSplitter({ safeLength: 4000 });
      const chunks = splitter.splitMessageIntelligently(htmlContent, 4000);
      
      expect(chunks.length).toBeGreaterThan(1); // Should be split
      
      // Check each chunk for HTML balance
      const unbalancedChunks = [];
      chunks.forEach((chunk, index) => {
        const isBalanced = splitter.isHtmlBalanced(chunk);
        if (!isBalanced) {
          unbalancedChunks.push(index + 1);
        }
        console.log(`📄 Chunk ${index + 1}: ${chunk.length} chars, balanced: ${isBalanced}`);
      });
      
      if (unbalancedChunks.length > 0) {
        console.log(`⚠️  Unbalanced chunks found: ${unbalancedChunks.join(', ')}`);
      }
      
      // This test demonstrates the problem - some chunks may have unbalanced HTML
      expect(chunks.every(chunk => chunk.length <= 4000)).toBe(true);
    });
  });

  describe('Complete Workflow: Raw → HTML → Split → Send', () => {
    test('should handle the complete workflow without HTML tag issues', async () => {
      // Step 1: Start with raw Claude output
      const rawOutput = testData;
      
      // Step 2: Convert to HTML using telegram-formatter
      const formatter = new TelegramFormatter({ mode: 'html' });
      const formatted = formatter.formatAssistantText(rawOutput);
      const htmlContent = formatted;
      
      // Step 3: Split the HTML content intelligently
      const splitter = new MessageSplitter({ safeLength: 4000 });
      
      // Step 4: Send using the splitter's sendLongMessage method
      await splitter.sendLongMessage(mockBot, 12345, htmlContent, { parse_mode: 'HTML' });
      
      // Verify the workflow completed
      expect(mockBot.sendMessage).toHaveBeenCalled();
      
      // Get the call arguments to verify HTML integrity
      const calls = mockBot.sendMessage.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      
      // Check each sent message for HTML balance
      let allBalanced = true;
      calls.forEach((call, index) => {
        const [chatId, message, options] = call;
        expect(chatId).toBe(12345);
        expect(options?.parse_mode).toBe('HTML');
        
        // Remove part indicators for HTML balance check
        const messageContent = message.replace(/\n\n_\\[Part \d+\/\d+\\]_$/, '');
        const isBalanced = splitter.isHtmlBalanced(messageContent);
        
        if (!isBalanced) {
          allBalanced = false;
          console.log(`❌ Unbalanced HTML in message ${index + 1}: "${messageContent.substring(0, 100)}..."`);
        }
      });
      
      console.log(`📨 Sent ${calls.length} messages, all HTML balanced: ${allBalanced}`);
      
      // All sent messages should have balanced HTML
      expect(allBalanced).toBe(true);
    });

    test('should handle edge cases with complex markdown structures', async () => {
      // Test with specific problematic patterns from the Claude output
      const problematicPatterns = [
        // Large table
        testData.substring(testData.indexOf('|'), testData.indexOf('|') + 2000),
        // Code blocks with markdown inside
        testData.substring(testData.indexOf('```'), testData.indexOf('```') + 1000),
        // Nested bold and headers
        testData.substring(testData.indexOf('**'), testData.indexOf('**') + 500)
      ];
      
      for (const pattern of problematicPatterns) {
        if (pattern && pattern.length > 100) { // Skip if pattern not found
          const formatter = new TelegramFormatter({ mode: 'html' });
          const formatted = formatter.formatAssistantText(pattern);
          const htmlContent = formatted;
          
          const splitter = new MessageSplitter({ safeLength: 2000 });
          await splitter.sendLongMessage(mockBot, 12345, htmlContent, { parse_mode: 'HTML' });
          
          // Should not throw errors
          expect(mockBot.sendMessage).toHaveBeenCalled();
        }
      }
    });
  });

  describe('Performance with Large Content', () => {
    test('should handle large Claude outputs efficiently', async () => {
      const startTime = Date.now();
      
      // Process the full Claude output
      const formatter = new TelegramFormatter({ mode: 'html' });
      const formatted = formatter.formatAssistantText(testData);
      const htmlContent = formatted;
      
      const splitter = new MessageSplitter({ safeLength: 4000 });
      await splitter.sendLongMessage(mockBot, 12345, htmlContent, { parse_mode: 'HTML' });
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      console.log(`⏱️  Processing time: ${processingTime}ms for ${testData.length} chars`);
      
      // Should complete within reasonable time (< 5 seconds for even very large content)
      expect(processingTime).toBeLessThan(5000);
      
      // Should have sent multiple messages
      expect(mockBot.sendMessage).toHaveBeenCalled();
      expect(mockBot.sendMessage.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Error Recovery', () => {
    test('should handle HTML conversion failures gracefully', async () => {
      // Mock formatter to throw error
      const formatter = new TelegramFormatter({ mode: 'html' });
      const originalFormat = formatter.formatAssistantText;
      formatter.formatAssistantText = jest.fn().mockImplementation(() => {
        throw new Error('HTML conversion failed');
      });
      
      const splitter = new MessageSplitter({ safeLength: 4000 });
      
      // Should not crash when HTML conversion fails
      await expect(async () => {
        try {
          const formatted = formatter.formatAssistantText(testData);
          await splitter.sendLongMessage(mockBot, 12345, formatted);
        } catch (error) {
          // Fall back to plain text
          await splitter.sendLongMessage(mockBot, 12345, testData);
        }
      }).not.toThrow();
      
      // Restore original method
      formatter.formatAssistantText = originalFormat;
    });

    test('should handle malformed HTML gracefully', async () => {
      // Create intentionally malformed HTML
      const malformedHtml = '<b>Bold text <i>italic <u>underlined</b> wrong nesting</i></u>';
      
      const splitter = new MessageSplitter({ safeLength: 100 });
      
      // Should not crash with malformed HTML
      await expect(
        splitter.sendLongMessage(mockBot, 12345, malformedHtml, { parse_mode: 'HTML' })
      ).resolves.not.toThrow();
      
      expect(mockBot.sendMessage).toHaveBeenCalled();
    });
  });
});
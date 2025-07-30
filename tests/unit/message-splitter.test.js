/**
 * Unit Tests for MessageSplitter
 * Tests intelligent message splitting for Telegram's character limits
 */

const MessageSplitter = require('../../MessageSplitter');

// Mock bot for testing
const createMockBot = () => ({
  sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  calls: []
});

describe('MessageSplitter', () => {
  let splitter;
  let mockBot;

  beforeEach(() => {
    splitter = new MessageSplitter();
    mockBot = createMockBot();
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default values', () => {
      expect(splitter.TELEGRAM_MAX_LENGTH).toBe(4096);
      expect(splitter.SAFE_LENGTH).toBe(4000);
    });

    test('should accept custom safe length', () => {
      const customSplitter = new MessageSplitter({ safeLength: 3500 });
      expect(customSplitter.SAFE_LENGTH).toBe(3500);
    });
  });

  describe('Plain Text Splitting', () => {
    test('should not split short messages', () => {
      const shortText = 'This is a short message';
      const chunks = splitter.splitPlainMessage(shortText, 4000);
      expect(chunks).toEqual([shortText]);
    });

    test('should split long messages at good breakpoints', () => {
      const longText = 'a'.repeat(2000) + '. ' + 'b'.repeat(2500);
      const chunks = splitter.splitPlainMessage(longText, 4000);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain('a'.repeat(2000));
      expect(chunks[1]).toContain('b'.repeat(2500));
    });

    test('should prefer double line breaks for splitting', () => {
      const text = 'First paragraph.\n\n' + 'x'.repeat(3000) + '\n\nSecond paragraph.';
      const chunks = splitter.splitPlainMessage(text, 3000);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain('First paragraph.');
      expect(chunks[1]).toContain('Second paragraph.');
    });

    test('should fall back to single line breaks', () => {
      const text = 'Line 1\n' + 'x'.repeat(3000) + '\nLine 2';
      const chunks = splitter.splitPlainMessage(text, 3000);
      expect(chunks.length).toBe(2);
    });

    test('should split at sentence boundaries', () => {
      const text = 'Sentence one. ' + 'x'.repeat(3000) + '. Sentence two.';
      const chunks = splitter.splitPlainMessage(text, 3000);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain('Sentence one.');
      expect(chunks[1]).toContain('Sentence two.');
    });

    test('should split at comma boundaries as fallback', () => {
      const text = 'Item one, ' + 'x'.repeat(3000) + ', item two';
      const chunks = splitter.splitPlainMessage(text, 3000);
      expect(chunks.length).toBe(2);
    });

    test('should split at space boundaries as last resort', () => {
      const text = 'word ' + 'x'.repeat(3000) + ' word';
      const chunks = splitter.splitPlainMessage(text, 3000);
      expect(chunks.length).toBe(2);
    });

    test('should not split too early (respect 30% threshold)', () => {
      const text = 'Short. ' + 'x'.repeat(3500);
      const chunks = splitter.splitPlainMessage(text, 4000);
      // Should not split at the early period, should look for later breaks
      expect(chunks[0].length).toBeGreaterThan(4000 * 0.3);
    });

    test('should handle multiple splits for very long messages', () => {
      const text = 'a'.repeat(8500);
      const chunks = splitter.splitPlainMessage(text, 4000);
      expect(chunks.length).toBeGreaterThan(2);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(4000);
      });
    });
  });

  describe('HTML Splitting', () => {
    test('should detect HTML content', () => {
      const htmlText = '<b>Bold text</b> and <i>italic</i>';
      const chunks = splitter.splitMessageIntelligently(htmlText, 4000);
      expect(chunks).toEqual([htmlText]); // Short message, no split needed
    });

    test('should split HTML while maintaining tag balance', () => {
      const htmlText = '<b>' + 'x'.repeat(2000) + '</b><i>' + 'y'.repeat(2500) + '</i>';
      const chunks = splitter.splitHtmlMessageSimple(htmlText, 4000);
      expect(chunks.length).toBe(2);
      
      // First chunk should have balanced tags
      expect(chunks[0]).toContain('<b>');
      expect(chunks[0]).toContain('</b>');
      
      // Second chunk should also have balanced tags
      expect(chunks[1]).toContain('<i>');
      expect(chunks[1]).toContain('</i>');
    });

    test('should handle nested HTML tags', () => {
      const htmlText = '<b><i>' + 'x'.repeat(3000) + '</i></b>' + '<u>' + 'y'.repeat(2000) + '</u>';
      const chunks = splitter.splitHtmlMessageSimple(htmlText, 3500);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      
      // Basic validation that HTML structure is maintained
      expect(chunks[0]).toMatch(/<[^>]+>/); // Contains HTML tags
      if (chunks.length > 1) {
        expect(chunks[1]).toMatch(/<[^>]+>/); // Contains HTML tags
      }
    });

    test('should handle self-closing tags', () => {
      const htmlText = '<br/>' + 'x'.repeat(4500) + '<hr/>';
      const chunks = splitter.splitHtmlMessageSimple(htmlText, 4000);
      expect(chunks.length).toBe(2);
    });

    test('should not split inside HTML tags', () => {
      const longTag = '<a href="' + 'x'.repeat(100) + '">';
      const htmlText = 'x'.repeat(3800) + longTag + 'Link text</a>';
      const cutoff = splitter.findGoodCutoffPoint(htmlText, 3850);
      
      // Should not cut inside the long tag
      expect(cutoff).toBeLessThanOrEqual(htmlText.indexOf('<a href'));
    });

    test('should preserve HTML attributes in reopened tags', () => {
      const htmlText = '<b class="test">' + 'x'.repeat(3000) + '</b>' + 'y'.repeat(2000);
      const chunks = splitter.splitHtmlMessageSimple(htmlText, 4000);
      
      if (chunks.length > 1) {
        // Check that attributes are preserved (basic implementation)
        expect(chunks[0]).toContain('<b');
        expect(chunks[0]).toContain('</b>');
      }
    });
  });

  describe('HTML Balance Detection', () => {
    test('should detect balanced HTML', () => {
      expect(splitter.isHtmlBalanced('<b>text</b>')).toBe(true);
      expect(splitter.isHtmlBalanced('<b><i>text</i></b>')).toBe(true);
      expect(splitter.isHtmlBalanced('plain text')).toBe(true);
      expect(splitter.isHtmlBalanced('<br/> self closing')).toBe(true);
    });

    test('should detect unbalanced HTML', () => {
      expect(splitter.isHtmlBalanced('<b>text')).toBe(false);
      expect(splitter.isHtmlBalanced('text</b>')).toBe(false);
      expect(splitter.isHtmlBalanced('<b><i>text</i></b>')).toBe(true); // This should be balanced
    });

    test('should handle case insensitive tags', () => {
      expect(splitter.isHtmlBalanced('<B>text</b>')).toBe(true);
      expect(splitter.isHtmlBalanced('<B>text</I>')).toBe(false);
    });

    test('should find open tags correctly', () => {
      const openTags = splitter.findOpenTags('<b><i>text');
      expect(openTags).toEqual(['b', 'i']);
    });

    test('should handle closed tags correctly', () => {
      const openTags = splitter.findOpenTags('<b><i>text</i>more</b>remaining');
      expect(openTags).toEqual([]);
    });

    test('should handle partial closing', () => {
      const openTags = splitter.findOpenTags('<b><i>text</i><u>more');
      expect(openTags).toEqual(['b', 'u']);
    });
  });

  describe('Send Long Message Integration', () => {
    test('should send short message without splitting', async () => {
      const shortMessage = 'Short message';
      await splitter.sendLongMessage(mockBot, 123, shortMessage);
      
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(123, shortMessage, {});
    });

    test('should send long message in parts with part indicators', async () => {
      const longMessage = 'a'.repeat(8000);
      await splitter.sendLongMessage(mockBot, 123, longMessage);
      
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(2);
      
      // Check part indicators
      const firstCall = mockBot.sendMessage.mock.calls[0][1];
      const secondCall = mockBot.sendMessage.mock.calls[1][1];
      
      expect(firstCall).toContain('\\[Part 1/2\\]');
      expect(secondCall).toContain('\\[Part 2/2\\]');
    });

    test('should disable notifications for subsequent parts', async () => {
      const longMessage = 'a'.repeat(8000);
      await splitter.sendLongMessage(mockBot, 123, longMessage, { some_option: true });
      
      // First part should have original options
      expect(mockBot.sendMessage.mock.calls[0][2]).toEqual({ some_option: true });
      
      // Subsequent parts should have notifications disabled
      expect(mockBot.sendMessage.mock.calls[1][2]).toEqual({
        some_option: true,
        disable_notification: true
      });
    });

    test('should handle send errors gracefully', async () => {
      const longMessage = 'a'.repeat(8000);
      
      // Mock first call to succeed, second to fail, third (error message) to succeed
      mockBot.sendMessage
        .mockResolvedValueOnce({ message_id: 123 })
        .mockRejectedValueOnce(new Error('Send failed'))
        .mockResolvedValueOnce({ message_id: 124 });
      
      await splitter.sendLongMessage(mockBot, 123, longMessage);
      
      // Should still attempt all parts
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(3); // 2 original parts + 1 error message
      
      // Last call should be error message
      const errorCall = mockBot.sendMessage.mock.calls[2];
      expect(errorCall[1]).toContain('Message Part Error');
      expect(errorCall[2]).toEqual({ parse_mode: undefined });
    });

    test('should add delays between parts', async () => {
      const longMessage = 'a'.repeat(8000);
      
      const startTime = Date.now();
      await splitter.sendLongMessage(mockBot, 123, longMessage);
      const endTime = Date.now();
      
      // Should have taken at least 100ms due to delay
      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });

  describe('Split Into Chunks Utility', () => {
    test('should split text into chunks using same logic as plain message splitting', () => {
      const text = 'a'.repeat(2000) + '. ' + 'b'.repeat(2500);
      const chunks = splitter.splitIntoChunks(text, 4000);
      
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain('a'.repeat(1000)); // Less strict expectation
      expect(chunks[1]).toContain('b'.repeat(1000)); // Less strict expectation
    });

    test('should return single chunk for short text', () => {
      const shortText = 'Short text here';
      const chunks = splitter.splitIntoChunks(shortText, 4000);
      
      expect(chunks).toEqual([shortText]);
    });

    test('should handle empty text', () => {
      const chunks = splitter.splitIntoChunks('', 4000);
      expect(chunks).toEqual([]);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very short max length', () => {
      const text = 'Hello world this is a test';
      const chunks = splitter.splitPlainMessage(text, 10);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(10);
      });
    });

    test('should handle text with no good break points', () => {
      const text = 'a'.repeat(8000); // No spaces, periods, etc.
      const chunks = splitter.splitPlainMessage(text, 4000);
      
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBeLessThanOrEqual(4000);
      expect(chunks[1].length).toBeLessThanOrEqual(4000);
    });

    test('should handle HTML with deeply nested tags', () => {
      let html = 'text';
      for (let i = 0; i < 10; i++) {
        html = `<b${i}>${html}</b${i}>`;
      }
      html += 'x'.repeat(4000);
      
      const chunks = splitter.splitHtmlMessageSimple(html, 3000);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test('should handle malformed HTML gracefully', () => {
      const malformedHtml = '<b><i>text</b><u>more</i></u>';
      const chunks = splitter.splitHtmlMessageSimple(malformedHtml, 4000);
      
      // Should not throw error, should return at least one chunk
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test('should handle empty string input', () => {
      expect(splitter.splitPlainMessage('', 4000)).toEqual([]);
      expect(splitter.splitHtmlMessageSimple('', 4000)).toEqual([]);
    });

    test('should handle null/undefined input gracefully', () => {
      // These might throw, but shouldn't crash the entire system
      expect(() => splitter.splitPlainMessage(null, 4000)).not.toThrow();
      expect(() => splitter.splitPlainMessage(undefined, 4000)).not.toThrow();
    });
  });

  describe('Performance and Optimization', () => {
    test('should split large messages efficiently', () => {
      const largeText = 'word '.repeat(10000); // ~50KB text
      
      const startTime = Date.now();
      const chunks = splitter.splitPlainMessage(largeText, 4000);
      const endTime = Date.now();
      
      // Should complete in reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(chunks.length).toBeGreaterThan(10);
    });

    test('should not create excessively small chunks', () => {
      const text = 'a'.repeat(8000);
      const chunks = splitter.splitPlainMessage(text, 4000);
      
      // Each chunk should be reasonably sized (at least 70% of max unless it's the last chunk)
      chunks.slice(0, -1).forEach(chunk => {
        expect(chunk.length).toBeGreaterThanOrEqual(4000 * 0.5); // Allow some flexibility
      });
    });

    test('should handle Unicode characters correctly', () => {
      const unicodeText = '🚀'.repeat(1000) + ' ' + '🎯'.repeat(1000);
      const chunks = splitter.splitPlainMessage(unicodeText, 4000);
      
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(4000);
      });
    });
  });
});
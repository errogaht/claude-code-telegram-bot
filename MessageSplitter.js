/**
 * Message Splitter - Telegram Message Splitting Utility
 * Handles intelligent splitting of long messages for Telegram's 4096 character limit
 * Supports both plain text and HTML-aware splitting with tag balancing
 */

class MessageSplitter {
  constructor(options = {}) {
    this.TELEGRAM_MAX_LENGTH = 4096;
    this.SAFE_LENGTH = options.safeLength || 4000; // Leave some buffer for markdown
  }

  /**
   * Send a long message by splitting it intelligently across multiple parts
   */
  async sendLongMessage(bot, chatId, text, options = {}) {
    // Smart splitting: try to split at good points
    const chunks = this.splitMessageIntelligently(text, this.SAFE_LENGTH);
    
    console.log(`📨 Splitting long message (${text.length} chars) into ${chunks.length} parts`);
    
    let firstMessage = null;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Add part indicator for multi-part messages
      let finalChunk = chunk;
      if (chunks.length > 1) {
        const partInfo = `\n\n_\\[Part ${i + 1}/${chunks.length}\\]_`;
        finalChunk = chunk + partInfo;
      }
      
      try {
        // Only notify on first part to avoid spam
        const chunkOptions = { ...options };
        if (i > 0) {
          chunkOptions.disable_notification = true;
        }
        
        const sentMessage = await bot.sendMessage(chatId, finalChunk, chunkOptions);
        
        // Store the first message to return (needed for callbacks with keyboards)
        if (i === 0) {
          firstMessage = sentMessage;
        }
        
        // Small delay between parts to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        // Only log errors in non-test environments to reduce test noise
        if (process.env.NODE_ENV !== 'test') {
          console.error(`❌ Failed to send part ${i + 1}/${chunks.length}:`, error.message);
          console.error(`🔍 Problematic chunk content (${chunk.length} chars):`);
          console.error('--- START CHUNK ---');
          console.error(chunk);
          console.error('--- END CHUNK ---');
        }
        
        // If this part fails, try to send error info
        try {
          await bot.sendMessage(chatId, 
            `❌ **Message Part Error**\n\nFailed to send part ${i + 1} of ${chunks.length}.\nLength: ${chunk.length} chars`,
            { parse_mode: undefined }
          );
        } catch (errorSendingError) {
          // Only log errors in non-test environments
          if (process.env.NODE_ENV !== 'test') {
            console.error(`❌ Failed to send error message:`, errorSendingError.message);
          }
        }
      }
    }
    
    // Return the first message (important for callbacks with keyboards)
    return firstMessage;
  }

  /**
   * Intelligently split message at good breakpoints with HTML support
   */
  splitMessageIntelligently(text, maxLength) {
    if (text.length <= maxLength) {
      return [text];
    }
    
    // Check if text contains HTML tags
    const hasHtmlTags = /<[^>]+>/.test(text);
    
    if (hasHtmlTags) {
      console.log('🔧 Using HTML-aware splitting');
      return this.splitHtmlMessageSimple(text, maxLength);
    } else {
      console.log('📝 Using plain text splitting');
      return this.splitPlainMessage(text, maxLength);
    }
  }

  /**
   * Intelligent HTML-aware splitting with validation-based cutoff
   */
  splitHtmlMessageSimple(text, maxLength) {
    const chunks = [];
    let remaining = text;
    
    while (remaining.length > maxLength) {
      // Find the best split point that ensures HTML balance
      let bestSplitPoint = this.findBestHtmlSplitPoint(remaining, maxLength);
      
      // Get the chunk up to best split point  
      let chunk = remaining.substring(0, bestSplitPoint).trim();
      
      // If chunk is not HTML balanced, apply tag closing/opening
      if (!this.isHtmlBalanced(chunk)) {
        const openTags = this.findOpenTags(chunk);
        // Add closing tags to current chunk
        for (let i = openTags.length - 1; i >= 0; i--) {
          chunk += `</${openTags[i]}>`;
        }
        
        // Add opening tags to remaining text
        let nextPart = remaining.substring(bestSplitPoint).trim();
        for (const tag of openTags) {
          nextPart = `<${tag}>` + nextPart;
        }
        remaining = nextPart;
      } else {
        remaining = remaining.substring(bestSplitPoint).trim();
      }
      
      chunks.push(chunk);
    }
    
    // Add the final remaining part
    if (remaining.length > 0) {
      chunks.push(remaining);
    }
    
    return chunks;
  }

  /**
   * Find the best split point that ensures HTML tags are balanced
   */
  findBestHtmlSplitPoint(text, maxLength) {
    // Start with a minimum safe length (70% of max) and work up to max
    const minLength = Math.floor(maxLength * 0.7);
    
    // Try different split points, preferring longer chunks
    for (let testLength = maxLength; testLength >= minLength; testLength -= 10) {
      let testPoint = this.findGoodCutoffPoint(text, testLength);
      let testChunk = text.substring(0, testPoint).trim();
      
      // Check if this chunk has balanced HTML
      if (this.isHtmlBalanced(testChunk)) {
        console.log(`🎯 Found balanced split at ${testChunk.length} chars (target was ${maxLength})`);
        return testPoint;
      }
    }
    
    // If no balanced point found, use the simple approach with tag closing
    console.log(`⚠️ No balanced split found, using tag-closing approach`);
    
    // Find a smaller cutoff point and add closing tags
    let cutoffPoint = this.findGoodCutoffPoint(text, Math.floor(maxLength * 0.8));
    let chunk = text.substring(0, cutoffPoint).trim();
    
    // Find open tags and add closing tags
    const openTags = this.findOpenTags(chunk);
    const closingTags = openTags.map(tag => `</${tag}>`).reverse().join('');
    
    // Adjust cutoff if adding closing tags would exceed max length
    while (chunk.length + closingTags.length > maxLength && cutoffPoint > minLength) {
      cutoffPoint = Math.floor(cutoffPoint * 0.9);
      cutoffPoint = this.findGoodCutoffPoint(text, cutoffPoint);
      chunk = text.substring(0, cutoffPoint).trim();
    }
    
    return cutoffPoint;
  }

  /**
   * Check if HTML tags are balanced in text
   */
  isHtmlBalanced(text) {
    const openTags = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    let match;
    
    while ((match = tagRegex.exec(text)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      
      if (fullTag.startsWith('</')) {
        // Closing tag
        const index = openTags.lastIndexOf(tagName);
        if (index !== -1) {
          openTags.splice(index, 1);
        } else {
          // Unmatched closing tag
          return false;
        }
      } else if (!fullTag.endsWith('/>')) {
        // Opening tag (not self-closing)
        openTags.push(tagName);
      }
    }
    
    // All tags should be closed for balanced HTML
    return openTags.length === 0;
  }

  /**
   * Find all unclosed opening HTML tags in text
   */
  findOpenTags(text) {
    const openTags = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    let match;
    
    while ((match = tagRegex.exec(text)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      
      if (fullTag.startsWith('</')) {
        // Closing tag - remove from open tags
        const index = openTags.lastIndexOf(tagName);
        if (index !== -1) {
          openTags.splice(index, 1);
        }
      } else if (!fullTag.endsWith('/>')) {
        // Opening tag (not self-closing)
        openTags.push(tagName);
      }
    }
    
    return openTags;
  }

  /**
   * Find good cutoff point that doesn't break HTML tags
   */
  findGoodCutoffPoint(text, maxLength) {
    let cutoffPoint = maxLength;
    
    // Don't cut inside HTML tags
    const tagStart = text.lastIndexOf('<', cutoffPoint);
    const tagEnd = text.indexOf('>', tagStart);
    
    if (tagStart !== -1 && (tagEnd === -1 || tagEnd > cutoffPoint)) {
      // We're inside a tag, move cutoff before the tag
      cutoffPoint = tagStart;
    }
    
    // Try to find good breakpoints
    const goodBreaks = [
      '\n\n',  // Double line break (paragraph)
      '\n',    // Single line break
      '. ',    // End of sentence
      ', ',    // Comma
      ' '      // Space
    ];
    
    for (const breakChar of goodBreaks) {
      const lastBreak = text.lastIndexOf(breakChar, cutoffPoint);
      if (lastBreak > maxLength * 0.7) { // Don't split too early
        cutoffPoint = lastBreak + breakChar.length;
        break;
      }
    }
    
    return cutoffPoint;
  }

  /**
   * Plain text splitting (original logic)
   */
  splitPlainMessage(text, maxLength) {
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    const chunks = [];
    let remaining = text;
    
    while (remaining.length > maxLength) {
      let splitPoint = maxLength;
      
      // Try to find good split points (in order of preference)
      const goodBreaks = [
        '\n\n',  // Double line break (paragraph)
        '\n',    // Single line break
        '. ',    // End of sentence
        ', ',    // Comma
        ' '      // Space
      ];
      
      for (const breakChar of goodBreaks) {
        const lastBreak = remaining.lastIndexOf(breakChar, maxLength);
        if (lastBreak > maxLength * 0.3) { // Don't split too early (30% threshold)
          splitPoint = lastBreak + breakChar.length;
          break;
        }
      }
      
      // Extract chunk and continue with remaining
      const chunk = remaining.substring(0, splitPoint).trim();
      chunks.push(chunk);
      remaining = remaining.substring(splitPoint).trim();
    }
    
    // Add the final remaining part
    if (remaining.length > 0) {
      chunks.push(remaining);
    }
    
    return chunks;
  }

  /**
   * Simple chunking method for basic text splitting (used by GitDiffManager)
   */
  splitIntoChunks(text, maxLength) {
    const chunks = [];
    let remaining = text;
    
    while (remaining.length > maxLength) {
      let splitPoint = maxLength;
      
      // Try to find good split points (in order of preference)
      const goodBreaks = ['\n\n', '\n', '. ', ', ', ' '];
      
      for (const breakChar of goodBreaks) {
        const lastBreak = remaining.lastIndexOf(breakChar, maxLength);
        if (lastBreak > maxLength * 0.3) { // Don't split too early (30% threshold)
          splitPoint = lastBreak + breakChar.length;
          break;
        }
      }
      
      // Extract chunk and continue with remaining
      const chunk = remaining.substring(0, splitPoint).trim();
      chunks.push(chunk);
      remaining = remaining.substring(splitPoint).trim();
    }
    
    // Add the final remaining part
    if (remaining.length > 0) {
      chunks.push(remaining);
    }
    
    return chunks;
  }
}

module.exports = MessageSplitter;
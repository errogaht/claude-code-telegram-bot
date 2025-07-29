/**
 * Telegram Message Sanitizer
 * Properly escapes content for Telegram markdown while preserving rich formatting
 */

class TelegramSanitizer {
  constructor() {
    // MarkdownV2 special characters that need escaping (per Telegram docs)
    this.markdownV2Chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    
    // Characters that need escaping inside specific contexts
    this.contextualEscaping = {
      pre: ['`', '\\'],           // Inside ``` blocks
      code: ['`', '\\'],          // Inside ` blocks  
      link: [')', '\\'],          // Inside (...) part of links
      emoji: [')', '\\'],         // Inside custom emoji definitions
    };
  }

  /**
   * Sanitize text for Telegram MarkdownV2
   * Preserves formatting while ensuring proper escaping per Telegram docs
   */
  sanitizeForTelegram(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return { text: text, parse_mode: 'MarkdownV2' };
    }

    try {
      // Convert legacy Markdown to MarkdownV2 and sanitize
      const sanitizedText = this.processMarkdownV2Safely(text, options);
      return { text: sanitizedText, parse_mode: 'MarkdownV2' };
    } catch (error) {
      throw new TelegramSanitizerError(
        'Failed to sanitize text for Telegram MarkdownV2',
        {
          originalText: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
          textLength: text.length,
          hasCodeBlocks: text.includes('```'),
          hasInlineCode: text.includes('`') && !text.includes('```'),
          hasBold: text.includes('*'),
          hasItalic: text.includes('_'),
          options: options,
          error: error.message
        }
      );
    }
  }

  /**
   * Process markdown with MarkdownV2 rules
   */
  processMarkdownV2Safely(text, options = {}) {
    let result = text;

    // Step 1: Extract and protect formatted blocks (code, bold, etc.)
    const protectedBlocks = this.extractAndConvertBlocks(result);
    result = protectedBlocks.text;

    // Step 2: Escape MarkdownV2 special characters in regular text
    result = this.escapeMarkdownV2Text(result, protectedBlocks.placeholders);

    // Step 3: Restore protected blocks with proper MarkdownV2 formatting
    result = this.restoreMarkdownV2Blocks(result, protectedBlocks.blocks);

    // Step 4: Validate MarkdownV2 structure (disabled for now to avoid blocking messages)
    // this.validateMarkdownV2Structure(result);

    return result;
  }

  /**
   * Safely extract bold text handling nested asterisks
   */
  extractBoldTextSafely(text, blocks, placeholders) {
    let result = text;
    let asteriskCount = 0;
    let currentMatch = '';
    let matchStart = -1;
    
    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      
      if (char === '*') {
        if (asteriskCount === 0) {
          // Start of potential bold
          matchStart = i;
          currentMatch = '';
        } else if (asteriskCount === 1) {
          // End of bold - we have a complete match
          const blockId = `__BOLD_${blocks.length}__`;
          const content = currentMatch;
          
          blocks.push({
            id: blockId,
            content: this.escapeTextContent(content),
            type: 'bold',
            original: `*${content}*`
          });
          placeholders.set(blockId, blocks.length - 1);
          
          // Replace the matched text with placeholder
          const fullMatch = `*${content}*`;
          result = result.substring(0, matchStart) + blockId + result.substring(i + 1);
          
          // Adjust index for the replacement
          i = matchStart + blockId.length - 1;
          
          // Reset state
          asteriskCount = 0;
          currentMatch = '';
          matchStart = -1;
          continue;
        }
        asteriskCount = (asteriskCount + 1) % 2;
      } else {
        if (asteriskCount === 1) {
          // We're inside a potential bold match
          currentMatch += char;
          
          // Safety check - if we've gone too far without closing, treat as regular text
          if (currentMatch.length > 200) {
            asteriskCount = 0;
            currentMatch = '';
            matchStart = -1;
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Extract and convert blocks to MarkdownV2 format
   */
  extractAndConvertBlocks(text) {
    const blocks = [];
    const placeholders = new Map();
    let result = text;

    // Extract code blocks first (```...```)
    result = result.replace(/```[\s\S]*?```/g, (match, offset) => {
      const blockId = `__CODEBLOCK_${blocks.length}__`;
      blocks.push({
        id: blockId,
        content: this.sanitizeCodeBlock(match),
        type: 'codeblock',
        original: match
      });
      placeholders.set(blockId, blocks.length - 1);
      return blockId;
    });

    // Extract inline code (`...`)
    result = result.replace(/`([^`]+)`/g, (match, content, offset) => {
      const blockId = `__INLINECODE_${blocks.length}__`;
      blocks.push({
        id: blockId,
        content: this.sanitizeInlineCode(content),
        type: 'inline',
        original: match
      });
      placeholders.set(blockId, blocks.length - 1);
      return blockId;
    });

    // Extract bold text (*...* but handle nested cases carefully)
    result = this.extractBoldTextSafely(result, blocks, placeholders);

    // Extract italic text (_..._ but not in URLs or other contexts)
    result = result.replace(/(?<![\w\/])_([^_]+)_(?![\w\/])/g, (match, content, offset) => {
      const blockId = `__ITALIC_${blocks.length}__`;
      blocks.push({
        id: blockId,
        content: this.escapeTextContent(content),
        type: 'italic',
        original: match
      });
      placeholders.set(blockId, blocks.length - 1);
      return blockId;
    });

    return { text: result, blocks, placeholders };
  }

  /**
   * Sanitize content inside code blocks for MarkdownV2
   */
  sanitizeCodeBlock(codeBlock) {
    // Extract language and content
    const match = codeBlock.match(/^```(\w+)?\n?([\s\S]*?)\n?```$/);
    if (!match) return codeBlock;

    const [, language, content] = match;
    
    // MarkdownV2 requires escaping ` and \ inside pre blocks
    const cleanContent = content
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/\r/g, '\n')    // Handle remaining \r
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove control chars
      .replace(/\\/g, '\\\\')  // Escape backslashes first (MarkdownV2 rule)
      .replace(/`/g, '\\`')    // Escape backticks (MarkdownV2 rule)
      .trim();

    return language ? `\`\`\`${language}\n${cleanContent}\n\`\`\`` : `\`\`\`\n${cleanContent}\n\`\`\``;
  }

  /**
   * Sanitize inline code content for MarkdownV2
   */
  sanitizeInlineCode(content) {
    // MarkdownV2 requires escaping ` and \ inside code entities
    return content
      .replace(/\r\n/g, ' ')  // Replace line breaks with spaces
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove control chars
      .replace(/\\/g, '\\\\')  // Escape backslashes first (MarkdownV2 rule)
      .replace(/`/g, '\\`')    // Escape backticks (MarkdownV2 rule)
      .trim();
  }

  /**
   * Escape text content inside formatting
   */
  escapeTextContent(text) {
    return text
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/\[/g, '\\[')   // Escape square brackets
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')   // Escape parentheses
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')    // Escape strikethrough
      .replace(/>/g, '\\>')    // Escape quotes
      .replace(/#/g, '\\#')    // Escape headers
      .replace(/\+/g, '\\+')   // Escape plus
      .replace(/-/g, '\\-')    // Escape dash (CRITICAL for MarkdownV2)
      .replace(/=/g, '\\=')    // Escape equals
      .replace(/\|/g, '\\|')   // Escape pipes
      .replace(/\{/g, '\\{')   // Escape braces
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')   // Escape dots
      .replace(/!/g, '\\!');   // Escape exclamation
  }

  /**
   * Escape regular text for MarkdownV2 (outside of formatting)
   */
  escapeMarkdownV2Text(text, placeholders) {
    let result = text;

    // Don't escape placeholder markers
    const placeholderPattern = /__(?:CODEBLOCK|INLINECODE|BOLD|ITALIC)_\d+__/g;
    const protectedRanges = [];
    let match;
    
    while ((match = placeholderPattern.exec(text)) !== null) {
      protectedRanges.push({
        start: match.index,
        end: match.index + match[0].length
      });
    }

    // Escape markdown characters, but skip protected ranges
    const chars = result.split('');
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      
      // Skip if in protected range
      const inProtected = protectedRanges.some(range => i >= range.start && i < range.end);
      if (inProtected) continue;

      // Escape MarkdownV2 special characters (make sure we don't double-escape)
      if (this.markdownV2Chars.includes(char) && chars[i-1] !== '\\') {
        chars[i] = '\\' + char;
      }
    }

    return chars.join('');
  }

  /**
   * Restore protected blocks with MarkdownV2 formatting
   */
  restoreMarkdownV2Blocks(text, blocks) {
    let result = text;

    blocks.forEach(block => {
      let replacement;
      
      switch (block.type) {
        case 'codeblock':
          replacement = block.content;
          break;
        case 'inline':
          replacement = `\`${block.content}\``;
          break;
        case 'bold':
          replacement = `*${block.content}*`;
          break;
        case 'italic':
          replacement = `_${block.content}_`;
          break;
        default:
          replacement = block.original;
      }

      result = result.replace(block.id, replacement);
    });

    return result;
  }

  /**
   * Validate MarkdownV2 structure to catch potential issues
   */
  validateMarkdownV2Structure(text) {
    const issues = [];

    // Simple validation - just check for basic issues
    try {
      // Check for unmatched code blocks (most critical)
      const codeBlockMatches = text.match(/```/g);
      if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
        issues.push('Unmatched code blocks detected');
      }

      // Check for unmatched backticks (ignoring escaped ones)
      const backtickCount = (text.match(/(?<!\\)`(?!``)/g) || []).length;
      if (backtickCount % 2 !== 0) {
        issues.push('Unmatched inline code backticks detected');
      }

    } catch (regexError) {
      // If regex fails, just log and continue (don't block the message)
      console.warn('⚠️ Regex validation failed, skipping validation:', regexError.message);
      return; // Skip validation if regex doesn't work
    }

    // Only throw error for critical issues that would definitely break Telegram
    if (issues.length > 0) {
      throw new TelegramSanitizerError('MarkdownV2 validation failed', {
        issues: issues,
        textPreview: text.substring(0, 100) + '...'
      });
    }
  }

  /**
   * Quick test if text would cause parsing issues
   */
  quickValidate(text) {
    try {
      this.validateMarkdownV2Structure(text);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        details: error.details 
      };
    }
  }
}

/**
 * Custom error class for sanitizer issues
 */
class TelegramSanitizerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TelegramSanitizerError';
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

module.exports = { TelegramSanitizer, TelegramSanitizerError };
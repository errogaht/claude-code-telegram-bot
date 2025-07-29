/**
 * Test Script for Real Claude Code Response HTML Splitting
 * Uses actual Claude Code response data to test HTML formatting and splitting
 */

const fs = require('fs');
const path = require('path');

// Import actual formatter
const TelegramFormatter = require('./telegram-formatter');

// Mock bot class with intelligent splitting logic (from bot.js)
class TestBotWithIntelligentSplitting {
  constructor() {
    this.formatter = new TelegramFormatter({ mode: 'html' });
  }

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
      '\\n\\n',  // Double line break (paragraph)
      '\\n',    // Single line break
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
}

// Load and parse the real Claude Code response
function loadClaudeResponse() {
  try {
    const jsonlPath = path.join(__dirname, 'tests/data/5c338118-50c0-4fef-b060-34a71aa1b74a.jsonl');
    const jsonlContent = fs.readFileSync(jsonlPath, 'utf8');
    const responseData = JSON.parse(jsonlContent.trim());
    
    // Extract the text content from the response
    const textContent = responseData.message.content[0].text;
    
    return textContent;
  } catch (error) {
    console.error('Error loading Claude response:', error.message);
    return null;
  }
}

// Validation function
function validateHtmlBalance(text) {
  const openTags = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let match;
  
  while ((match = tagRegex.exec(text)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    
    if (fullTag.startsWith('</')) {
      const index = openTags.lastIndexOf(tagName);
      if (index !== -1) {
        openTags.splice(index, 1);
      } else {
        return { balanced: false, error: `Unmatched closing tag: ${fullTag}` };
      }
    } else if (!fullTag.endsWith('/>')) {
      openTags.push(tagName);
    }
  }
  
  if (openTags.length > 0) {
    return { balanced: false, error: `Unclosed tags: ${openTags.join(', ')}` };
  }
  
  return { balanced: true };
}

console.log('🧪 Testing Real Claude Code Response HTML Splitting\\n');

// Load the real Claude response
const originalText = loadClaudeResponse();

if (!originalText) {
  console.error('❌ Failed to load Claude response data');
  process.exit(1);
}

console.log(`📄 Loaded Claude response: ${originalText.length} characters`);

// Create bot instance
const bot = new TestBotWithIntelligentSplitting();

// Step 1: Format through the actual Telegram formatter (HTML mode)
console.log('\\n🔄 Step 1: Formatting through TelegramFormatter HTML mode...');
const formatted = bot.formatter.formatAssistantTextHTML(originalText);
console.log(`📝 Formatted text: ${formatted.text.length} characters`);
console.log(`🏷️ Parse mode: ${formatted.parse_mode}`);

// Step 2: Split the formatted HTML text intelligently
console.log('\\n🔄 Step 2: Splitting HTML text intelligently...');
const maxLength = 4000; // Same as bot.js SAFE_LENGTH
const chunks = bot.splitHtmlMessageSimple(formatted.text, maxLength);

console.log(`\\n📨 Split into ${chunks.length} chunks:`);

// Step 3: Validate each chunk
let allValid = true;
let totalLength = 0;
const chunkStats = [];

chunks.forEach((chunk, index) => {
  const validation = validateHtmlBalance(chunk);
  const lengthStatus = chunk.length <= maxLength ? '✅' : '⚠️';
  const balanceStatus = validation.balanced ? '✅' : '❌';
  
  console.log(`\\n🔸 Chunk ${index + 1}/${chunks.length}:`);
  console.log(`   📏 Length: ${chunk.length} chars ${lengthStatus}`);
  console.log(`   🏷️ HTML Balance: ${balanceStatus} ${validation.balanced ? 'Valid' : validation.error}`);
  
  // Show first 150 characters as preview
  const preview = chunk.length > 150 ? chunk.substring(0, 150) + '...' : chunk;
  console.log(`   📖 Preview: ${preview.replace(/\\n/g, '↵')}`);
  
  if (!validation.balanced) {
    allValid = false;
    console.log(`   ❌ INVALID HTML: ${validation.error}`);
  }
  
  totalLength += chunk.length;
  chunkStats.push({
    index: index + 1,
    length: chunk.length,
    balanced: validation.balanced,
    error: validation.error || null
  });
});

// Summary
console.log('\\n' + '='.repeat(80));
console.log('📊 SPLITTING RESULTS SUMMARY');
console.log('='.repeat(80));

console.log(`🎯 SUCCESS METRICS:`);
console.log(`   • Total chunks: ${chunks.length}`);
console.log(`   • All HTML balanced: ${allValid ? '✅ YES' : '❌ NO'}`);
console.log(`   • Average chunk size: ${Math.round(totalLength / chunks.length)} chars`);
console.log(`   • Efficiency: ${Math.round((totalLength / chunks.length) / maxLength * 100)}% of target length`);

if (!allValid) {
  console.log(`\\n❌ FAILED CHUNKS:`);
  chunkStats.filter(chunk => !chunk.balanced).forEach(chunk => {
    console.log(`   • Chunk ${chunk.index}: ${chunk.error}`);
  });
} else {
  console.log(`\\n🎉 ALL CHUNKS HAVE PERFECTLY BALANCED HTML TAGS!`);
}

console.log(`\\n📋 COMPARISON WITH RIGID SPLITTING:`);
const rigidChunks = Math.ceil(formatted.text.length / maxLength);
console.log(`   • Rigid splitting would create: ${rigidChunks} chunks`);
console.log(`   • Intelligent splitting created: ${chunks.length} chunks`);
console.log(`   • Difference: ${chunks.length - rigidChunks} ${chunks.length > rigidChunks ? 'more' : 'fewer'} chunks for HTML safety`);

console.log('\\n💡 This test validates that:');
console.log('   ✅ Real Claude Code responses are properly formatted to HTML');
console.log('   ✅ HTML tags remain balanced across all message chunks'); 
console.log('   ✅ Telegram will receive valid HTML in every message part');
console.log('   ✅ No more "can\'t parse entities" errors should occur');

// Save chunks for inspection
const outputPath = path.join(__dirname, 'claude-response-chunks-output.json');
fs.writeFileSync(outputPath, JSON.stringify({
  originalLength: originalText.length,
  formattedLength: formatted.text.length,
  chunkCount: chunks.length,
  maxLength: maxLength,
  allBalanced: allValid,
  chunks: chunks.map((chunk, index) => ({
    index: index + 1,
    length: chunk.length,
    balanced: validateHtmlBalance(chunk).balanced,
    content: chunk
  }))
}, null, 2));

console.log(`\\n💾 Detailed results saved to: ${outputPath}`);
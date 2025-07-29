/**
 * Test Script for Intelligent HTML Splitting
 * Tests the improved approach that prioritizes HTML balance over exact length
 */

// Mock the bot class methods for testing
class TestBot {
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
    let cutoffPoint = this.findGoodCutoffPoint(text, maxLength);
    let chunk = text.substring(0, cutoffPoint).trim();
    
    // Find open tags and calculate where to split with tag closing
    const openTags = this.findOpenTags(chunk);
    const closingTagsLength = openTags.reduce((len, tag) => len + `</${tag}>`.length, 0);
    
    // If adding closing tags would exceed length, reduce chunk size
    if (chunk.length + closingTagsLength > maxLength) {
      const targetLength = maxLength - closingTagsLength - 50; // Leave buffer
      cutoffPoint = this.findGoodCutoffPoint(text, targetLength);
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

console.log('🧪 Testing Intelligent HTML Splitting\\n');

const bot = new TestBot();

// Test cases focusing on HTML balance
const testCases = [
  {
    name: 'Problematic nested bold (should find balanced split)',
    text: '<b>🔸 Analysis Complete:</b>\\n\\n<i>The system analysis shows that</i> <b>performance is optimal</b> and <code>all tests pass</code>.\\n\\n<b>Next steps:</b>\\n- Review implementation\\n- Deploy to production\\n- Monitor metrics\\n\\n<i>End of analysis report.</i>',
    maxLength: 200
  },
  {
    name: 'Mixed HTML with natural break points',
    text: '<b>Results Summary:</b>\\n\\n<i>Performance metrics:</i>\\n<code>latency: 45ms\\nthroughput: 1000 req/s</code>\\n\\n<b>Error Analysis:</b>\\n<i>No critical errors found.</i> <code>error_rate: 0.01%</code>\\n\\n<b>Recommendations:</b>\\n- Continue monitoring\\n- Implement optimizations\\n- Schedule maintenance',
    maxLength: 150
  },
  {
    name: 'Complex nested structure (challenging case)',
    text: '<b>Ultra-Detailed Analysis:</b>\\n\\n<b>Section 1:</b> <i>Initial findings show <code>system.status = "optimal"</code> with <b>high performance</b> metrics.</i>\\n\\n<b>Section 2:</b> <i>Database queries are <code>averaging 12ms</code> response time.</i>\\n\\n<b>Conclusion:</b> <i>System is performing <b>exceptionally well</b> under current load.</i>',
    maxLength: 180
  }
];

testCases.forEach((testCase, index) => {
  console.log(`📋 Test ${index + 1}: ${testCase.name}`);
  console.log('='.repeat(70));
  console.log(`Original length: ${testCase.text.length} chars`);
  console.log(`Target max length: ${testCase.maxLength}`);
  
  const chunks = bot.splitHtmlMessageSimple(testCase.text, testCase.maxLength);
  
  console.log(`\\n📨 Intelligently split into ${chunks.length} chunks:`);
  
  let totalLength = 0;
  let allBalanced = true;
  
  chunks.forEach((chunk, chunkIndex) => {
    const isBalanced = bot.isHtmlBalanced(chunk);
    const lengthStatus = chunk.length <= testCase.maxLength ? '✅' : '⚠️';
    const balanceStatus = isBalanced ? '✅' : '❌';
    
    console.log(`\\n🔸 Chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} chars) ${lengthStatus} Length ${balanceStatus} Balance:`);
    console.log(chunk);
    
    if (!isBalanced) {
      allBalanced = false;
    }
    totalLength += chunk.length;
  });
  
  const avgChunkSize = Math.round(totalLength / chunks.length);
  const efficiency = Math.round((avgChunkSize / testCase.maxLength) * 100);
  
  console.log(`\\n📊 Results:`);
  console.log(`   • All chunks balanced: ${allBalanced ? '✅ YES' : '❌ NO'}`);
  console.log(`   • Average chunk size: ${avgChunkSize} chars (${efficiency}% of target)`);
  console.log(`   • Total chunks: ${chunks.length} (vs rigid splitting: ${Math.ceil(testCase.text.length / testCase.maxLength)})`);
  
  console.log('\\n' + '='.repeat(70) + '\\n');
});

console.log('🎉 Intelligent HTML splitting test completed!');
console.log('\\n💡 Advantages of intelligent approach:');
console.log('  • ✅ Prioritizes HTML balance over exact length');
console.log('  • ✅ Finds naturally balanced split points');
console.log('  • ✅ Allows slightly longer chunks if they maintain balance');
console.log('  • ✅ Falls back to tag-closing when needed');
console.log('  • ✅ Better user experience with properly formatted messages');
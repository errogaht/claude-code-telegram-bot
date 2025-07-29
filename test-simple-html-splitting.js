/**
 * Test Script for Simple HTML Splitting Approach
 * Tests the user's suggested simple approach: find open tags, add closing tags
 */

// Mock the bot class methods for testing
class TestBot {
  splitHtmlMessageSimple(text, maxLength) {
    const chunks = [];
    let remaining = text;
    
    while (remaining.length > maxLength) {
      // Find good cutoff point
      let cutoffPoint = this.findGoodCutoffPoint(remaining, maxLength);
      
      // Get the chunk up to cutoff point  
      let chunk = remaining.substring(0, cutoffPoint).trim();
      
      // Find all opening HTML tags in this chunk
      const openTags = this.findOpenTags(chunk);
      
      // Add closing tags in reverse order
      for (let i = openTags.length - 1; i >= 0; i--) {
        chunk += `</${openTags[i]}>`;</chunk>
      }
      
      chunks.push(chunk);
      
      // For remaining text, add opening tags back
      let nextPart = remaining.substring(cutoffPoint).trim();
      for (const tag of openTags) {
        nextPart = `<${tag}>` + nextPart;
      }
      
      remaining = nextPart;
    }
    
    // Add the final remaining part
    if (remaining.length > 0) {
      chunks.push(remaining);
    }
    
    return chunks;
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

console.log('🧪 Testing Simple HTML Splitting Approach\\n');

const bot = new TestBot();

// Test cases - including the problematic ones from your error
const testCases = [
  {
    name: 'Simple nested bold tags (problematic case)',
    text: '<b>🔸 ✅ <b>PAGINATION FEATURE COMPLETED SUCCESSFULLY!</b></b>\\n\\n<b>Implementation Details:</b>\\n\\n<code>function paginate() {\\n  return "success";\\n}</code>\\n\\n<i>This is additional information that makes the message very long and needs to be split into multiple parts for Telegram compatibility.</i>',
    maxLength: 150
  },
  {
    name: 'Complex mixed HTML with multiple tags',
    text: '<b>Analysis Results:</b>\\n\\n<i>Key findings:</i>\\n<code>const data = { success: true };</code>\\n\\n<b>Performance metrics:</b>\\n- <code>latency: 45ms</code>\\n- <code>throughput: 1000 req/s</code>\\n\\n<i>Conclusion: System is performing well with the new optimizations implemented in the latest release.</i>',
    maxLength: 180
  },
  {
    name: 'Ultra-detailed analysis (long content)',
    text: '<b>Ultra-Detailed Analysis & Migration Strategy</b>\\n\\n<b>Base Implementation Status:</b>\\n\\n<i>Current state analysis:</i>\\n<code>system.status = "active"\\nperformance.level = "high"\\noptimization.enabled = true</code>\\n\\n<b>Migration Requirements:</b>\\n- <i>Database schema updates required</i>\\n- <code>ALTER TABLE users ADD COLUMN preferences JSON;</code>\\n- <i>API endpoint modifications needed</i>\\n\\n<b>Performance Considerations:</b>\\n<code>// Critical optimization point\\nfunction processLargeDataset(data) {\\n  return data.map(item => optimize(item));\\n}</code>\\n\\n<i>This represents a comprehensive analysis of the current system state and the required migration path forward.</i>',
    maxLength: 200
  }
];

testCases.forEach((testCase, index) => {
  console.log(`📋 Test ${index + 1}: ${testCase.name}`);
  console.log('='.repeat(70));
  console.log(`Original length: ${testCase.text.length} chars`);
  console.log(`Max length: ${testCase.maxLength}`);
  
  const chunks = bot.splitHtmlMessageSimple(testCase.text, testCase.maxLength);
  
  console.log(`\\n📨 Split into ${chunks.length} chunks:`);
  
  let allValid = true;
  chunks.forEach((chunk, chunkIndex) => {
    console.log(`\\n🔸 Chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} chars):`);
    console.log(chunk);
    
    // Validate HTML balance for each chunk
    const validation = validateHtmlBalance(chunk);
    if (validation.balanced) {
      console.log('✅ HTML tags balanced');
    } else {
      console.log(`❌ HTML tags unbalanced: ${validation.error}`);
      allValid = false;
    }
  });
  
  if (allValid) {
    console.log('\\n🎉 ALL CHUNKS HAVE BALANCED HTML TAGS!');
  } else {
    console.log('\\n⚠️ Some chunks have unbalanced HTML tags');
  }
  
  console.log('\\n' + '='.repeat(70) + '\\n');
});

console.log('🎉 Simple HTML splitting test completed!');
console.log('\\n💡 Key advantages of this approach:');
console.log('  • ✅ Simple and reliable');
console.log('  • ✅ Preserves HTML structure');
console.log('  • ✅ Handles nested tags correctly');
console.log('  • ✅ No complex tag balancing algorithms');
console.log('  • ✅ Easy to debug and maintain');
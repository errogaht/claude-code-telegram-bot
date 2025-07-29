/**
 * Test Script to Compare HTML vs MarkdownV2 Formatting
 * Tests both approaches side by side to determine which works better
 */

const TelegramFormatter = require('./telegram-formatter');

console.log('🧪 Testing HTML vs MarkdownV2 Formatting Comparison\n');
console.log('='.repeat(60));

const formatter = new TelegramFormatter();

// Test cases with problematic content
const testCases = [
  {
    name: 'Problematic Header with Bold',
    text: '## ✅ **PAGINATION FEATURE COMPLETED SUCCESSFULLY!**'
  },
  {
    name: 'Mixed Formatting',
    text: 'Here is **bold text** and `code` and [link](https://example.com) and *italic*.'
  },
  {
    name: 'Complex Text with Special Characters',
    text: 'Testing <script> tags & special chars! Also: dots... dashes-here, (parentheses), {braces}'
  },
  {
    name: 'Code Blocks and Lists',
    text: `Here's some code: \`const x = "test";\`

And a list:
1. First item
2. Second item with **bold**
3. Third item

\`\`\`javascript
function test() {
  return "Hello & World!";
}
\`\`\``
  },
  {
    name: 'Multiple Headers',
    text: `# Main Header
## Sub Header with **bold**
### Small header

Regular text here.`
  }
];

// Test Assistant Text formatting
console.log('\n📝 ASSISTANT TEXT FORMATTING COMPARISON\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(40));
  console.log('Original:', testCase.text.replace(/\n/g, '\\n'));
  
  // MarkdownV2 version
  const markdownResult = formatter.formatAssistantText(testCase.text);
  console.log('\n🟦 MarkdownV2 Result:');
  console.log('Text:', markdownResult.text.replace(/\n/g, '\\n'));
  console.log('Parse Mode:', markdownResult.parse_mode || 'Will be set by sanitizer');
  
  // HTML version
  const htmlResult = formatter.formatAssistantTextHTML(testCase.text);
  console.log('\n🟧 HTML Result:');
  console.log('Text:', htmlResult.text.replace(/\n/g, '\\n'));
  console.log('Parse Mode:', htmlResult.parse_mode);
  
  console.log('\n' + '='.repeat(60) + '\n');
});

// Test TodoWrite formatting
console.log('\n📋 TODO WRITE FORMATTING COMPARISON\n');

const testTodos = [
  { id: '1', content: 'Setup project structure with <special> chars & symbols', status: 'completed', priority: 'high' },
  { id: '2', content: 'Implement stream processor (with parentheses)', status: 'in_progress', priority: 'high' },
  { id: '3', content: 'Add error handling...', status: 'pending', priority: 'medium' },
  { id: '4', content: 'Write documentation & guides', status: 'pending', priority: 'low' }
];

console.log('Todo Test Data:', testTodos.map(t => `${t.status}: ${t.content}`).join(', '));
console.log('-'.repeat(40));

// MarkdownV2 version
const markdownTodos = formatter.formatTodoWrite(testTodos);
console.log('\n🟦 MarkdownV2 Todos:');
console.log('Text:', markdownTodos.text.replace(/\n/g, '\\n'));
console.log('Parse Mode:', markdownTodos.parse_mode || 'Will be set by sanitizer');

// HTML version
const htmlTodos = formatter.formatTodoWriteHTML(testTodos);
console.log('\n🟧 HTML Todos:');
console.log('Text:', htmlTodos.text.replace(/\n/g, '\\n'));
console.log('Parse Mode:', htmlTodos.parse_mode);

console.log('\n' + '='.repeat(60));

// Test Thinking formatting
console.log('\n🤔 THINKING FORMATTING COMPARISON\n');

const thinkingText = `Analyzing the problem...
- Need to handle <tags> and & symbols
- Consider performance implications
- Check for edge cases like "quotes" and 'apostrophes'`;

console.log('Thinking Text:', thinkingText.replace(/\n/g, '\\n'));
console.log('-'.repeat(40));

// MarkdownV2 version
const markdownThinking = formatter.formatThinking(thinkingText);
console.log('\n🟦 MarkdownV2 Thinking:');
console.log('Text:', markdownThinking.text.replace(/\n/g, '\\n'));
console.log('Parse Mode:', markdownThinking.parse_mode || 'Will be set by sanitizer');

// HTML version
const htmlThinking = formatter.formatThinkingHTML(thinkingText);
console.log('\n🟧 HTML Thinking:');
console.log('Text:', htmlThinking.text.replace(/\n/g, '\\n'));
console.log('Parse Mode:', htmlThinking.parse_mode);

console.log('\n' + '='.repeat(60));
console.log('\n📊 COMPARISON SUMMARY\n');

console.log('🟦 MarkdownV2 Pros:');
console.log('  • More familiar syntax');
console.log('  • Already implemented and working');
console.log('  • Supports strikethrough with ~text~');

console.log('\n🟦 MarkdownV2 Cons:');
console.log('  • Complex escaping rules (many special characters)');
console.log('  • Prone to parsing errors with nested formatting');
console.log('  • Requires sanitizer for proper escaping');

console.log('\n🟧 HTML Pros:');
console.log('  • Simple escaping (only 3 characters: <, >, &)');
console.log('  • More predictable and robust');
console.log('  • Better nested formatting support');
console.log('  • Supports strikethrough with <s>text</s>');

console.log('\n🟧 HTML Cons:');
console.log('  • Different syntax than markdown');
console.log('  • Links show as <a href="...">text</a> instead of inline');

console.log('\n💡 RECOMMENDATION:');
console.log('Based on reliability and simplicity, HTML mode appears more robust');
console.log('for Telegram bot applications with complex formatting requirements.');

console.log('\n🎉 Comparison test completed!');
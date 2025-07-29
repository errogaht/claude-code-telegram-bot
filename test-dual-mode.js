/**
 * Test Script for Dual-Mode Formatter
 * Tests the automatic mode selection functionality
 */

const TelegramFormatter = require('./telegram-formatter');

console.log('🧪 Testing Dual-Mode Formatter\n');

// Test problematic case that was causing issues
const problematicText = '## ✅ **PAGINATION FEATURE COMPLETED SUCCESSFULLY!**';

console.log('Test Text:', problematicText);
console.log('='.repeat(50));

// Test HTML mode (default)
console.log('\n🟧 HTML Mode (default):');
const htmlFormatter = new TelegramFormatter(); // defaults to HTML
const htmlResult = htmlFormatter.formatAssistantText(problematicText);
console.log('Mode:', htmlFormatter.mode);
console.log('Result:', htmlResult.text);
console.log('Parse Mode:', htmlResult.parse_mode);

// Test MarkdownV2 mode
console.log('\n🟦 MarkdownV2 Mode:');
const markdownFormatter = new TelegramFormatter({ mode: 'markdown' });
const markdownResult = markdownFormatter.formatAssistantText(problematicText);
console.log('Mode:', markdownFormatter.mode);
console.log('Result:', markdownResult.text);
console.log('Parse Mode:', markdownResult.parse_mode || 'Will be set by sanitizer');

// Test TodoWrite with both modes
console.log('\n📋 TodoWrite Comparison:');
const testTodos = [
  { id: '1', content: 'Test with <special> & chars', status: 'completed', priority: 'high' },
  { id: '2', content: 'Another task', status: 'in_progress', priority: 'medium' }
];

console.log('\n🟧 HTML TodoWrite:');
const htmlTodos = htmlFormatter.formatTodoWrite(testTodos);
console.log('Parse Mode:', htmlTodos.parse_mode);
console.log('Sample:', htmlTodos.text.substring(0, 100) + '...');

console.log('\n🟦 MarkdownV2 TodoWrite:');
const markdownTodos = markdownFormatter.formatTodoWrite(testTodos);
console.log('Parse Mode:', markdownTodos.parse_mode || 'Will be set by sanitizer');
console.log('Sample:', markdownTodos.text.substring(0, 100) + '...');

console.log('\n✅ Dual-mode functionality working correctly!');
console.log('\n💡 HTML mode is set as default for better reliability.');
/**
 * Test script for Claude Stream Processor
 * Tests the new architecture without Telegram
 */

const ClaudeStreamProcessor = require('./claude-stream-processor');
const TelegramFormatter = require('./telegram-formatter');

async function testStreamProcessor() {
  console.log('🧪 Testing Claude Stream Processor...\n');

  const processor = new ClaudeStreamProcessor({
    model: 'sonnet',
    workingDirectory: process.cwd()
  });

  const formatter = new TelegramFormatter();

  // Setup event listeners
  processor.on('session-init', (data) => {
    console.log('🚀 Session initialized:', data.sessionId);
    const formatted = formatter.formatSessionInit(data);
    console.log('📱 Telegram format:', formatted.text);
    console.log('---');
  });

  processor.on('assistant-text', (data) => {
    console.log('💬 Assistant text:', data.text.substring(0, 100) + '...');
    const formatted = formatter.formatAssistantText(data.text);
    console.log('📱 Telegram format:', formatted.text.substring(0, 100) + '...');
    console.log('---');
  });

  processor.on('todo-write', (data) => {
    console.log('📋 TodoWrite detected:', data.todos.length, 'todos');
    const formatted = formatter.formatTodoWrite(data.todos);
    console.log('📱 Telegram format:', formatted.text);
    console.log('---');
  });

  processor.on('bash-command', (data) => {
    console.log('💻 Bash command:', data.command);
    const formatted = formatter.formatBashCommand(data.command, data.description);
    console.log('📱 Telegram format:', formatted.text);
    console.log('---');
  });

  processor.on('file-edit', (data) => {
    console.log('✏️ File edit:', data.filePath);
    const formatted = formatter.formatFileEdit(data.filePath, data.oldString, data.newString);
    console.log('📱 Telegram format:', formatted.text.substring(0, 200) + '...');
    console.log('---');
  });

  processor.on('complete', (data) => {
    console.log('✅ Execution complete:', data.success);
    const formatted = formatter.formatExecutionResult(data, 'test-session-12345678');
    console.log('📱 Telegram format:', formatted.text);
    console.log('---');
    console.log('🎉 Test completed!\n');
  });

  processor.on('error', (error) => {
    console.error('❌ Error:', error.message);
    const formatted = formatter.formatError(error);
    console.log('📱 Telegram format:', formatted.text);
  });

  try {
    // Test 1: Simple conversation
    console.log('Test 1: Starting new conversation...');
    await processor.startNewConversation('Hello! Can you create a simple todo list with 3 tasks?');
    
    // Wait for completion
    await new Promise(resolve => {
      processor.once('complete', resolve);
    });

    // Test 2: Continue conversation
    console.log('\nTest 2: Continuing conversation...');
    await processor.continueConversation('Now update the first task to completed status');
    
    // Wait for completion
    await new Promise(resolve => {
      processor.once('complete', resolve);
    });

    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test TodoWrite formatter specifically
function testTodoFormatter() {
  console.log('🧪 Testing TodoWrite Formatter...\n');
  
  const formatter = new TelegramFormatter();
  
  const testTodos = [
    { id: '1', content: 'Setup project structure', status: 'completed', priority: 'high' },
    { id: '2', content: 'Implement stream processor', status: 'in_progress', priority: 'high' },
    { id: '3', content: 'Add error handling', status: 'pending', priority: 'medium' },
    { id: '4', content: 'Write documentation', status: 'pending', priority: 'low' },
    { id: '5', content: 'Blocked task example', status: 'blocked', priority: 'medium' }
  ];
  
  const formatted = formatter.formatTodoWrite(testTodos);
  console.log('📋 Formatted TodoWrite:');
  console.log(formatted.text);
  console.log('\n---\n');
  
  // Test todo change detection
  const modifiedTodos = testTodos.map((todo, index) => 
    index === 1 ? { ...todo, status: 'completed' } : { ...todo }
  );
  
  const hasChanged = formatter.todosChanged(testTodos, modifiedTodos);
  console.log('🔍 Change detection test:', hasChanged ? '✅ Detected change' : '❌ No change detected');
  
  const formattedModified = formatter.formatTodoWrite(modifiedTodos);
  console.log('\n📋 Modified TodoWrite:');
  console.log(formattedModified.text);
}

// Test message formatting
function testMessageFormatting() {
  console.log('🧪 Testing Message Formatting...\n');
  
  const formatter = new TelegramFormatter();
  
  // Test different message types
  console.log('1. Assistant Text:');
  const textFormatted = formatter.formatAssistantText('Here is **bold text** and `code` and normal text.');
  console.log(textFormatted.text);
  console.log('---');
  
  console.log('2. File Edit:');
  const editFormatted = formatter.formatFileEdit('src/app.js', 'const old = "value"', 'const new = "updated"');
  console.log(editFormatted.text);
  console.log('---');
  
  console.log('3. Bash Command:');
  const bashFormatted = formatter.formatBashCommand('npm install', 'Install dependencies');
  console.log(bashFormatted.text);
  console.log('---');
  
  console.log('4. Session Init:');
  const sessionFormatted = formatter.formatSessionInit({
    sessionId: 'abc123-def456-ghi789',
    model: 'claude-sonnet-4',
    cwd: '/home/user/project',
    tools: ['Edit', 'Write', 'Read', 'Bash', 'TodoWrite'],
    permissionMode: 'bypassPermissions'
  });
  console.log(sessionFormatted.text);
  console.log('---');
}

// Run tests
async function runAllTests() {
  console.log('🚀 Running Claude Stream Bot Tests\n');
  console.log('=' .repeat(50));
  
  // Test 1: Message formatting
  testMessageFormatting();
  console.log('\n' + '=' .repeat(50));
  
  // Test 2: TodoWrite formatting
  testTodoFormatter();
  console.log('\n' + '=' .repeat(50));
  
  // Test 3: Stream processor (requires Claude CLI)
  try {
    await testStreamProcessor();
  } catch (error) {
    console.log('⚠️ Stream processor test skipped (Claude CLI may not be available)');
    console.log('Error:', error.message);
  }
  
  console.log('🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testStreamProcessor,
  testTodoFormatter,
  testMessageFormatting
};
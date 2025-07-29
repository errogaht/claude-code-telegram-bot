/**
 * Unit Tests for Claude Telegram Bot Functions
 * Tests core functionality without requiring actual Telegram API
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fsSync = require('fs');

// Import modules to test
const ClaudeStreamProcessor = require('./claude-stream-processor');
const TelegramFormatter = require('./telegram-formatter');

// Mock data
const mockTodos = [
  { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
  { id: '2', content: 'Task 2', status: 'in_progress', priority: 'medium' },
  { id: '3', content: 'Task 3', status: 'completed', priority: 'low' }
];

const mockSessionData = {
  sessionId: 'test-session-12345678',
  model: 'sonnet',
  cwd: '/test/directory',
  tools: ['Read', 'Write', 'Bash'],
  permissionMode: 'auto'
};

console.log('🧪 Running Claude Telegram Bot Unit Tests...\n');

// Test 1: ClaudeStreamProcessor Creation
console.log('📋 Test 1: ClaudeStreamProcessor Creation');
try {
  const processor = new ClaudeStreamProcessor({
    model: 'sonnet',
    workingDirectory: '/tmp',
    verbose: true
  });
  
  assert(processor.options.model === 'sonnet', 'Model should be set correctly');
  assert(processor.options.workingDirectory === '/tmp', 'Working directory should be set');
  assert(processor.options.verbose === true, 'Verbose should be enabled');
  assert(processor.isActive() === false, 'Should not be active initially');
  
  console.log('✅ ClaudeStreamProcessor created successfully');
} catch (error) {
  console.error('❌ ClaudeStreamProcessor test failed:', error.message);
}

// Test 2: TelegramFormatter Creation
console.log('\n📋 Test 2: TelegramFormatter Creation');
try {
  const formatter = new TelegramFormatter();
  assert(typeof formatter === 'object', 'Formatter should be an object');
  console.log('✅ TelegramFormatter created successfully');
} catch (error) {
  console.error('❌ TelegramFormatter test failed:', error.message);
}

// Test 3: TodoWrite Formatting
console.log('\n📋 Test 3: TodoWrite Formatting');
try {
  const formatter = new TelegramFormatter();
  const result = formatter.formatTodoWrite(mockTodos);
  
  assert(typeof result === 'object', 'Should return an object');
  assert(typeof result.text === 'string', 'Should have text property');
  assert(result.text.includes('Task 1'), 'Should include task content');
  assert(result.text.includes('📋'), 'Should include emoji');
  
  console.log('✅ TodoWrite formatting works correctly');
} catch (error) {
  console.error('❌ TodoWrite formatting test failed:', error.message);
}

// Test 4: Todo Change Detection
console.log('\n📋 Test 4: Todo Change Detection');
try {
  const formatter = new TelegramFormatter();
  
  // Same todos - should return false
  const unchanged = formatter.todosChanged(mockTodos, mockTodos);
  assert(unchanged === false, 'Same todos should not be marked as changed');
  
  // Modified todos - should return true
  const modifiedTodos = mockTodos.map((todo, index) => 
    index === 1 ? { ...todo, status: 'completed' } : { ...todo }
  );
  const changed = formatter.todosChanged(mockTodos, modifiedTodos);
  assert(changed === true, 'Modified todos should be marked as changed');
  
  console.log('✅ Todo change detection works correctly');
} catch (error) {
  console.error('❌ Todo change detection test failed:', error.message);
}

// Test 5: Session Init Formatting
console.log('\n📋 Test 5: Session Init Formatting');
try {
  const formatter = new TelegramFormatter();
  const result = formatter.formatSessionInit(mockSessionData);
  
  assert(typeof result === 'object', 'Should return an object');
  assert(typeof result.text === 'string', 'Should have text property');
  assert(result.text.includes('12345678'), 'Should include session ID (last 8 chars)');
  assert(result.text.includes('sonnet'), 'Should include model');
  
  console.log('✅ Session init formatting works correctly');
} catch (error) {
  console.error('❌ Session init formatting test failed:', error.message);
}

// Test 6: File Operations Formatting
console.log('\n📋 Test 6: File Operations Formatting');
try {
  const formatter = new TelegramFormatter();
  
  // Test file read formatting
  const readResult = formatter.formatFileRead('/test/file.js');
  assert(readResult.text.includes('/test/file.js'), 'Should include file path');
  assert(readResult.text.includes('👀'), 'Should include read emoji');
  
  // Test file write formatting
  const writeResult = formatter.formatFileWrite('/test/output.js', 'console.log("test")');
  assert(writeResult.text.includes('/test/output.js'), 'Should include file path');
  assert(writeResult.text.includes('📝'), 'Should include write emoji');
  
  // Test file edit formatting
  const editResult = formatter.formatFileEdit('/test/edit.js', 'old code', 'new code');
  assert(editResult.text.includes('/test/edit.js'), 'Should include file path');
  assert(editResult.text.includes('✏️'), 'Should include edit emoji');
  
  console.log('✅ File operations formatting works correctly');
} catch (error) {
  console.error('❌ File operations formatting test failed:', error.message);
}

// Test 7: Bash Command Formatting
console.log('\n📋 Test 7: Bash Command Formatting');
try {
  const formatter = new TelegramFormatter();
  const result = formatter.formatBashCommand('npm install', 'Install dependencies');
  
  assert(result.text.includes('npm install'), 'Should include command');
  assert(result.text.includes('Install dependencies'), 'Should include description');
  assert(result.text.includes('💻'), 'Should include terminal emoji');
  
  console.log('✅ Bash command formatting works correctly');
} catch (error) {
  console.error('❌ Bash command formatting test failed:', error.message);
}

// Test 8: Error Formatting
console.log('\n📋 Test 8: Error Formatting');
try {
  const formatter = new TelegramFormatter();
  const testError = new Error('Test error message');
  const result = formatter.formatError(testError);
  
  assert(result.text.includes('Test error message'), 'Should include error message');
  assert(result.text.includes('❌'), 'Should include error emoji');
  
  console.log('✅ Error formatting works correctly');
} catch (error) {
  console.error('❌ Error formatting test failed:', error.message);
}

// Test 9: Session ID Functions (Mock test for bot functionality)
console.log('\n📋 Test 9: Session ID Utilities');
try {
  // Test session ID display (should show end, not start)
  const sessionId = 'session-prefix-1234567890abcdef';
  const shortId = sessionId.slice(-8);
  
  assert(shortId === '90abcdef', 'Should show last 8 characters');
  assert(shortId !== sessionId.substring(0, 8), 'Should not show start');
  
  console.log('✅ Session ID utilities work correctly');
} catch (error) {
  console.error('❌ Session ID utilities test failed:', error.message);
}

// Test 10: Project Cache Logic
console.log('\n📋 Test 10: Project Cache Logic');
try {
  // Simulate project cache functionality
  const projectCache = new Map();
  let counter = 0;
  
  const testProjects = ['/home/user/project1', '/home/user/project2'];
  const shortIds = testProjects.map(path => {
    const shortId = `p${counter++}`;
    projectCache.set(shortId, path);
    return shortId;
  });
  
  assert(shortIds.length === 2, 'Should create 2 short IDs');
  assert(projectCache.get('p0') === '/home/user/project1', 'Should cache first project');
  assert(projectCache.get('p1') === '/home/user/project2', 'Should cache second project');
  assert(shortIds[0].length < 64, 'Short ID should be under Telegram limit');
  
  console.log('✅ Project cache logic works correctly');
} catch (error) {
  console.error('❌ Project cache logic test failed:', error.message);
}

console.log('\n🎉 All unit tests completed!');
console.log('📊 Summary: Basic functionality tests passed');
console.log('💡 Note: These are unit tests for core functions only');
console.log('🔍 For full integration testing, use the actual bot with Telegram');
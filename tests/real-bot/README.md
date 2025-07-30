# Real Telegram Bot Integration Testing

This directory contains **Phase 2** of the testing infrastructure: **Real Telegram Bot Integration Testing** using `telegram-test-api` for automated, programmatic testing of actual bot interactions.

## 🎯 Overview

**No more manual clicking!** This system provides:

- ✅ **Real Bot Testing**: Actual Telegram Bot API simulation
- ✅ **Automated Interactions**: Send messages, press buttons, upload files programmatically
- ✅ **Complete Workflows**: Test entire conversation flows automatically
- ✅ **Regression Testing**: Catch integration issues before deployment
- ✅ **CI/CD Ready**: Automated testing in continuous integration

## 🏗️ Architecture

### Core Components

1. **TelegramTestServer** (`telegram-test-server.js`)
   - Manages local `telegram-test-api` server instance
   - Provides isolated testing environment
   - Handles server lifecycle (start/stop)

2. **TelegramTestClient** (`telegram-test-client.js`)
   - Simulates real Telegram user interactions
   - Sends messages, presses buttons, uploads files
   - Tracks conversation history and bot responses

3. **RealBotTestHelper** (`real-bot-test-helper.js`)
   - High-level testing utilities
   - Orchestrates server + client + bot setup
   - Provides easy-to-use testing methods

### Test Suites

| Test File | Purpose | Coverage |
|-----------|---------|----------|
| `start-command.test.js` | `/start` command flow | First-time users, session management, authorization |
| `button-interactions.test.js` | Keyboard interactions | Reply buttons, inline callbacks, sequences |
| `voice-message.test.js` | Voice message handling | Upload, processing, integration |
| `error-scenarios.test.js` | Error handling | Edge cases, resilience, recovery |
| `multi-config.test.js` | Configuration testing | Multiple bot configs, isolation |
| `real-bot-test-suite.js` | Overall test suite | Health checks, documentation |

## 🚀 Quick Start

### Run All Real Bot Tests
```bash
npm run test:real-bot
```

### Run Specific Test Categories
```bash
# Test /start command functionality
npm run test:real-bot:start

# Test button interactions
npm run test:real-bot:buttons

# Test voice message handling
npm run test:real-bot:voice

# Test error scenarios
npm run test:real-bot:errors

# Test multiple configurations
npm run test:real-bot:configs

# Run comprehensive test suite
npm run test:real-bot:suite
```

### Development and Debugging
```bash
# Watch mode for development
npm run test:real-bot -- --watch

# Verbose output for debugging
npm run test:real-bot -- --verbose

# Debug with Node.js inspector
node --inspect-brk node_modules/.bin/jest tests/real-bot
```

## 📋 Test Scenarios Covered

### 1. Start Command Flow (`start-command.test.js`)
- **First-time user flow**: Welcome messages, help information
- **Session management**: Session creation and persistence
- **User authorization**: Admin vs regular user handling
- **Interface elements**: Keyboard setup and response quality
- **Error handling**: Malformed commands, stability testing
- **Performance**: Response times and reliability

### 2. Button Interactions (`button-interactions.test.js`)
- **Reply keyboard buttons**: 🛑 STOP, 📊 Status, 📂 Projects, etc.
- **Inline keyboard callbacks**: Model selection, thinking modes, pagination
- **Interaction sequences**: Rapid presses, mixed patterns
- **Error handling**: Invalid callbacks, missing data
- **State management**: Keyboard persistence, session continuity

### 3. Voice Message Handling (`voice-message.test.js`)
- **Upload workflow**: Voice file acceptance and processing
- **Integration**: Voice + text message combinations
- **Session context**: Voice messages in different session states
- **Error handling**: Missing files, processing failures
- **Performance**: Processing times and response quality

### 4. Error Scenarios (`error-scenarios.test.js`)
- **Invalid commands**: Nonexistent commands, malformed input
- **Special characters**: Unicode, emojis, encoding issues
- **Session errors**: State corruption, rapid interactions
- **Resource limits**: Long messages, performance edge cases
- **Recovery**: Error state recovery, graceful degradation

### 5. Multi-Configuration (`multi-config.test.js`)
- **Configuration validation**: JSON format, required fields
- **Multiple instances**: Concurrent bot testing
- **Isolation**: Separate conversation histories
- **Compatibility**: Backward compatibility, missing configs
- **Performance**: Response times across configurations

## 🛠️ Technical Details

### Test Environment Setup

Each test automatically:
1. Starts a local `telegram-test-api` server
2. Creates a test Telegram client
3. Initializes the bot with test configuration
4. Provides isolated testing environment
5. Cleans up resources after testing

### Test Isolation

- **Unique ports**: Each test uses different server ports
- **Separate user IDs**: Different test users for isolation
- **Clean state**: Fresh session before each test
- **Resource cleanup**: Automatic server shutdown and cleanup

### Real Bot Interactions

Tests simulate actual Telegram user behavior:

```javascript
// Send a message and wait for bot response
const response = await testHelper.sendMessageAndWaitForResponse('/start');

// Press a button and wait for response
const buttonResponse = await testHelper.pressButtonAndWaitForResponse('model:sonnet');

// Send voice message and wait for processing
const voiceResponse = await testHelper.sendVoiceAndWaitForResponse('test-voice.ogg');

// Test complete conversation flows
const results = await testHelper.testConversationFlow([
  { type: 'message', text: '/start' },
  { type: 'button', callbackData: 'model:sonnet' },
  { type: 'message', text: 'Hello, how are you?' }
]);
```

## 🔧 Configuration

### Environment Variables
```bash
# Optional configuration
TEST_TIMEOUT=120000          # Test timeout in milliseconds
REAL_BOT_PORT=8081          # Base port for test servers
REAL_BOT_LOG_LEVEL=error    # Reduce test server noise
```

### Custom Test Configuration
```javascript
const testHelper = new RealBotTestHelper({
  serverPort: 8081,           // Test server port
  testUserId: 12345,          // Simulated user ID
  workingDirectory: '/path',  // Bot working directory
  // ... other options
});
```

## 📊 Benefits Achieved

### ✅ Development Efficiency
- **No Manual Testing**: Automated button clicking and message sending
- **Rapid Feedback**: Instant detection of integration issues
- **Consistent Testing**: Repeatable test scenarios every time
- **Developer Focus**: Spend time on features, not manual testing

### ✅ Quality Assurance
- **Real API Testing**: Actual Telegram Bot API responses
- **Complete Workflows**: End-to-end conversation testing  
- **Edge Case Coverage**: Error scenarios and resilience testing
- **Regression Prevention**: Catch breaking changes immediately

### ✅ CI/CD Integration
- **Automated Pipelines**: Tests run in continuous integration
- **Pre-deployment Validation**: Verify functionality before release
- **Performance Monitoring**: Track response times and reliability
- **Documentation**: Self-documenting test scenarios

## 🐛 Troubleshooting

### Common Issues

**Test timeouts:**
```bash
# Increase timeout for slow systems
jest tests/real-bot --testTimeout=180000
```

**Port conflicts:**
```bash
# Check if ports are in use
lsof -i :8081-8090

# Kill processes using test ports
killall -9 node
```

**telegram-test-api issues:**
```bash
# Ensure telegram-test-api is installed
npm install telegram-test-api --save-dev

# Try installing globally if local fails
npm install -g telegram-test-api
```

**Memory issues:**
```bash
# Run tests with more memory
node --max-old-space-size=4096 node_modules/.bin/jest tests/real-bot
```

### Debug Mode

Enable verbose logging:
```javascript
const testHelper = new RealBotTestHelper({
  serverPort: 8081,
  testUserId: 12345,
  workingDirectory: process.cwd()
});

// Set debug mode
process.env.DEBUG = 'telegram-test-*';
```

## 🚀 Future Enhancements

### Planned Features
- **Visual regression testing**: Screenshot comparisons
- **Performance benchmarking**: Automated performance monitoring
- **Load testing**: Concurrent user simulation  
- **Mobile testing**: Device-specific testing scenarios
- **Custom assertions**: Domain-specific test helpers

### Integration Opportunities
- **GitHub Actions**: Automated PR testing
- **Docker containers**: Isolated test environments
- **Test reporting**: Rich HTML test reports
- **Monitoring integration**: Production testing hooks

## 📚 Additional Resources

- [telegram-test-api Documentation](https://github.com/jehy/telegram-test-api)
- [Jest Testing Framework](https://jestjs.io/)
- [Telegram Bot API Reference](https://core.telegram.org/bots/api)
- [Node.js Telegram Bot API](https://github.com/yagop/node-telegram-bot-api)

---

**Phase 2 Complete**: Real Telegram Bot Integration Testing is now fully implemented and ready for automated testing workflows!
# Message Concatenation Feature - Implementation Plan

## 📋 Feature Overview

**Feature Name**: Message Concatenation System (Concat Mode)
**Purpose**: Allow users to accumulate multiple messages (text, voice, images) in a buffer before sending them as a single combined message to Claude Code.

## 🎯 Requirements Analysis

### Core Functionality
1. **Buffer Mode Toggle**: "Concat On" button to enable message accumulation
2. **Message Accumulation**: Store all message types in a buffer while in concat mode
3. **Send Accumulated**: "Concat Send" button to process all buffered messages at once
4. **Multi-Type Support**: Handle text, voice (transcribed), and images in the same buffer
5. **User Instructions**: Clear guidance on how to use the feature

### Supported Message Types
- **Text Messages**: Direct text input from user
- **Voice Messages**: Transcribed text from voice messages
- **Image Messages**: Images with optional captions
- **Mixed Combinations**: Any combination of the above

## 🏗️ Technical Architecture

### Current Message Flow Analysis
```
User Message → handleUserMessage() → processUserMessage() → Claude Code Session
Voice Message → handleVoiceMessage() → transcribe → processUserMessage() → Claude Code
Image Message → handlePhotoMessage() → processImageMessage() → processUserMessage() → Claude Code
```

### New Concat Mode Flow
```
User Enables Concat → Store messages in buffer → User clicks "Concat Send" → Combine all messages → processUserMessage() → Claude Code
```

## 🔧 Implementation Design

### 1. State Management

**Location**: Add to `StreamTelegramBot` class in `bot.js`

```javascript
// New properties to add to constructor
this.concatMode = new Map(); // userId -> boolean (concat mode status)
this.messageBuffer = new Map(); // userId -> Array of buffered messages
```

**Message Buffer Structure**:
```javascript
{
  type: 'text' | 'voice' | 'image',
  content: 'message text or transcription',
  imagePath: 'path/to/image' || null,
  timestamp: Date,
  originalMessage: msg // original Telegram message object
}
```

### 2. Keyboard Integration

**Location**: Modify `KeyboardHandlers.js`

#### Update `createReplyKeyboard()` method:
```javascript
createReplyKeyboard(userId = null) {
  const concatModeActive = this.mainBot.concatMode.get(userId) || false;
  const bufferCount = this.mainBot.messageBuffer.get(userId)?.length || 0;
  
  const concatButton = concatModeActive 
    ? { text: `📤 Concat Send (${bufferCount})` }
    : { text: '🔗 Concat On' };

  return {
    keyboard: [
      [
        { text: '🛑 STOP' },
        { text: '📊 Status' },
        { text: '📂 Projects' }
      ],
      [
        { text: '🔄 New Session' },
        { text: '📝 Sessions' },
        { text: '🤖 Model' }
      ],
      [
        { text: '🧠 Thinking' },
        { text: '📍 Path' },
        { text: '📁 Git' }
      ],
      [
        concatButton,
        { text: '🔄 Restart Bot' }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
}
```

#### Add new button handlers in `handleKeyboardButton()`:
```javascript
case '🔗 Concat On':
  await this.mainBot.enableConcatMode(userId, chatId);
  return true;

case '📤 Concat Send':
  if (text.includes('Concat Send')) {
    await this.mainBot.sendConcatenatedMessage(userId, chatId);
    return true;
  }
  break;
```

### 3. Core Concat Mode Methods

**Location**: Add to `StreamTelegramBot` class in `bot.js`

#### Enable Concat Mode
```javascript
async enableConcatMode(userId, chatId) {
  this.concatMode.set(userId, true);
  this.messageBuffer.set(userId, []);
  
  const instructionMessage = `🔗 **Concat Mode Enabled**

📝 **How to use:**
• Send any messages (text, voice, images)
• All messages will be collected in a buffer
• Click "📤 Concat Send" to process all at once
• Click "🔗 Concat On" again to disable

📊 **Buffer**: 0 messages`;

  await this.safeSendMessage(chatId, instructionMessage, {
    reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
  });
}
```

#### Disable Concat Mode
```javascript
async disableConcatMode(userId, chatId, clearBuffer = true) {
  this.concatMode.set(userId, false);
  if (clearBuffer) {
    this.messageBuffer.set(userId, []);
  }
  
  await this.safeSendMessage(chatId, '🔗 **Concat Mode Disabled**\n\nMessages will be sent immediately again.', {
    reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
  });
}
```

#### Add Message to Buffer
```javascript
async addToMessageBuffer(userId, messageData) {
  if (!this.messageBuffer.has(userId)) {
    this.messageBuffer.set(userId, []);
  }
  
  const buffer = this.messageBuffer.get(userId);
  buffer.push({
    ...messageData,
    timestamp: new Date()
  });
  
  console.log(`[User ${userId}] Added to buffer: ${messageData.type} message. Buffer size: ${buffer.length}`);
  return buffer.length;
}
```

#### Send Concatenated Message
```javascript
async sendConcatenatedMessage(userId, chatId) {
  const buffer = this.messageBuffer.get(userId) || [];
  
  if (buffer.length === 0) {
    await this.safeSendMessage(chatId, '📭 **Empty Buffer**\n\nNo messages to send. Add some messages first!', {
      reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
    });
    return;
  }

  // Combine all messages
  const combinedMessage = await this.combineBufferedMessages(buffer);
  
  // Clear buffer and disable concat mode
  this.messageBuffer.set(userId, []);
  this.concatMode.set(userId, false);
  
  // Send notification
  await this.safeSendMessage(chatId, `📤 **Sending Combined Message**\n\nProcessing ${buffer.length} messages...`, {
    reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
  });
  
  // Process the combined message
  await this.processUserMessage(combinedMessage, userId, chatId);
}
```

#### Combine Buffered Messages
```javascript
async combineBufferedMessages(buffer) {
  let combinedText = '';
  const imagePaths = [];
  
  for (let i = 0; i < buffer.length; i++) {
    const message = buffer[i];
    const messageNumber = i + 1;
    
    switch (message.type) {
      case 'text':
        combinedText += `[Message ${messageNumber} - Text]\n${message.content}\n\n`;
        break;
        
      case 'voice':
        combinedText += `[Message ${messageNumber} - Voice Transcription]\n${message.content}\n\n`;
        break;
        
      case 'image':
        combinedText += `[Message ${messageNumber} - Image${message.content ? ' with caption' : ''}]\n`;
        if (message.content) {
          combinedText += `Caption: ${message.content}\n`;
        }
        combinedText += `Image: ${message.imagePath}\n\n`;
        imagePaths.push(message.imagePath);
        break;
    }
  }
  
  // Add summary header
  const summaryHeader = `Combined Message (${buffer.length} parts):\n${'='.repeat(40)}\n\n`;
  
  return summaryHeader + combinedText.trim();
}
```

### 4. Message Handler Modifications

#### Update `handleUserMessage()` in `bot.js`
```javascript
async handleUserMessage(msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log(`[User ${userId}] Message: ${text}`);

  // Check if concat mode is enabled
  if (this.concatMode.get(userId)) {
    // Add to buffer instead of processing immediately
    const bufferSize = await this.addToMessageBuffer(userId, {
      type: 'text',
      content: text,
      imagePath: null
    });
    
    // Send buffer status update
    await this.safeSendMessage(chatId, `📝 **Added to Buffer**\n\nBuffer: ${bufferSize} message${bufferSize > 1 ? 's' : ''}`, {
      reply_markup: this.keyboardHandlers.createReplyKeyboard(userId)
    });
    return;
  }

  // Normal processing if concat mode is off
  await this.processUserMessage(text, userId, chatId);
}
```

#### Update `VoiceMessageHandler.js`
Modify the `handleVoiceCallback()` method to check for concat mode:

```javascript
// In handleVoiceCallback method, replace the processUserMessageCallback call:
if (data.startsWith('voice_confirm:')) {
  // ... existing code ...
  
  // Check if concat mode is enabled
  if (this.mainBot.concatMode.get(userId)) {
    const bufferSize = await this.mainBot.addToMessageBuffer(userId, {
      type: 'voice',
      content: transcribedText,
      imagePath: null
    });
    
    await this.mainBot.safeEditMessage(chatId, messageId, 
      `📝 **Voice Added to Buffer**\n\n🎤 Transcription: "${transcribedText}"\n\nBuffer: ${bufferSize} message${bufferSize > 1 ? 's' : ''}`
    );
  } else {
    // Normal processing
    await processUserMessageCallback(transcribedText, userId, chatId);
  }
}
```

#### Update `ImageHandler.js`
Modify the `handlePhotoMessage()` method:

```javascript
// In handlePhotoMessage method, before processImageMessage call:
if (this.mainBot && this.mainBot.concatMode.get(userId)) {
  // Add image to buffer
  const bufferSize = await this.mainBot.addToMessageBuffer(userId, {
    type: 'image',
    content: caption,
    imagePath: imagePath
  });
  
  await this.mainBot.safeSendMessage(chatId, 
    `🖼️ **Image Added to Buffer**\n\n${caption ? `Caption: ${caption}` : 'No caption'}\n\nBuffer: ${bufferSize} message${bufferSize > 1 ? 's' : ''}`, {
      reply_markup: this.mainBot.keyboardHandlers.createReplyKeyboard(userId)
    }
  );
  return;
}
```

### 5. Session Management Integration

**Location**: Modify `SessionManager.js`

Add cleanup for concat mode when starting new sessions:

```javascript
// In startNewSession method:
async startNewSession(userId, chatId) {
  // Clear any existing concat mode state
  if (this.mainBot.concatMode) {
    this.mainBot.concatMode.set(userId, false);
    this.mainBot.messageBuffer.set(userId, []);
  }
  
  // ... existing session creation logic ...
}
```

## 🧪 Testing Strategy

### Unit Tests
1. **Concat Mode Toggle**: Test enabling/disabling concat mode
2. **Buffer Management**: Test adding different message types to buffer
3. **Message Combination**: Test combining various message types
4. **Keyboard Updates**: Test dynamic keyboard updates based on concat state

### Integration Tests
1. **End-to-End Flow**: Full concat mode workflow
2. **Mixed Message Types**: Text + Voice + Image combinations
3. **Session Integration**: Concat mode with session management
4. **Error Handling**: Invalid states and edge cases

### Test Files to Create
- `tests/unit/concat-mode.test.js`
- `tests/integration/concat-workflow.test.js`
- `tests/real-bot/concat-feature.test.js`

## 📋 Implementation Checklist

### Phase 1: Core Infrastructure (Day 1)
- [ ] Add concat mode state properties to bot constructor
- [ ] Implement `enableConcatMode()` method
- [ ] Implement `disableConcatMode()` method
- [ ] Implement `addToMessageBuffer()` method
- [ ] Update keyboard handlers for concat buttons

### Phase 2: Message Handling (Day 2)
- [ ] Modify `handleUserMessage()` for concat mode
- [ ] Update `VoiceMessageHandler` for concat mode
- [ ] Update `ImageHandler` for concat mode
- [ ] Implement `combineBufferedMessages()` method
- [ ] Implement `sendConcatenatedMessage()` method

### Phase 3: UI/UX Polish (Day 3)
- [ ] Dynamic keyboard updates with buffer count
- [ ] Status messages and user feedback
- [ ] Error handling and edge cases
- [ ] Session cleanup integration

### Phase 4: Testing & Validation (Day 4)
- [ ] Create unit tests
- [ ] Create integration tests
- [ ] Manual testing with all message types
- [ ] Performance testing with large buffers

## 🚨 Edge Cases & Error Handling

### Edge Cases to Handle
1. **Empty Buffer Send**: User clicks "Concat Send" with no messages
2. **Session Restart**: What happens to buffer when session restarts
3. **Large Buffers**: Performance with many messages in buffer
4. **Image Cleanup**: Proper cleanup of temporary image files in buffer
5. **Voice Transcription Failures**: Handle failed voice transcriptions in buffer

### Error Recovery
- Clear buffer on session errors
- Fallback to individual message processing if concat fails
- Proper cleanup of temporary files
- User-friendly error messages

## 📊 Success Metrics

### Functional Success
- All message types can be buffered successfully
- Combined messages are processed correctly by Claude Code
- UI provides clear feedback to users
- No memory leaks or file system issues

### User Experience Success
- Intuitive button interactions
- Clear instructions and feedback
- Seamless integration with existing features
- Reliable message delivery

## 🔄 Future Enhancements

### Potential Improvements
1. **Buffer Preview**: Show preview of buffered messages
2. **Selective Send**: Choose which messages to include in send
3. **Buffer Persistence**: Save buffer across bot restarts
4. **Message Editing**: Edit buffered messages before sending
5. **Templates**: Save common message combinations as templates

This implementation plan provides a comprehensive roadmap for adding the message concatenation feature while maintaining the existing bot architecture and ensuring robust functionality across all supported message types.
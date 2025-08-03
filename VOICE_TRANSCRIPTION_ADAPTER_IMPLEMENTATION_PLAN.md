# Voice Transcription Adapter Implementation Plan

## 📋 Overview

**Feature**: Dual Voice Transcription System with Settings Interface
**Objective**: Add Telegram Bot API transcription as a second option alongside existing Nexara API, with global configuration setting

**🎯 Developer Tool Context**: This is a developer tool application. Users are developers who understand technical concepts and can handle direct error messages without excessive hand-holding.

## 🎯 Requirements Analysis

### Current State
- **Existing System**: VoiceMessageHandler.js with Nexara API integration
- **Architecture**: Single transcription method with test mode fallback
- **User Flow**: Voice → Transcribe → Confirm/Cancel/Edit → Execute
- **Configuration**: Uses existing `configs/bot1.json` system

### New Requirements
1. **Dual Transcription Adapters**: Nexara API + Telegram Bot API
2. **Settings Interface**: Global transcription method selection
3. **Simple Error Handling**: Direct API error messages (no fallbacks)
4. **Config Integration**: Use existing configuration system

## 🏗️ Architecture Design

### 1. Transcription Adapter Pattern

```
TranscriptionAdapterInterface
├── NexaraTranscriptionAdapter (existing logic)
├── TelegramTranscriptionAdapter (new)
└── TestTranscriptionAdapter (unit tests only)
```

**Benefits**:
- Clean separation of concerns
- Simple to maintain for developers
- Testable architecture
- Direct error propagation

### 2. Configuration Integration

**Global Setting in `configs/bot1.json`**:
```json
{
  "voiceTranscriptionMethod": "nexara", // "nexara" | "telegram"
  // ... existing config fields
}
```

**Default**: `"nexara"` (preserves existing behavior)

### 3. Enhanced VoiceMessageHandler

```
VoiceMessageHandler (Enhanced)
├── Adapter selection from config
├── Direct error handling (no fallbacks)
├── Simple method switching
└── Developer-friendly error messages
```

## 📱 User Interface Design

### Settings Menu Structure

```
⚙️ Settings
├── 🎤 Voice Transcription Method
│   ├── 📡 Telegram API
│   └── 🔧 Nexara API (Current)
└── 🔙 Back to Main Menu
```

### Settings Interface Features

1. **Simple Options**: 
   - "Telegram API"
   - "Nexara API"
2. **Current Selection Display**: Show active method
3. **Direct Configuration**: Immediate config file update

## 🛠️ Implementation Phases

### Phase 1: Adapter Architecture Foundation
**Status**: ⏳ Planned

**Tasks**:
1. Create `TranscriptionAdapterInterface` base class
2. Refactor existing Nexara code into `NexaraTranscriptionAdapter`
3. Create `TestTranscriptionAdapter` for unit tests only
4. Update `VoiceMessageHandler` to use adapter pattern
5. Add config reading for transcription method selection

**Files to Create/Modify**:
- `adapters/TranscriptionAdapterInterface.js` (new)
- `adapters/NexaraTranscriptionAdapter.js` (new)
- `adapters/TestTranscriptionAdapter.js` (new - tests only)
- `VoiceMessageHandler.js` (modify)

### Phase 2: Telegram API Transcription Adapter
**Status**: ⏳ Planned

**Tasks**:
1. Implement `TelegramTranscriptionAdapter`
2. Handle Telegram Bot API transcription requests
3. Direct error handling from Telegram API
4. Integration with existing voice flow

**Files to Create/Modify**:
- `adapters/TelegramTranscriptionAdapter.js` (new)

### Phase 3: Settings UI Integration
**Status**: ⏳ Planned

**Tasks**:
1. Create settings menu interface
2. Add settings callbacks to main bot
3. Implement transcription method selection UI
4. Config file update mechanism

**Files to Create/Modify**:
- `SettingsMenuHandler.js` (new)
- `bot.js` (modify - add settings callbacks)

### Phase 4: Integration and Testing
**Status**: ⏳ Planned

**Tasks**:
1. TDD implementation of all components
2. Integration testing
3. Fix existing tests broken by changes
4. Documentation updates

**Files to Create/Modify**:
- `tests/unit/transcription-adapters.test.js` (new)
- `tests/unit/voice-message-handler.test.js` (modify existing)
- Update other affected tests

## 🔧 Technical Implementation Details

### 1. Telegram API Transcription Method

**Implementation Approach**:
```javascript
// Pseudo-code for Telegram transcription
async transcribeWithTelegram(fileId) {
  try {
    // Use Telegram Bot API to transcribe voice message
    const result = await this.bot.transcribeAudio(fileId);
    return result.text;
  } catch (error) {
    // Direct error propagation to user
    throw new Error(`Telegram transcription failed: ${error.message}`);
  }
}
```

### 2. Configuration System Integration

**Reading Config**:
```javascript
getTranscriptionMethod() {
  const config = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
  return config.voiceTranscriptionMethod || 'nexara'; // default
}
```

**Updating Config**:
```javascript
setTranscriptionMethod(method) {
  const config = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
  config.voiceTranscriptionMethod = method;
  fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
}
```

### 3. Error Handling Strategy

**Direct Error Messages** (no fallbacks):
- Telegram API unavailable → show Telegram error message
- Nexara API key missing → show "Nexara API key not configured"
- Network errors → show network error details
- Invalid method → show configuration error

### 4. Adapter Selection Logic

```javascript
createTranscriptionAdapter() {
  const method = this.getTranscriptionMethod();
  
  switch (method) {
    case 'telegram':
      return new TelegramTranscriptionAdapter(this.bot);
    case 'nexara':
    default:
      return new NexaraTranscriptionAdapter(this.nexaraApiKey);
  }
}
```

## 🧪 Testing Strategy

### TDD Approach (Required)
1. **Write tests first** for each component
2. **Implement functionality** to pass tests
3. **Fix existing tests** broken by changes
4. **Maintain test coverage** throughout development

### Unit Tests
- Each adapter tested independently
- Settings configuration changes
- Error handling scenarios
- Config file read/write operations

### Integration Tests
- End-to-end voice message flow with both adapters
- Settings UI interactions
- Error propagation through the system

## 📋 User Stories

### Story 1: Settings Access
**As a developer**, I want to access transcription settings easily
**Given** I'm using the bot
**When** I type `/settings` or use a settings command
**Then** I see transcription method options

### Story 2: Method Selection
**As a developer**, I want to choose Telegram API for transcription
**Given** I access settings
**When** I select "Telegram API"
**Then** my voice messages use Telegram's transcription service

### Story 3: Error Handling
**As a developer**, I want clear error messages when transcription fails
**Given** I'm using a transcription method that fails
**When** I send a voice message
**Then** I see the exact error from the API (no fallbacks)

### Story 4: Settings Persistence
**As a developer**, I want my transcription method choice to persist
**Given** I've selected a transcription method
**When** I restart the bot or send messages later
**Then** my choice is maintained in the config file

## 🚀 Success Criteria

### Functional Requirements ✅
- [ ] Two transcription adapters working independently
- [ ] Settings interface accessible via bot commands
- [ ] Global preference saved in `configs/bot1.json`
- [ ] Direct error handling (no fallbacks)
- [ ] TDD implementation with full test coverage

### Non-Functional Requirements ✅
- [ ] Response time similar to current implementation
- [ ] Settings changes take effect immediately
- [ ] Error messages are direct and technical (appropriate for developers)
- [ ] Code maintains test coverage
- [ ] Integration with existing config system

### User Experience Requirements ✅
- [ ] Settings menu is accessible and functional
- [ ] Transcription method selection is clear
- [ ] Current method is displayed
- [ ] Config file updates work correctly

## 📝 Implementation Notes

### Configuration File Structure
**Add to `configs/bot1.json`**:
```json
{
  "voiceTranscriptionMethod": "nexara",
  // ... existing fields remain unchanged
}
```

### Error Handling Philosophy
- **No fallbacks**: If selected method fails, show error
- **Developer-friendly**: Technical error messages are acceptable
- **Direct API errors**: Pass through actual API error messages
- **Simple troubleshooting**: Clear indication of what went wrong

### Testing Requirements
- **TDD mandatory**: Tests written before implementation
- **Fix broken tests**: Update existing tests affected by changes
- **Component isolation**: Each adapter testable independently
- **Integration coverage**: Full voice message flow testing

---

## 🎯 Ready for Implementation

This simplified plan provides a straightforward approach for implementing dual voice transcription:

- **Minimal Complexity**: Two adapters, simple config, direct errors
- **Developer-Focused**: Technical users can handle direct error messages
- **Existing Integration**: Uses current config system
- **TDD Approach**: Test-driven development throughout
- **No Over-Engineering**: Focused on core requirements only

**Next Steps**: Get approval for this simplified plan and begin Phase 1 implementation with TDD approach.
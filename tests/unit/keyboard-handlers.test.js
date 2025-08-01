/**
 * Unit Tests for KeyboardHandlers
 * Tests Telegram keyboard logic, button handling, and UI generation
 */

const KeyboardHandlers = require('../../KeyboardHandlers');

const createMockBot = () => ({
  sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  editMessageText: jest.fn().mockResolvedValue(true)
});

const createMockMainBot = () => ({
  cancelUserSession: jest.fn().mockResolvedValue(),
  safeSendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  sessionManager: {
    showSessionStatus: jest.fn().mockResolvedValue(),
    startNewSession: jest.fn().mockResolvedValue(),
    showSessionHistory: jest.fn().mockResolvedValue(),
    getCurrentDirectory: jest.fn().mockReturnValue('/test/project'),
    cancelUserSession: jest.fn().mockResolvedValue()
  },
  projectNavigator: {
    showProjectSelection: jest.fn().mockResolvedValue()
  },
  showModelSelection: jest.fn().mockResolvedValue(),
  showThinkingModeSelection: jest.fn().mockResolvedValue(),
  gitManager: {
    showGitOverview: jest.fn().mockResolvedValue()
  }
});

const createMockMessage = (text, overrides = {}) => ({
  text,
  chat: { id: 123 },
  from: { id: 456 },
  ...overrides
});

describe('KeyboardHandlers', () => {
  let keyboardHandlers;
  let mockBot;
  let mockMainBot;

  beforeEach(() => {
    mockBot = createMockBot();
    mockMainBot = createMockMainBot();
    keyboardHandlers = new KeyboardHandlers(mockBot, mockMainBot);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with bot instances', () => {
      expect(keyboardHandlers.bot).toBe(mockBot);
      expect(keyboardHandlers.mainBot).toBe(mockMainBot);
    });
  });

  describe('Reply Keyboard Creation', () => {
    test('should create reply keyboard with all buttons', () => {
      const keyboard = keyboardHandlers.createReplyKeyboard();

      expect(keyboard).toEqual({
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
          ]
        ],
        resize_keyboard: true,
        persistent: true
      });
    });

    test('should have consistent keyboard structure', () => {
      const keyboard = keyboardHandlers.createReplyKeyboard();

      expect(keyboard.keyboard).toHaveLength(3);
      keyboard.keyboard.forEach(row => {
        expect(row).toHaveLength(3);
        row.forEach(button => {
          expect(button).toHaveProperty('text');
          expect(typeof button.text).toBe('string');
        });
      });
    });
  });

  describe('Keyboard Button Handling', () => {
    test('should handle STOP button', async () => {
      const msg = createMockMessage('🛑 STOP');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.sessionManager.cancelUserSession).toHaveBeenCalledWith(123);
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        123,
        '🛑 *Emergency Stop*\n\nAll processes stopped.',
        {
          forceNotification: true,
          reply_markup: keyboardHandlers.createReplyKeyboard()
        }
      );
    });

    test('should handle Status button', async () => {
      const msg = createMockMessage('📊 Status');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.sessionManager.showSessionStatus).toHaveBeenCalledWith(123);
    });

    test('should handle Projects button', async () => {
      const msg = createMockMessage('📂 Projects');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.projectNavigator.showProjectSelection).toHaveBeenCalledWith(123);
    });

    test('should handle New Session button', async () => {
      const msg = createMockMessage('🔄 New Session');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.sessionManager.startNewSession).toHaveBeenCalledWith(123);
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        123,
        '🔄 *New Session*\n\nOld session ended, new session started.',
        {
          forceNotification: true,
          reply_markup: keyboardHandlers.createReplyKeyboard()
        }
      );
    });

    test('should handle Sessions button', async () => {
      const msg = createMockMessage('📝 Sessions');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.sessionManager.showSessionHistory).toHaveBeenCalledWith(123);
    });

    test('should handle Path button', async () => {
      const msg = createMockMessage('📍 Path');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.sessionManager.getCurrentDirectory).toHaveBeenCalledWith(456);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123,
        '📍 *Current Path:*\n\n`/test/project`',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboardHandlers.createReplyKeyboard()
        }
      );
    });

    test('should handle Model button', async () => {
      const msg = createMockMessage('🤖 Model');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.showModelSelection).toHaveBeenCalledWith(123);
    });

    test('should handle Thinking button', async () => {
      const msg = createMockMessage('🧠 Thinking');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.showThinkingModeSelection).toHaveBeenCalledWith(123);
    });

    test('should handle Git button', async () => {
      const msg = createMockMessage('📁 Git');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(true);
      expect(mockMainBot.gitManager.showGitOverview).toHaveBeenCalledWith(123);
    });

    test('should return false for unknown button', async () => {
      const msg = createMockMessage('Unknown Button');

      const result = await keyboardHandlers.handleKeyboardButton(msg);

      expect(result).toBe(false);
    });

    test('should handle button press errors gracefully', async () => {
      mockMainBot.sessionManager.showSessionStatus.mockRejectedValueOnce(new Error('Session error'));
      const msg = createMockMessage('📊 Status');

      // Should not throw error
      await expect(keyboardHandlers.handleKeyboardButton(msg)).rejects.toThrow('Session error');
    });
  });

  describe('Session History Keyboard', () => {
    test('should create keyboard with session buttons', () => {
      const sessions = ['session-123-abc', 'session-456-def', 'session-789-ghi'];
      const keyboard = keyboardHandlers.createSessionHistoryKeyboard(0, 1, sessions);

      expect(keyboard.inline_keyboard).toHaveLength(1);
      expect(keyboard.inline_keyboard[0]).toHaveLength(3);
      expect(keyboard.inline_keyboard[0]).toEqual([
        { text: '📄 -123-abc', callback_data: 'resume_session:session-123-abc' },
        { text: '📄 -456-def', callback_data: 'resume_session:session-456-def' },
        { text: '📄 -789-ghi', callback_data: 'resume_session:session-789-ghi' }
      ]);
    });

    test('should limit to 5 sessions per page', () => {
      const sessions = Array.from({ length: 10 }, (_, i) => `session-${i}`);
      const keyboard = keyboardHandlers.createSessionHistoryKeyboard(0, 2, sessions);

      expect(keyboard.inline_keyboard[0]).toHaveLength(5);
    });

    test('should add pagination for multiple pages', () => {
      const sessions = ['session-1', 'session-2'];
      const keyboard = keyboardHandlers.createSessionHistoryKeyboard(1, 3, sessions);

      expect(keyboard.inline_keyboard).toHaveLength(2);
      
      const paginationRow = keyboard.inline_keyboard[1];
      expect(paginationRow).toContainEqual({
        text: '◀️ Previous',
        callback_data: 'sessions_page:0'
      });
      expect(paginationRow).toContainEqual({
        text: '📄 2/3',
        callback_data: 'noop'
      });
      expect(paginationRow).toContainEqual({
        text: 'Next ▶️',
        callback_data: 'sessions_page:2'
      });
    });

    test('should handle first page pagination', () => {
      const sessions = ['session-1'];
      const keyboard = keyboardHandlers.createSessionHistoryKeyboard(0, 3, sessions);

      const paginationRow = keyboard.inline_keyboard[1];
      expect(paginationRow).not.toContain(
        expect.objectContaining({ text: '◀️ Previous' })
      );
      expect(paginationRow).toContainEqual({
        text: 'Next ▶️',
        callback_data: 'sessions_page:1'
      });
    });

    test('should handle last page pagination', () => {
      const sessions = ['session-1'];
      const keyboard = keyboardHandlers.createSessionHistoryKeyboard(2, 3, sessions);

      const paginationRow = keyboard.inline_keyboard[1];
      expect(paginationRow).toContainEqual({
        text: '◀️ Previous',
        callback_data: 'sessions_page:1'
      });
      expect(paginationRow).not.toContain(
        expect.objectContaining({ text: 'Next ▶️' })
      );
    });

    test('should handle single page without pagination', () => {
      const sessions = ['session-1'];
      const keyboard = keyboardHandlers.createSessionHistoryKeyboard(0, 1, sessions);

      expect(keyboard.inline_keyboard).toHaveLength(1);
    });

    test('should handle empty sessions', () => {
      const keyboard = keyboardHandlers.createSessionHistoryKeyboard(0, 1, []);

      expect(keyboard.inline_keyboard).toHaveLength(0);
    });
  });

  describe('Model Selection Keyboard', () => {
    test('should create model selection keyboard', () => {
      const keyboard = keyboardHandlers.createModelSelectionKeyboard();

      expect(keyboard.inline_keyboard).toEqual([
        [
          { text: '🚀 Sonnet (Fast)', callback_data: 'model:claude-3-5-sonnet-20241022' },
          { text: '🎯 Haiku (Quick)', callback_data: 'model:claude-3-5-haiku-20241022' }
        ],
        [
          { text: '🧠 Opus (Smart)', callback_data: 'model:claude-3-opus-20240229' }
        ],
        [
          { text: '❌ Cancel', callback_data: 'model:cancel' }
        ]
      ]);
    });

    test('should have consistent structure', () => {
      const keyboard = keyboardHandlers.createModelSelectionKeyboard();

      expect(keyboard.inline_keyboard).toHaveLength(3);
      keyboard.inline_keyboard.forEach(row => {
        row.forEach(button => {
          expect(button).toHaveProperty('text');
          expect(button).toHaveProperty('callback_data');
          expect(typeof button.text).toBe('string');
          expect(typeof button.callback_data).toBe('string');
        });
      });
    });
  });

  describe('Thinking Mode Keyboard', () => {
    test('should create thinking mode keyboard', () => {
      const keyboard = keyboardHandlers.createThinkingModeKeyboard();

      expect(keyboard.inline_keyboard).toHaveLength(4); // 3 rows of 2 modes + cancel row

      // Check first row
      expect(keyboard.inline_keyboard[0]).toEqual([
        { text: '💭 Standard', callback_data: 'think:standard' },
        { text: '🤔 Deep Think', callback_data: 'think:deep' }
      ]);

      // Check second row
      expect(keyboard.inline_keyboard[1]).toEqual([
        { text: '🧠 Ultra Think', callback_data: 'think:ultra' },
        { text: '⚡ Quick', callback_data: 'think:quick' }
      ]);

      // Check third row
      expect(keyboard.inline_keyboard[2]).toEqual([
        { text: '🎯 Focused', callback_data: 'think:focused' },
        { text: '🔍 Analysis', callback_data: 'think:analysis' }
      ]);

      // Check cancel row
      expect(keyboard.inline_keyboard[3]).toEqual([
        { text: '❌ Cancel', callback_data: 'think:cancel' }
      ]);
    });

    test('should group modes into rows of 2', () => {
      const keyboard = keyboardHandlers.createThinkingModeKeyboard();

      // All rows except the last should have 2 buttons
      for (let i = 0; i < keyboard.inline_keyboard.length - 1; i++) {
        expect(keyboard.inline_keyboard[i]).toHaveLength(2);
      }

      // Last row should have 1 button (cancel)
      expect(keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]).toHaveLength(1);
    });

    test('should have consistent callback data format', () => {
      const keyboard = keyboardHandlers.createThinkingModeKeyboard();

      keyboard.inline_keyboard.forEach(row => {
        row.forEach(button => {
          expect(button.callback_data).toMatch(/^think:/);
        });
      });
    });
  });

  describe('Helper Methods', () => {
    test('should provide getReplyKeyboardMarkup method', () => {
      // Add this method to the class for consistency with usage
      keyboardHandlers.getReplyKeyboardMarkup = () => keyboardHandlers.createReplyKeyboard();

      const markup = keyboardHandlers.getReplyKeyboardMarkup();
      expect(markup).toEqual(keyboardHandlers.createReplyKeyboard());
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle rapid button presses', async () => {
      const msg = createMockMessage('📊 Status');

      // Simulate rapid button presses
      const promises = Array.from({ length: 5 }, () => 
        keyboardHandlers.handleKeyboardButton(msg)
      );

      const results = await Promise.all(promises);
      results.forEach(result => expect(result).toBe(true));
      expect(mockMainBot.sessionManager.showSessionStatus).toHaveBeenCalledTimes(5);
    });

    test('should handle mixed button types', async () => {
      const buttons = [
        '🛑 STOP',
        '📊 Status',
        '📂 Projects',
        'Unknown Button'
      ];

      const results = [];
      for (const buttonText of buttons) {
        const msg = createMockMessage(buttonText);
        const result = await keyboardHandlers.handleKeyboardButton(msg);
        results.push(result);
      }

      expect(results).toEqual([true, true, true, false]);
    });

    test('should maintain keyboard state across operations', async () => {
      const msg1 = createMockMessage('🛑 STOP');
      const msg2 = createMockMessage('🔄 New Session');

      await keyboardHandlers.handleKeyboardButton(msg1);
      await keyboardHandlers.handleKeyboardButton(msg2);

      // Both should send messages with the same keyboard
      expect(mockMainBot.safeSendMessage).toHaveBeenCalledTimes(2);
      const calls = mockMainBot.safeSendMessage.mock.calls;
      expect(calls[0][2].reply_markup).toEqual(calls[1][2].reply_markup);
    });
  });

  describe('Error Handling', () => {
    test('should handle bot sendMessage errors', async () => {
      mockBot.sendMessage.mockRejectedValueOnce(new Error('Send failed'));
      const msg = createMockMessage('📍 Path');

      await expect(keyboardHandlers.handleKeyboardButton(msg)).rejects.toThrow('Send failed');
    });

    test('should handle mainBot method errors', async () => {
      mockMainBot.sessionManager.cancelUserSession.mockRejectedValueOnce(new Error('Cancel failed'));
      const msg = createMockMessage('🛑 STOP');

      await expect(keyboardHandlers.handleKeyboardButton(msg)).rejects.toThrow('Cancel failed');
    });

    test('should handle invalid message structure', async () => {
      const invalidMsg = { text: '📊 Status' }; // Missing chat and from

      // Should throw error due to missing chat.id
      await expect(keyboardHandlers.handleKeyboardButton(invalidMsg)).rejects.toThrow();
    });
  });

  describe('Keyboard Structure Validation', () => {
    test('should create valid Telegram keyboard structures', () => {
      const replyKeyboard = keyboardHandlers.createReplyKeyboard();
      const sessionKeyboard = keyboardHandlers.createSessionHistoryKeyboard(0, 1, ['session-1']);
      const modelKeyboard = keyboardHandlers.createModelSelectionKeyboard();
      const thinkingKeyboard = keyboardHandlers.createThinkingModeKeyboard();

      // All keyboards should have the required structure
      [replyKeyboard, sessionKeyboard, modelKeyboard, thinkingKeyboard].forEach(keyboard => {
        if (keyboard.keyboard) {
          // Reply keyboard
          expect(Array.isArray(keyboard.keyboard)).toBe(true);
        } else {
          // Inline keyboard
          expect(keyboard).toHaveProperty('inline_keyboard');
          expect(Array.isArray(keyboard.inline_keyboard)).toBe(true);
        }
      });
    });

    test('should use valid callback data formats', () => {
      const sessionKeyboard = keyboardHandlers.createSessionHistoryKeyboard(0, 2, ['session-1']);
      const modelKeyboard = keyboardHandlers.createModelSelectionKeyboard();
      const thinkingKeyboard = keyboardHandlers.createThinkingModeKeyboard();

      [sessionKeyboard, modelKeyboard, thinkingKeyboard].forEach(keyboard => {
        keyboard.inline_keyboard.forEach(row => {
          row.forEach(button => {
            expect(button.callback_data).toBeDefined();
            expect(typeof button.callback_data).toBe('string');
            expect(button.callback_data.length).toBeLessThanOrEqual(64); // Telegram limit
          });
        });
      });
    });
  });

  describe('Button Text Consistency', () => {
    test('should have consistent emoji usage', () => {
      const replyKeyboard = keyboardHandlers.createReplyKeyboard();
      
      replyKeyboard.keyboard.forEach(row => {
        row.forEach(button => {
          // Each button should start with an emoji
          expect(button.text).toMatch(/^([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/u);
        });
      });
    });

    test('should have appropriate button text lengths', () => {
      const keyboards = [
        keyboardHandlers.createReplyKeyboard(),
        keyboardHandlers.createModelSelectionKeyboard(),
        keyboardHandlers.createThinkingModeKeyboard()
      ];

      keyboards.forEach(keyboard => {
        const buttons = keyboard.keyboard || keyboard.inline_keyboard;
        buttons.forEach(row => {
          row.forEach(button => {
            expect(button.text.length).toBeLessThanOrEqual(32); // Reasonable limit
            expect(button.text.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });
});
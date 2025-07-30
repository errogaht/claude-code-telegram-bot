module.exports = {
  // Simple text messages
  simpleText: {
    message_id: 1,
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: 67890,
      type: 'private'
    },
    date: 1640995200,
    text: 'Hello, how are you?'
  },

  // Long message that should be split
  longText: {
    message_id: 2,
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: 67890,
      type: 'private'
    },
    date: 1640995200,
    text: 'This is a very long message that exceeds the Telegram message limit. '.repeat(100)
  },

  // Message with HTML formatting
  htmlMessage: {
    message_id: 3,
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: 67890,
      type: 'private'
    },
    date: 1640995200,
    text: '<b>Bold text</b> and <i>italic text</i> with <code>code</code>'
  },

  // Group chat message
  groupMessage: {
    message_id: 4,
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: -1001234567890,
      type: 'supergroup',
      title: 'Test Group'
    },
    date: 1640995200,
    text: 'Hello everyone in the group!'
  },

  // Command message
  commandMessage: {
    message_id: 6,
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: 67890,
      type: 'private'
    },
    date: 1640995200,
    text: '/start',
    entities: [
      {
        offset: 0,
        length: 6,
        type: 'bot_command'
      }
    ]
  }
};
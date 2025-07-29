# 🤖 Claude Code Telegram Bot

A Node.js Telegram bot that provides remote access to your existing Claude Code installation. Continue your development workflow through Telegram when away from your computer.

## 🔄 How It Works

This bot runs on your development machine and connects to your existing Claude Code instance. It allows you to:

- 💬 **Continue coding sessions** remotely through Telegram
- 🎙️ **Send voice messages** that get transcribed and processed by Claude Code
- 📱 **Access your projects** and development environment from your phone
- 🏢 **Manage multiple bot instances** for different projects or clients

**⚠️ Important**: This tool doesn't add any AI functionality. It's a bridge that lets you use your existing Claude Code setup through Telegram with some convenience features.

## 📋 Requirements

### Prerequisites
- 🔧 **Claude Code CLI** installed and configured on your development machine
- ⚡ **Node.js** 14+ 
- 🔑 **Telegram Bot Token** from [@BotFather](https://t.me/botfather)
- 📂 **Your existing Claude Code projects** and tooling setup

### Optional
- 🎙️ **Nexara API key** for voice message transcription
- 🔌 **MCP servers** configured in Claude Code for enhanced functionality

## 📦 Installation

```bash
git clone <repository-url>
cd claude-code-telegram-control
npm install
```

## ⚙️ Setup

### ⚡ Quick Setup
```bash
npm run setup
```

The interactive wizard will ask for:
- 🤖 Bot name and Telegram token
- 📁 Working directory (where your projects are)
- 👤 Admin user ID (optional - auto-detected from first message)
- 🎙️ Nexara API key (optional - for voice messages)
- 🧠 Default Claude model (Sonnet/Opus)

### 📝 Manual Configuration
Create configuration files in `configs/` directory:

```json
// configs/bot1.json
{
  "botName": "MyDevBot",
  "token": "your_telegram_bot_token",
  "adminUserId": "your_telegram_user_id",
  "nexaraApiKey": "optional_nexara_key",
  "workingDirectory": "/path/to/your/projects",
  "model": "sonnet"
}
```

## 🚀 Usage

### ▶️ Starting the Bot
```bash
# Start default bot
npm run bot1

# Start multiple bots
npm run bot2
npm run bot3

# Development mode with auto-restart
npm run dev
```

### 📝 Basic Commands
- `/start` - 🎦 Initialize bot and show keyboard
- `/status` - 📈 Show active Claude Code processes
- `/new` - ✨ Start new Claude Code session
- `/sessions` - 📂 Browse previous sessions
- `/model` - 🧠 Switch Claude model (Sonnet/Opus)
- `/cancel` - 🛑 Stop all running processes

### ⌨️ Persistent Keyboard
Always available buttons:
```
🛑 STOP        📊 Status       📂 Projects
🔄 New Session 📝 Sessions     🤖 Model  
🧠 Thinking    📍 Path        🔍 Git Diff
```

### 🎙️ Voice Messages
If Nexara API is configured:
1. Send voice message to bot
2. Bot transcribes speech to text
3. Shows Execute/Cancel/Edit buttons
4. Execute sends command to Claude Code
5. Receive streaming response

## ✨ Features

### 📝 Session Management
- ⏯️ **Resume conversations** using Claude Code's `--resume` flag
- 📂 **Session history** with browsable past conversations
- 🏢 **Multi-instance support** - run separate bots for different projects

### 🔄 Real-time Streaming
- ⚡ **Live updates** as Claude Code processes commands
- 🧮 **Smart message chunking** for Telegram's 4096 character limit
- 📝 **Progressive message editing** to show work in progress

### 🏢 Multi-Bot Configuration
- 🔄 **Independent instances** with separate configs
- 📁 **Different working directories** per bot
- 👥 **Separate admin users** for each bot
- 🔒 **Isolated session storage**

### 🔒 Security
- 👤 **Admin-only access** - only configured users can use the bot
- ✅ **Command confirmation** for voice messages
- ⏰ **Process timeouts** and emergency stop functionality

## 🏠 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Telegram      │◄──►│  StreamTelegram │◄──►│  Claude CLI     │
│   Bot API       │    │  Bot (bot.js)   │    │  Process        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │ ClaudeStream    │
                        │ Processor +     │
                        │ TelegramFormat  │
                        └─────────────────┘
```

### Key Components
- 🤖 **bot.js** - Main Telegram bot implementation
- 🔄 **claude-stream-processor.js** - Claude CLI integration and streaming
- 📝 **telegram-formatter.js** - Message formatting and chunking
- 🧼 **telegram-sanitizer.js** - Message sanitization

## 📂 Project Structure

```
claude-code-telegram-control/
├── configs/                   # Bot configurations
│   ├── bot1.json             # Bot instance configs
│   ├── bot2.json
│   └── *.json.example        # Example configurations
├── scripts/                   # Management scripts
│   ├── start-bot.js          # Bot launcher
│   └── setup-bot.js          # Interactive setup
├── bot.js                     # Main bot implementation
├── claude-stream-processor.js # Claude CLI integration
├── telegram-formatter.js     # Message formatting
├── telegram-sanitizer.js     # Message sanitization
└── package.json              # Dependencies and scripts
```

## 🔧 Troubleshooting

### ⚠️ Common Issues

**🤖 Bot doesn't respond:**
- Check Telegram token is valid
- Verify bot is started with correct config
- Check admin user ID in config

**🔧 Claude Code integration fails:**
- Ensure `claude` command works in terminal
- Check working directory exists and has proper permissions
- Verify Claude Code is logged in and configured

**🎙️ Voice messages don't work:**
- Check Nexara API key in config
- Verify internet connectivity
- Check Nexara account balance

### 🔍 Debug Commands
```bash
# Check configured bots
npm run list-bots

# Test Claude Code connection
claude --version

# View bot logs
npm run bot1 # Check console output
```

## 👨‍💻 Development

### 🚀 Running in Development Mode
```bash
npm run dev  # Uses nodemon for auto-restart
```

### 🧪 Testing
```bash
npm test    # Run test suite
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test with your Claude Code setup
5. Submit a pull request

## 📜 License

MIT License - see LICENSE file for details.
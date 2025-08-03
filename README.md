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

### Development Setup
```bash
git clone <repository-url>
cd claude-code-telegram-control
npm install
```

### PM2 Production Setup

For production deployment with PM2 process manager:

#### Prerequisites
```bash
# Update system
sudo apt update

# Install Node.js and npm (if not already installed)
sudo apt install -y nodejs npm

# Verify installations
node --version    # Should be 14+
npm --version

# Install PM2 globally
npm install -g pm2
```

#### Setup Process
```bash
# 1. Clone and prepare the project
git clone <repository-url>
cd claude-code-telegram-control
npm install

# 2. Configure your bots (create configs/bot1.json, etc.)
npm run setup   # Interactive setup for each bot

# 3. Install PM2 log rotation
pm2 install pm2-logrotate

# 4. Start bots with PM2
pm2 start ecosystem.config.js

# 5. Setup auto-startup on system boot
pm2 startup
# Run the command PM2 shows you (requires sudo)

# 6. Save current process list
pm2 save
```

PM2 provides:
- ✅ **Auto-restart** on crash (configurable limits)
- ✅ **Auto-start** on system boot
- ✅ **No sudo required** for daily management
- ✅ **Memory leak protection** (auto-restart on limit)
- ✅ **Built-in log rotation**
- ✅ **Real-time monitoring** with `pm2 monit`

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

#### Development Mode (Manual)
```bash
# Start default bot
npm run bot1

# Start multiple bots
npm run bot2
npm run bot3

# Development mode with auto-restart
npm run dev
```

#### Production Mode (PM2 Process Manager)
For production deployment with PM2 process manager:

```bash
# Start all bots
pm2 start ecosystem.config.js

# Management commands (NO SUDO REQUIRED!)
pm2 restart bot1        # Restart specific bot
pm2 restart all         # Restart all bots
pm2 stop bot1          # Stop specific bot
pm2 start bot1         # Start specific bot
pm2 delete bot1        # Remove bot from PM2

# Monitoring and logs
pm2 status             # Show all processes
pm2 logs               # Show all logs
pm2 logs bot1          # Show logs for specific bot
pm2 monit              # Interactive monitoring dashboard

# Updates and maintenance
git pull               # Update code
pm2 restart all        # Restart with new code
```

PM2 process manager provides:
- ✅ **Automatic startup** on system boot
- 🔄 **Auto-restart** on crash (configurable limits)
- 📋 **Centralized logging** with rotation
- 🛡️ **Memory leak protection** (512MB restart threshold)
- 📊 **Real-time monitoring** with `pm2 monit`
- 🚀 **Zero-downtime deployments**
- ⚡ **No sudo required** for daily operations

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

### 🔄 Git Workflow Management
- 📊 **Comprehensive git interface** - complete git workflow through Telegram
- 🌿 **Branch management** - create, switch, list branches with validation
- 📦 **Staging operations** - stage/unstage files individually or in bulk
- 📝 **Smart file view** - examine diffs with context-aware staging buttons
- 📱 **Mobile-optimized UI** - pagination and touch-friendly controls
- ⚡ **Real-time status** - live git status with ahead/behind tracking
- 🔄 **Interactive workflows** - guided git operations with error handling

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

#### Development Mode
```bash
# Check configured bots
npm run list-bots

# Test Claude Code connection
claude --version

# View bot logs
npm run bot1 # Check console output
```

#### Production Mode (PM2)
```bash
# Check process status
pm2 status

# View live logs
pm2 logs bot1 -f

# View recent logs
pm2 logs bot1 --lines 100

# View all processes logs
pm2 logs

# Interactive monitoring
pm2 monit

# Process information
pm2 info bot1
```

### 🔄 Using Git Workflow Features

The bot includes a comprehensive Git management interface accessible through Telegram:

#### 📊 Git Overview
- Send `/start` or click the git button to access the main git interface
- View current branch, ahead/behind status, file counts
- Navigate to branches, staging, files, and remote operations

#### 🌿 Branch Management
- **View branches**: See current branch with ahead/behind tracking
- **Switch branches**: Safe switching with uncommitted changes handling
- **Create branches**: Text input with full git validation
  - Type branch name when prompted
  - Automatic validation against git naming rules
  - Conflict detection for existing branches

#### 📦 Staging Operations
- **Staging overview**: Separate sections for staged/modified/untracked files
- **Individual file staging**: Stage/unstage specific files from file view
- **Bulk operations**: Stage All / Unstage All with smart state handling
- **File selection**: Paginated interfaces for selecting multiple files

#### 📝 File Operations
- **File browsing**: Navigate through changed files with pagination
- **Diff viewing**: Examine file changes with configurable context
- **Smart buttons**: Context-aware staging/unstaging buttons per file
- **Mobile-optimized**: Touch-friendly interface with clear navigation

#### 🎯 Workflow Tips
- Use the **📦 Staging** button from any interface for quick access
- **File view** shows real-time staging status for each file
- **Error handling** provides helpful guidance for git issues
- All operations include **confirmation and next steps** guidance

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
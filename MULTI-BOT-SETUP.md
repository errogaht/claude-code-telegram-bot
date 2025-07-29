# Multi-Bot Instance Setup

This project supports running multiple Telegram bot instances simultaneously, each with its own JSON configuration file, admin user, and working directory.

## 🚀 Quick Start

### 1. Setup Multiple Bots

Create configurations for your bots:

```bash
# Interactive setup for each bot
npm run setup
```

The setup wizard will ask you for:
- **Bot name** (bot1, bot2, bot3, or custom)
- **Telegram Bot Token** (from @BotFather)
- **Admin User ID** (optional - auto-detected from first message)
- **Nexara API Key** (optional - for voice messages)
- **Working Directory** (where Claude Code will run)
- **Default Model** (sonnet or opus)

### 2. Start Bot Instances

Each bot runs independently in its own process:

```bash
# Terminal 1: Start main bot
npm run bot1

# Terminal 2: Start test bot  
npm run bot2

# Terminal 3: Start dev bot
npm run bot3
```

## 📁 Project Structure

```
├── configs/
│   ├── bot1.json              # Main bot configuration
│   ├── bot2.json              # Test bot configuration
│   ├── bot3.json              # Dev bot configuration
│   ├── bot1.json.example      # Example configuration
│   ├── bot2.json.example      # Example configuration
│   └── bot3.json.example      # Example configuration
├── scripts/
│   ├── start-bot.js      # Bot launcher script
│   └── setup-bot.js      # Interactive setup wizard
├── bot.js                # Main bot code
└── package.json          # Updated with multi-bot scripts
```

## 🔧 Configuration

Each bot has its own `.json` file in the `configs/` directory:

**configs/bot1.json:**
```json
{
  "botName": "MainBot",
  "botToken": "1234567890:ABCDEF...",
  "nexaraApiKey": "your_nexara_api_key",
  "workingDirectory": "/home/user/projects",
  "adminUserId": "123456789",
  "defaultModel": "sonnet",
  "logLevel": "info",
  "generatedAt": "2024-01-01T12:00:00.000Z"
}
```

### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| `botName` | ✅ | Display name for the bot |
| `botToken` | ✅ | Bot token from @BotFather |
| `adminUserId` | ❌ | Pre-configured admin (auto-detect if empty) |
| `nexaraApiKey` | ❌ | For voice message transcription |
| `workingDirectory` | ❌ | Claude Code working directory (default: current) |
| `defaultModel` | ❌ | "sonnet" or "opus" (default: "sonnet") |
| `logLevel` | ❌ | "info", "debug", or "error" (default: "info") |
| `generatedAt` | ❌ | Timestamp when config was created |

## 📋 Available Commands

### Setup Commands
```bash
npm run setup          # Create new bot configuration
npm run list-bots      # Show all configured bots
```

### Bot Management
```bash
npm start              # Start bot1 (default)
npm run bot1           # Start bot 1
npm run bot2           # Start bot 2  
npm run bot3           # Start bot 3
npm run dev            # Start bot1 in development mode
```

### Direct Script Usage
```bash
# Start specific bot
node scripts/start-bot.js bot1
node scripts/start-bot.js custom-bot

# Setup new bot
node scripts/setup-bot.js
```

## 🔐 Admin User Management

### Pre-configured Admin
Set `adminUserId` in the JSON configuration file:
```json
{
  "adminUserId": "123456789"
}
```

### Auto-detection (Recommended)
Omit `adminUserId` field, and the first user to message the bot becomes admin:
```json
{
  "botName": "MyBot",
  "botToken": "..."
  // adminUserId omitted for auto-detection
}
```

### Getting Your User ID
1. Message @userinfobot on Telegram
2. Or leave ADMIN_USER_ID empty and check bot logs after messaging

## 🎛️ Use Cases

### Development Workflow
```bash
# Terminal 1: Production bot
npm run bot1    # configs/bot1.json - Production token, main project

# Terminal 2: Testing bot  
npm run bot2    # configs/bot2.json - Test token, test project

# Terminal 3: Personal bot
npm run bot3    # configs/bot3.json - Personal token, experiments
```

### Team Setup
```bash
# Developer 1
npm run setup   # Create dev1.json with their admin ID
npm run dev1    # node scripts/start-bot.js dev1

# Developer 2  
npm run setup   # Create dev2.json with their admin ID
npm run dev2    # node scripts/start-bot.js dev2
```

## 🔧 Troubleshooting

### Bot Not Starting
```bash
# Check if configuration exists
npm run list-bots

# If no configurations found
npm run setup

# Check environment file
cat configs/bot1.env
```

### Wrong Admin User
```bash
# Stop bot and edit config
nano configs/bot1.json
# Update "adminUserId": "correct_user_id"

# Restart bot
npm run bot1
```

### Token Issues
```bash
# Test token with curl
curl -s "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"

# Re-run setup to update token
npm run setup
```

### Multiple Bots Same Token
❌ **Don't do this** - Each bot needs its own unique token from @BotFather

✅ **Create multiple bots:**
1. Message @BotFather
2. `/newbot` for each bot instance
3. Use different tokens in each .env file

## 📊 Monitoring Multiple Bots

Each bot logs with its name:
```
🚀 Starting MainBot...
📁 Working directory: /home/user/projects
🤖 Default model: sonnet
👤 Pre-configured admin: 123456789
🚀 MainBot is running!
```

### Log Differentiation
- Bot 1: `[MainBot] message logs`
- Bot 2: `[TestBot] message logs`  
- Bot 3: `[DevBot] message logs`

## 💡 Best Practices

### 1. Naming Convention
- `bot1` - Production/Main bot
- `bot2` - Testing/Staging bot
- `bot3` - Development/Experimental bot
- `custom` - Project-specific bots

### 2. Working Directories
Keep different working directories per bot:
```json
// bot1.json
{
  "workingDirectory": "/home/user/production-projects"
}

// bot2.json
{
  "workingDirectory": "/home/user/test-projects"
}

// bot3.json
{
  "workingDirectory": "/home/user/dev-experiments"
}
```

### 3. Model Selection
Choose models based on use case:
```json
// Production - reliable and fast
{
  "defaultModel": "sonnet"
}

// Experimentation - more capable
{
  "defaultModel": "opus"
}
```

### 4. Security
- Never commit .json config files to git (they're in .gitignore)
- Each bot should have different admin users
- Use separate tokens for different environments

## 🔄 Migration from Old Setup

If you have an existing `config.json`:

### 1. Create First Bot Config
```bash
npm run setup
# Enter your existing token and admin ID
```

### 2. Remove Old Config (Optional)
```bash
# Backup first
cp config.json config.json.backup

# Remove old config (optional - bot will work with both)
rm config.json
```

### 3. Test New Setup
```bash
npm run bot1
```

## 📚 Additional Resources

- **Bot Setup**: Run `npm run setup` for interactive configuration
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Nexara Voice API**: https://nexara.ru
- **Claude Code Documentation**: See `CLAUDE.md`

---

🎉 **You're all set!** Now you can run multiple Claude Code Telegram bots simultaneously, each with its own configuration and admin user.
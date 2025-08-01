# Claude Code Configuration - SPARC Development Environment (Batchtools Optimized)

## 🌐 PROJECT LANGUAGE POLICY

**ENGLISH ONLY PROJECT**: This project is fully English-based. ALL code comments, user interface elements, messages, documentation, and any text-based content MUST be in English only. This ensures:
- Universal accessibility and understanding
- Professional code standards
- Consistent international collaboration
- Clear documentation for global developers

**NO EXCEPTIONS**: Never use Russian, Chinese, or any other languages in:
- Code comments and documentation
- User interface text and messages
- Bot responses and notifications
- Error messages and system feedback
- Variable names and function descriptions

## 📋 PM2 Process Management

### Log Monitoring

**PM2 Logs:**
```bash
# View real-time logs
pm2 logs bot1 -f
pm2 logs bot2 -f

# View recent logs
pm2 logs bot1 --lines 50
pm2 logs bot2 --lines 50

# View all processes logs
pm2 logs

# Interactive monitoring dashboard
pm2 monit
```

### Applying Code Changes to Running Bots

**✅ SAFE: PM2 allows restarting any bot without risk**

**Complete Update Workflow:**
```bash
# 1. Restart bots (safe - can restart any bot)
pm2 restart bot1
pm2 restart bot2
# OR
pm2 restart all

# 2. Verify bots are running
pm2 status
```

**🤖 Bot Self-Restart (Admin Only):**
- Admin users can restart bot1 directly via Telegram: `/restart`
- Bot will send confirmation and restart itself using PM2
- **IMPORTANT:** Always test code changes by restarting after making changes

### PM2 Management Commands
```bash
# Process status
pm2 status                # Show all processes
pm2 info bot1            # Detailed info for specific bot

# Start/stop/restart (NO SUDO REQUIRED!)
pm2 start bot1           # Start specific bot
pm2 stop bot1            # Stop specific bot  
pm2 restart bot1         # Restart specific bot
pm2 restart all          # Restart all bots

# Process management
pm2 delete bot1          # Remove bot from PM2
pm2 start ecosystem.config.js  # Start all bots from config

# Monitoring and logs
pm2 logs                 # All logs
pm2 logs bot1           # Specific bot logs
pm2 monit               # Interactive monitoring
```

## 🛠️ Development Environment

### Testing Infrastructure
**Complete Jest test suite exists - use existing infrastructure:**

```bash
# Test commands
npm test                                           # Full test suite
npm test -- tests/unit/component-name.test.js     # Specific test file
npm test -- --testNamePattern="test name"         # Pattern matching
npm test -- --coverage                            # With coverage
```

**Test structure:** `tests/unit/`, `tests/integration/`, `tests/real-bot/`, `tests/helpers/`, `tests/fixtures/`

### Development Workflow

**Task Completion Rules:**
After significant implementation, check if CLAUDE.md needs updates:

**ALWAYS ADD:**
- New major system components (GitManager replaces GitDiffManager and fixes Telegram Markdown parsing)
- Critical infrastructure that exists (testing, build systems, deployment)
- Essential commands and procedures future sessions need
- Important project constraints and policies
- Key directory structures and file organization
- Critical bug fixes and their impact on the codebase

**INTEGRATION APPROACH:**
- Find logical section to integrate new info (don't just append)
- Keep descriptions concise but actionable
- Include essential commands with brief explanations
- Warn about existing infrastructure to prevent recreation
- Update section headings if needed for better organization

**NEVER ADD:**
- Implementation details or code snippets
- Temporary session-specific information
- Step-by-step tutorials or detailed explanations

**Code Changes Workflow:**
1. Make code changes (always prefer editing existing files over creating new ones)
2. **MUST RESTART:** Use PM2 restart workflow above or `/restart` command via Telegram
3. **MUST TEST:** Verify changes work correctly after restart
4. Check logs if issues occur: `pm2 logs bot1`

**⚠️ CRITICAL:** Bot changes only take effect after restart - always restart and test!

**🤖 IMPORTANT FOR CLAUDE:** When you make changes to bot code, you MUST restart the bot yourself using bash commands so the user can test the new functionality:
```bash
pm2 restart bot1
```
**Never forget this step!** The user cannot test new features until the bot is restarted.

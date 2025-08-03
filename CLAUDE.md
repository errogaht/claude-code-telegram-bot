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

## 🎯 DEVELOPER TOOL APPLICATION

**TARGET AUDIENCE**: This application is designed specifically for developers. This means:
- Users understand technical concepts and terminology
- Direct, technical error messages are acceptable and preferred
- No need for extensive hand-holding or simplified explanations
- Users can handle raw API errors and troubleshoot issues independently
- Focus on functionality over user-friendly explanations

**DESIGN IMPLICATIONS**:
- Error messages can be direct and technical
- No need for fallback mechanisms - show errors directly
- Users can handle configuration files and technical settings
- Documentation assumes technical knowledge
- Interface can prioritize efficiency over simplicity

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

### Available Bots

**Three bots are configured and running:**
- **bot1**: Primary development bot
- **bot2**: Secondary bot for testing
- **bot3**: Additional bot instance

**Bot Status Check:**
```bash
pm2 status    # Check all running bots
```

**🤖 Bot Self-Restart (Admin Only):**
- Admin users can restart bot1 directly via Telegram: `/restart`
- Bot will send confirmation and restart itself using PM2

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

### 🧪 TDD Development Requirements

**MANDATORY TDD APPROACH:**
- **ALL features MUST be developed using Test-Driven Development (TDD)**
- Write tests FIRST, then implement functionality
- If any changes are made to existing code, tests MUST be updated accordingly
- No exceptions - every code change requires corresponding test changes

**Testing Guidelines:**
- **Avoid over-engineering tests** - keep them simple and focused
- **Test multiple cases in one test** instead of separate individual tests
- This approach reduces test execution time and improves efficiency
- Focus on practical scenarios and edge cases within consolidated test blocks
- Prioritize test coverage over test quantity

### Development Workflow

**📋 Planning and Documentation Requirements:**

**For Complex Features/Refactoring:**
1. **Create MD documentation/implementation plan FIRST**
2. **Get human approval** before starting implementation
3. **Implement step-by-step** following the documented plan
4. **Mark completed stages** in the documentation
5. **Update "What was done" section** with important notes for multi-session work
6. **Update project documentation** (README, etc.) when feature is complete

**Documentation Updates:**
- **Always update README** when new features are added - document how to use them
- **Keep documentation files current** with project changes
- **Multi-session continuity** - maintain detailed progress notes in implementation docs

**Task Completion Rules:**
After significant implementation, check if CLAUDE.md needs updates:

**ALWAYS ADD:**
- New major system components
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
2. Test changes work correctly 
3. Check logs if issues occur: `pm2 logs bot1`
4. **After completing tasks, ALWAYS run:**
   - `npm run lint` - fix all linting issues
   - `npm run test:failures` - fix all failing tests

**⚠️ IMPORTANT:** do not do bot restart, only ask human to do that manually

## 📝 Git Version Control

### File Handling Rules

**Git Ignore Policy:**
- If a file is in `.gitignore` and git refuses to add it, **DO NOT force add it**
- This is by design for sensitive files (tokens, configs, etc.)
- Use `git add` normally - if it fails with ignore warning, respect the ignore

**NEVER use `git add -f` for ignored files** - they are ignored for security reasons.

**Example - Correct behavior:**
```bash
git add configs/bot3.json  # This will fail - that's correct!
# ❌ DO NOT: git add -f configs/bot3.json
# ✅ DO: Leave the file ignored as intended
```


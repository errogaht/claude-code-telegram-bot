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

### 🔄 GitManager System (Comprehensive Git Workflow)

**Main Implementation**: `GitManager.js` - Full git workflow management through Telegram interface
**Development Tracking**: See `GitManager_Implementation_Plan.md` for current status and detailed progress
**Testing**: `tests/unit/git-manager.test.js` - Comprehensive test coverage with TDD approach

**Key Architecture:**
- **Callback system**: `git:action:subaction` pattern for all git operations
- **Text input integration**: Handles commit messages and branch creation via Telegram
- **Mobile-optimized UI**: Touch-friendly interfaces with smart pagination
- **Comprehensive error handling**: User-friendly guidance and fallback options

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

## 📋 GITMANAGER DEVELOPMENT CONTEXT

### 🚀 Current Development Status
**PHASES 1-3 COMPLETED** - Ready for Phase 4 or 5 implementation

**Completed Phases:**
- **Phase 1**: ✅ Foundation (GitDiffManager → GitManager, git overview, Telegram parsing fixes) 
- **Phase 2**: ✅ Branch Management (full branch workflow with text input validation)
- **Phase 3**: ✅ Staging Operations (comprehensive staging with smart UI integration)

**Next Phase Options:**
- **Phase 4**: Commit Operations (commit creation, history, amending, validation)
- **Phase 5**: Remote Operations (push, pull, fetch, upstream tracking - originally requested by user)

### 🗂️ Key Files
- **`GitManager.js`** - Main implementation (2500+ lines, 40+ methods)
- **`GitManager_Implementation_Plan.md`** - Detailed phase tracking and progress  
- **`tests/unit/git-manager.test.js`** - Comprehensive test coverage
- **`bot.js`** - Integration point (lines 145-148: text input handling for branch creation)

### 🔧 Architecture Notes
**Callback System**: `git:action:subaction` pattern
- `git:overview` - main interface
- `git:branch:list|create|switch` - branch operations  
- `git:staging:overview` - staging interface
- `git:stage:all|select|file:index` - staging operations
- `git:unstage:all|select|file:index` - unstaging operations
- `git:file:index[:stage|unstage]` - file-level operations

**State Management**: Enhanced `gitState` object
- `branchCreationInProgress` / `branchCreationChatId` - text input capture
- `stagedFiles` / `unstagedFiles` / `untrackedFiles` - cached git status

**Integration Points**:
- **Text input**: `handleTextInput()` method integrated with bot message handler
- **Error handling**: Comprehensive user-friendly error messages with guidance
- **Mobile UI**: Pagination, smart buttons, touch-friendly interfaces

### 🎯 Development Approach
**SPARC Methodology**: Used throughout development
**TDD Required**: All new features must have tests first
**Mobile-First**: UI designed for Telegram mobile usage
**Error Handling**: User-friendly fallbacks with clear guidance

### 🔄 Continuation Strategy
1. **Check current plan**: Review `GitManager_Implementation_Plan.md` for phase details
2. **Update plan first**: Mark completed items, plan next phase steps  
3. **TDD approach**: Write tests before implementation
4. **Integration testing**: Verify callback routing and state management
5. **Update documentation**: Keep CLAUDE.md and README.md current

### ⚠️ Critical Notes
- **NO bot restart** needed during development - changes are hot-loaded
- **Linting required**: Run `npm run lint` after code changes
- **Test coverage**: All GitManager methods have test coverage requirements
- **User language**: Project is English-only, no other languages allowed

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.


**# GitManager Implementation Plan

## 🎯 **Project Overview**

Transform the current `GitDiffManager` into a comprehensive `GitManager` that provides full git workflow management through Telegram bot interface.

## ✅ **Task Tracking System**

**IMPORTANT**: When implementing this plan, mark tasks as completed directly in this document to track progress.

**Marking Convention**:
- ✅ **COMPLETED** - Task fully implemented and tested
- 🔄 **IN PROGRESS** - Task currently being worked on  
- ❌ **BLOCKED** - Task blocked by dependency or issue
- ⏳ **PENDING** - Task not yet started

**Example Usage**:
```
### **Phase 1: Foundation (Week 1)** ✅ COMPLETED
1. ✅ Rename GitDiffManager → GitManager
2. 🔄 Update all references and callbacks  
3. ⏳ Implement basic branch detection and display
4. ❌ Enhance git overview with branch info (blocked by callback updates)
```

**Progress Tracking**: Update status immediately after completing each task or encountering blockers. This ensures clear visibility of implementation progress and identifies bottlenecks early.

## 📋 **Current State Analysis**

### **Existing GitDiffManager Capabilities:**
- ✅ Git repository detection
- ✅ Git status and diff viewing
- ✅ File change overview and pagination
- ✅ Individual file diff viewing with context control
- ✅ Untracked file content display
- ✅ Mobile-friendly pagination and navigation

### **Current Methods to Preserve:**
- `checkGitRepository()` - Repository validation
- `getGitStatus()` - Enhanced for broader git operations
- `showDiffOverview()` - Renamed to `showGitOverview()`
- `showDiffFileList()` - Renamed to `showFileList()`
- `showDiffFile()` - Enhanced with staging options
- `handleDiffCallback()` - Renamed to `handleGitCallback()`

## 🏗️ **New GitManager Architecture**

### **Class Structure Principles:**
- **State Management**: Track current branch, staged files, branch list, and multi-step commit state
- **Integration**: Maintain compatibility with existing bot, options, and keyboard handlers
- **Message Handling**: Leverage existing MessageSplitter for Telegram message length limits
- **Session Persistence**: Store operation state for multi-step workflows like commits with message input

## 🎮 **User Interface Design**

### **Main Git Menu (Keyboard Button: "📁 Git")**
```
🌿 Git Repository Manager

📁 Directory: project-name
🌿 Branch: main ↗️ (ahead 2, behind 1)
📋 Files changed: 5 | ✅ Staged: 2 | ❓ Untracked: 1

💡 Choose action:

[📊 Overview] [📂 Files] 
[🌿 Branches] [📝 Commit]
[⬆️ Push] [⬇️ Fetch] [🔄 Pull]
[🔄 Refresh]
```

### **Branch Management Interface**
```
🌿 Branch Management

Current: main* ↗️ (ahead 2, behind 1)

📋 Available Branches:
🌿 main* (current)
🌿 develop ↗️ (ahead 5)
🌿 feature/auth ↘️ (behind 3)
🌿 hotfix/bug-123

💡 Actions:
[➡️ Switch Branch] [🆕 Create Branch]
[🔙 Back to Git]
```

### **Staging Interface**
```
📦 Staging Area

✅ Staged (2 files):
✅ GitManager.js
✅ README.md

❓ Unstaged (3 files):
📝 bot.js (modified)
📝 package.json (modified)
🆕 config.json (untracked)

💡 Actions:
[➕ Stage All] [➖ Unstage All]
[➕ Stage Some] [➖ Unstage Some]
[📝 Commit] [🔙 Back]
```

**Individual File Selection Workflow:**
- **Stage Some**: Opens paginated interface with numbered buttons (1,2,3,4,5) to select specific unstaged files
- **Unstage Some**: Opens paginated interface with numbered buttons (1,2,3,4,5) to select specific staged files
- Uses existing pagination patterns from file list navigation
- Each file selection shows confirmation with updated counts

### **Commit Interface**
```
📝 Commit Changes

✅ Staged Files (2):
✅ GitManager.js (+45 -12)
✅ README.md (+3 -1)

💬 Commit Message:
[Type your commit message...]

💡 Options:
[📝 Commit] [👤 Amend Last]
[🔙 Back to Staging]
```

## 🔧 **New Methods Implementation Principles**

### **1. Branch Management Approach**
- **Branch Discovery**: Use `git branch -v --all` to detect local and remote branches with status
- **Safe Switching**: Validate branch existence and handle uncommitted changes before checkout
- **Branch Creation**: Implement name validation and automatic switching to new branches
- **Status Tracking**: Show ahead/behind commit counts and remote tracking information
- **Comparison Tools**: Enable branch-to-branch diff viewing for merge decision support

### **2. Staging Operations Approach**
- **State Detection**: Parse `git status --porcelain` to categorize files by staging state
- **Individual Control**: Support single-file staging/unstaging through paginated selection
- **Bulk Operations**: Maintain existing stage-all/unstage-all functionality
- **Real-time Updates**: Update UI immediately after each staging operation
- **File Validation**: Ensure staged files exist on disk before showing in interface

### **3. Commit Operations Approach**
- **Message Validation**: Enforce length limits and prevent empty commits
- **Interactive Flow**: Handle commit message input through Telegram's text input system
- **History Access**: Display recent commits with formatting optimized for mobile
- **Amend Support**: Allow last commit modification with proper safety warnings
- **Status Feedback**: Show commit success with hash and affected file summary

### **4. Remote Operations Approach**
- **Push Safety**: Implement force-push confirmations and upstream tracking setup
- **Fetch Intelligence**: Show available updates without applying changes
- **Pull Handling**: Detect and guide through merge conflicts
- **Connection Validation**: Handle network errors and authentication issues gracefully
- **Progress Feedback**: Provide real-time status during remote operations

### **5. Enhanced File Operations Approach**
- **Action Integration**: Add staging controls to existing file diff views
- **Destructive Safeguards**: Confirm file discard operations with clear warnings
- **Blame Integration**: Format git blame output for mobile viewing
- **State Consistency**: Ensure file actions immediately reflect in git status
- **Error Recovery**: Handle file operation failures with user-friendly messages

## 🎨 **Callback Data Structure**

### **New Callback Patterns:**
```javascript
// Branch operations
git:branch:list
git:branch:switch:<branch-name>
git:branch:create
git:branch:compare:<branch1>:<branch2>

// Staging operations  
git:stage:file:<file-index>
git:unstage:file:<file-index>
git:stage:all
git:unstage:all
git:staging:overview

// Commit operations
git:commit:prepare
git:commit:execute:<message-encoded>
git:commit:amend
git:commit:history

// Remote operations
git:push
git:push:force
git:fetch  
git:pull

// File operations (enhanced)
git:file:<index>:stage
git:file:<index>:unstage
git:file:<index>:discard
git:file:<index>:blame

// Navigation
git:overview
git:files:<page>
git:back
```

## 📱 **Mobile-Optimized Workflows**

### **1. Quick Commit Workflow**
```
Git → Overview → [Files] → [Select File] → [Stage] → [Commit] → [Type Message] → [Push]
```

### **2. Branch Switch Workflow**
```
Git → [Branches] → [Switch Branch] → [Select Branch] → [Confirm]
```

### **3. Pull Request Prep Workflow**
```
Git → [Stage All] → [Commit] → [Push] → [Create PR] (future feature)
```

## 🔒 **Safety & Validation**

### **Input Validation:**
- Branch names: alphanumeric, hyphens, underscores only
- Commit messages: 1-72 characters, no special markdown
- File paths: prevent directory traversal

### **Confirmation Dialogs:**
- Force push operations
- Destructive actions (discard changes)
- Branch deletion
- Merge conflict resolution

### **Error Handling:**
- Git command failures with user-friendly messages
- Network issues during remote operations
- Merge conflicts with resolution guidance
- Permission issues

## 🚀 **Implementation Phases**

### **Phase 1: Foundation (Week 1)** ✅ COMPLETED
1. ✅ Rename GitDiffManager → GitManager
2. ✅ Update all references and callbacks
3. ✅ Implement basic branch detection and display
4. ✅ Enhance git overview with branch info

### **Phase 2: Branch Management (Week 1-2)** 🔄 IN PROGRESS
1. ✅ Implement branch listing and switching
2. 🔄 Add branch creation functionality  
3. ⏳ Add remote tracking information
4. ⏳ Implement branch comparison

### **Phase 3: Staging Operations (Week 2)**
1. Implement staging status detection
2. Add individual file staging/unstaging
3. Add stage all/unstage all operations
4. Enhance file view with staging actions

### **Phase 4: Commit Operations (Week 2-3)**
1. Implement commit creation with message input
2. Add commit history viewing
3. Implement commit amending
4. Add commit validation

### **Phase 5: Remote Operations (Week 3)**
1. Implement push functionality
2. Add fetch and pull operations
3. Handle upstream tracking
4. Add force push with safety

### **Phase 6: Enhanced Features (Week 3-4)**
1. Add file discard functionality
2. Implement git blame viewing
3. Add merge conflict detection
4. Implement advanced git operations

### **Phase 7: Testing & Polish (Week 4)**
1. Comprehensive testing of all workflows
2. Performance optimization
3. Error handling improvements
4. UI/UX refinements

## 🧪 **Comprehensive Testing Strategy**

### **Current Testing Issues Analysis**

**Existing GitDiffManager Test Problems:**
- ❌ **Mock-only testing**: Uses mocked git commands, doesn't verify real operations
- ❌ **File name truncation bug**: Tests show first character truncation issues (lines 133, 387, 196, 537)
- ❌ **No real file system validation**: Cannot catch issues where interface shows non-existent files
- ❌ **No git state verification**: Cannot verify actual git repository state changes

### **New Testing Architecture**

#### **1. Real Git Integration Testing Principles** (`tests/integration/git-manager-real.test.js`)

**Purpose**: Test all GitManager operations with actual git repositories and file systems.

**Testing Infrastructure Approach**:
- **Temporary Repository Management**: Create isolated git repositories for each test with automatic cleanup
- **Real Git Operations**: Execute actual git commands and validate both command output and file system state
- **File System Validation**: Ensure all displayed files actually exist on disk to prevent UI/reality mismatches
- **State Verification**: Cross-validate UI state against actual git repository state after each operation

**Branch Operations Testing**:
- **Creation & Switching**: Verify branches are created in real repository and UI reflects current branch
- **Listing & Status**: Test branch discovery with proper ahead/behind tracking information
- **Edge Cases**: Handle invalid branch names, non-existent branches, and checkout conflicts

**Staging Operations Testing**:
- **Individual File Control**: Test single-file staging/unstaging with real git add/reset commands
- **Bulk Operations**: Verify stage-all and unstage-all affect correct file sets
- **Special Characters**: Handle files with spaces, Unicode characters, and shell-sensitive names
- **State Consistency**: Ensure staging UI matches actual git index state

**Commit Operations Testing**:
- **Message Validation**: Test length limits, empty messages, and special character handling
- **History Verification**: Confirm commits appear in git log with correct messages and file changes
- **Working Directory**: Verify clean state after successful commits

**File System Validation Testing**:
- **Existence Checks**: All UI-displayed files must exist on disk and be readable
- **Deletion Handling**: Test scenarios where files are deleted outside git (manual deletion)
- **Permission Issues**: Handle files that become unreadable or directories that become inaccessible

#### **2. Enhanced Unit Tests** (`tests/unit/git-manager.test.js`)

**Migrated from GitDiffManager with fixes:**
- ✅ **Fixed filename truncation tests**: Remove workarounds for first character bugs
- ✅ **Real command validation**: Verify actual git commands are constructed correctly
- ✅ **Enhanced mocking**: More realistic git command outputs
- ✅ **Edge case coverage**: Handle all git status codes and file states

#### **3. Telegram Bot Integration Testing Principles** (`tests/real-bot/git-manager-workflows.test.js`)

**Complete workflow testing through Telegram interface:**

**End-to-End Workflow Testing**:
- **Complete Git Workflows**: Test full stage→commit→push sequences through actual Telegram bot interface
- **Navigation Patterns**: Verify button presses navigate correctly between git overview, staging, branches, and commit interfaces
- **State Persistence**: Ensure git state remains consistent across UI navigation and operations
- **Real Repository Integration**: Cross-validate Telegram UI state with actual git repository state at each step

**User Interaction Simulation**:
- **Button Press Testing**: Simulate actual Telegram callback button presses with proper callback data
- **Text Input Handling**: Test commit message input and branch name input through Telegram's text input system
- **Multi-Step Operations**: Validate operations that require multiple user interactions (commit workflow, branch creation)

**Workflow Validation Approach**:
- **Stage Management**: Test individual file staging, bulk operations, and UI state updates
- **Branch Operations**: Verify branch switching, creation, and status display accuracy
- **Commit Process**: Test complete commit workflow from staging through message input to final commit
- **Error Scenarios**: Handle invalid operations and network issues gracefully through Telegram interface

#### **4. Performance & Load Testing Principles** (`tests/performance/git-manager-performance.test.js`)

**Performance Validation Approach**:
- **Large Repository Handling**: Test git operations with repositories containing hundreds of files and commits
- **Response Time Monitoring**: Ensure all operations complete within acceptable time limits (≤5 seconds for status, ≤2 seconds for simple operations)
- **Memory Usage Tracking**: Monitor memory consumption during large repository operations
- **Concurrent Operation Handling**: Test rapid user interactions and prevent race conditions

**Load Testing Strategy**:
- **Rapid Interaction Simulation**: Test quick successive button presses and command executions
- **Large File Handling**: Validate performance with large files and extensive diffs
- **Branch-Heavy Repositories**: Test performance with repositories containing many branches
- **Network Operation Timeouts**: Ensure remote operations (push/pull/fetch) handle network delays appropriately

### **Testing Implementation Strategy**

#### **Phase 1: Foundation Testing (Week 1)**
1. **Setup testing infrastructure** with temporary git repositories
2. **Migrate existing tests** from GitDiffManager to GitManager
3. **Fix filename truncation test cases** that were working around bugs
4. **Add real git repository validation** to all tests

#### **Phase 2: Feature Testing (Week 2-3)**
1. **Branch management tests** with real git operations
2. **Staging operation tests** with file system validation
3. **Commit workflow tests** with git history verification
4. **Telegram integration tests** for complete workflows

#### **Phase 3: Comprehensive Testing (Week 3-4)**
1. **Performance testing** with large repositories
2. **Error scenario testing** with corrupted repos and invalid operations
3. **Edge case testing** with special file names and Unicode
4. **Integration testing** with real Telegram Bot API

### **Test Data Management**

#### **Temporary Repository Lifecycle**
**Testing Isolation Strategy**: Each test receives a fresh temporary git repository with automatic cleanup to prevent test interference and ensure consistent starting conditions.

#### **Test File Scenarios**
- **Modified files**: Different content types, line changes, binary files
- **Staged files**: Partially staged, fully staged, mixed staging states
- **Untracked files**: New files, ignored files, nested directories
- **Deleted files**: Removed from working directory, staged deletions
- **Renamed files**: Git detects renames, moves between directories
- **Special files**: Unicode names, spaces, symlinks, executable bits

#### **Git State Validation Approach**
**Cross-Validation Strategy**: Verify git repository state matches UI display by comparing actual git command output with displayed UI state to ensure accuracy and prevent phantom file issues.

### **Continuous Integration Integration**

#### **GitHub Actions Integration Approach**
**Continuous Integration Strategy**: Implement automated testing pipeline that runs all test categories on push and pull requests, ensuring comprehensive validation before code integration.

#### **Test Categories Structure**
**Organized Test Execution**: Create separate npm scripts for different test types (unit, integration, real-bot, performance) to enable targeted testing during development and comprehensive testing during CI.

### **Quality Metrics & Coverage**

#### **Test Coverage Requirements**
- **Unit Tests**: 95%+ line coverage, 90%+ branch coverage
- **Integration Tests**: 100% git command coverage, 100% file operation coverage
- **Telegram Tests**: 100% callback handler coverage, 100% workflow coverage
- **Performance Tests**: Response time validation, memory usage monitoring

#### **Quality Gates Standards**
**Testing Criteria**: All tests must meet defined quality thresholds including coverage percentages, response time limits, memory usage constraints, and file system validation requirements to ensure production readiness.

## 📚 **Required Dependencies**

### **New Git Commands:**
- `git branch -v --all` - Branch listing
- `git checkout <branch>` - Branch switching
- `git checkout -b <branch>` - Branch creation
- `git add <files>` - File staging
- `git reset HEAD <files>` - File unstaging
- `git commit -m "<message>"` - Commit creation
- `git push` - Push changes
- `git fetch --all` - Fetch updates
- `git pull` - Pull changes
- `git remote -v` - Remote information
- `git log --oneline` - Commit history
- `git blame <file>` - File annotations

### **Enhanced Error Handling:**
- Git command exit codes
- Network connectivity issues
- Authentication problems
- Repository state conflicts

## 🎯 **Success Metrics**

### **Functionality Goals:**
- ✅ Complete git workflow through Telegram
- ✅ Mobile-optimized interface
- ✅ Safe operation with confirmations
- ✅ Intuitive navigation and actions

### **Performance Goals:**
- ⚡ <2s response time for all operations
- 📱 Mobile-friendly pagination
- 🔄 Efficient state management
- 💾 Minimal memory footprint

### **User Experience Goals:**
- 🎨 Consistent UI patterns
- 📚 Clear action feedback
- 🔒 Safe destructive operations
- 🚀 Streamlined workflows

## 🔄 **Migration Strategy**

### **Backward Compatibility:**
- Preserve existing callback patterns during transition
- Maintain current diff viewing functionality
- Gradual rollout of new features
- Fallback to old patterns if needed

### **Data Migration:**
- Update callback data format progressively
- Maintain state consistency during updates
- Handle mixed callback versions gracefully

## 📝 **Documentation Requirements**

### **User Documentation:**
- Git workflow guides
- Command reference
- Troubleshooting guide
- Best practices

### **Developer Documentation:**
- API documentation
- Callback pattern reference
- Testing procedures
- Deployment guide

---

## ❓ **Questions for Review**

1. **Scope**: Does this cover all the git operations you need?
2. **UI Design**: Are the interface mockups intuitive for mobile use?
3. **Safety**: Are there additional safety measures needed?
4. **Performance**: Any concerns about git command execution time?
5. **Phasing**: Should any phases be reordered or combined?
6. **Features**: Any missing git operations that are essential?

---

*This plan provides a comprehensive roadmap for transforming GitDiffManager into a full-featured GitManager with professional git workflow capabilities optimized for Telegram bot interaction.***
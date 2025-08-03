# Cumulative Token Tracking Enhancement

## Overview

The Status button now shows **true context usage** by tracking tokens from all parent sessions in the chain, not just the current session. This gives accurate context window percentage and prevents surprises when context limits are reached.

## Problem Solved

**Before:** Status showed only current session tokens (e.g., 5%), but Claude Code actually loads ALL parent sessions into context, potentially using 95% of the context window.

**After:** Status shows cumulative tokens from entire session chain (e.g., 95% actual usage), giving you the real picture.

## Architecture

### Key Components

1. **In-Memory Cache** (`cumulativeTokenCache`)
   - Stores calculated cumulative tokens for session chains
   - Prevents expensive recalculation on every status check
   - Maps sessionId → cumulative token totals

2. **Recursive Token Calculator** (`calculateCumulativeTokens`)
   - Walks up the session chain using `parentUuid` in JSONL files
   - Sums tokens from all parent sessions
   - Handles circular references and infinite loops
   - Caches results for future use

3. **Session Chain Parser** (`getParentSessionId`)
   - Reads first line of JSONL files to extract `parentUuid`
   - Follows the session parent chain to root
   - Handles missing or invalid session files gracefully

### Integration Points

- **Session Creation**: When continuing a session, calculates and caches cumulative tokens from all parents
- **Status Display**: Shows "Total Context" with breakdown of previous vs current session tokens
- **Bot Restart**: Automatically recalculates cumulative tokens if cache is empty

## Usage Examples

### New Session (No Parents)
```
🎯 Context: 1,200 / 200,000 (0.6%)
   ↳ 800 in, 400 out
   ↳ 3 transactions
```

### Continued Session (With Parents)
```
🎯 Total Context: 85,400 / 200,000 (42.7%)
   ↳ 65,200 in, 20,200 out
   ↳ 45 transactions
   ↳ 🔄 Previous sessions: 75,800 tokens
   ↳ 📝 Current session: 9,600 tokens
```

### Stored Session (After Bot Restart)
```
🎯 Total Context: 180,500 / 200,000 (90.3%)
   ↳ 145,200 in, 35,300 out
   ↳ 125 transactions
   ↳ 🔗 Includes all parent sessions in chain
⚠️ Close to limit - consider /compact soon
```

## Implementation Details

### Cache Management

- **Cache Key**: Session ID of the stored/continued session
- **Cache Value**: Cumulative token totals from entire chain
- **Cache Lifecycle**: Populated on session creation, cleared on bot restart
- **Cache Miss**: Automatically calculates and stores on first access

### Session Chain Walking

```javascript
// Example session chain: C → B → A (root)
sessionC.parentUuid = "sessionB-id"
sessionB.parentUuid = "sessionA-id"  
sessionA.parentUuid = null // root session

// calculateCumulativeTokens("sessionC-id") sums:
// sessionC.tokens + sessionB.tokens + sessionA.tokens
```

### Error Handling

- **Missing Session Files**: Gracefully handled, continues with available sessions
- **Circular References**: Detected and prevented using visited session tracking
- **Invalid JSON**: Skipped lines, continues processing
- **File Access Errors**: Logged but don't crash the bot

## Testing Coverage

Comprehensive test suite covers:

- ✅ Parent session ID parsing from JSONL files
- ✅ Cumulative token calculation across chains
- ✅ In-memory caching behavior
- ✅ Empty/missing session handling
- ✅ Circular reference detection
- ✅ Session chain walking logic

## Performance Impact

- **Minimal**: Calculations only run on session creation and cache misses
- **Fast**: In-memory cache provides instant status updates
- **Efficient**: Single pass through session chain, results cached
- **Scalable**: Handles long session chains without performance degradation

## Backwards Compatibility

- ✅ Existing sessions continue to work normally
- ✅ New sessions without parents show traditional display
- ✅ No breaking changes to existing APIs
- ✅ Graceful degradation when session files unavailable

## Future Enhancements

- **Token Usage Analytics**: Track token consumption patterns over time
- **Auto-Compaction Triggers**: Automatically compact when approaching limits
- **Session Chain Visualization**: Show session hierarchy in status
- **Memory Optimization**: Implement LRU cache for very large session histories
/**
 * Unit Tests for TelegramFormatter
 * Tests utility functions for formatting messages, todos, and tool outputs
 */

const TelegramFormatter = require('../../telegram-formatter');

describe('TelegramFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new TelegramFormatter();
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default HTML mode', () => {
      expect(formatter.mode).toBe('html');
    });

    test('should always use HTML mode regardless of option', () => {
      const mdFormatter = new TelegramFormatter({ mode: 'markdown' });
      expect(mdFormatter.mode).toBe('html');
    });

    test('should have status icons configured', () => {
      expect(formatter.statusIcons).toEqual({
        completed: '✅',
        in_progress: '🔄',
        pending: '⭕',
        blocked: '🚧'
      });
    });

    test('should have priority badges configured', () => {
      expect(formatter.priorityBadges).toEqual({
        high: '🔴',
        medium: '🟡',
        low: '🟢',
        critical: '🚨'
      });
    });

    test('should have tool icons configured', () => {
      expect(formatter.toolIcons).toHaveProperty('todowrite', '📋');
      expect(formatter.toolIcons).toHaveProperty('edit', '✏️');
      expect(formatter.toolIcons).toHaveProperty('bash', '💻');
    });
  });

  describe('HTML Escaping', () => {
    test('should escape HTML special characters', () => {
      expect(formatter.escapeHTML('&')).toBe('&amp;');
      expect(formatter.escapeHTML('<script>')).toBe('&lt;script&gt;');
      expect(formatter.escapeHTML('Hello & <world>')).toBe('Hello &amp; &lt;world&gt;');
    });

    test('should handle null and empty strings', () => {
      expect(formatter.escapeHTML(null)).toBe('');
      expect(formatter.escapeHTML('')).toBe('');
      expect(formatter.escapeHTML(undefined)).toBe('');
    });

    test('should not double-escape already escaped characters', () => {
      expect(formatter.escapeHTML('&amp;')).toBe('&amp;amp;');
    });
  });

  describe('Text Formatting', () => {
    test('should return plain text for assistant messages', () => {
      const result = formatter.formatAssistantText('This is **bold** text');
      expect(typeof result).toBe('string');
      expect(result).toBe('This is **bold** text');
    });

    test('should return plain text for various content', () => {
      const result = formatter.formatAssistantText('# Header\n**Bold** and *italic*');
      expect(typeof result).toBe('string');
      expect(result).toBe('# Header\n**Bold** and *italic*');
    });
  });


  describe('Thinking Message Formatting', () => {
    test('should format thinking message', () => {
      const result = formatter.formatThinking('User wants help with code', 'signature');
      expect(typeof result).toBe('string');
      expect(result).toContain('🤔 **Claude is thinking...**');
      expect(result).toContain('```\nUser wants help with code\n```');
    });

    test('should handle special characters in thinking content', () => {
      const result = formatter.formatThinking('Need to handle <script> tags', 'signature');
      expect(typeof result).toBe('string');
      expect(result).toContain('Need to handle <script> tags');
    });
  });

  describe('TodoWrite Formatting', () => {
    const sampleTodos = [
      { id: '1', content: 'Complete unit tests', status: 'in_progress', priority: 'high' },
      { id: '2', content: 'Review documentation', status: 'pending', priority: 'medium' },
      { id: '3', content: 'Fix bug in formatter', status: 'completed', priority: 'low' }
    ];

    test('should format todo list with progress overview', () => {
      const result = formatter.formatTodoWrite(sampleTodos);
      expect(typeof result).toBe('string');
      expect(result).toContain('📋 **Todo List**');
      expect(result).toContain('📊 **Progress**: 1/3 (33%)');
      expect(result).toContain('✅ 1 | 🔄 1 | ⭕ 1');
    });

    test('should group todos by status', () => {
      const result = formatter.formatTodoWrite(sampleTodos);
      expect(result).toContain('**🔄 In Progress** (1)');
      expect(result).toContain('**⭕ Pending** (1)');
      expect(result).toContain('**✅ Completed** (1)');
    });

    test('should show priority badges for todos', () => {
      const result = formatter.formatTodoWrite(sampleTodos);
      expect(result).toContain('🔴'); // high priority
      expect(result).toContain('🟡'); // medium priority
      expect(result).toContain('🟢'); // low priority
    });

    test('should strikethrough completed todos', () => {
      const result = formatter.formatTodoWrite(sampleTodos);
      expect(result).toContain('~~Fix bug in formatter~~');
    });

    test('should handle todos with blocked status', () => {
      const todosWithBlocked = [
        ...sampleTodos,
        { id: '4', content: 'Deploy to production', status: 'blocked', priority: 'critical' }
      ];
      const result = formatter.formatTodoWrite(todosWithBlocked);
      expect(result).toContain('🚧 1');
      expect(result).toContain('**🚧 Blocked** (1)');
      expect(result).toContain('🚨'); // critical priority
    });

    test('should handle special characters in todo content', () => {
      const todosWithSpecial = [
        { id: '1', content: 'Fix <script> injection', status: 'pending', priority: 'high' }
      ];
      const result = formatter.formatTodoWrite(todosWithSpecial);
      expect(result).toContain('Fix <script> injection');
    });
  });

  describe('File Operation Formatting', () => {
    test('should format file edit operation', () => {
      const result = formatter.formatFileEdit(
        '/path/to/file.js',
        'old code here',
        'new code here',
        { isError: false }
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('✏️ **File Edit**');
      expect(result).toContain('📄 `/path/to/file.js`');
      expect(result).toContain('**Before:**');
      expect(result).toContain('**After:**');
      expect(result).toContain('✅ **Result:** Success');
    });

    test('should format file write operation', () => {
      const result = formatter.formatFileWrite(
        '/path/to/new-file.js',
        'const example = "hello";',
        { isError: false }
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('📝 **File Write**');
      expect(result).toContain('📄 `/path/to/new-file.js`');
      expect(result).toContain('**Content:**');
      expect(result).toContain('const example = "hello";');
    });

    test('should format file read operation', () => {
      const result = formatter.formatFileRead(
        '/path/to/existing-file.js',
        { isError: false, content: 'file content here' }
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('👀 **File Read**');
      expect(result).toContain('📄 `/path/to/existing-file.js`');
      expect(result).toContain('**Content:**');
      expect(result).toContain('file content here');
    });

    test('should handle file operation errors', () => {
      const result = formatter.formatFileEdit(
        '/path/to/file.js',
        'old',
        'new',
        { isError: true }
      );
      expect(result).toContain('❌ **Result:** Failed');
    });

    test('should truncate long content previews', () => {
      const longContent = 'a'.repeat(300);
      const result = formatter.formatFileWrite('/file.js', longContent);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longContent.length + 100);
    });
  });

  describe('Bash Command Formatting', () => {
    test('should format simple bash command', () => {
      const result = formatter.formatBashCommand(
        'ls -la',
        'List files in directory',
        { isError: false, content: 'file1.js\nfile2.js' }
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('💻 **Terminal Command**');
      expect(result).toContain('📝 **Description:** List files in directory');
      expect(result).toContain('💻 `ls -la`');
      expect(result).toContain('✅ **Result:** Success');
      expect(result).toContain('**Output:**');
    });

    test('should format complex bash command with code block', () => {
      const complexCommand = 'for file in *.js; do\n  echo "Processing $file"\ndone';
      const result = formatter.formatBashCommand(complexCommand, 'Process all JS files');
      expect(result).toContain('```\n' + complexCommand + '\n```');
    });

    test('should handle bash command errors', () => {
      const result = formatter.formatBashCommand(
        'invalid-command',
        'This will fail',
        { isError: true }
      );
      expect(result).toContain('❌ **Result:** Failed');
    });

    test('should truncate long command output', () => {
      const longOutput = 'line\n'.repeat(100);
      const result = formatter.formatBashCommand(
        'ls',
        'List files',
        { isError: false, content: longOutput }
      );
      expect(result).toContain('...');
    });
  });

  describe('Task and MCP Tool Formatting', () => {
    test('should format task spawn operation', () => {
      const result = formatter.formatTaskSpawn(
        'Analyze code quality',
        'Please analyze the code for potential improvements',
        'code-reviewer',
        { isError: false }
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('🤖 **Task Agent**');
      expect(result).toContain('🤖 **Type:** code-reviewer');
      expect(result).toContain('📋 **Description:** Analyze code quality');
      expect(result).toContain('✅ **Status:** Running');
    });

    test('should format MCP tool operation', () => {
      const result = formatter.formatMCPTool(
        'vibe_kanban__create_task',
        { project_id: '123', title: 'New task' },
        { isError: false, content: 'Task created successfully' }
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('🔌 **MCP Tool**');
      expect(result).toContain('🔌 **Tool:** `vibe_kanban__create_task`');
      expect(result).toContain('**Parameters:**');
      expect(result).toContain('• **project_id:** `123`');
      expect(result).toContain('• **title:** `New task`');
      expect(result).toContain('✅ **Result:** Success');
    });
  });

  describe('Session and Error Formatting', () => {
    test('should format session initialization', () => {
      const sessionData = {
        sessionId: 'abc123def456',
        model: 'claude-3',
        cwd: '/home/user/project',
        tools: ['read', 'write', 'bash'],
        permissionMode: 'ask'
      };
      const result = formatter.formatSessionInit(sessionData);
      expect(typeof result).toBe('string');
      expect(result).toContain('🚀 **Session Started**');
      expect(result).toContain('🆔 **Session:** `23def456`'); // last 8 chars
      expect(result).toContain('🤖 **Model:** claude-3');
      expect(result).toContain('📁 **Directory:** `/home/user/project`');
      expect(result).toContain('🔒 **Permissions:** ask');
      expect(result).toContain('🛠 **Tools:** 3 available');
    });

    test('should format execution result', () => {
      const result = formatter.formatExecutionResult(
        {
          success: true,
          cost: 0.0025,
          duration: 5500,
          usage: { input_tokens: 100, output_tokens: 50 }
        },
        'session123'
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('✅ **Session** `ssion123` **ended**');
      expect(result).toContain('⏱ **Duration:** 5.50s');
      expect(result).toContain('💰 **Cost:** $0.0025');
      expect(result).toContain('🎯 **Tokens:** 150 (100 in, 50 out)');
    });

    test('should format error messages', () => {
      const error = new Error('Something went wrong');
      const result = formatter.formatError(error, 'file operation');
      expect(typeof result).toBe('string');
      expect(result).toContain('❌ **Error** in file operation');
      expect(result).toContain('Something went wrong');
    });
  });

  describe('Todo Comparison Utility', () => {
    test('should detect when todos have changed', () => {
      const oldTodos = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];
      const newTodos = [
        { id: '1', content: 'Task 1', status: 'completed', priority: 'high' }
      ];
      expect(formatter.todosChanged(oldTodos, newTodos)).toBe(true);
    });

    test('should detect when todos have not changed', () => {
      const todos = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];
      expect(formatter.todosChanged(todos, todos)).toBe(false);
    });

    test('should detect length changes', () => {
      const oldTodos = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];
      const newTodos = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'pending', priority: 'low' }
      ];
      expect(formatter.todosChanged(oldTodos, newTodos)).toBe(true);
    });

    test('should handle null/undefined inputs', () => {
      expect(formatter.todosChanged(null, [])).toBe(true);
      expect(formatter.todosChanged([], null)).toBe(true);
      expect(formatter.todosChanged(null, null)).toBe(true);
    });
  });

  describe('Code Block Escaping', () => {
    test('should escape backticks in code blocks', () => {
      const result = formatter.escapeForCodeBlock('const template = `Hello ${name}`;');
      expect(result).toBe('const template = \'Hello ${name}\';');
    });

    test('should remove control characters', () => {
      const result = formatter.escapeForCodeBlock('Hello\u0001World\u007F');
      expect(result).toBe('HelloWorld');
    });

    test('should replace emojis and symbols', () => {
      const result = formatter.escapeForCodeBlock('Hello 😀 World ⚡');
      expect(result).toBe('Hello [emoji] World [symbol]');
    });

    test('should handle null and empty strings', () => {
      expect(formatter.escapeForCodeBlock(null)).toBe('');
      expect(formatter.escapeForCodeBlock('')).toBe('');
    });

    test('should trim whitespace', () => {
      const result = formatter.escapeForCodeBlock('  code here  ');
      expect(result).toBe('code here');
    });
  });

  describe('Mode Selection', () => {
    test('should return plain text regardless of mode', () => {
      const htmlFormatter = new TelegramFormatter({ mode: 'html' });
      const result = htmlFormatter.formatAssistantText('**bold** text');
      expect(typeof result).toBe('string');
      expect(result).toBe('**bold** text');
    });

    test('should return plain text for markdown mode too', () => {
      const mdFormatter = new TelegramFormatter({ mode: 'markdown' });
      const result = mdFormatter.formatAssistantText('**bold** text');
      expect(typeof result).toBe('string');
      expect(result).toBe('**bold** text');
    });

    test('should return plain text for thinking', () => {
      const htmlFormatter = new TelegramFormatter({ mode: 'html' });
      const result = htmlFormatter.formatThinking('thinking content');
      expect(typeof result).toBe('string');
      expect(result).toContain('```\nthinking content\n```');
    });

    test('should return plain text for todos', () => {
      const htmlFormatter = new TelegramFormatter({ mode: 'html' });
      const todos = [{ id: '1', content: 'Test', status: 'pending', priority: 'low' }];
      const result = htmlFormatter.formatTodoWrite(todos);
      expect(typeof result).toBe('string');
      expect(result).toContain('📋 **Todo List**');
    });
  });
});
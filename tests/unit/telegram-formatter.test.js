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

    test('should accept mode option', () => {
      const mdFormatter = new TelegramFormatter({ mode: 'markdown' });
      expect(mdFormatter.mode).toBe('markdown');
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

  describe('Text Formatting - HTML Mode', () => {
    beforeEach(() => {
      formatter = new TelegramFormatter({ mode: 'html' });
    });

    test('should format headers with icons in HTML', () => {
      const result = formatter.formatAssistantTextHTML('# Main Header\n## Sub Header');
      expect(result.text).toContain('<b>📋 Main Header</b>');
      expect(result.text).toContain('<b>🔸 Sub Header</b>');
      expect(result.parse_mode).toBe('HTML');
    });

    test('should format bold text in HTML', () => {
      const result = formatter.formatAssistantTextHTML('This is **bold** text');
      expect(result.text).toContain('This is <b>bold</b> text');
    });

    test('should format italic text in HTML', () => {
      const result = formatter.formatAssistantTextHTML('This is *italic* text');
      expect(result.text).toContain('This is <i>italic</i> text');
    });

    test('should format inline code in HTML', () => {
      const result = formatter.formatAssistantTextHTML('Use `console.log()` for debugging');
      expect(result.text).toContain('Use <code>console.log()</code> for debugging');
    });

    test('should convert markdown links to HTML links', () => {
      const result = formatter.formatAssistantTextHTML('[GitHub](https://github.com)');
      expect(result.text).toContain('<a href="https://github.com">GitHub</a>');
    });

    test('should convert numbered lists to bullet points', () => {
      const result = formatter.formatAssistantTextHTML('1. First item\n2. Second item');
      expect(result.text).toContain('• First item');
      expect(result.text).toContain('• Second item');
    });

    test('should escape HTML in content before formatting', () => {
      const result = formatter.formatAssistantTextHTML('Use <script> **tags** carefully');
      expect(result.text).toContain('Use &lt;script&gt; <b>tags</b> carefully');
    });
  });

  describe('Text Formatting - Markdown Mode', () => {
    beforeEach(() => {
      formatter = new TelegramFormatter({ mode: 'markdown' });
    });

    test('should format headers with icons in Markdown', () => {
      const result = formatter.formatAssistantTextMarkdown('# Main Header\n## Sub Header');
      expect(result.text).toContain('*📋 Main Header*');
      expect(result.text).toContain('*🔸 Sub Header*');
    });

    test('should convert double asterisks to single asterisks', () => {
      const result = formatter.formatAssistantTextMarkdown('This is **bold** text');
      expect(result.text).toContain('This is *bold* text');
    });

    test('should preserve inline code formatting', () => {
      const result = formatter.formatAssistantTextMarkdown('Use `console.log()` function');
      expect(result.text).toContain('Use `console.log()` function');
    });

    test('should convert markdown links to plain text format', () => {
      const result = formatter.formatAssistantTextMarkdown('[GitHub](https://github.com)');
      expect(result.text).toContain('GitHub (https://github.com)');
    });
  });

  describe('Thinking Message Formatting', () => {
    test('should format thinking message in HTML mode', () => {
      const result = formatter.formatThinkingHTML('User wants help with code', 'signature');
      expect(result.text).toContain('🤔 <b>Claude is thinking...</b>');
      expect(result.text).toContain('<pre>User wants help with code</pre>');
      expect(result.parse_mode).toBe('HTML');
      expect(result.type).toBe('thinking');
    });

    test('should format thinking message in Markdown mode', () => {
      const result = formatter.formatThinkingMarkdown('User wants help with code', 'signature');
      expect(result.text).toContain('🤔 *Claude is thinking...*');
      expect(result.text).toContain('```\nUser wants help with code\n```');
      expect(result.type).toBe('thinking');
    });

    test('should escape HTML in thinking content', () => {
      const result = formatter.formatThinkingHTML('Need to handle <script> tags', 'signature');
      expect(result.text).toContain('Need to handle &lt;script&gt; tags');
    });
  });

  describe('TodoWrite Formatting', () => {
    const sampleTodos = [
      { id: '1', content: 'Complete unit tests', status: 'in_progress', priority: 'high' },
      { id: '2', content: 'Review documentation', status: 'pending', priority: 'medium' },
      { id: '3', content: 'Fix bug in formatter', status: 'completed', priority: 'low' }
    ];

    test('should format todo list with progress overview in HTML', () => {
      const result = formatter.formatTodoWriteHTML(sampleTodos);
      expect(result.text).toContain('📋 <b>Todo List</b>');
      expect(result.text).toContain('📊 <b>Progress</b>: 1/3 (33%)');
      expect(result.text).toContain('✅ 1 | 🔄 1 | ⭕ 1');
      expect(result.type).toBe('todo');
      expect(result.canEdit).toBe(true);
    });

    test('should group todos by status', () => {
      const result = formatter.formatTodoWriteHTML(sampleTodos);
      expect(result.text).toContain('<b>🔄 In Progress</b> (1)');
      expect(result.text).toContain('<b>⭕ Pending</b> (1)');
      expect(result.text).toContain('<b>✅ Completed</b> (1)');
    });

    test('should show priority badges for todos', () => {
      const result = formatter.formatTodoWriteHTML(sampleTodos);
      expect(result.text).toContain('🔴'); // high priority
      expect(result.text).toContain('🟡'); // medium priority
      expect(result.text).toContain('🟢'); // low priority
    });

    test('should strikethrough completed todos in HTML', () => {
      const result = formatter.formatTodoWriteHTML(sampleTodos);
      expect(result.text).toContain('<s>Fix bug in formatter</s>');
    });

    test('should handle todos with blocked status', () => {
      const todosWithBlocked = [
        ...sampleTodos,
        { id: '4', content: 'Deploy to production', status: 'blocked', priority: 'critical' }
      ];
      const result = formatter.formatTodoWriteHTML(todosWithBlocked);
      expect(result.text).toContain('🚧 1');
      expect(result.text).toContain('<b>🚧 Blocked</b> (1)');
      expect(result.text).toContain('🚨'); // critical priority
    });

    test('should escape HTML in todo content', () => {
      const todosWithHtml = [
        { id: '1', content: 'Fix <script> injection', status: 'pending', priority: 'high' }
      ];
      const result = formatter.formatTodoWriteHTML(todosWithHtml);
      expect(result.text).toContain('Fix &lt;script&gt; injection');
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
      expect(result.text).toContain('✏️ *File Edit*');
      expect(result.text).toContain('📄 `/path/to/file.js`');
      expect(result.text).toContain('*Before:*');
      expect(result.text).toContain('*After:*');
      expect(result.text).toContain('✅ *Result:* Success');
      expect(result.type).toBe('file_edit');
    });

    test('should format file write operation', () => {
      const result = formatter.formatFileWrite(
        '/path/to/new-file.js',
        'const example = "hello";',
        { isError: false }
      );
      expect(result.text).toContain('📝 *File Write*');
      expect(result.text).toContain('📄 `/path/to/new-file.js`');
      expect(result.text).toContain('*Content:*');
      expect(result.text).toContain('const example = "hello";');
      expect(result.type).toBe('file_write');
    });

    test('should format file read operation', () => {
      const result = formatter.formatFileRead(
        '/path/to/existing-file.js',
        { isError: false, content: 'file content here' }
      );
      expect(result.text).toContain('👀 *File Read*');
      expect(result.text).toContain('📄 `/path/to/existing-file.js`');
      expect(result.text).toContain('*Content:*');
      expect(result.text).toContain('file content here');
      expect(result.type).toBe('file_read');
    });

    test('should handle file operation errors', () => {
      const result = formatter.formatFileEdit(
        '/path/to/file.js',
        'old',
        'new',
        { isError: true }
      );
      expect(result.text).toContain('❌ *Result:* Failed');
    });

    test('should truncate long content previews', () => {
      const longContent = 'a'.repeat(300);
      const result = formatter.formatFileWrite('/file.js', longContent);
      expect(result.text).toContain('...');
      expect(result.text.length).toBeLessThan(longContent.length + 100);
    });
  });

  describe('Bash Command Formatting', () => {
    test('should format simple bash command', () => {
      const result = formatter.formatBashCommand(
        'ls -la',
        'List files in directory',
        { isError: false, content: 'file1.js\nfile2.js' }
      );
      expect(result.text).toContain('💻 *Terminal Command*');
      expect(result.text).toContain('📝 *Description:* List files in directory');
      expect(result.text).toContain('💻 `ls -la`');
      expect(result.text).toContain('✅ *Result:* Success');
      expect(result.text).toContain('*Output:*');
      expect(result.type).toBe('bash_command');
    });

    test('should format complex bash command with code block', () => {
      const complexCommand = 'for file in *.js; do\n  echo "Processing $file"\ndone';
      const result = formatter.formatBashCommand(complexCommand, 'Process all JS files');
      expect(result.text).toContain('```bash\n' + complexCommand + '\n```');
    });

    test('should handle bash command errors', () => {
      const result = formatter.formatBashCommand(
        'invalid-command',
        'This will fail',
        { isError: true }
      );
      expect(result.text).toContain('❌ *Result:* Failed');
    });

    test('should truncate long command output', () => {
      const longOutput = 'line\n'.repeat(100);
      const result = formatter.formatBashCommand(
        'ls',
        'List files',
        { isError: false, content: longOutput }
      );
      expect(result.text).toContain('...');
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
      expect(result.text).toContain('🤖 *Task Agent*');
      expect(result.text).toContain('🤖 *Type:* code-reviewer');
      expect(result.text).toContain('📋 *Description:* Analyze code quality');
      expect(result.text).toContain('✅ *Status:* Running');
      expect(result.type).toBe('task_spawn');
    });

    test('should format MCP tool operation', () => {
      const result = formatter.formatMCPTool(
        'vibe_kanban__create_task',
        { project_id: '123', title: 'New task' },
        { isError: false, content: 'Task created successfully' }
      );
      expect(result.text).toContain('🔌 *MCP Tool*');
      expect(result.text).toContain('🔌 *Tool:* `vibe_kanban__create_task`');
      expect(result.text).toContain('*Parameters:*');
      expect(result.text).toContain('• *project_id:* `123`');
      expect(result.text).toContain('• *title:* `New task`');
      expect(result.text).toContain('✅ *Result:* Success');
      expect(result.type).toBe('mcp_tool');
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
      expect(result.text).toContain('🚀 *Session Started*');
      expect(result.text).toContain('🆔 *Session:* `23def456`'); // last 8 chars
      expect(result.text).toContain('🤖 *Model:* claude-3');
      expect(result.text).toContain('📁 *Directory:* `/home/user/project`');
      expect(result.text).toContain('🔒 *Permissions:* ask');
      expect(result.text).toContain('🛠 *Tools:* 3 available');
      expect(result.type).toBe('session_init');
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
      expect(result.text).toContain('✅ *Session* `ssion123` *ended*');
      expect(result.text).toContain('⏱ *Duration:* 5.50s');
      expect(result.text).toContain('💰 *Cost:* $0.0025');
      expect(result.text).toContain('🎯 *Tokens:* 150 (100 in, 50 out)');
      expect(result.type).toBe('execution_result');
    });

    test('should format error messages', () => {
      const error = new Error('Something went wrong');
      const result = formatter.formatError(error, 'file operation');
      expect(result.text).toContain('❌ *Error* in file operation');
      expect(result.text).toContain('Something went wrong');
      expect(result.type).toBe('error');
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
      expect(result).toBe("const template = 'Hello ${name}';");
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
    test('should use HTML formatting when in HTML mode', () => {
      const htmlFormatter = new TelegramFormatter({ mode: 'html' });
      const result = htmlFormatter.formatAssistantText('**bold** text');
      expect(result.text).toContain('<b>bold</b>');
      expect(result.parse_mode).toBe('HTML');
    });

    test('should use Markdown formatting when in markdown mode', () => {
      const mdFormatter = new TelegramFormatter({ mode: 'markdown' });
      const result = mdFormatter.formatAssistantText('**bold** text');
      expect(result.text).toContain('*bold*');
      expect(result.parse_mode).toBeUndefined();
    });

    test('should use HTML formatting for thinking based on mode', () => {
      const htmlFormatter = new TelegramFormatter({ mode: 'html' });
      const result = htmlFormatter.formatThinking('thinking content');
      expect(result.text).toContain('<pre>');
    });

    test('should use HTML formatting for todos based on mode', () => {
      const htmlFormatter = new TelegramFormatter({ mode: 'html' });
      const todos = [{ id: '1', content: 'Test', status: 'pending', priority: 'low' }];
      const result = htmlFormatter.formatTodoWrite(todos);
      expect(result.parse_mode).toBe('HTML');
    });
  });
});
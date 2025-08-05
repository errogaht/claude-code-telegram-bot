/**
 * Unit Tests for TelegramFormatter (Current Implementation)
 * Tests for the current TelegramFormatter that returns Markdown strings
 * HTML conversion is handled by safeSendMessage, not the formatter
 */

const TelegramFormatter = require('../../telegram-formatter');

describe('TelegramFormatter - Current Implementation', () => {
  let formatter;

  beforeEach(() => {
    formatter = new TelegramFormatter();
  });

  describe('Constructor and Configuration', () => {
    test('should always initialize in HTML mode', () => {
      expect(formatter.mode).toBe('html');
    });

    test('should ignore mode option and always use HTML', () => {
      const formatterWithOption = new TelegramFormatter({ mode: 'markdown' });
      expect(formatterWithOption.mode).toBe('html');
    });

    test('should not have markdown-specific methods', () => {
      // These methods should be removed in current version
      expect(formatter.formatAssistantTextMarkdown).toBeUndefined();
      expect(formatter.formatThinkingMarkdown).toBeUndefined();
      expect(formatter.formatTodoWriteMarkdown).toBeUndefined();
    });
  });

  describe('Text Formatting (Returns Markdown)', () => {
    test('should return markdown text for assistant messages', () => {
      const result = formatter.formatAssistantText('**bold** text');
      expect(typeof result).toBe('string');
      expect(result).toBe('**bold** text');
    });

    test('should return complex markdown unchanged', () => {
      const input = `# Main Header
## Sub Header
This is **bold** and *italic* with \`code\`.

\`\`\`javascript
console.log("hello");
\`\`\`

[Link](https://example.com)

1. First item
2. Second item`;

      const result = formatter.formatAssistantText(input);
      expect(typeof result).toBe('string');
      expect(result).toBe(input);
    });

    test('should handle special characters in user content', () => {
      const input = '**<script>alert("xss")</script>**';
      const result = formatter.formatAssistantText(input);
      expect(typeof result).toBe('string');
      expect(result).toBe(input);
    });
  });

  describe('Thinking Message Formatting', () => {
    test('should format thinking with markdown', () => {
      const result = formatter.formatThinking('User wants help with code');
      expect(typeof result).toBe('string');
      expect(result).toContain('🤔 **Claude is thinking...**');
      expect(result).toContain('```\nUser wants help with code\n```');
    });

    test('should handle special characters in thinking content', () => {
      const result = formatter.formatThinking('Need to handle <script> tags');
      expect(typeof result).toBe('string');
      expect(result).toContain('Need to handle <script> tags');
    });
  });

  describe('TodoWrite Formatting', () => {
    const sampleTodos = [
      { id: '1', content: 'Complete unit tests', status: 'in_progress', priority: 'high' },
      { id: '2', content: 'Review <documentation>', status: 'pending', priority: 'medium' },
      { id: '3', content: 'Fix bug in formatter', status: 'completed', priority: 'low' }
    ];

    test('should format todos with markdown', () => {
      const result = formatter.formatTodoWrite(sampleTodos);
      expect(typeof result).toBe('string');
      expect(result).toContain('📋 **Todo List**');
      expect(result).toContain('📊 **Progress**: 1/3 (33%)');
    });

    test('should handle special characters in todo content', () => {
      const result = formatter.formatTodoWrite(sampleTodos);
      expect(typeof result).toBe('string');
      expect(result).toContain('Review <documentation>');
    });

    test('should use markdown strikethrough for completed todos', () => {
      const result = formatter.formatTodoWrite(sampleTodos);
      expect(typeof result).toBe('string');
      expect(result).toContain('~~Fix bug in formatter~~');
    });
  });

  describe('File Operation Formatting', () => {
    test('should format file operations with markdown', () => {
      const result = formatter.formatFileEdit(
        '/path/to/file.js',
        'const old = "<script>";',
        'const new = "&lt;script&gt;";',
        { isError: false }
      );
      
      expect(typeof result).toBe('string');
      expect(result).toContain('✏️ **File Edit**');
      expect(result).toContain('📄 `/path/to/file.js`');
      expect(result).toContain('**Before:**');
      expect(result).toContain('**After:**');
      expect(result).toContain('✅ **Result:** Success');
    });

    test('should format bash commands with markdown', () => {
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
    });
  });

  describe('Error Handling', () => {
    test('should format errors with markdown', () => {
      const error = new Error('Something went wrong with <tags>');
      const result = formatter.formatError(error, 'file operation');
      expect(typeof result).toBe('string');
      expect(result).toContain('❌ **Error** in file operation');
      expect(result).toContain('Something went wrong with <tags>');
    });
  });

  describe('Session Information Formatting', () => {
    test('should format session info with markdown', () => {
      const sessionData = {
        sessionId: 'abc123def456',
        model: 'claude-3',
        cwd: '/home/user/project',
        tools: ['read', 'write', 'bash'],
        permissionMode: 'ask'
      };
      
      const result = formatter.formatSessionInit(sessionData);
      expect(typeof result).toBe('string');
      expect(result).toContain('🚀 **New Session Started**');
      expect(result).toContain('🆔 **Session:** `23def456`');
      expect(result).toContain('🤖 **Model:** claude-3');
      expect(result).toContain('📁 **Directory:** `/home/user/project`');
    });

    test('should format execution results with markdown', () => {
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
    });
  });

  describe('Task and MCP Formatting', () => {
    test('should format task operations with markdown', () => {
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
    });

    test('should format MCP tools with markdown', () => {
      const result = formatter.formatMCPTool(
        'vibe_kanban__create_task',
        { project_id: '123', title: 'New <task>' },
        { isError: false, content: 'Task created successfully' }
      );
      
      expect(typeof result).toBe('string');
      expect(result).toContain('🔌 **MCP Tool**');
      expect(result).toContain('🔌 **Tool:** `vibe_kanban__create_task`');
      expect(result).toContain('**Parameters:**');
      expect(result).toContain('• **title:** `New <task>`');
    });
  });

  describe('Backward Compatibility', () => {
    test('should return string for all methods', () => {
      const result = formatter.formatAssistantText('test');
      expect(typeof result).toBe('string');
      expect(result).toBe('test');
    });

    test('should maintain todos comparison functionality', () => {
      const oldTodos = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];
      const newTodos = [
        { id: '1', content: 'Task 1', status: 'completed', priority: 'high' }
      ];
      expect(formatter.todosChanged(oldTodos, newTodos)).toBe(true);
    });

    test('should maintain code block escaping functionality', () => {
      const result = formatter.escapeForCodeBlock('const template = `Hello ${name}`;');
      expect(result).toBe('const template = \'Hello ${name}\';');
    });
  });

  describe('Special Characters and Edge Cases', () => {
    test('should handle empty and null inputs', () => {
      expect(formatter.formatAssistantText('')).toBe('');
      expect(formatter.formatAssistantText(null)).toBe('');
    });

    test('should handle very long content', () => {
      const longText = 'a'.repeat(5000);
      const result = formatter.formatAssistantText(longText);
      expect(typeof result).toBe('string');
      expect(result).toBe(longText);
    });

    test('should handle unicode and emoji content', () => {
      const input = '**Bold** with emoji 🚀 and unicode characters: 中文';
      const result = formatter.formatAssistantText(input);
      expect(typeof result).toBe('string');
      expect(result).toBe(input);
    });

    test('should handle special characters in user input', () => {
      const input = '<unclosed>tag and **bold**';
      const result = formatter.formatAssistantText(input);
      expect(typeof result).toBe('string');
      expect(result).toBe(input);
    });
  });
});
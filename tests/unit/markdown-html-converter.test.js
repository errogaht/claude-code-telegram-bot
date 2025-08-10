/**
 * Unit Tests for MarkdownHtmlConverter (TDD)
 * Tests for the enhanced Markdown to HTML converter component
 * Following TDD approach - writing tests first before implementation
 */

describe('MarkdownHtmlConverter', () => {
  let converter;

  beforeEach(() => {
    // This will fail initially since we haven't created the class yet
    const MarkdownHtmlConverter = require('../../utils/markdown-html-converter');
    converter = new MarkdownHtmlConverter();
  });

  describe('Constructor and Basic Functionality', () => {
    test('should be instantiable', () => {
      expect(converter).toBeDefined();
      expect(converter).toBeInstanceOf(Object);
    });

    test('should have convert method', () => {
      expect(typeof converter.convert).toBe('function');
    });

    test('should have escapeHTML method', () => {
      expect(typeof converter.escapeHTML).toBe('function');
    });

    test('should have convertCodeBlocks method', () => {
      expect(typeof converter.convertCodeBlocks).toBe('function');
    });
  });

  describe('HTML Escaping', () => {
    test('should escape HTML special characters', () => {
      expect(converter.escapeHTML('&')).toBe('&amp;');
      expect(converter.escapeHTML('<script>')).toBe('&lt;script&gt;');
      expect(converter.escapeHTML('Hello & <world>')).toBe('Hello &amp; &lt;world&gt;');
    });

    test('should handle null and empty strings', () => {
      expect(converter.escapeHTML(null)).toBe('');
      expect(converter.escapeHTML('')).toBe('');
      expect(converter.escapeHTML(undefined)).toBe('');
    });

    test('should escape in correct order to prevent double escaping issues', () => {
      // & must be escaped first to avoid double-escaping
      expect(converter.escapeHTML('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
    });
  });

  describe('Code Block Conversion', () => {
    test('should convert triple backtick code blocks to HTML pre tags', () => {
      const input = '```\nconsole.log("hello");\n```';
      const result = converter.convertCodeBlocks(input);
      expect(result).toBe('<pre>console.log("hello");</pre>');
    });

    test('should handle code blocks with language specifier', () => {
      const input = '```javascript\nconsole.log("hello");\n```';
      const result = converter.convertCodeBlocks(input);
      expect(result).toBe('<pre><code class="language-javascript">console.log("hello");</code></pre>');
    });

    test('should handle various programming languages in code blocks', () => {
      const phpCode = '```php\n<?php echo "Hello"; ?>\n```';
      expect(converter.convertCodeBlocks(phpCode)).toBe('<pre><code class="language-php">&lt;?php echo "Hello"; ?&gt;</code></pre>');

      const pythonCode = '```python\ndef hello():\n    print("Hello")\n```';
      expect(converter.convertCodeBlocks(pythonCode)).toBe('<pre><code class="language-python">def hello():\n    print("Hello")</code></pre>');

      const bashCode = '```bash\necho "Hello World"\n```';
      expect(converter.convertCodeBlocks(bashCode)).toBe('<pre><code class="language-bash">echo "Hello World"</code></pre>');
    });

    test('should handle multiple code blocks', () => {
      const input = '```\ncode1\n```\ntext\n```\ncode2\n```';
      const result = converter.convertCodeBlocks(input);
      expect(result).toBe('<pre>code1</pre>\ntext\n<pre>code2</pre>');
    });

    test('should escape HTML inside code blocks', () => {
      const input = '```\n<script>alert("xss")</script>\n```';
      const result = converter.convertCodeBlocks(input);
      expect(result).toBe('<pre>&lt;script&gt;alert("xss")&lt;/script&gt;</pre>');
    });

    test('should handle empty code blocks', () => {
      const input = '```\n```';
      const result = converter.convertCodeBlocks(input);
      expect(result).toBe('<pre></pre>');
    });

    test('should trim whitespace from code blocks', () => {
      const input = '```\n  code here  \n```';
      const result = converter.convertCodeBlocks(input);
      expect(result).toBe('<pre>code here</pre>');
    });
  });

  describe('Markdown to HTML Conversion', () => {
    test('should convert headers with icons', () => {
      expect(converter.convert('# Main Header')).toBe('<b>📋 Main Header</b>');
      expect(converter.convert('## Sub Header')).toBe('<b>🔸 Sub Header</b>');
      expect(converter.convert('### Sub Sub Header')).toBe('<b>🔸 Sub Sub Header</b>');
    });

    test('should convert bold markdown to HTML', () => {
      expect(converter.convert('**bold text**')).toBe('<b>bold text</b>');
      expect(converter.convert('This is **bold** text')).toBe('This is <b>bold</b> text');
    });

    test('should convert italic markdown to HTML', () => {
      expect(converter.convert('*italic text*')).toBe('<i>italic text</i>');
      expect(converter.convert('This is *italic* text')).toBe('This is <i>italic</i> text');
    });

    test('should convert strikethrough markdown to HTML', () => {
      expect(converter.convert('~~strikethrough text~~')).toBe('<s>strikethrough text</s>');
      expect(converter.convert('This is ~~deleted~~ text')).toBe('This is <s>deleted</s> text');
    });

    test('should convert blockquotes markdown to HTML', () => {
      expect(converter.convert('> This is a blockquote')).toBe('<blockquote>This is a blockquote</blockquote>');
      expect(converter.convert('Normal text\n> Quoted text')).toBe('Normal text\n<blockquote>Quoted text</blockquote>');
    });

    test('should convert inline code markdown to HTML', () => {
      expect(converter.convert('`code`')).toBe('<code>code</code>');
      expect(converter.convert('Use `console.log()` for debugging')).toBe('Use <code>console.log()</code> for debugging');
    });

    test('should convert markdown links to HTML links', () => {
      const input = '[GitHub](https://github.com)';
      const expected = '<a href="https://github.com">GitHub</a>';
      expect(converter.convert(input)).toBe(expected);
    });

    test('should convert numbered lists to bullet points', () => {
      const input = '1. First item\n2. Second item';
      const result = converter.convert(input);
      expect(result).toContain('• First item');
      expect(result).toContain('• Second item');
    });

    test('should handle code blocks before inline code', () => {
      const input = '```\nconst code = `template`;\n```\nInline `code`';
      const result = converter.convert(input);
      expect(result).toContain('<pre>const code = `template`;</pre>');
      expect(result).toContain('Inline <code>code</code>');
    });

    test('should escape HTML characters before markdown conversion', () => {
      const input = '**<script>alert("xss")</script>**';
      const result = converter.convert(input);
      expect(result).toBe('<b>&lt;script&gt;alert("xss")&lt;/script&gt;</b>');
    });

    test('should limit excessive line breaks', () => {
      const input = 'Text\n\n\n\n\nMore text';
      const result = converter.convert(input);
      expect(result).toBe('Text\n\n\nMore text');
    });

    test('should handle null and empty inputs', () => {
      expect(converter.convert(null)).toBe('');
      expect(converter.convert('')).toBe('');
      expect(converter.convert(undefined)).toBe('');
    });

    test('should handle non-string inputs', () => {
      expect(converter.convert(123)).toBe('');
      expect(converter.convert({})).toBe('');
      expect(converter.convert([])).toBe('');
    });
  });

  describe('Complex Markdown Scenarios', () => {
    test('should handle mixed formatting', () => {
      const input = '# Header\n\nThis is **bold** and *italic* with `code`.';
      const result = converter.convert(input);
      expect(result).toContain('<b>📋 Header</b>');
      expect(result).toContain('<b>bold</b>');
      expect(result).toContain('<i>italic</i>');
      expect(result).toContain('<code>code</code>');
    });

    test('should handle nested formatting safely', () => {
      const input = '**Bold with *italic* inside**';
      const result = converter.convert(input);
      // Should handle this gracefully without breaking HTML
      expect(result).toContain('<b>');
      expect(result).toContain('</b>');
    });

    test('should handle code blocks with mixed content', () => {
      const input = `Here's some code:
\`\`\`javascript
function test() {
  console.log("Hello **world**");
  return \`template\`;
}
\`\`\`
And inline \`code\` here.`;
      
      const result = converter.convert(input);
      expect(result).toContain('<pre>');
      expect(result).toContain('<code>code</code>');
      // Code block content should not be processed for markdown
      expect(result).toContain('Hello **world**'); // Not converted to HTML bold
    });

    test('should handle malformed markdown gracefully', () => {
      const input = '**unclosed bold and *unclosed italic';
      const result = converter.convert(input);
      // Should not crash and should escape HTML properly
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    test('should preserve regular asterisks that are not markdown', () => {
      const input = 'Math: 2 * 3 = 6 and 4*5=20';
      const result = converter.convert(input);
      expect(result).toBe('Math: 2 * 3 = 6 and 4*5=20');
    });
  });

  describe('Real-world Content Examples', () => {
    test('should handle typical AI assistant response', () => {
      const input = `# Analysis Results

Here are the **key findings**:

1. Performance issue in \`getUserData()\`
2. Security vulnerability in authentication

\`\`\`javascript
// Fix suggestion
function getUserData(id) {
  return cache.get(id) || database.fetch(id);
}
\`\`\`

For more info, see [documentation](https://example.com/docs).`;

      const result = converter.convert(input);
      
      expect(result).toContain('<b>📋 Analysis Results</b>');
      expect(result).toContain('<b>key findings</b>');
      expect(result).toContain('<code>getUserData()</code>');
      expect(result).toContain('<pre><code class="language-javascript">// Fix suggestion');
      expect(result).toContain('<a href="https://example.com/docs">documentation</a>');
      expect(result).toContain('• Performance issue');
      expect(result).toContain('• Security vulnerability');
    });

    test('should handle git diff style content', () => {
      const input = `## Git Status

**Modified files:**
- \`src/app.js\` - *updated configuration*
- \`README.md\` - **added documentation**

\`\`\`diff
+ added new feature
- removed old code
\`\`\``;

      const result = converter.convert(input);
      
      expect(result).toContain('<b>🔸 Git Status</b>');
      expect(result).toContain('<b>Modified files:</b>');
      expect(result).toContain('<code>src/app.js</code>');
      expect(result).toContain('<i>updated configuration</i>');
      expect(result).toContain('<b>added documentation</b>');
      expect(result).toContain('<pre><code class="language-diff">+ added new feature');
    });
  });
});
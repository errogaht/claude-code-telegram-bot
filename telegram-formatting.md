# 📱 Telegram Bot API - Message Formatting Documentation

Comprehensive guide to all message formatting options available in Telegram Bot API. This document covers HTML, Markdown (legacy), and MarkdownV2 parsing modes with complete syntax reference.

## 📋 Table of Contents

- [Overview](#overview)
- [HTML Formatting](#html-formatting)
- [MarkdownV2 Formatting](#markdownv2-formatting) 
- [Markdown Legacy Formatting](#markdown-legacy-formatting)
- [Comparison Table](#comparison-table)
- [Best Practices](#best-practices)
- [Common Issues & Solutions](#common-issues--solutions)

---

## 🎯 Overview

The Telegram Bot API supports three parsing modes for message formatting:

| Parse Mode | Status | Recommendation |
|------------|---------|----------------|
| `HTML` | **Active** | ✅ **Recommended** - Most reliable and flexible |
| `MarkdownV2` | **Active** | ⚠️ **Use with caution** - Complex escaping rules |
| `Markdown` | **Legacy** | ❌ **Deprecated** - Limited features, use only for compatibility |

---

## 🏷️ HTML Formatting

**Parse Mode**: `HTML` or `html`

HTML formatting is the **most reliable and recommended** approach for Telegram bots. It uses familiar HTML tags and has fewer escaping issues.

### ✅ Supported HTML Tags

#### Text Formatting
```html
<b>bold text</b>               <!-- Bold -->
<strong>bold text</strong>     <!-- Bold (alternative) -->

<i>italic text</i>             <!-- Italic -->
<em>italic text</em>           <!-- Italic (alternative) -->

<u>underlined text</u>         <!-- Underline -->
<ins>underlined text</ins>     <!-- Underline (alternative) -->

<s>strikethrough text</s>      <!-- Strikethrough -->
<strike>strikethrough text</strike>  <!-- Strikethrough (alternative) -->
<del>strikethrough text</del>  <!-- Strikethrough (alternative) -->

<span class="tg-spoiler">spoiler text</span>  <!-- Spoiler -->
```

#### Links and Mentions
```html
<a href="https://example.com">inline URL</a>
<a href="tg://user?id=123456789">inline mention</a>
```

#### Code Formatting
```html
<code>inline fixed-width code</code>

<pre>pre-formatted fixed-width code block</pre>

<pre><code class="language-python">
# Python syntax highlighting
def hello():
    print("Hello, World!")
</code></pre>
```

#### Block Quotes
```html
<blockquote>This is a blockquote</blockquote>
<blockquote expandable>This is an expandable blockquote</blockquote>
```

### 🎨 Nested Formatting Example
```html
<b>Bold <i>italic <u>underlined <s>strikethrough <span class="tg-spoiler">spoiler</span></s></u></i></b>
```

### 🔒 HTML Escaping Rules
- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;`

---

## 📝 MarkdownV2 Formatting

**Parse Mode**: `MarkdownV2`

MarkdownV2 is the modern Markdown implementation with full feature support but requires careful character escaping.

### ✅ Supported Syntax

#### Text Formatting
```markdown
*bold text*
_italic text_
__underlined text__
~strikethrough text~
||spoiler text||
```

#### Advanced Nesting
```markdown
*bold _italic bold ~italic bold strikethrough ||italic bold strikethrough spoiler||~ __underline italic bold___ bold*
```

#### Links and Mentions
```markdown
[inline URL](http://www.example.com/)
[inline mention of a user](tg://user?id=123456789)
```

#### Code Formatting
```markdown
`inline fixed-width code`

```
pre-formatted fixed-width code block
```

```python
# Python code block with syntax highlighting  
def hello():
    print("Hello, World!")  
```
```

#### Block Quotes
```markdown
>Block quotation started
>Block quotation continued
>The last line of the block quotation

>Expandable block quotation started||
>Expandable block quotation continued||
>Expandable block quotation continued||
>The last line of the expandable block quotation||
```

### ⚠️ Character Escaping Rules

**IMPORTANT**: Any character with code between 1 and 126 can be escaped with a preceding `\` character.

#### Must Always Escape:
```
_   *   [   ]   (   )   ~   `   >   #   +   -   =   |   {   }   .   !
```

#### Escaping Examples:
```markdown
\.   \-   \_   \*   \[   \]   \(   \)   \~   \`   \>   \#   \+   \=   \|   \{   \}   \!
```

#### Safe Text Example:
```markdown
This is a normal sentence with escaped special characters: \. \- \_
```

---

## 📜 Markdown Legacy Formatting

**Parse Mode**: `Markdown` 

⚠️ **Legacy mode** - retained for backward compatibility only. **Not recommended** for new projects.

### ⚠️ Limited Syntax

#### Text Formatting
```markdown
*bold text*
_italic text_
```

#### Links and Mentions  
```markdown
[inline URL](http://www.example.com/)
[inline mention of a user](tg://user?id=123456789)
```

#### Code Formatting
```markdown
`inline fixed-width code`

```
pre-formatted fixed-width code block
```

```python
# Language-specific code block
def hello():
    print("Hello, World!")
```
```

### ❌ Missing Features
- No underline support
- No strikethrough support  
- No spoiler support
- No blockquote support
- **No entity nesting allowed**

### 🔒 Escaping Rules
Escape `_`, `*`, `` ` ``, `[` outside entities with preceding `\`.

---

## 📊 Comparison Table

| Feature | HTML | MarkdownV2 | Markdown (Legacy) |
|---------|------|------------|-------------------|
| **Bold** | `<b>text</b>` | `*text*` | `*text*` |
| **Italic** | `<i>text</i>` | `_text_` | `_text_` |
| **Underline** | `<u>text</u>` | `__text__` | ❌ |
| **Strikethrough** | `<s>text</s>` | `~text~` | ❌ |
| **Spoiler** | `<span class="tg-spoiler">text</span>` | `\|\|text\|\|` | ❌ |
| **Inline Code** | `<code>text</code>` | `` `text` `` | `` `text` `` |
| **Code Block** | `<pre>text</pre>` | ``` ```text``` ``` | ``` ```text``` ``` |
| **Links** | `<a href="url">text</a>` | `[text](url)` | `[text](url)` |
| **Blockquote** | `<blockquote>text</blockquote>` | `>text` | ❌ |
| **Nesting** | ✅ Full support | ✅ Full support | ❌ No nesting |
| **Escaping Complexity** | 🟢 Minimal | 🔴 High | 🟡 Medium |

---

## 🎯 Best Practices

### ✅ Recommended Approach

1. **Use HTML formatting** as primary choice
   - Most reliable parsing
   - Familiar syntax
   - Minimal escaping issues
   - Full feature support

2. **Avoid MarkdownV2** unless specifically needed
   - Complex escaping rules
   - Easy to make mistakes
   - Difficult to debug

3. **Never use Legacy Markdown** for new projects
   - Limited features
   - No nesting support
   - Deprecated status

### 🛡️ Safety Guidelines

#### HTML Safety
```javascript
// Always escape user input in HTML mode
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const userInput = "User said: <script>alert('xss')</script>";
const safeMessage = `User message: <code>${escapeHtml(userInput)}</code>`;
```

#### MarkdownV2 Safety  
```javascript
// Escape special characters for MarkdownV2
function escapeMarkdownV2(text) {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

const userInput = "Price: $19.99 (50% off!)";
const safeMessage = escapeMarkdownV2(userInput);
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: HTML Tags Not Working
**Problem**: Using Markdown syntax with HTML parse mode
```javascript
// ❌ Wrong - Markdown syntax with HTML mode
bot.sendMessage(chatId, '*bold text*', { parse_mode: 'HTML' });
```

**Solution**: Use proper HTML tags
```javascript  
// ✅ Correct - HTML syntax with HTML mode
bot.sendMessage(chatId, '<b>bold text</b>', { parse_mode: 'HTML' });
```

### Issue 2: MarkdownV2 Parsing Errors
**Problem**: Unescaped special characters
```javascript
// ❌ Wrong - Special characters not escaped
bot.sendMessage(chatId, 'Price: $19.99 (50% off!)', { parse_mode: 'MarkdownV2' });
```

**Solution**: Escape all special characters
```javascript
// ✅ Correct - All special characters escaped  
bot.sendMessage(chatId, 'Price: \\$19\\.99 \\(50\\% off\\!\\)', { parse_mode: 'MarkdownV2' });
```

### Issue 3: Nested Entities in Legacy Markdown
**Problem**: Trying to nest formatting in legacy Markdown
```javascript
// ❌ Wrong - Nesting not supported in legacy Markdown
bot.sendMessage(chatId, '*bold _italic_*', { parse_mode: 'Markdown' });
```

**Solution**: Use HTML or MarkdownV2 for nesting
```javascript
// ✅ Correct - HTML supports nesting
bot.sendMessage(chatId, '<b>bold <i>italic</i></b>', { parse_mode: 'HTML' });
```

### Issue 4: Strikethrough Not Working
**Problem**: Using wrong strikethrough syntax
```javascript
// ❌ Wrong - Markdown strikethrough syntax with HTML mode
bot.sendMessage(chatId, '~~strikethrough~~', { parse_mode: 'HTML' });
```

**Solution**: Use correct HTML tag
```javascript
// ✅ Correct - HTML strikethrough tag
bot.sendMessage(chatId, '<s>strikethrough</s>', { parse_mode: 'HTML' });
```

---

## 📚 Implementation Examples

### Complete HTML Example
```javascript
const htmlMessage = `
<b>🎉 Welcome to Our Bot!</b>

<i>Features available:</i>
• <u>File management</u>
• <s>Old feature (deprecated)</s>  
• <span class="tg-spoiler">Secret feature</span>

<blockquote>
💡 <b>Pro Tip:</b> Use <code>/help</code> for assistance
</blockquote>

<pre><code class="language-javascript">
// Code example
function greet(name) {
    return \`Hello, \${name}!\`;
}
</code></pre>

Visit our <a href="https://example.com">website</a> for more info!
`;

bot.sendMessage(chatId, htmlMessage, { parse_mode: 'HTML' });
```

### Complete MarkdownV2 Example
```javascript
const markdownV2Message = `
*🎉 Welcome to Our Bot\\!*

_Features available:_
• __File management__
• ~Old feature \\(deprecated\\)~
• ||Secret feature||

>💡 *Pro Tip:* Use \`/help\` for assistance

\`\`\`javascript
// Code example
function greet\\(name\\) \\{
    return \`Hello, \\$\\{name\\}\\!\\`;
\\}
\`\`\`

Visit our [website](https://example\\.com) for more info\\!
`;

bot.sendMessage(chatId, markdownV2Message, { parse_mode: 'MarkdownV2' });
```

---

## 🔗 Official References

- **Telegram Bot API Documentation**: https://core.telegram.org/bots/api
- **Formatting Options**: https://core.telegram.org/bots/api#formatting-options  
- **Message Entities**: https://core.telegram.org/api/entities

---

**📝 Last Updated**: January 2025  
**⚡ Status**: Up-to-date with latest Telegram Bot API
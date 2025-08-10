/**
 * Enhanced Markdown to HTML converter
 * Based on existing telegram-formatter logic + missing features
 */
class MarkdownHtmlConverter {
  convert(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Store code blocks and blockquotes to protect from HTML escaping
    const codeBlocks = [];
    const blockQuotes = [];
    let codeBlockIndex = 0;
    let blockQuoteIndex = 0;
    
    // 1. Extract and protect code blocks first
    let formatted = text.replace(/```(?:([a-zA-Z]+)\n)?([\s\S]*?)```/g, (match, language, code) => {
      const placeholder = `!!!CODE_BLOCK_${codeBlockIndex}!!!`;
      if (language) {
        codeBlocks[codeBlockIndex] = `<pre><code class="language-${language}">${this.escapeHTML(code.trim())}</code></pre>`;
      } else {
        codeBlocks[codeBlockIndex] = `<pre>${this.escapeHTML(code.trim())}</pre>`;
      }
      codeBlockIndex++;
      return placeholder;
    });
    
    // 2. Convert and protect blockquotes BEFORE escaping HTML
    formatted = formatted.replace(/^> (.+)$/gm, (match, content) => {
      const placeholder = `!!!BLOCKQUOTE_${blockQuoteIndex}!!!`;
      blockQuotes[blockQuoteIndex] = `<blockquote>${content}</blockquote>`;
      blockQuoteIndex++;
      return placeholder;
    });
    
    // 3. Escape HTML characters (prevent XSS)
    formatted = this.escapeHTML(formatted);
    
    // 4. Convert markdown (reuse proven telegram-formatter logic) 
    formatted = formatted
      .replace(/^# (.*$)/gim, '<b>📋 $1</b>')
      .replace(/^## (.*$)/gim, '<b>🔸 $1</b>')
      .replace(/^### (.*$)/gim, '<b>🔸 $1</b>')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*\s][^*]*[^*\s])\*/g, '<i>$1</i>')
      .replace(/\*([^*\s])\*/g, '<i>$1</i>')
      .replace(/~~(.*?)~~/g, '<s>$1</s>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^\d+\.\s+/gm, '• ')
      .replace(/\n{4,}/g, '\n\n\n');
    
    // 5. Restore protected elements
    codeBlocks.forEach((codeBlock, index) => {
      formatted = formatted.replace(`!!!CODE_BLOCK_${index}!!!`, codeBlock);
    });
    
    blockQuotes.forEach((blockQuote, index) => {
      formatted = formatted.replace(`!!!BLOCKQUOTE_${index}!!!`, blockQuote);
    });
    
    return formatted;
  }
  
  // NEW: Handle ```code blocks``` (missing from current formatter)
  convertCodeBlocks(text) {
    return text.replace(/```(?:([a-zA-Z]+)\n)?([\s\S]*?)```/g, (match, language, code) => {
      const trimmedCode = code.trim();
      if (language) {
        return `<pre><code class="language-${language}">${this.escapeHTML(trimmedCode)}</code></pre>`;
      } else {
        return `<pre>${this.escapeHTML(trimmedCode)}</pre>`;
      }
    });
  }
  
  // Reuse existing escapeHTML logic from telegram-formatter
  escapeHTML(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

module.exports = MarkdownHtmlConverter;
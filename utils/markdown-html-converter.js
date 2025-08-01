/**
 * Enhanced Markdown to HTML converter
 * Based on existing telegram-formatter logic + missing features
 */
class MarkdownHtmlConverter {
  convert(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Store code blocks to protect from markdown processing
    const codeBlocks = [];
    let codeBlockIndex = 0;
    
    // 1. Extract and protect code blocks first
    let formatted = text.replace(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/g, (match, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`;
      codeBlocks[codeBlockIndex] = `<pre>${this.escapeHTML(code.trim())}</pre>`;
      codeBlockIndex++;
      return placeholder;
    });
    
    // 2. Escape HTML characters (prevent XSS)
    formatted = this.escapeHTML(formatted);
    
    // 3. Convert markdown (reuse proven telegram-formatter logic) 
    formatted = formatted
      .replace(/^# (.*$)/gim, '<b>📋 $1</b>')
      .replace(/^## (.*$)/gim, '<b>🔸 $1</b>')
      .replace(/^### (.*$)/gim, '<b>🔸 $1</b>')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*\s][^*]*[^*\s])\*/g, '<i>$1</i>')
      .replace(/\*([^*\s])\*/g, '<i>$1</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^\d+\.\s+/gm, '• ')
      .replace(/\n{4,}/g, '\n\n\n');
    
    // 4. Restore protected code blocks
    codeBlocks.forEach((codeBlock, index) => {
      formatted = formatted.replace(`__CODE_BLOCK_${index}__`, codeBlock);
    });
    
    return formatted;
  }
  
  // NEW: Handle ```code blocks``` (missing from current formatter)
  convertCodeBlocks(text) {
    return text.replace(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/g, (match, code) => {
      const trimmedCode = code.trim();
      return `<pre>${this.escapeHTML(trimmedCode)}</pre>`;
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
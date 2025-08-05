/**
 * Input Summary Service
 * Generates intelligent summaries of user input using Claude API
 */

const ClaudeStreamProcessor = require('./claude-stream-processor');
const os = require('os');
const path = require('path');
const fs = require('fs');

class InputSummaryService {
  constructor() {
    // Create temporary directory for Claude to avoid loading CLAUDE.md
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-summary-'));
    
    this.processor = new ClaudeStreamProcessor({
      model: 'sonnet', // Use sonnet model for summaries
      verbose: false,
      workingDirectory: this.tempDir // Run in temp directory
    });
  }

  /**
   * Generate summary of user input using Claude
   * @param {string} userInput - The user's input text
   * @returns {Promise<string>} - Generated summary
   */
  async generateSummary(userInput) {
    const prompt = this.createSummaryPrompt(userInput);
    
    try {
      console.log('[InputSummary] Generating summary for user input...');
      
      // Start new conversation with the summary prompt
      await this.processor.startNewConversation(prompt);
      
      return new Promise((resolve) => {
        let fullResponse = '';
        let hasError = false;
        
        // Collect the response text
        this.processor.on('output', (data) => {
          if (data.type === 'text') {
            fullResponse += data.content;
          }
        });
        
        this.processor.on('error', (error) => {
          console.error('[InputSummary] Claude process error:', error);
          hasError = true;
          resolve(this.fallbackSummary(userInput));
        });
        
        this.processor.on('exit', (code) => {
          if (hasError) return; // Already handled
          
          if (code === 0 && fullResponse.trim()) {
            // Try to parse JSON response
            try {
              const summaryData = JSON.parse(fullResponse);
              const summary = summaryData.summary || summaryData.content || fullResponse;
              console.log('[InputSummary] Summary generated successfully');
              resolve(summary);
            } catch {
              // Use raw response if not JSON
              console.log('[InputSummary] Using raw response as summary');
              resolve(fullResponse.trim());
            }
          } else {
            console.warn('[InputSummary] Claude process failed, using fallback');
            resolve(this.fallbackSummary(userInput));
          }
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (!hasError) {
            console.warn('[InputSummary] Timeout, using fallback summary');
            resolve(this.fallbackSummary(userInput));
          }
        }, 30000);
      });
      
    } catch (error) {
      console.error('[InputSummary] Error generating summary:', error.message);
      return this.fallbackSummary(userInput);
    }
  }

  /**
   * Create prompt for Claude to generate summary
   * @param {string} userInput - The user's input text
   * @returns {string} - Formatted prompt
   */
  createSummaryPrompt(userInput) {
    return `You are helping a Telegram bot create summaries of user messages. Create a concise summary of what the user is asking for.

IMPORTANT RULES:
- Write the summary in the SAME LANGUAGE as the user's input
- Write from FIRST PERSON perspective (as if the user is describing their own request)
- Do NOT use third person phrases like "User wants", "User needs", "User is asking"
- Be concise but capture the main request and key technical details
- Do NOT add prefixes like "Claude Summaries:" or similar

User Input:
\`\`\`
${userInput}
\`\`\`

Examples:
- If user asks "Fix my React component" → "Fix my React component"  
- If user asks "помоги с багом в API" → "помоги с багом в API"
- If user asks "Add user authentication system" → "Add user authentication system"

Respond in JSON format:
{
  "summary": "Your summary here"
}`;
  }

  /**
   * Fallback summary when Claude API fails
   * @param {string} userInput - The user's input text
   * @returns {string} - Simple fallback summary
   */
  fallbackSummary(userInput) {
    // Check if message has multiple lines first
    const lines = userInput.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length > 1) {
      // Multi-line message - return first line
      const firstLine = lines[0];
      return firstLine.length > 200 ? firstLine.substring(0, 200) : firstLine;
    }
    
    // Single line message - check word count and length
    const words = userInput.split(/\s+/);
    const length = words.length;
    
    if (length <= 10 && userInput.length <= 200) {
      return userInput; // Don't truncate short messages
    } else {
      // Long single line - truncate to 200 chars
      return userInput.length > 200 ? userInput.substring(0, 200) : userInput;
    }
  }

  /**
   * Clean up temporary directory
   */
  cleanup() {
    try {
      if (this.tempDir && fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        console.log('[InputSummary] Cleaned up temporary directory');
      }
    } catch (error) {
      console.error('[InputSummary] Failed to cleanup temp directory:', error.message);
    }
  }
}

module.exports = InputSummaryService;
/**
 * Simple Typing Indicator for Telegram Bot
 * Shows typing action during Claude processing
 */
class ActivityIndicator {
  constructor(bot) {
    this.bot = bot;
    this.activeIndicators = new Map();
  }

  async start(chatId) {
    try {
      // Start typing indicator immediately
      await this.bot.sendChatAction(chatId, 'typing');
      
      // Continue typing indicator every 4 seconds to stay within 5s limit
      const typingInterval = setInterval(async () => {
        try {
          await this.bot.sendChatAction(chatId, 'typing');
        } catch (error) {
          console.error(`[ActivityIndicator] Typing error for chat ${chatId}:`, error.message);
        }
      }, 4000);

      // Store for cleanup
      this.activeIndicators.set(chatId, {
        typingInterval,
        startTime: Date.now()
      });

      console.log(`[ActivityIndicator] Started typing for chat ${chatId}`);
    } catch (error) {
      console.error(`[ActivityIndicator] Failed to start typing for chat ${chatId}:`, error.message);
    }
  }

  async stop(chatId) {
    const indicator = this.activeIndicators.get(chatId);
    if (!indicator) {
      return; // Already stopped or never started
    }

    // Clear typing interval
    clearInterval(indicator.typingInterval);

    // Calculate processing time
    const processingTime = Date.now() - indicator.startTime;
    console.log(`[ActivityIndicator] Stopped typing for chat ${chatId}, duration: ${processingTime}ms`);

    this.activeIndicators.delete(chatId);
  }

  // Emergency cleanup - stops all indicators
  cleanup() {
    console.log(`[ActivityIndicator] Emergency cleanup - stopping ${this.activeIndicators.size} typing indicators`);
    for (const [, indicator] of this.activeIndicators) {
      clearInterval(indicator.typingInterval);
    }
    this.activeIndicators.clear();
  }

  // Get stats for debugging
  getStats() {
    return {
      activeIndicators: this.activeIndicators.size,
      indicators: Array.from(this.activeIndicators.keys())
    };
  }
}

module.exports = ActivityIndicator;
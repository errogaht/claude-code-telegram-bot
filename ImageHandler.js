const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

/**
 * Image Handler - Telegram image processing and management
 * Handles image downloads, temp file management, and Claude integration
 */
class ImageHandler {
  constructor(bot, sessionManager, activityIndicator) {
    this.bot = bot;
    this.sessionManager = sessionManager;
    this.activityIndicator = activityIndicator;
  }

  /**
   * Handle incoming photo message with optional caption
   */
  async handlePhotoMessage(msg, processUserMessageCallback) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const photos = msg.photo;
    const caption = msg.caption || '';

    console.log(`[User ${userId}] Photo message with caption: "${caption}"`);

    let imagePath = null;
    try {
      // Get the largest photo (best quality)
      const photo = photos[photos.length - 1];
      console.log(`[User ${userId}] Selected photo: ${photo.file_id} (${photo.width}x${photo.height})`);

      // Download the image to temp directory
      imagePath = await this.downloadImage(photo.file_id, userId);
      console.log(`[User ${userId}] Downloaded image to temp: ${imagePath}`);

      // Create message for Claude with image path and caption
      let message = '';
      if (caption.trim()) {
        message = `${caption.trim()}\n\nImage file: ${imagePath}`;
      } else {
        message = `Please analyze this image: ${imagePath}`;
      }

      console.log(`[User ${userId}] Sending to Claude: "${message}"`);

      // Process message with temp file cleanup tracking
      await this.processImageMessage(message, userId, chatId, imagePath, processUserMessageCallback);

    } catch (error) {
      console.error(`[User ${userId}] Error processing photo:`, error);
      
      // Clean up temp file on error
      if (imagePath && fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
          console.log(`[User ${userId}] Cleaned up temp image on error: ${imagePath}`);
        } catch (cleanupError) {
          console.error(`[User ${userId}] Failed to cleanup temp image:`, cleanupError);
        }
      }
      
      await this.sessionManager.sendError(chatId, error);
    }
  }

  /**
   * Download image from Telegram servers to temp directory
   */
  async downloadImage(fileId, userId) {
    try {
      // Get file info from Telegram
      const file = await this.bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;
      
      // Use system temp directory
      const tempDir = os.tmpdir();
      
      // Generate unique filename in temp directory
      const timestamp = Date.now();
      const extension = path.extname(file.file_path) || '.jpg';
      const filename = `telegram_image_${userId}_${timestamp}${extension}`;
      const imagePath = path.join(tempDir, filename);

      console.log(`Downloading image from: ${fileUrl}`);
      console.log(`Saving to temp file: ${imagePath}`);

      // Download the file
      await this.downloadFile(fileUrl, imagePath);

      return imagePath;
    } catch (error) {
      console.error('Error downloading image:', error);
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  /**
   * Download file from URL to local path
   */
  downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (error) => {
          fs.unlink(filePath, () => {}); // Delete partial file
          reject(error);
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Process image message with temp file cleanup tracking
   */
  async processImageMessage(text, userId, chatId, tempFilePath, processUserMessageCallback) {
    // Get or create user session first
    let session = this.sessionManager.getUserSession(userId);
    
    if (!session) {
      // First message - create new session
      console.log(`[ImageHandler] Creating new session for user ${userId}`);
      session = await this.sessionManager.createUserSession(userId, chatId);
      
      // Send session init message
      const sessionInitText = `🚀 **New Session Started**\n\n` +
        `Ready to process your requests with Claude CLI stream-json mode.\n\n` +
        `🔄 Session continuity with ID tracking\n` +
        `🛡️ Auto-permissions enabled\n` +
        `📋 Live TodoWrite updates active\n` +
        `📸 Image analysis ready\n\n` +
        `💡 Use /end to close this session\n` +
        `📚 Use /sessions to view history`;
      
      await this.sessionManager.safeSendMessage(chatId, sessionInitText);
    }
    
    // Store temp file path in session for cleanup after Claude completes
    session.tempFilePath = tempFilePath;
    console.log(`[User ${userId}] Stored temp file path in session: ${tempFilePath}`);
    
    try {
      // Use the callback to process the message
      await processUserMessageCallback(text, userId, chatId);
      
      // Note: Temp file will be cleaned up in SessionManager when Claude completes
      
    } catch (error) {
      // Clean up temp file immediately on error during setup
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`[User ${userId}] Cleaned up temp image on setup error: ${tempFilePath}`);
        } catch (cleanupError) {
          console.error(`[User ${userId}] Failed to cleanup temp image:`, cleanupError);
        }
      }
      
      // Clear temp file path from session
      if (session) {
        session.tempFilePath = null;
      }
      
      // Re-throw the error to maintain error handling flow
      throw error;
    }
  }

  /**
   * Clean up temporary file (called by SessionManager)
   */
  static cleanupTempFile(session, userId) {
    if (session && session.tempFilePath) {
      try {
        if (fs.existsSync(session.tempFilePath)) {
          fs.unlinkSync(session.tempFilePath);
          console.log(`[User ${userId}] Cleaned up temp image after Claude completion: ${session.tempFilePath}`);
        }
      } catch (error) {
        console.error(`[User ${userId}] Failed to cleanup temp image:`, error);
      }
      
      // Clear temp file path from session
      session.tempFilePath = null;
    }
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return {
      // Could add statistics here like processed images count, etc.
      handlerType: 'ImageHandler',
      tempDirectory: os.tmpdir()
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Could clean up any pending temp files here if needed
    console.log('🧹 ImageHandler cleanup completed');
  }
}

module.exports = ImageHandler;
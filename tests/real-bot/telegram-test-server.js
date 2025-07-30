/**
 * Telegram Test API Server Configuration
 * Sets up a local Telegram Bot API server for real bot testing
 */

class TelegramTestServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 8082,
      host: 'localhost',
      logLevel: 'info',
      ...options
    };
    this.server = null;
    this.isStarted = false;
    this.startTimeout = null; // Track the timeout so we can clear it
    this.isShuttingDown = false; // Track shutdown state
  }

  async start() {
    if (this.isStarted) {
      console.log('Telegram test server already running');
      return;
    }

    if (this.isShuttingDown) {
      console.log('Server is shutting down, waiting before restart...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.isShuttingDown = false;
    }

    return new Promise((resolve, reject) => {
      console.log(`Starting telegram-test-api server on ${this.options.host}:${this.options.port}`);
      
      try {
        // Use telegram-test-api programmatically
        const TelegramServer = require('telegram-test-api');
        
        // Create server instance
        this.server = new TelegramServer({
          port: this.options.port,
          host: this.options.host,
          storage: 'RAM', // Use RAM storage for tests
          storeTimeout: 60000 // 1 minute timeout
        });

        // Start the server
        this.server.start().then(() => {
          // Clear timeout if server started successfully
          if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
          }
          
          this.isStarted = true;
          console.log('✅ Telegram test server started successfully');
          resolve();
        }).catch((error) => {
          // Clear timeout on error
          if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
          }
          
          console.error('Failed to start telegram-test-api server:', error);
          reject(error);
        });

      } catch (error) {
        console.error('Error creating telegram-test-api server:', error);
        reject(error);
      }

      // Timeout after 10 seconds with proper cleanup
      this.startTimeout = setTimeout(() => {
        if (!this.isStarted && !this.isShuttingDown) {
          console.error('Timeout starting telegram-test-api server');
          this.startTimeout = null;
          this.stop();
          reject(new Error('Timeout starting server'));
        }
      }, 10000);
    });
  }

  async stop() {
    this.isShuttingDown = true;
    
    // Clear any pending startup timeout
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
    
    if (this.server && this.isStarted) {
      console.log('Stopping telegram test server...');
      try {
        await this.server.stop();
        console.log('✅ Telegram test server stopped');
      } catch (error) {
        console.warn('Warning stopping telegram test server:', error.message);
      }
    }
    
    this.isStarted = false;
    this.server = null;
    
    // Wait longer to ensure port is fully released
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.isShuttingDown = false;
  }

  getApiUrl() {
    return `http://${this.options.host}:${this.options.port}`;
  }

  getWebUrl() {
    return `${this.getApiUrl()}/`;
  }

  // Create a test bot token for use with the test server
  createTestToken(botId = '123456789') {
    return `${botId}:TEST-TOKEN-FOR-INTEGRATION-TESTING`;
  }

  // Get server instance for direct access if needed
  getServer() {
    return this.server;
  }
}

module.exports = TelegramTestServer;
const express = require('express');
const net = require('net');
const ngrok = require('@ngrok/ngrok');
const WebServerSecurity = require('./WebServerSecurity');

/**
 * Base Web Server Class
 * Provides a simple foundation for creating secure web pages in the bot ecosystem
 * Automatically includes security, ngrok tunneling, and multi-bot port management
 */
class BaseWebServer {
    constructor(options = {}) {
        this.botInstance = options.botInstance || 'bot1';
        this.ngrokAuthToken = options.ngrokAuthToken || null;
        this.security = options.security || new WebServerSecurity(this.botInstance);
        this.customRoutes = options.routes || [];
        
        // Server state
        this.app = express();
        this.server = null;
        this.ngrokListener = null;
        this.port = null;
        this.isStarting = false;
        this.isStarted = false;
        
        console.log(`[${this.botInstance}] BaseWebServer initialized for new web page`);
        this.setupCore();
    }
    
    /**
     * Set up core middleware and security
     */
    setupCore() {
        // Apply security middleware to all routes
        this.app.use(this.security.getMiddleware());
        
        // Basic JSON parsing for API routes
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Serve static files from multiple possible directories
        this.app.use('/static', express.static('public'));
        this.app.use('/assets', express.static('assets'));
        
        // Set up custom routes
        this.setupRoutes();
    }
    
    /**
     * Override this method to add your custom routes
     * All routes are automatically protected by security middleware
     */
    setupRoutes() {
        // Default route for health check
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'OK', 
                server: 'BaseWebServer',
                botInstance: this.botInstance,
                timestamp: new Date().toISOString()
            });
        });
        
        // Add any custom routes provided in constructor
        this.customRoutes.forEach(route => {
            const { method, path, handler } = route;
            this.app[method.toLowerCase()](path, handler);
        });
    }
    
    /**
     * Quick method to add new routes after initialization
     */
    addRoute(method, path, handler) {
        this.app[method.toLowerCase()](path, handler);
        console.log(`[${this.botInstance}] Added route: ${method.toUpperCase()} ${path}`);
    }
    
    /**
     * Get secure URL for internal linking
     */
    getSecureUrl(path, queryParams = {}) {
        return this.security.secureUrl(path, queryParams);
    }
    
    /**
     * Get secure external URL (for Telegram buttons, etc.)
     */
    getSecureExternalUrl(path = '/', queryParams = {}) {
        const baseUrl = this.getBaseUrl();
        return baseUrl ? this.security.secureExternalUrl(baseUrl, path, queryParams) : null;
    }
    
    /**
     * Get base URL (ngrok or localhost)
     */
    getBaseUrl() {
        if (this.ngrokListener && this.isStarted) {
            return this.ngrokListener.url();
        }
        return this.server ? `http://localhost:${this.port}` : null;
    }
    
    /**
     * Generate a simple HTML page template with security integration
     */
    generateBasePage(title, content, styles = '') {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 20px; background: #f5f5f5; 
        }
        .container { 
            max-width: 1200px; margin: 0 auto; background: white; 
            border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .header { border-bottom: 1px solid #e1e1e1; padding-bottom: 15px; margin-bottom: 20px; }
        .secure-link { color: #007cba; text-decoration: none; }
        .secure-link:hover { text-decoration: underline; }
        ${styles}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
        </div>
        ${content}
    </div>
</body>
</html>`;
    }
    
    /**
     * Find available port for this bot instance
     */
    async findAvailablePort() {
        const botPortMap = {
            'bot1': 3847, 'bot2': 3848, 'bot3': 3849, 'bot4': 3850
        };
        
        let startPort = botPortMap[this.botInstance] || 3847;
        
        // Try ports from base + 100 to avoid conflicts with FileBrowserServer
        startPort += 100;
        
        for (let i = 0; i < 50; i++) {
            const port = startPort + i;
            if (await this.isPortAvailable(port)) {
                console.log(`[${this.botInstance}] Found available port: ${port}`);
                return port;
            }
        }
        
        throw new Error(`Unable to find available port for ${this.botInstance} web server`);
    }
    
    /**
     * Check if port is available
     */
    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.listen(port, 'localhost', (err) => {
                if (err) {
                    resolve(false);
                } else {
                    server.once('close', () => resolve(true));
                    server.close();
                }
            });
            server.on('error', () => resolve(false));
        });
    }
    
    /**
     * Start the web server with ngrok tunneling
     */
    async start() {
        if (this.isStarting || this.isStarted) {
            console.log(`[${this.botInstance}] Web server already running`);
            return this.getSecureExternalUrl();
        }
        
        try {
            this.isStarting = true;
            console.log(`[${this.botInstance}] Starting web server...`);
            
            // Find available port
            if (!this.port) {
                this.port = await this.findAvailablePort();
            }
            
            // Start HTTP server
            this.server = this.app.listen(this.port, 'localhost', () => {
                console.log(`[${this.botInstance}] Web server running on http://localhost:${this.port}`);
            });
            
            // Try to start ngrok tunnel
            try {
                const ngrokOptions = { addr: this.port };
                
                if (this.ngrokAuthToken) {
                    ngrokOptions.authtoken = this.ngrokAuthToken;
                } else {
                    ngrokOptions.authtoken_from_env = true;
                }
                
                this.ngrokListener = await ngrok.forward(ngrokOptions);
                console.log(`[${this.botInstance}] 🌐 Public URL: ${this.ngrokListener.url()}`);
                
            } catch (ngrokError) {
                console.log(`[${this.botInstance}] ⚠️ Ngrok failed (local access only): ${ngrokError.message}`);
            }
            
            this.isStarted = true;
            this.isStarting = false;
            
            return this.getSecureExternalUrl();
            
        } catch (error) {
            this.isStarting = false;
            console.error(`[${this.botInstance}] Failed to start web server:`, error);
            throw error;
        }
    }
    
    /**
     * Stop the web server
     */
    async stop() {
        try {
            console.log(`[${this.botInstance}] Stopping web server...`);
            
            if (this.ngrokListener) {
                await this.ngrokListener.close();
                this.ngrokListener = null;
            }
            
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                this.server = null;
            }
            
            this.isStarted = false;
            this.isStarting = false;
            this.port = null;
            
        } catch (error) {
            console.error(`[${this.botInstance}] Error stopping web server:`, error);
            throw error;
        }
    }
}

module.exports = BaseWebServer;
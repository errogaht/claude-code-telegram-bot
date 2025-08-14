const crypto = require('crypto');

/**
 * Generic Web Server Security System
 * Provides token-based authentication middleware for any Express web server
 * One-time setup, automatic protection for all routes
 */
class WebServerSecurity {
    constructor(botInstance = 'bot1') {
        this.botInstance = botInstance;
        this.securityToken = this.generateSecurityToken();
        this.excludedPaths = ['/static', '/assets', '/public']; // Static assets don't need tokens
        
        console.log(`[${this.botInstance}] 🔐 WebServerSecurity initialized with token authentication`);
    }

    /**
     * Generate a cryptographically secure token
     */
    generateSecurityToken() {
        const token = crypto.randomBytes(32).toString('hex');
        console.log(`[${this.botInstance}] 🔑 Generated security token (${token.length} chars)`);
        return token;
    }

    /**
     * Express middleware for token validation
     * Apply this to your Express app to protect all routes automatically
     */
    getMiddleware() {
        return (req, res, next) => {
            // Skip token validation for excluded paths (static assets, etc.)
            if (this.isPathExcluded(req.path)) {
                return next();
            }

            const providedToken = req.query.token;
            const isValidToken = providedToken === this.securityToken;

            if (!isValidToken) {
                console.log(`[${this.botInstance}] 🚫 Unauthorized access: ${req.ip} -> ${req.path} (${providedToken ? 'invalid token' : 'missing token'})`);
                return res.status(403).send(this.generateSecurityErrorPage());
            }

            console.log(`[${this.botInstance}] ✅ Authorized access: ${req.ip} -> ${req.path}`);
            next();
        };
    }

    /**
     * Check if a path should be excluded from token validation
     */
    isPathExcluded(path) {
        return this.excludedPaths.some(excluded => path.startsWith(excluded));
    }

    /**
     * Generate secure URL with token for any path
     * Use this in your HTML templates to create secure links
     */
    secureUrl(path, queryParams = {}) {
        queryParams.token = this.securityToken;
        const params = new URLSearchParams(queryParams).toString();
        return `${path}?${params}`;
    }

    /**
     * Generate secure external URL (for ngrok public URLs)
     * Use this when providing URLs to Telegram bot buttons
     */
    secureExternalUrl(baseUrl, path = '/', queryParams = {}) {
        queryParams.token = this.securityToken;
        const params = new URLSearchParams(queryParams).toString();
        return `${baseUrl}${path}?${params}`;
    }

    /**
     * Get current security token (for external systems)
     */
    getToken() {
        return this.securityToken;
    }

    /**
     * Regenerate security token (invalidates all existing links)
     */
    regenerateToken() {
        const oldToken = this.securityToken;
        this.securityToken = this.generateSecurityToken();
        console.log(`[${this.botInstance}] 🔄 Security token regenerated (old: ${oldToken.slice(0, 8)}..., new: ${this.securityToken.slice(0, 8)}...)`);
        return this.securityToken;
    }

    /**
     * Add paths to exclude from token validation
     */
    excludePaths(...paths) {
        this.excludedPaths.push(...paths);
        console.log(`[${this.botInstance}] ➕ Added excluded paths: ${paths.join(', ')}`);
    }

    /**
     * Generate professional security error page
     */
    generateSecurityErrorPage() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔒 Access Denied - Secure Web Server</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            padding: 20px; 
        }
        .container { 
            background: white; 
            border-radius: 16px; 
            padding: 40px; 
            text-align: center; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1); 
            max-width: 600px; 
            width: 100%;
        }
        .security-icon { 
            font-size: 5rem; 
            margin-bottom: 24px; 
            display: block;
        }
        .error-title { 
            color: #dc3545; 
            font-size: 2rem; 
            font-weight: 700; 
            margin-bottom: 16px; 
        }
        .error-subtitle { 
            color: #6c757d; 
            font-size: 1.1rem; 
            margin-bottom: 32px; 
        }
        .security-notice { 
            background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); 
            padding: 24px; 
            border-radius: 12px; 
            border-left: 4px solid #ffc107; 
            text-align: left; 
            margin-bottom: 32px;
        }
        .security-notice h3 { 
            color: #856404; 
            font-size: 1.2rem; 
            margin-bottom: 12px; 
        }
        .security-notice p { 
            color: #664d03; 
            line-height: 1.6; 
            margin-bottom: 8px; 
        }
        .instructions { 
            color: #495057; 
            line-height: 1.6; 
            font-size: 1rem;
        }
        .code { 
            background: #f8f9fa; 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-family: 'Monaco', 'Courier New', monospace; 
            color: #e83e8c; 
        }
        .footer { 
            margin-top: 32px; 
            color: #6c757d; 
            font-size: 0.9rem; 
        }
        @media (max-width: 768px) {
            .container { padding: 24px; }
            .error-title { font-size: 1.5rem; }
            .security-icon { font-size: 3.5rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <span class="security-icon">🔒</span>
        <h1 class="error-title">Access Denied</h1>
        <p class="error-subtitle">This page requires secure authentication</p>
        
        <div class="security-notice">
            <h3>🛡️ Security Protection Active</h3>
            <p>This web server uses token-based authentication to protect sensitive content.</p>
            <p>All requests must include a valid security token to access protected resources.</p>
            <p><strong>Unauthorized access attempts are logged and monitored.</strong></p>
        </div>
        
        <div class="instructions">
            <p>If you're the authorized user:</p>
            <ol style="text-align: left; margin: 16px 0; padding-left: 20px;">
                <li>Use the official Telegram bot to get secure access links</li>
                <li>Run the <span class="code">/files</span> command to access the file browser</li>
                <li>Access other mini-apps through official bot commands</li>
            </ol>
        </div>
        
        <div class="footer">
            <p>🤖 Powered by Telegram Bot Security System</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generate a lightweight error response (for API endpoints)
     */
    generateApiErrorResponse() {
        return {
            error: 'Access Denied',
            message: 'Valid security token required',
            code: 403,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Utility method to create secure HTML links
     * Use this in your templates: ${security.link('/path', 'Link Text', {param: 'value'})}
     */
    link(path, text, queryParams = {}, className = '') {
        const url = this.secureUrl(path, queryParams);
        const classAttr = className ? ` class="${className}"` : '';
        return `<a href="${url}"${classAttr}>${text}</a>`;
    }

    /**
     * Utility method for secure form actions
     */
    formAction(action, queryParams = {}) {
        return this.secureUrl(action, queryParams);
    }

    /**
     * Get security stats/info
     */
    getSecurityInfo() {
        return {
            botInstance: this.botInstance,
            tokenLength: this.securityToken.length,
            tokenPreview: this.securityToken.slice(0, 8) + '...',
            excludedPaths: [...this.excludedPaths],
            active: true
        };
    }
}

module.exports = WebServerSecurity;
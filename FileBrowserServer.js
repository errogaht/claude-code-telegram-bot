const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const ngrok = require('@ngrok/ngrok');
const net = require('net');
const WebServerSecurity = require('./WebServerSecurity');
const SmartPortResolver = require('./SmartPortResolver');

class FileBrowserServer {
    constructor(projectRoot = process.cwd(), botInstance = 'bot1', ngrokAuthToken = null, security = null) {
        this.app = express();
        this.server = null;
        this.ngrokListener = null;
        this.projectRoot = projectRoot;
        this.botInstance = botInstance;
        this.ngrokAuthToken = ngrokAuthToken;
        this.port = null; // Will be dynamically allocated
        this.isStarting = false;
        this.isStarted = false;
        
        // Use provided security system or create new one
        this.security = security || new WebServerSecurity(botInstance);
        
        // Smart port resolver with large random range (8000-9999)
        this.portResolver = new SmartPortResolver({
            minPort: 8000,
            maxPort: 9999,
            maxAttempts: 50
        });
        
        this.setupRoutes();
    }

    setupRoutes() {
        // Apply generic security middleware (protects all routes automatically)
        this.app.use(this.security.getMiddleware());

        // Serve static assets with proper headers
        this.app.use('/static', express.static(path.join(__dirname, 'public')));
        
        // Main file browser page
        this.app.get('/', async (req, res) => {
            const currentPath = req.query.path || '';
            const fullPath = path.join(this.projectRoot, currentPath);
            
            try {
                await this.validatePath(fullPath);
                const content = await this.generateFileList(fullPath, currentPath);
                res.send(this.generateHTML(content, currentPath));
            } catch (error) {
                res.status(404).send(this.generateErrorHTML(error.message));
            }
        });

        // File content viewer
        this.app.get('/view', async (req, res) => {
            const filePath = req.query.path;
            if (!filePath) {
                return res.status(400).send(this.generateErrorHTML('File path required'));
            }

            const fullPath = path.join(this.projectRoot, filePath);
            
            try {
                await this.validatePath(fullPath);
                const stats = await fs.stat(fullPath);
                
                if (stats.isDirectory()) {
                    return res.redirect(`/?path=${encodeURIComponent(filePath)}`);
                }

                const content = await fs.readFile(fullPath, 'utf8');
                const fileExtension = path.extname(fullPath).toLowerCase();
                
                res.send(this.generateFileViewHTML(content, filePath, fileExtension));
            } catch (error) {
                res.status(404).send(this.generateErrorHTML(error.message));
            }
        });
    }

    async validatePath(fullPath) {
        // Security: Ensure path is within project directory
        const resolvedPath = path.resolve(fullPath);
        const resolvedRoot = path.resolve(this.projectRoot);
        
        if (!resolvedPath.startsWith(resolvedRoot)) {
            throw new Error('Access denied: Path outside project directory');
        }

        // Check if path exists
        await fs.access(resolvedPath);
    }

    async generateFileList(dirPath, currentPath) {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        const files = [];
        const directories = [];

        for (const item of items) {
            const itemPath = path.join(currentPath, item.name);
            const fullItemPath = path.join(dirPath, item.name);
            
            // Skip hidden files and node_modules
            if (item.name.startsWith('.') || item.name === 'node_modules') {
                continue;
            }

            try {
                const stats = await fs.stat(fullItemPath);
                const size = stats.isFile() ? this.formatFileSize(stats.size) : '-';
                const modified = stats.mtime.toLocaleDateString();

                if (item.isDirectory()) {
                    directories.push({
                        name: item.name,
                        path: itemPath,
                        type: 'directory',
                        size,
                        modified
                    });
                } else {
                    files.push({
                        name: item.name,
                        path: itemPath,
                        type: 'file',
                        size,
                        modified
                    });
                }
            } catch (error) {
                // Skip files we can't access
                continue;
            }
        }

        return { directories, files, currentPath };
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }


    generateHTML({ directories, files, currentPath }) {
        const breadcrumbs = this.generateBreadcrumbs(currentPath);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Project File Browser</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 10px; background: #f5f5f5; 
            min-height: 100vh; /* Full screen height */
            height: 100vh; /* Full screen height */
            overflow-x: hidden; /* Prevent horizontal scroll */
        }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 1px solid #e1e1e1; padding-bottom: 15px; margin-bottom: 20px; }
        .breadcrumbs { color: #666; margin-bottom: 10px; }
        .breadcrumbs a { color: #007cba; text-decoration: none; }
        .breadcrumbs a:hover { text-decoration: underline; }
        .file-list { border-collapse: collapse; width: 100%; }
        .file-list th, .file-list td { padding: 12px; text-align: left; border-bottom: 1px solid #e1e1e1; }
        .file-list th { background: #f8f9fa; font-weight: 600; }
        .file-item { display: flex; align-items: center; }
        .file-icon { width: 20px; height: 20px; margin-right: 10px; }
        .file-name { color: #333; text-decoration: none; }
        .file-name:hover { color: #007cba; }
        .directory { color: #007cba; font-weight: 500; }
        .back-link { display: inline-block; margin-bottom: 15px; color: #666; text-decoration: none; }
        .back-link:hover { color: #007cba; }
        @media (max-width: 768px) { 
            .container { padding: 10px; margin: 10px; }
            .file-list { font-size: 14px; }
            .file-list td, .file-list th { padding: 8px 5px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📁 Project File Browser</h1>
            <div class="breadcrumbs">${breadcrumbs}</div>
            ${currentPath ? `<a href="${this.security.secureUrl('/', { path: path.dirname(currentPath) })}" class="back-link">← Back</a>` : ''}
        </div>
        
        <table class="file-list">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Modified</th>
                </tr>
            </thead>
            <tbody>
                ${directories.map(dir => `
                    <tr>
                        <td>
                            <div class="file-item">
                                <span class="file-icon">📁</span>
                                <a href="${this.security.secureUrl('/', { path: dir.path })}" class="file-name directory">${dir.name}/</a>
                            </div>
                        </td>
                        <td>${dir.size}</td>
                        <td>${dir.modified}</td>
                    </tr>
                `).join('')}
                ${files.map(file => `
                    <tr>
                        <td>
                            <div class="file-item">
                                <span class="file-icon">${this.getFileIcon(file.name)}</span>
                                <a href="${this.security.secureUrl('/view', { path: file.path })}" class="file-name">${file.name}</a>
                            </div>
                        </td>
                        <td>${file.size}</td>
                        <td>${file.modified}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>`;
    }

    generateBreadcrumbs(currentPath) {
        if (!currentPath) return 'Project Root';
        
        const parts = currentPath.split(path.sep).filter(part => part);
        let breadcrumbs = `<a href="${this.security.secureUrl('/', {})}">Project Root</a>`;
        let buildPath = '';
        
        for (const part of parts) {
            buildPath = path.join(buildPath, part);
            breadcrumbs += ` / <a href="${this.security.secureUrl('/', { path: buildPath })}">${part}</a>`;
        }
        
        return breadcrumbs;
    }

    getFileIcon(filename) {
        const ext = path.extname(filename).toLowerCase();
        const iconMap = {
            '.js': '📄', '.json': '📄', '.md': '📝', '.txt': '📄',
            '.html': '🌐', '.css': '🎨', '.png': '🖼️', '.jpg': '🖼️',
            '.jpeg': '🖼️', '.gif': '🖼️', '.pdf': '📕', '.zip': '📦',
            '.log': '📊', '.yml': '⚙️', '.yaml': '⚙️', '.xml': '📄'
        };
        return iconMap[ext] || '📄';
    }

    generateFileViewHTML(content, filePath, extension) {
        const language = this.getLanguageForHighlighting(extension);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>📄 ${path.basename(filePath)} - File Browser</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/themes/prism.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/line-numbers/prism-line-numbers.min.css">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 10px; background: #f5f5f5; 
            min-height: 100vh; /* Full screen height */
            height: 100vh; /* Full screen height */
            overflow-x: hidden; /* Prevent horizontal scroll */
        }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 1px solid #e1e1e1; padding-bottom: 15px; margin-bottom: 20px; }
        .back-link { display: inline-block; margin-bottom: 15px; color: #666; text-decoration: none; }
        .back-link:hover { color: #007cba; }
        .file-content { background: #f8f9fa; border: 1px solid #e1e1e1; border-radius: 4px; overflow-x: auto; }
        pre { margin: 0; padding: 20px; font-family: 'Monaco', 'Courier New', monospace; font-size: 14px; line-height: 1.5; }
        .line-numbers { color: #999; user-select: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="${this.security.secureUrl('/', { path: path.dirname(filePath) })}" class="back-link">← Back to directory</a>
            <h1>📄 ${path.basename(filePath)}</h1>
            <p>Path: ${filePath}</p>
        </div>
        
        <div class="file-content">
            <pre class="line-numbers"><code class="language-${language}">${this.escapeHtml(content)}</code></pre>
        </div>
    </div>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-core.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/line-numbers/prism-line-numbers.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/autoloader/prism-autoloader.min.js"></script>
</body>
</html>`;
    }

    getLanguageForHighlighting(extension) {
        const langMap = {
            '.js': 'javascript', '.json': 'json', '.md': 'markdown',
            '.html': 'html', '.css': 'css', '.yml': 'yaml',
            '.yaml': 'yaml', '.xml': 'xml', '.sh': 'bash'
        };
        return langMap[extension] || 'text';
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    generateErrorHTML(message) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Error - File Browser</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; text-align: center; }
        .error { color: #d63384; }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="error">⚠️ Error</h1>
        <p>${this.escapeHtml(message)}</p>
        <a href="/">← Back to file browser</a>
    </div>
</body>
</html>`;
    }


    /**
     * Find an available port using SmartPortResolver
     */
    async findAvailablePort() {
        return await this.portResolver.findAvailablePort(`FileBrowser-${this.botInstance}`);
    }

    async start() {
        try {
            // Prevent multiple simultaneous starts
            if (this.isStarting) {
                console.log(`[${this.botInstance}] File browser server is already starting...`);
                return null;
            }
            
            if (this.isStarted) {
                console.log(`[${this.botInstance}] File browser server is already running on port ${this.port}`);
                return this.ngrokListener ? this.ngrokListener.url() : null;
            }

            this.isStarting = true;
            console.log(`[${this.botInstance}] Starting file browser server...`);

            // Find available port
            if (!this.port) {
                this.port = await this.findAvailablePort();
            }

            // Start HTTP server (always works locally)
            this.server = this.app.listen(this.port, 'localhost', () => {
                console.log(`[${this.botInstance}] File browser server running on http://localhost:${this.port}`);
            });

            const localUrl = `http://localhost:${this.port}`;
            let publicUrl = localUrl; // Default to local URL

            // Try to start ngrok tunnel (optional for remote access)
            try {
                const ngrokOptions = { addr: this.port };
                
                if (this.ngrokAuthToken) {
                    ngrokOptions.authtoken = this.ngrokAuthToken;
                    console.log(`[${this.botInstance}] Using ngrok token from config file`);
                } else {
                    ngrokOptions.authtoken_from_env = true;
                    console.log(`[${this.botInstance}] Using ngrok token from environment variable`);
                }
                
                this.ngrokListener = await ngrok.forward(ngrokOptions);

                publicUrl = this.ngrokListener.url();
                console.log(`[${this.botInstance}] 🌐 Public file browser URL: ${publicUrl}`);
                console.log(`[${this.botInstance}] 💡 Add header "ngrok-skip-browser-warning: true" to bypass warning banner`);
                
                // Verify ngrok tunnel is actually ready before proceeding
                const isNgrokReady = await this.verifyNgrokReady(publicUrl);
                if (!isNgrokReady) {
                    console.log(`[${this.botInstance}] ⚠️  Ngrok URL not responding yet, falling back to local access`);
                    publicUrl = localUrl; // Use local URL as fallback
                }
            } catch (ngrokError) {
                console.log(`[${this.botInstance}] ⚠️  Ngrok tunnel failed (using local access only): ${ngrokError.message}`);
                
                if (ngrokError.message?.includes('authtoken')) {
                    console.log(`[${this.botInstance}] 💡 Set NGROK_AUTHTOKEN environment variable for remote access`);
                }
                
                // Continue with local-only access
                console.log(`[${this.botInstance}] 🏠 File browser available locally: ${localUrl}`);
            }
            
            this.isStarted = true;
            this.isStarting = false;
            
            return publicUrl;
        } catch (error) {
            this.isStarting = false;
            console.error(`[${this.botInstance}] Failed to start file browser server:`, error);
            throw error;
        }
    }

    /**
     * Verify that ngrok tunnel is actually ready and responding
     * Uses basic connectivity check without security token to avoid false negatives
     */
    async verifyNgrokReady(ngrokUrl, maxAttempts = 2, delayMs = 2000) {
        const https = require('https');
        const http = require('http');
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`[${this.botInstance}] 🔍 Verifying ngrok readiness (attempt ${attempt}/${maxAttempts})...`);
                
                // Test basic ngrok connectivity (without security token to avoid false negatives)
                const urlObj = new URL(ngrokUrl);
                const client = urlObj.protocol === 'https:' ? https : http;
                
                const isReady = await new Promise((resolve) => {
                    const req = client.request(urlObj, { 
                        method: 'HEAD',
                        timeout: 8000, // Longer timeout for ngrok
                        headers: {
                            'User-Agent': 'TelegramBot-FileBrowser-HealthCheck/1.0',
                            'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
                        }
                    }, (res) => {
                        // Accept any response from ngrok (including 403 from our security)
                        // If ngrok is responding, it means the tunnel is ready
                        console.log(`[${this.botInstance}] ✅ Ngrok tunnel responding (status: ${res.statusCode})`);
                        resolve(true);
                    });
                    
                    req.on('error', (error) => {
                        console.log(`[${this.botInstance}] ❌ Ngrok tunnel not ready: ${error.message}`);
                        resolve(false);
                    });
                    
                    req.on('timeout', () => {
                        console.log(`[${this.botInstance}] ⏰ Ngrok tunnel timeout (${8000}ms)`);
                        req.destroy();
                        resolve(false);
                    });
                    
                    req.end();
                });
                
                if (isReady) {
                    console.log(`[${this.botInstance}] ✅ Ngrok tunnel verified and ready`);
                    return true;
                }
                
                // Wait before next attempt (except on last attempt)
                if (attempt < maxAttempts) {
                    console.log(`[${this.botInstance}] ⏳ Waiting ${delayMs}ms before next attempt...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
            } catch (error) {
                console.log(`[${this.botInstance}] ❌ Error verifying ngrok readiness: ${error.message}`);
            }
        }
        
        console.log(`[${this.botInstance}] ❌ Ngrok tunnel not ready after ${maxAttempts} attempts, using anyway`);
        return true; // Be less strict - use ngrok URL even if verification fails
    }

    /**
     * Get the secure public URL with token for external access
     */
    getSecurePublicUrl() {
        if (!this.ngrokListener || !this.isStarted) {
            // Return local URL if ngrok failed
            const baseUrl = this.server ? `http://localhost:${this.port}` : null;
            return baseUrl ? this.security.secureExternalUrl(baseUrl) : null;
        }
        
        const baseUrl = this.ngrokListener.url();
        return this.security.secureExternalUrl(baseUrl);
    }

    async stop() {
        try {
            console.log(`[${this.botInstance}] Stopping file browser server...`);
            
            if (this.ngrokListener) {
                await this.ngrokListener.close();
                this.ngrokListener = null;
                console.log(`[${this.botInstance}] Ngrok tunnel closed`);
            }

            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                this.server = null;
                console.log(`[${this.botInstance}] File browser server stopped`);
            }
            
            // Release port allocation
            if (this.port) {
                this.portResolver.releasePort(this.port, `FileBrowser-${this.botInstance}`);
            }
            
            // Reset state flags
            this.isStarted = false;
            this.isStarting = false;
            this.port = null;
        } catch (error) {
            console.error(`[${this.botInstance}] Error stopping file browser server:`, error);
            this.isStarted = false;
            this.isStarting = false;
            throw error;
        }
    }
}

module.exports = FileBrowserServer;
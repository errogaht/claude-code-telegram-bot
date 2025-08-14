const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const ngrok = require('@ngrok/ngrok');
const net = require('net');
const WebServerSecurity = require('./WebServerSecurity');
const SmartPortResolver = require('./SmartPortResolver');

const execAsync = promisify(exec);

class GitDiffServer {
    constructor(projectRoot = process.cwd(), botInstance = 'bot1', ngrokAuthToken = null, security = null) {
        this.app = express();
        this.server = null;
        this.ngrokListener = null;
        this.projectRoot = projectRoot;
        this.botInstance = botInstance;
        this.ngrokAuthToken = ngrokAuthToken;
        this.port = null;
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
        // Apply generic security middleware
        this.app.use(this.security.getMiddleware());

        // Serve static assets
        this.app.use('/static', express.static(path.join(__dirname, 'public')));
        
        // Main git diff page - show changed files
        this.app.get('/', async (req, res) => {
            try {
                const changedFiles = await this.getChangedFiles();
                res.send(this.generateMainHTML(changedFiles));
            } catch (error) {
                res.status(500).send(this.generateErrorHTML(error.message));
            }
        });

        // View diff for specific file
        this.app.get('/diff', async (req, res) => {
            const filePath = req.query.file;
            if (!filePath) {
                return res.status(400).send(this.generateErrorHTML('File path required'));
            }

            try {
                const diff = await this.getFileDiff(filePath);
                res.send(this.generateDiffHTML(diff, filePath));
            } catch (error) {
                res.status(500).send(this.generateErrorHTML(error.message));
            }
        });

        // View full git status
        this.app.get('/status', async (req, res) => {
            try {
                const status = await this.getGitStatus();
                res.send(this.generateStatusHTML(status));
            } catch (error) {
                res.status(500).send(this.generateErrorHTML(error.message));
            }
        });
    }

    async getChangedFiles() {
        try {
            // Get git status in porcelain format for easy parsing
            const { stdout } = await execAsync('git status --porcelain', { 
                cwd: this.projectRoot,
                maxBuffer: 1024 * 1024 
            });

            const files = [];
            const lines = stdout.trim().split('\n').filter(line => line.length > 0);

            for (const line of lines) {
                const status = line.substring(0, 2);
                const filePath = line.substring(3);
                
                let changeType = 'unknown';
                let icon = '📄';
                
                // Parse git status codes
                if (status.includes('M')) {
                    changeType = 'modified';
                    icon = '📝';
                } else if (status.includes('A')) {
                    changeType = 'added';
                    icon = '➕';
                } else if (status.includes('D')) {
                    changeType = 'deleted';
                    icon = '🗑️';
                } else if (status.includes('R')) {
                    changeType = 'renamed';
                    icon = '🔄';
                } else if (status.includes('??')) {
                    changeType = 'untracked';
                    icon = '❓';
                }

                files.push({
                    path: filePath,
                    status: status.trim(),
                    changeType,
                    icon
                });
            }

            return files;
        } catch (error) {
            console.error('Error getting changed files:', error);
            return [];
        }
    }

    async getFileDiff(filePath) {
        try {
            // Try different diff commands based on file status
            let cmd = `git diff HEAD -- "${filePath}"`;
            
            // Check if file is staged
            try {
                const { stdout: staged } = await execAsync(`git diff --cached --name-only "${filePath}"`, { 
                    cwd: this.projectRoot 
                });
                if (staged.trim()) {
                    cmd = `git diff --cached -- "${filePath}"`;
                }
            } catch (e) {
                // File might be untracked, try different approach
            }

            // If no diff found, try comparing with previous commit
            const { stdout } = await execAsync(cmd, { 
                cwd: this.projectRoot,
                maxBuffer: 1024 * 1024 
            });

            if (!stdout.trim()) {
                // For untracked files, show the entire content as "new"
                try {
                    const { stdout: content } = await execAsync(`cat "${filePath}"`, { 
                        cwd: this.projectRoot,
                        maxBuffer: 1024 * 1024 
                    });
                    return this.formatAsNewFile(content, filePath);
                } catch (e) {
                    return 'No diff available for this file';
                }
            }

            return stdout;
        } catch (error) {
            console.error('Error getting file diff:', error);
            return `Error getting diff: ${error.message}`;
        }
    }

    formatAsNewFile(content, filePath) {
        const lines = content.split('\n');
        let diff = `diff --git a/${filePath} b/${filePath}\n`;
        diff += `new file mode 100644\n`;
        diff += `index 0000000..0000000\n`;
        diff += `--- /dev/null\n`;
        diff += `+++ b/${filePath}\n`;
        diff += `@@ -0,0 +1,${lines.length} @@\n`;
        
        for (const line of lines) {
            diff += `+${line}\n`;
        }
        
        return diff;
    }

    async getGitStatus() {
        try {
            const { stdout } = await execAsync('git status', { 
                cwd: this.projectRoot,
                maxBuffer: 1024 * 1024 
            });
            return stdout;
        } catch (error) {
            return `Error getting git status: ${error.message}`;
        }
    }

    generateMainHTML(files) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Git Diff Viewer</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 10px; background: #f5f5f5; 
            min-height: 100vh;
            height: 100vh;
            overflow-x: hidden;
        }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 1px solid #e1e1e1; padding-bottom: 15px; margin-bottom: 20px; }
        .nav-links { margin-bottom: 15px; }
        .nav-links a { 
            display: inline-block; 
            margin-right: 15px; 
            padding: 8px 12px; 
            background: #f8f9fa; 
            border-radius: 4px; 
            text-decoration: none; 
            color: #333;
            border: 1px solid #e1e1e1;
        }
        .nav-links a:hover { background: #e9ecef; }
        .nav-links a.active { background: #007cba; color: white; }
        .file-list { border-collapse: collapse; width: 100%; }
        .file-list th, .file-list td { padding: 12px; text-align: left; border-bottom: 1px solid #e1e1e1; }
        .file-list th { background: #f8f9fa; font-weight: 600; }
        .file-item { display: flex; align-items: center; }
        .file-icon { width: 20px; margin-right: 10px; font-size: 16px; }
        .file-name { color: #333; text-decoration: none; }
        .file-name:hover { color: #007cba; }
        .change-type { 
            padding: 4px 8px; 
            border-radius: 3px; 
            font-size: 12px; 
            font-weight: 500;
        }
        .change-type.modified { background: #fff3cd; color: #856404; }
        .change-type.added { background: #d1edff; color: #0c5460; }
        .change-type.deleted { background: #f8d7da; color: #721c24; }
        .change-type.untracked { background: #e2e3e5; color: #383d41; }
        .change-type.renamed { background: #d4edda; color: #155724; }
        .status-code { font-family: monospace; font-size: 12px; color: #666; }
        .empty-state { text-align: center; padding: 40px; color: #666; }
        @media (max-width: 768px) { 
            .container { padding: 10px; margin: 10px; }
            .file-list { font-size: 14px; }
            .file-list td, .file-list th { padding: 8px 5px; }
            .nav-links a { margin-right: 10px; margin-bottom: 5px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Git Diff Viewer</h1>
            <div class="nav-links">
                <a href="${this.security.secureUrl('/', {})}" class="active">Changed Files</a>
                <a href="${this.security.secureUrl('/status', {})}">Full Status</a>
            </div>
        </div>
        
        ${files.length === 0 ? `
            <div class="empty-state">
                <h3>✅ No Changes</h3>
                <p>Working directory is clean</p>
            </div>
        ` : `
            <table class="file-list">
                <thead>
                    <tr>
                        <th>File</th>
                        <th>Status</th>
                        <th>Change Type</th>
                    </tr>
                </thead>
                <tbody>
                    ${files.map(file => `
                        <tr>
                            <td>
                                <div class="file-item">
                                    <span class="file-icon">${file.icon}</span>
                                    <a href="${this.security.secureUrl('/diff', { file: file.path })}" class="file-name">${file.path}</a>
                                </div>
                            </td>
                            <td>
                                <span class="status-code">${file.status}</span>
                            </td>
                            <td>
                                <span class="change-type ${file.changeType}">${file.changeType}</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `}
    </div>
</body>
</html>`;
    }

    generateDiffHTML(diff, filePath) {
        const syntaxHighlightedDiff = this.highlightDiff(diff);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>📄 ${path.basename(filePath)} - Diff</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 10px; background: #f5f5f5; 
            min-height: 100vh;
            overflow-x: auto;
        }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 1px solid #e1e1e1; padding-bottom: 15px; margin-bottom: 20px; }
        .back-link { display: inline-block; margin-bottom: 15px; color: #666; text-decoration: none; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; }
        .back-link:hover { color: #007cba; background: #e9ecef; }
        .diff-content { 
            background: #f8f9fa; 
            border: 1px solid #e1e1e1; 
            border-radius: 4px; 
            overflow-x: auto; 
            font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.4;
        }
        .diff-line { 
            padding: 2px 8px; 
            white-space: pre; 
            border-left: 3px solid transparent;
            margin: 0;
        }
        .diff-line.added { 
            background-color: #e6ffed; 
            border-left-color: #28a745;
            color: #22863a;
        }
        .diff-line.removed { 
            background-color: #ffeef0; 
            border-left-color: #d73a49;
            color: #b31d28;
        }
        .diff-line.context { 
            color: #586069; 
        }
        .diff-line.header { 
            background-color: #f1f8ff; 
            color: #0366d6;
            font-weight: 500;
        }
        .diff-line.hunk { 
            background-color: #f6f8fa; 
            color: #6a737d;
            border-left-color: #d1d5da;
        }
        .line-number {
            display: inline-block;
            width: 50px;
            color: #959da5;
            text-align: right;
            margin-right: 10px;
            user-select: none;
        }
        @media (max-width: 768px) { 
            .container { padding: 10px; margin: 10px; }
            .diff-content { font-size: 12px; }
            .line-number { width: 40px; margin-right: 5px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="${this.security.secureUrl('/', {})}" class="back-link">← Back to file list</a>
            <h1>📄 ${path.basename(filePath)}</h1>
            <p>Path: ${filePath}</p>
        </div>
        
        <div class="diff-content">
            ${syntaxHighlightedDiff}
        </div>
    </div>
</body>
</html>`;
    }

    generateStatusHTML(status) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Git Status</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 10px; background: #f5f5f5; 
            min-height: 100vh;
        }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 1px solid #e1e1e1; padding-bottom: 15px; margin-bottom: 20px; }
        .back-link { display: inline-block; margin-bottom: 15px; color: #666; text-decoration: none; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; }
        .back-link:hover { color: #007cba; background: #e9ecef; }
        .status-content { 
            background: #f8f9fa; 
            border: 1px solid #e1e1e1; 
            border-radius: 4px; 
            padding: 20px;
            font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
            white-space: pre-wrap;
        }
        @media (max-width: 768px) { 
            .container { padding: 10px; margin: 10px; }
            .status-content { font-size: 12px; padding: 15px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="${this.security.secureUrl('/', {})}" class="back-link">← Back to file list</a>
            <h1>📊 Git Status</h1>
        </div>
        
        <div class="status-content">${this.escapeHtml(status)}</div>
    </div>
</body>
</html>`;
    }

    highlightDiff(diff) {
        const lines = diff.split('\n');
        let html = '';
        let lineNumber = 1;

        for (const line of lines) {
            let className = 'context';
            
            if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) {
                className = 'header';
            } else if (line.startsWith('@@')) {
                className = 'hunk';
            } else if (line.startsWith('+')) {
                className = 'added';
            } else if (line.startsWith('-')) {
                className = 'removed';
            }

            const escapedLine = this.escapeHtml(line);
            html += `<div class="diff-line ${className}"><span class="line-number">${lineNumber}</span>${escapedLine}</div>\n`;
            lineNumber++;
        }

        return html;
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
    <title>Error - Git Diff Viewer</title>
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
        <a href="/">← Back to git diff viewer</a>
    </div>
</body>
</html>`;
    }

    /**
     * Find an available port using SmartPortResolver
     */
    async findAvailablePort() {
        return await this.portResolver.findAvailablePort(`GitDiff-${this.botInstance}`);
    }

    async start() {
        try {
            if (this.isStarting) {
                console.log(`[${this.botInstance}] Git diff server is already starting...`);
                return null;
            }
            
            if (this.isStarted) {
                console.log(`[${this.botInstance}] Git diff server is already running on port ${this.port}`);
                return this.ngrokListener ? this.ngrokListener.url() : null;
            }

            this.isStarting = true;
            console.log(`[${this.botInstance}] Starting git diff server...`);

            if (!this.port) {
                this.port = await this.findAvailablePort();
            }

            this.server = this.app.listen(this.port, 'localhost', () => {
                console.log(`[${this.botInstance}] Git diff server running on http://localhost:${this.port}`);
            });

            const localUrl = `http://localhost:${this.port}`;
            let publicUrl = localUrl;

            // Try ngrok tunnel
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
                console.log(`[${this.botInstance}] 🌐 Public git diff URL: ${publicUrl}`);
                
                const isNgrokReady = await this.verifyNgrokReady(publicUrl);
                if (!isNgrokReady) {
                    console.log(`[${this.botInstance}] ⚠️  Ngrok URL not responding yet, falling back to local access`);
                    publicUrl = localUrl;
                }
            } catch (ngrokError) {
                console.log(`[${this.botInstance}] ⚠️  Ngrok tunnel failed (using local access only): ${ngrokError.message}`);
                console.log(`[${this.botInstance}] 🏠 Git diff viewer available locally: ${localUrl}`);
            }
            
            this.isStarted = true;
            this.isStarting = false;
            
            return publicUrl;
        } catch (error) {
            this.isStarting = false;
            console.error(`[${this.botInstance}] Failed to start git diff server:`, error);
            throw error;
        }
    }

    async verifyNgrokReady(ngrokUrl, maxAttempts = 2, delayMs = 2000) {
        const https = require('https');
        const http = require('http');
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`[${this.botInstance}] 🔍 Verifying git diff ngrok readiness (attempt ${attempt}/${maxAttempts})...`);
                
                const urlObj = new URL(ngrokUrl);
                const client = urlObj.protocol === 'https:' ? https : http;
                
                const isReady = await new Promise((resolve) => {
                    const req = client.request(urlObj, { 
                        method: 'HEAD',
                        timeout: 8000,
                        headers: {
                            'User-Agent': 'TelegramBot-GitDiff-HealthCheck/1.0',
                            'ngrok-skip-browser-warning': 'true'
                        }
                    }, (res) => {
                        console.log(`[${this.botInstance}] ✅ Git diff ngrok tunnel responding (status: ${res.statusCode})`);
                        resolve(true);
                    });
                    
                    req.on('error', (error) => {
                        console.log(`[${this.botInstance}] ❌ Git diff ngrok tunnel not ready: ${error.message}`);
                        resolve(false);
                    });
                    
                    req.on('timeout', () => {
                        console.log(`[${this.botInstance}] ⏰ Git diff ngrok tunnel timeout (${8000}ms)`);
                        req.destroy();
                        resolve(false);
                    });
                    
                    req.end();
                });
                
                if (isReady) {
                    console.log(`[${this.botInstance}] ✅ Git diff ngrok tunnel verified and ready`);
                    return true;
                }
                
                if (attempt < maxAttempts) {
                    console.log(`[${this.botInstance}] ⏳ Waiting ${delayMs}ms before next attempt...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
            } catch (error) {
                console.log(`[${this.botInstance}] ❌ Error verifying git diff ngrok readiness: ${error.message}`);
            }
        }
        
        console.log(`[${this.botInstance}] ❌ Git diff ngrok tunnel not ready after ${maxAttempts} attempts, using anyway`);
        return true;
    }

    getSecurePublicUrl() {
        if (!this.ngrokListener || !this.isStarted) {
            const baseUrl = this.server ? `http://localhost:${this.port}` : null;
            return baseUrl ? this.security.secureExternalUrl(baseUrl) : null;
        }
        
        const baseUrl = this.ngrokListener.url();
        return this.security.secureExternalUrl(baseUrl);
    }

    async stop() {
        try {
            console.log(`[${this.botInstance}] Stopping git diff server...`);
            
            if (this.ngrokListener) {
                await this.ngrokListener.close();
                this.ngrokListener = null;
                console.log(`[${this.botInstance}] Git diff ngrok tunnel closed`);
            }

            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                this.server = null;
                console.log(`[${this.botInstance}] Git diff server stopped`);
            }
            
            // Release port allocation
            if (this.port) {
                this.portResolver.releasePort(this.port, `GitDiff-${this.botInstance}`);
            }
            
            this.isStarted = false;
            this.isStarting = false;
            this.port = null;
        } catch (error) {
            console.error(`[${this.botInstance}] Error stopping git diff server:`, error);
            this.isStarted = false;
            this.isStarting = false;
            throw error;
        }
    }
}

module.exports = GitDiffServer;
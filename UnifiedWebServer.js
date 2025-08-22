const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const WebServerSecurity = require('./WebServerSecurity');
const SmartPortResolver = require('./SmartPortResolver');
const QTunnel = require('./QTunnel');

const execAsync = promisify(exec);

/**
 * Unified Web Server - Single server for all Mini App pages (File Browser + Git Diff)
 * Replaces separate FileBrowserServer and GitDiffServer with unified approach
 * 
 * TO DISABLE: Pass { disabled: true } in options parameter to constructor
 * Example: new UnifiedWebServer(projectRoot, botInstance, security, { disabled: true })
 */
class UnifiedWebServer {
    constructor(projectRoot = process.cwd(), botInstance = 'bot1', security = null, options = {}) {
        this.app = express();
        this.server = null;
        this.projectRoot = projectRoot;
        this.botInstance = botInstance;
        this.port = null;
        this.isStarting = false;
        this.isStarted = false;
        
        // Flag to disable web server functionality entirely
        this.disabled = options.disabled || false;
        
        // Use provided security system or create new one
        this.security = security || new WebServerSecurity(botInstance);
        
        // Smart port resolver with large random range (8000-9999)
        this.portResolver = new SmartPortResolver({
            minPort: 8000,
            maxPort: 9999,
            maxAttempts: 50
        });
        
        // QTunnel adapter - HTTP/2 for better network resilience
        this.tunnelAdapter = new QTunnel({
            protocol: options.qTunnelProtocol || 'http2',
            token: options.qTunnelToken || null,
            botInstance: botInstance
        });
        
        this.publicUrl = null;
        
        this.setupRoutes();
    }

    setupRoutes() {
        // Apply security middleware to all routes
        this.app.use(this.security.getMiddleware());

        // Serve static assets
        this.app.use('/static', express.static(path.join(__dirname, 'public')));
        
        // Configure EJS as template engine
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
        
        // ========== MAIN MENU (Vue.js Default) ==========
        this.app.get('/', async (req, res) => {
            res.render('v2/main-menu', {
                botInstance: this.botInstance,
                currentVersion: 'vue'
            });
        });

        // ========== FILE BROWSER ROUTES (Vue.js) ==========
        this.app.get('/files', async (req, res) => {
            const currentPath = req.query.path || '';
            const fullPath = path.join(this.projectRoot, currentPath);
            
            try {
                await this.validatePath(fullPath);
                const content = await this.generateFileList(fullPath, currentPath);
                res.render('v2/file-browser-simple', {
                    ...content,
                    currentPath,
                    botInstance: this.botInstance
                });
            } catch (error) {
                res.status(404).render('v2/error', { 
                    message: error.message,
                    botInstance: this.botInstance 
                });
            }
        });

        this.app.get('/files/view', async (req, res) => {
            const filePath = req.query.path;
            if (!filePath) {
                return res.status(400).render('v2/error', { 
                    message: 'File path required',
                    botInstance: this.botInstance 
                });
            }

            const fullPath = path.join(this.projectRoot, filePath);
            
            try {
                await this.validatePath(fullPath);
                const stats = await fs.stat(fullPath);
                
                if (stats.isDirectory()) {
                    return res.redirect(`/files?path=${encodeURIComponent(filePath)}`);
                }

                const content = await fs.readFile(fullPath, 'utf8');
                const fileExtension = path.extname(fullPath).toLowerCase();
                
                res.render('v2/file-viewer-simple', {
                    content,
                    filePath,
                    fileExtension,
                    language: this.getLanguageForHighlighting(fileExtension),
                    botInstance: this.botInstance
                });
            } catch (error) {
                res.status(404).render('v2/error', { 
                    message: error.message,
                    botInstance: this.botInstance 
                });
            }
        });

        // ========== GIT DIFF ROUTES (Vue.js) ==========
        this.app.get('/git', async (req, res) => {
            try {
                const changedFiles = await this.getChangedFiles();
                res.render('v2/git-diff-simple', {
                    files: changedFiles,
                    botInstance: this.botInstance
                });
            } catch (error) {
                res.status(500).render('v2/error', { 
                    message: error.message,
                    botInstance: this.botInstance 
                });
            }
        });

        this.app.get('/git/diff', async (req, res) => {
            const filePath = req.query.file;
            if (!filePath) {
                return res.status(400).render('v2/error', { 
                    message: 'File path required',
                    botInstance: this.botInstance 
                });
            }

            try {
                const diff = await this.getFileDiff(filePath);
                const highlightedDiff = this.highlightDiff(diff);
                res.render('v2/diff-viewer-simple', {
                    diff: highlightedDiff,
                    filePath,
                    botInstance: this.botInstance
                });
            } catch (error) {
                res.status(500).render('v2/error', { 
                    message: error.message,
                    botInstance: this.botInstance 
                });
            }
        });

        this.app.get('/git/status', async (req, res) => {
            try {
                const status = await this.getGitStatus();
                res.render('v2/git-status-simple', {
                    status,
                    botInstance: this.botInstance
                });
            } catch (error) {
                res.status(500).render('v2/error', { 
                    message: error.message,
                    botInstance: this.botInstance 
                });
            }
        });
        
        // ========== INFO ROUTE (Vue.js) ==========
        this.app.get('/info', async (req, res) => {
            const stats = this.tunnelAdapter.getTunnelStats();
            res.render('v2/info-simple', {
                stats,
                botInstance: this.botInstance
            });
        });
    }

    // ========== PATH VALIDATION ==========
    async validatePath(fullPath) {
        const resolvedPath = path.resolve(fullPath);
        const resolvedRoot = path.resolve(this.projectRoot);
        
        if (!resolvedPath.startsWith(resolvedRoot)) {
            throw new Error('Access denied: Path outside project directory');
        }

        await fs.access(resolvedPath);
    }

    // ========== FILE BROWSER FUNCTIONALITY ==========
    async generateFileList(dirPath, currentPath) {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        const files = [];
        const directories = [];

        for (const item of items) {
            const itemPath = path.join(currentPath, item.name);
            const fullItemPath = path.join(dirPath, item.name);
            
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

    // ========== GIT FUNCTIONALITY ==========
    async getChangedFiles() {
        try {
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
            let cmd = `git diff HEAD -- "${filePath}"`;
            
            try {
                const { stdout: staged } = await execAsync(`git diff --cached --name-only "${filePath}"`, { 
                    cwd: this.projectRoot 
                });
                if (staged.trim()) {
                    cmd = `git diff --cached -- "${filePath}"`;
                }
            } catch (e) {
                // File might be untracked
            }

            const { stdout } = await execAsync(cmd, { 
                cwd: this.projectRoot,
                maxBuffer: 1024 * 1024 
            });

            if (!stdout.trim()) {
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

    








    // ========== UTILITY METHODS ==========

    getLanguageForHighlighting(extension) {
        const langMap = {
            '.js': 'javascript', '.json': 'json', '.md': 'markdown',
            '.html': 'html', '.css': 'css', '.yml': 'yaml',
            '.yaml': 'yaml', '.xml': 'xml', '.sh': 'bash'
        };
        return langMap[extension] || 'text';
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





    // ========== PROJECT ROOT MANAGEMENT ==========
    updateProjectRoot(newProjectRoot) {
        if (newProjectRoot && newProjectRoot !== this.projectRoot) {
            const oldRoot = this.projectRoot;
            this.projectRoot = newProjectRoot;
            console.log(`[${this.botInstance}] Updated UnifiedWebServer project root: ${oldRoot} → ${newProjectRoot}`);
        }
    }

    // ========== SERVER MANAGEMENT ==========
    async findAvailablePort() {
        return await this.portResolver.findAvailablePort(`Unified-${this.botInstance}`);
    }

    async start() {
        try {
            // Early return if web server is disabled
            if (this.disabled) {
                console.log(`[${this.botInstance}] Unified web server is DISABLED - skipping startup`);
                return null;
            }
            
            if (this.isStarting) {
                console.log(`[${this.botInstance}] Unified web server is already starting...`);
                return null;
            }
            
            if (this.isStarted) {
                console.log(`[${this.botInstance}] Unified web server is already running on port ${this.port}`);
                return this.publicUrl;
            }

            this.isStarting = true;
            console.log(`[${this.botInstance}] Starting unified web server...`);

            if (!this.port) {
                this.port = await this.findAvailablePort();
            }

            this.server = this.app.listen(this.port, 'localhost', () => {
                console.log(`[${this.botInstance}] 🚀 Unified web server running on http://localhost:${this.port}`);
            });

            const localUrl = `http://localhost:${this.port}`;
            
            // Create QTunnel WebSocket tunnel
            try {
                console.log(`[${this.botInstance}] Creating QTunnel...`);
                const publicUrl = await this.tunnelAdapter.createTunnel(this.port, 'unified');
                this.publicUrl = publicUrl;
                console.log(`[${this.botInstance}] ✅ Unified server public URL: ${publicUrl}`);
            } catch (tunnelError) {
                console.log(`[${this.botInstance}] ⚠️ QTunnel failed, using local access only: ${tunnelError.message}`);
                this.publicUrl = localUrl;
            }
            
            this.isStarted = true;
            this.isStarting = false;
            
            return this.publicUrl;
        } catch (error) {
            this.isStarting = false;
            console.error(`[${this.botInstance}] Failed to start unified web server:`, error);
            throw error;
        }
    }

    getSecurePublicUrl() {
        // Return null if web server is disabled
        if (this.disabled) {
            return null;
        }
        
        if (!this.publicUrl || !this.isStarted) {
            return null;
        }
        
        // Return direct URL since we use QTunnel
        const secureUrl = this.security.secureExternalUrl(this.publicUrl, '', {});
        return secureUrl;
    }

    async stop() {
        try {
            console.log(`[${this.botInstance}] Stopping unified web server...`);
            
            // Close all QTunnels
            await this.tunnelAdapter.closeAllTunnels();

            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                this.server = null;
                console.log(`[${this.botInstance}] Unified web server stopped`);
            }
            
            // Release port allocation
            if (this.port) {
                this.portResolver.releasePort(this.port, `Unified-${this.botInstance}`);
            }
            
            this.isStarted = false;
            this.isStarting = false;
            this.port = null;
            this.publicUrl = null;
        } catch (error) {
            console.error(`[${this.botInstance}] Error stopping unified web server:`, error);
            this.isStarted = false;
            this.isStarting = false;
            throw error;
        }
    }

}

module.exports = UnifiedWebServer;
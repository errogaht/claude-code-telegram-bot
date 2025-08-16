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
        
        // QTunnel adapter - WebSocket-based tunneling to qtunnel.q9x.ru
        this.tunnelAdapter = new QTunnel({
            server: 'wss://qtunnel.q9x.ru/ws',
            token: options.qTunnelToken || null,
            botInstance: botInstance
        });
        
        this.publicUrl = null;
        
        this.setupRoutes();
        this.setupVueRoutes(); // Add Vue.js routes alongside existing ones
    }

    setupRoutes() {
        // Apply security middleware to all routes
        this.app.use(this.security.getMiddleware());


        // Serve static assets
        this.app.use('/static', express.static(path.join(__dirname, 'public')));
        
        // ========== INFO ROUTE ==========
        this.app.get('/info', async (req, res) => {
            res.send(this.generateInfoHTML());
        });

        // ========== MAIN MENU ==========
        this.app.get('/', async (req, res) => {
            res.send(this.generateMainMenuHTML());
        });

        // ========== FILE BROWSER ROUTES ==========
        this.app.get('/files', async (req, res) => {
            const currentPath = req.query.path || '';
            const fullPath = path.join(this.projectRoot, currentPath);
            
            try {
                await this.validatePath(fullPath);
                const content = await this.generateFileList(fullPath, currentPath);
                res.send(this.generateFileBrowserHTML(content, currentPath));
            } catch (error) {
                res.status(404).send(this.generateErrorHTML(error.message));
            }
        });

        this.app.get('/files/view', async (req, res) => {
            const filePath = req.query.path;
            if (!filePath) {
                return res.status(400).send(this.generateErrorHTML('File path required'));
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
                
                res.send(this.generateFileViewHTML(content, filePath, fileExtension));
            } catch (error) {
                res.status(404).send(this.generateErrorHTML(error.message));
            }
        });

        // ========== GIT DIFF ROUTES ==========
        this.app.get('/git', async (req, res) => {
            try {
                const changedFiles = await this.getChangedFiles();
                res.send(this.generateGitDiffHTML(changedFiles));
            } catch (error) {
                res.status(500).send(this.generateErrorHTML(error.message));
            }
        });

        this.app.get('/git/diff', async (req, res) => {
            const filePath = req.query.file;
            if (!filePath) {
                return res.status(400).send(this.generateErrorHTML('File path required'));
            }

            try {
                const diff = await this.getFileDiff(filePath);
                res.send(this.generateDiffViewHTML(diff, filePath));
            } catch (error) {
                res.status(500).send(this.generateErrorHTML(error.message));
            }
        });

        this.app.get('/git/status', async (req, res) => {
            try {
                const status = await this.getGitStatus();
                res.send(this.generateGitStatusHTML(status));
            } catch (error) {
                res.status(500).send(this.generateErrorHTML(error.message));
            }
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

    // ========== HTML GENERATORS ==========
    generateInfoHTML() {
        const stats = this.tunnelAdapter.getTunnelStats();
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🚀 Development Tools - Info</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .status { margin: 20px 0; padding: 15px; border-radius: 5px; background: #d1edff; color: #0c5460; }
        .info-section { margin: 20px 0; }
        .info-section h3 { color: #007cba; margin-bottom: 10px; }
        .provider-info { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007cba; }
        .back-link { display: inline-block; color: #007cba; text-decoration: none; margin-bottom: 20px; }
        .back-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Main Menu</a>
        
        <h1>🚀 Development Tools - QTunnel Info</h1>
        
        <div class="status">
            <strong>🌟 QTunnel WebSocket Tunneling:</strong> Fast, secure tunneling with WebSocket protocol!<br>
            Direct access to your development tools through qtunnel.q9x.ru
        </div>
        
        <div class="info-section">
            <h3>Current Status</h3>
            <p><strong>Bot Instance:</strong> ${this.botInstance}</p>
            <p><strong>Provider:</strong> ${stats.provider}</p>
            <p><strong>Server:</strong> ${stats.server}</p>
            <p><strong>Active Tunnels:</strong> ${stats.activeTunnels}</p>
        </div>
        
        <div class="info-section">
            <h3>QTunnel Features</h3>
            <div class="provider-info">
                <strong>✅ WebSocket-based tunneling</strong><br>
                <small>Fast, reliable connection using modern WebSocket protocol</small><br><br>
                <strong>✅ HTTPS with SSL certificates</strong><br>
                <small>Secure encrypted connections to *.q9x.ru domain</small><br><br>
                <strong>✅ No installation required</strong><br>
                <small>Binary already available at /usr/local/bin/qtunnel</small>
            </div>
        </div>
        
        ${stats.tunnels.length > 0 ? `
        <div class="info-section">
            <h3>Active Tunnels</h3>
            ${stats.tunnels.map(tunnel => `
                <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                    <strong>${tunnel.serviceName}</strong> (Port: ${tunnel.port})<br>
                    <a href="${tunnel.url}" target="_blank">${tunnel.url}</a><br>
                    <small>Status: ${tunnel.status}</small>
                </div>
            `).join('')}
        </div>
        ` : ''}
    </div>
    ${this.getCommonScripts()}
</body>
</html>`;
    }
    

    generateMainMenuHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>🚀 Development Tools</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 20px; background: #f5f5f5; 
            min-height: 100vh;
        }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 40px; }
        .menu-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .menu-item { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; padding: 25px; border-radius: 12px; 
            text-decoration: none; transition: transform 0.2s;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .menu-item:hover { transform: translateY(-2px); box-shadow: 0 6px 25px rgba(0,0,0,0.15); }
        .menu-item.git { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
        .menu-icon { font-size: 2.5em; margin-bottom: 15px; display: block; }
        .menu-title { font-size: 1.3em; font-weight: 600; margin-bottom: 8px; }
        .menu-desc { font-size: 0.95em; opacity: 0.9; }
        .version-selector { 
            margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; 
            border: 2px dashed #007cba; text-align: center;
        }
        .version-selector h3 { 
            margin: 0 0 15px 0; color: #007cba; font-size: 1.1em; 
        }
        .version-buttons { 
            display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;
        }
        .version-btn { 
            padding: 12px 20px; border-radius: 6px; text-decoration: none; 
            font-weight: 600; transition: all 0.2s; display: inline-block;
            min-width: 140px; text-align: center;
        }
        .version-btn.current { 
            background: #6c757d; color: white; border: 2px solid #6c757d; 
        }
        .version-btn.current:hover { 
            background: #5a6268; transform: translateY(-1px); 
        }
        .version-btn.new { 
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
            color: white; border: 2px solid #28a745; 
        }
        .version-btn.new:hover { 
            background: linear-gradient(135deg, #218838 0%, #1eb489 100%); 
            transform: translateY(-1px); 
        }
        @media (max-width: 768px) { 
            .container { padding: 20px; margin: 10px; }
            .menu-grid { grid-template-columns: 1fr; }
            .version-buttons { flex-direction: column; align-items: center; }
            .version-btn { min-width: 200px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Development Tools</h1>
            <p>Bot Instance: <strong>${this.botInstance}</strong></p>
            
            <div class="version-selector">
                <h3>🧪 Version Selector</h3>
                <div class="version-buttons">
                    <a href="/" class="version-btn current">📄 Current Version</a>
                    <a href="/v2" class="version-btn new">🚀 Vue Version</a>
                </div>
            </div>
        </div>
        
        <div class="menu-grid">
            <a href="/files" class="menu-item">
                <span class="menu-icon">📁</span>
                <div class="menu-title">File Browser</div>
                <div class="menu-desc">Browse and view project files with syntax highlighting</div>
            </a>
            
            <a href="/git" class="menu-item git">
                <span class="menu-icon">🔍</span>
                <div class="menu-title">Git Diff Viewer</div>
                <div class="menu-desc">View git changes, diffs, and status with syntax highlighting</div>
            </a>
            
            <a href="/info" class="menu-item" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
                <span class="menu-icon">ℹ️</span>
                <div class="menu-title">QTunnel Info</div>
                <div class="menu-desc">WebSocket-based tunnel status and connection information</div>
            </a>
        </div>
    </div>
    ${this.getCommonScripts()}
</body>
</html>`;
    }

    generateFileBrowserHTML({ directories, files, currentPath }) {
        const breadcrumbs = this.generateBreadcrumbs(currentPath, '/files');
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>📁 File Browser</title>
    ${this.getCommonStyles()}
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/" class="back-link">← Home</a>
            <h1>📁 File Browser</h1>
            <div class="breadcrumbs">${breadcrumbs}</div>
            ${currentPath ? `<a href="/files?path=${encodeURIComponent(path.dirname(currentPath))}" class="back-link">← Back</a>` : ''}
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
                                <a href="/files?path=${encodeURIComponent(dir.path)}" class="file-name directory">${dir.name}/</a>
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
                                <a href="/files/view?path=${encodeURIComponent(file.path)}" class="file-name">${file.name}</a>
                            </div>
                        </td>
                        <td>${file.size}</td>
                        <td>${file.modified}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    ${this.getCommonScripts()}
</body>
</html>`;
    }

    generateGitDiffHTML(files) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>🔍 Git Diff Viewer</title>
    ${this.getCommonStyles()}
    ${this.getGitStyles()}
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/" class="back-link">← Home</a>
            <h1>🔍 Git Diff Viewer</h1>
            <div class="nav-links">
                <a href="/git" class="active">Changed Files</a>
                <a href="/git/status">Full Status</a>
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
                                    <a href="/git/diff?file=${encodeURIComponent(file.path)}" class="file-name">${file.path}</a>
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
    ${this.getCommonScripts()}
</body>
</html>`;
    }

    generateFileViewHTML(content, filePath, extension) {
        const language = this.getLanguageForHighlighting(extension);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>📄 ${path.basename(filePath)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/themes/prism.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/line-numbers/prism-line-numbers.min.css">
    ${this.getCommonStyles()}
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/files?path=${encodeURIComponent(path.dirname(filePath))}" class="back-link">← Back to directory</a>
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
    ${this.getCommonScripts()}
</body>
</html>`;
    }

    generateDiffViewHTML(diff, filePath) {
        const syntaxHighlightedDiff = this.highlightDiff(diff);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>📄 ${path.basename(filePath)} - Diff</title>
    ${this.getCommonStyles()}
    ${this.getDiffStyles()}
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/git" class="back-link">← Back to file list</a>
            <h1>📄 ${path.basename(filePath)}</h1>
            <p>Path: ${filePath}</p>
        </div>
        
        <div class="diff-content">
            ${syntaxHighlightedDiff}
        </div>
    </div>
    ${this.getCommonScripts()}
</body>
</html>`;
    }

    generateGitStatusHTML(status) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>📊 Git Status</title>
    ${this.getCommonStyles()}
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/git" class="back-link">← Back to file list</a>
            <h1>📊 Git Status</h1>
            <div class="nav-links">
                <a href="/git">Changed Files</a>
                <a href="/git/status" class="active">Full Status</a>
            </div>
        </div>
        
        <div class="status-content">${this.escapeHtml(status)}</div>
    </div>
    ${this.getCommonScripts()}
</body>
</html>`;
    }

    generateErrorHTML(message) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Error</title>
    ${this.getCommonStyles()}
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/" class="back-link">← Home</a>
            <h1 class="error">⚠️ Error</h1>
        </div>
        <p>${this.escapeHtml(message)}</p>
    </div>
    ${this.getCommonScripts()}
</body>
</html>`;
    }

    // ========== UTILITY METHODS ==========
    generateBreadcrumbs(currentPath, baseUrl = '/files') {
        if (!currentPath) return 'Project Root';
        
        const parts = currentPath.split(path.sep).filter(part => part);
        let breadcrumbs = `<a href="${baseUrl}">Project Root</a>`;
        let buildPath = '';
        
        for (const part of parts) {
            buildPath = path.join(buildPath, part);
            breadcrumbs += ` / <a href="${baseUrl}?path=${encodeURIComponent(buildPath)}">${part}</a>`;
        }
        
        return breadcrumbs;
    }

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

    // ========== STYLES ==========
    getCommonStyles() {
        return `
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0; padding: 10px; background: #f5f5f5; 
            min-height: 100vh; overflow-x: hidden;
        }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 1px solid #e1e1e1; padding-bottom: 15px; margin-bottom: 20px; }
        .back-link { display: inline-block; margin-bottom: 15px; color: #666; text-decoration: none; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; }
        .back-link:hover { color: #007cba; background: #e9ecef; }
        .breadcrumbs { color: #666; margin-bottom: 10px; }
        .breadcrumbs a { color: #007cba; text-decoration: none; }
        .breadcrumbs a:hover { text-decoration: underline; }
        .file-list { border-collapse: collapse; width: 100%; }
        .file-list th, .file-list td { padding: 12px; text-align: left; border-bottom: 1px solid #e1e1e1; }
        .file-list th { background: #f8f9fa; font-weight: 600; }
        .file-item { display: flex; align-items: center; }
        .file-icon { width: 20px; margin-right: 10px; font-size: 16px; }
        .file-name { color: #333; text-decoration: none; }
        .file-name:hover { color: #007cba; }
        .directory { color: #007cba; font-weight: 500; }
        .file-content { background: #f8f9fa; border: 1px solid #e1e1e1; border-radius: 4px; overflow-x: auto; }
        .file-content pre { margin: 0; padding: 20px; font-family: 'Monaco', 'Courier New', monospace; font-size: 14px; line-height: 1.5; }
        .line-numbers { color: #999; user-select: none; }
        .empty-state { text-align: center; padding: 40px; color: #666; }
        .error { color: #d63384; }
        @media (max-width: 768px) { 
            .container { padding: 10px; margin: 10px; }
            .file-list { font-size: 14px; }
            .file-list td, .file-list th { padding: 8px 5px; }
        }
    </style>`;
    }

    getCommonScripts() {
        return `
    <script>
        // Token Management System
        class TokenManager {
            constructor() {
                this.COOKIE_NAME = 'auth_token';
                this.COOKIE_EXPIRES_DAYS = 7; // Token cookie expires in 7 days
                this.init();
            }

            init() {
                // Check if there's a token in the URL
                const urlToken = this.getTokenFromUrl();
                if (urlToken) {
                    // Save token to cookie
                    this.saveTokenToCookie(urlToken);
                    // Clean the URL by removing the token parameter
                    this.cleanUrl();
                }
            }

            getTokenFromUrl() {
                const urlParams = new URLSearchParams(window.location.search);
                return urlParams.get('token');
            }

            saveTokenToCookie(token) {
                const expires = new Date();
                expires.setTime(expires.getTime() + (this.COOKIE_EXPIRES_DAYS * 24 * 60 * 60 * 1000));
                document.cookie = this.COOKIE_NAME + '=' + token + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax';
                console.log('Token saved to cookie');
            }

            getTokenFromCookie() {
                const name = this.COOKIE_NAME + '=';
                const decodedCookie = decodeURIComponent(document.cookie);
                const ca = decodedCookie.split(';');
                for (let i = 0; i < ca.length; i++) {
                    let c = ca[i];
                    while (c.charAt(0) === ' ') {
                        c = c.substring(1);
                    }
                    if (c.indexOf(name) === 0) {
                        return c.substring(name.length, c.length);
                    }
                }
                return null;
            }

            cleanUrl() {
                // Remove token from URL without reloading the page
                const url = new URL(window.location);
                url.searchParams.delete('token');
                window.history.replaceState({}, document.title, url.toString());
            }

            // Add token to URLs for navigation
            addTokenToUrl(url) {
                const token = this.getTokenFromCookie();
                if (!token) return url;

                const urlObj = new URL(url, window.location.origin);
                // Only add token if it's not already present
                if (!urlObj.searchParams.has('token')) {
                    urlObj.searchParams.set('token', token);
                }
                return urlObj.toString();
            }

            // Enhanced link clicking with automatic token injection
            enhanceLinks() {
                document.addEventListener('click', (e) => {
                    const link = e.target.closest('a');
                    if (link && link.href) {
                        // Only enhance internal links (same origin)
                        try {
                            const linkUrl = new URL(link.href);
                            if (linkUrl.origin === window.location.origin && !linkUrl.searchParams.has('token')) {
                                e.preventDefault();
                                window.location.href = this.addTokenToUrl(link.href);
                            }
                        } catch (e) {
                            // Invalid URL, let it proceed normally
                        }
                    }
                });
            }
        }

        // Initialize token manager when page loads
        document.addEventListener('DOMContentLoaded', function() {
            const tokenManager = new TokenManager();
            tokenManager.enhanceLinks();
        });
    </script>`;
    }

    getGitStyles() {
        return `
    <style>
        .nav-links { margin-bottom: 15px; }
        .nav-links a { 
            display: inline-block; margin-right: 15px; padding: 8px 12px; 
            background: #f8f9fa; border-radius: 4px; text-decoration: none; 
            color: #333; border: 1px solid #e1e1e1;
        }
        .nav-links a:hover { background: #e9ecef; }
        .nav-links a.active { background: #007cba; color: white; }
        .change-type { 
            padding: 4px 8px; border-radius: 3px; font-size: 12px; font-weight: 500;
        }
        .change-type.modified { background: #fff3cd; color: #856404; }
        .change-type.added { background: #d1edff; color: #0c5460; }
        .change-type.deleted { background: #f8d7da; color: #721c24; }
        .change-type.untracked { background: #e2e3e5; color: #383d41; }
        .change-type.renamed { background: #d4edda; color: #155724; }
        .status-code { font-family: monospace; font-size: 12px; color: #666; }
        .status-content { 
            background: #f8f9fa; border: 1px solid #e1e1e1; border-radius: 4px; padding: 20px;
            font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
            font-size: 14px; line-height: 1.5; white-space: pre-wrap;
        }
    </style>`;
    }

    getDiffStyles() {
        return `
    <style>
        .diff-content { 
            background: #f8f9fa; border: 1px solid #e1e1e1; border-radius: 4px; overflow-x: auto; 
            font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
            font-size: 13px; line-height: 1.4;
        }
        .diff-line { 
            padding: 2px 8px; white-space: pre; border-left: 3px solid transparent; margin: 0;
        }
        .diff-line.added { 
            background-color: #e6ffed; border-left-color: #28a745; color: #22863a;
        }
        .diff-line.removed { 
            background-color: #ffeef0; border-left-color: #d73a49; color: #b31d28;
        }
        .diff-line.context { color: #586069; }
        .diff-line.header { 
            background-color: #f1f8ff; color: #0366d6; font-weight: 500;
        }
        .diff-line.hunk { 
            background-color: #f6f8fa; color: #6a737d; border-left-color: #d1d5da;
        }
        .line-number {
            display: inline-block; width: 50px; color: #959da5; text-align: right;
            margin-right: 10px; user-select: none;
        }
        @media (max-width: 768px) { 
            .diff-content { font-size: 12px; }
            .line-number { width: 40px; margin-right: 5px; }
        }
    </style>`;
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

    // ========== VUE.JS IMPLEMENTATION (NEW) ==========
    
    setupVueRoutes() {
        // Configure EJS as template engine for Vue routes
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
        
        // ========== NEW VUE ROUTES (/v2 prefix) ==========
        
        // Main menu with version selector
        this.app.get('/v2', async (req, res) => {
            res.render('v2/main-menu', {
                botInstance: this.botInstance,
                currentVersion: 'vue'
            });
        });

        // File browser routes
        this.app.get('/v2/files', async (req, res) => {
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

        this.app.get('/v2/files/view', async (req, res) => {
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
                    return res.redirect(`/v2/files?path=${encodeURIComponent(filePath)}`);
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

        // Git diff routes
        this.app.get('/v2/git', async (req, res) => {
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

        this.app.get('/v2/git/diff', async (req, res) => {
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

        this.app.get('/v2/git/status', async (req, res) => {
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

        // Info page
        this.app.get('/v2/info', async (req, res) => {
            const stats = this.tunnelAdapter.getTunnelStats();
            res.render('v2/info-simple', {
                stats,
                botInstance: this.botInstance
            });
        });
    }
}

module.exports = UnifiedWebServer;
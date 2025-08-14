const BaseWebServer = require('../BaseWebServer');

/**
 * Example: Simple Status Page
 * Demonstrates how to create a new protected web page using BaseWebServer
 */
class SimpleStatusPage extends BaseWebServer {
    constructor(botInstance = 'bot1', ngrokAuthToken = null) {
        super({ 
            botInstance, 
            ngrokAuthToken,
            // You can add routes directly in constructor options
            routes: [
                {
                    method: 'GET',
                    path: '/api/status',
                    handler: (req, res) => {
                        res.json({
                            status: 'active',
                            botInstance: this.botInstance,
                            uptime: process.uptime(),
                            memory: process.memoryUsage(),
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            ]
        });
    }
    
    /**
     * Override setupRoutes to add custom functionality
     */
    setupRoutes() {
        // Call parent to set up basic routes
        super.setupRoutes();
        
        // Add main status page
        this.app.get('/', (req, res) => {
            const statusData = this.getStatusData();
            const content = this.generateStatusHTML(statusData);
            res.send(this.generateBasePage('Bot Status Dashboard', content, this.getStatusStyles()));
        });
        
        // Add system info page
        this.app.get('/system', (req, res) => {
            const systemData = this.getSystemData();
            const content = this.generateSystemHTML(systemData);
            res.send(this.generateBasePage('System Information', content));
        });
    }
    
    /**
     * Get current status data
     */
    getStatusData() {
        return {
            botInstance: this.botInstance,
            status: 'Running',
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform,
            timestamp: new Date().toLocaleString()
        };
    }
    
    /**
     * Get system information
     */
    getSystemData() {
        const os = require('os');
        return {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
            freeMemory: (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
            loadAvg: os.loadavg(),
            uptime: Math.floor(os.uptime())
        };
    }
    
    /**
     * Generate status page HTML
     */
    generateStatusHTML(data) {
        const memoryMB = (data.memory.used / 1024 / 1024).toFixed(2);
        const uptimeHours = Math.floor(data.uptime / 3600);
        const uptimeMinutes = Math.floor((data.uptime % 3600) / 60);
        
        return `
            <div class="status-grid">
                <div class="status-card">
                    <h3>🤖 Bot Status</h3>
                    <div class="status-item">
                        <span class="label">Instance:</span>
                        <span class="value">${data.botInstance}</span>
                    </div>
                    <div class="status-item">
                        <span class="label">Status:</span>
                        <span class="value status-active">${data.status}</span>
                    </div>
                    <div class="status-item">
                        <span class="label">Uptime:</span>
                        <span class="value">${uptimeHours}h ${uptimeMinutes}m</span>
                    </div>
                </div>
                
                <div class="status-card">
                    <h3>💾 Memory Usage</h3>
                    <div class="status-item">
                        <span class="label">Used:</span>
                        <span class="value">${memoryMB} MB</span>
                    </div>
                    <div class="status-item">
                        <span class="label">Heap Used:</span>
                        <span class="value">${(data.memory.heapUsed / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                </div>
                
                <div class="status-card">
                    <h3>🔧 Environment</h3>
                    <div class="status-item">
                        <span class="label">Node.js:</span>
                        <span class="value">${data.nodeVersion}</span>
                    </div>
                    <div class="status-item">
                        <span class="label">Platform:</span>
                        <span class="value">${data.platform}</span>
                    </div>
                </div>
            </div>
            
            <div class="actions">
                <a href="${this.getSecureUrl('/system')}" class="secure-link btn">System Info</a>
                <a href="${this.getSecureUrl('/api/status')}" class="secure-link btn">API Status</a>
            </div>
            
            <div class="footer">
                <p>Last updated: ${data.timestamp}</p>
            </div>
        `;
    }
    
    /**
     * Generate system information HTML
     */
    generateSystemHTML(data) {
        return `
            <div class="system-info">
                <div class="info-section">
                    <h3>System Overview</h3>
                    <ul>
                        <li><strong>Hostname:</strong> ${data.hostname}</li>
                        <li><strong>Platform:</strong> ${data.platform}</li>
                        <li><strong>Architecture:</strong> ${data.arch}</li>
                        <li><strong>CPUs:</strong> ${data.cpus} cores</li>
                    </ul>
                </div>
                
                <div class="info-section">
                    <h3>Memory Information</h3>
                    <ul>
                        <li><strong>Total Memory:</strong> ${data.totalMemory}</li>
                        <li><strong>Free Memory:</strong> ${data.freeMemory}</li>
                        <li><strong>Load Average:</strong> ${data.loadAvg.map(l => l.toFixed(2)).join(', ')}</li>
                    </ul>
                </div>
                
                <div class="info-section">
                    <h3>System Uptime</h3>
                    <p><strong>${Math.floor(data.uptime / 86400)} days, ${Math.floor((data.uptime % 86400) / 3600)} hours</strong></p>
                </div>
            </div>
            
            <div class="actions">
                <a href="${this.getSecureUrl('/')}" class="secure-link btn">← Back to Status</a>
            </div>
        `;
    }
    
    /**
     * Custom styles for status page
     */
    getStatusStyles() {
        return `
            .status-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .status-card {
                background: #f8f9fa;
                border: 1px solid #e1e1e1;
                border-radius: 8px;
                padding: 20px;
            }
            .status-card h3 {
                margin: 0 0 15px 0;
                color: #333;
            }
            .status-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            .status-item .label {
                font-weight: 500;
                color: #666;
            }
            .status-item .value {
                color: #333;
            }
            .status-active {
                color: #28a745;
                font-weight: 600;
            }
            .actions {
                text-align: center;
                margin: 30px 0;
            }
            .btn {
                display: inline-block;
                padding: 10px 20px;
                margin: 0 10px;
                background: #007cba;
                color: white;
                border-radius: 5px;
                text-decoration: none;
            }
            .btn:hover {
                background: #005a87;
                text-decoration: none;
            }
            .footer {
                text-align: center;
                color: #666;
                font-size: 0.9rem;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e1e1e1;
            }
            .system-info {
                max-width: 800px;
            }
            .info-section {
                background: #f8f9fa;
                padding: 20px;
                margin-bottom: 20px;
                border-radius: 8px;
                border: 1px solid #e1e1e1;
            }
            .info-section h3 {
                margin: 0 0 15px 0;
                color: #333;
            }
            .info-section ul {
                margin: 0;
                padding-left: 20px;
            }
            .info-section li {
                margin-bottom: 8px;
            }
        `;
    }
}

module.exports = SimpleStatusPage;

// Example usage:
// const statusPage = new SimpleStatusPage('bot1', 'your-ngrok-token');
// statusPage.start().then(url => {
//     console.log(`Status page available at: ${url}`);
// });
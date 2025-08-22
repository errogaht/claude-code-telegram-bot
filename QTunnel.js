const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

/**
 * QTunnel Integration
 * Supports HTTP/2 and WebSocket protocols for improved VPN compatibility
 * HTTP/2 protocol provides better compatibility with X-Ray Reality VPN
 * Based on: https://github.com/errogaht/qtunnel
 */
class QTunnel {
    constructor(options = {}) {
        this.protocol = options.protocol || 'auto';
        this.token = options.token || null;
        this.botInstance = options.botInstance || 'bot1';
        this.activeTunnels = new Map();
        
        // Set server URL based on protocol
        if (this.protocol === 'http2') {
            this.server = options.server || 'https://qtunnel.q9x.ru/http2';
        } else if (this.protocol === 'websocket') {
            this.server = options.server || 'wss://qtunnel.q9x.ru/ws';
        } else { // auto protocol
            this.server = options.server || 'wss://qtunnel.q9x.ru/ws';
        }
        
        console.log(`[QTunnel] Initialized for ${this.botInstance}`);
        console.log(`[QTunnel] Protocol: ${this.protocol}, Server: ${this.server}`);
        if (this.token) {
            console.log(`[QTunnel] Token configured: ${this.token.substring(0, 8)}...`);
        }
    }

    /**
     * Create tunnel using qtunnel with new stream JSON format (v1.1.0+)
     */
    async createTunnel(port, serviceName = 'service') {
        if (!this.token) {
            throw new Error('QTunnel token not configured');
        }

        // Check if qtunnel is available
        try {
            await execAsync('which qtunnel');
        } catch (e) {
            throw new Error('qtunnel not installed. Install from: https://github.com/errogaht/qtunnel');
        }

        const tunnelId = `${serviceName}-${this.botInstance}`;
        
        // Close existing tunnel if any
        await this.closeTunnel(serviceName);

        console.log(`[QTunnel] Starting tunnel for ${serviceName} on port ${port}`);

        return new Promise((resolve, reject) => {
            // Use new stream JSON format with HTTP/2 protocol support (v1.4.0+)
            const args = [
                '--output-format', 'stream.json',
                '--protocol', this.protocol,
                '--server', this.server,
                '--token', this.token,
                port.toString()
            ];
            
            console.log(`[QTunnel] Command: qtunnel ${args.join(' ')}`);
            
            const process = spawn('qtunnel', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let urlFound = false;
            let reconnectAttempts = 0;
            const maxReconnectAttempts = 5;
            
            const timeout = setTimeout(() => {
                if (!urlFound) {
                    process.kill();
                    reject(new Error('QTunnel timeout - tunnel creation took too long'));
                }
            }, 30000); // 30 second timeout

            const handleStreamOutput = (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                
                lines.forEach(line => {
                    try {
                        const event = JSON.parse(line);
                        
                        // Log all events for debugging
                        console.log(`[QTunnel Debug] Event:`, event);
                        
                        // Tunnel status updates
                        if (event.status === 'active' && event.domain && !urlFound) {
                            urlFound = true;
                            clearTimeout(timeout);
                            
                            const tunnelUrl = `https://${event.domain}`;
                            const tunnelInfo = {
                                url: tunnelUrl,
                                process: process,
                                type: 'qtunnel',
                                tunnelId: tunnelId,
                                port: port,
                                serviceName: serviceName,
                                domain: event.domain,
                                status: 'active',
                                lastSeen: new Date(),
                                reconnectAttempts: 0
                            };
                            
                            this.activeTunnels.set(tunnelId, tunnelInfo);
                            console.log(`[QTunnel] ✅ ${serviceName} tunnel created: ${tunnelUrl}`);
                            resolve(tunnelUrl);
                        }
                        
                        // Connection status monitoring
                        if (event.status === 'connecting') {
                            console.log(`[QTunnel] Connecting to server...`);
                        }
                        
                        if (event.status === 'disconnected') {
                            console.warn(`[QTunnel] ⚠️ Tunnel disconnected - attempting reconnection`);
                            reconnectAttempts++;
                            
                            // Update tunnel info if exists
                            const tunnelInfo = this.activeTunnels.get(tunnelId);
                            if (tunnelInfo) {
                                tunnelInfo.status = 'disconnected';
                                tunnelInfo.reconnectAttempts = reconnectAttempts;
                                tunnelInfo.lastSeen = new Date();
                            }
                        }
                        
                        if (event.status === 'reconnected') {
                            console.log(`[QTunnel] ✅ Tunnel reconnected successfully`);
                            reconnectAttempts = 0;
                            
                            // Update tunnel info if exists
                            const tunnelInfo = this.activeTunnels.get(tunnelId);
                            if (tunnelInfo) {
                                tunnelInfo.status = 'active';
                                tunnelInfo.reconnectAttempts = 0;
                                tunnelInfo.lastSeen = new Date();
                            }
                        }
                        
                        // Request monitoring
                        if (event.request_id) {
                            console.log(`[QTunnel] 📡 ${event.method} ${event.url} ${event.status}`);
                            
                            // Update last activity
                            const tunnelInfo = this.activeTunnels.get(tunnelId);
                            if (tunnelInfo) {
                                tunnelInfo.lastSeen = new Date();
                            }
                        }
                        
                        // Error handling
                        if (event.level === 'ERROR') {
                            console.error(`[QTunnel] ❌ Error: ${event.message}`);
                            if (event.details) {
                                console.error(`[QTunnel] Error details:`, event.details);
                            }
                            
                            // If too many reconnect attempts, reject
                            if (reconnectAttempts >= maxReconnectAttempts) {
                                clearTimeout(timeout);
                                reject(new Error(`QTunnel failed after ${maxReconnectAttempts} reconnection attempts: ${event.message}`));
                            }
                        }
                        
                        // Log other important events
                        if (event.level === 'INFO' && event.message && event.message.includes('created')) {
                            console.log(`[QTunnel] ✅ ${event.message}`);
                        }
                        
                    } catch (e) {
                        // Non-JSON lines - could be legacy format fallback
                        const output = line.trim();
                        if (output) {
                            console.log(`[QTunnel Debug] Non-JSON: ${output}`);
                            
                            // Fallback: Look for legacy URL pattern
                            const urlMatch = output.match(/🌐 Public URL: (https:\/\/[a-f0-9]+-tun\.q9x\.ru)/);
                            if (urlMatch && !urlFound) {
                                urlFound = true;
                                clearTimeout(timeout);
                                
                                const tunnelInfo = {
                                    url: urlMatch[1],
                                    process: process,
                                    type: 'qtunnel',
                                    tunnelId: tunnelId,
                                    port: port,
                                    serviceName: serviceName,
                                    status: 'active',
                                    lastSeen: new Date(),
                                    reconnectAttempts: 0
                                };
                                
                                this.activeTunnels.set(tunnelId, tunnelInfo);
                                console.log(`[QTunnel] ✅ ${serviceName} tunnel created (legacy): ${urlMatch[1]}`);
                                resolve(urlMatch[1]);
                            }
                        }
                    }
                });
            };

            process.stdout.on('data', handleStreamOutput);
            process.stderr.on('data', (data) => {
                console.error(`[QTunnel] stderr: ${data.toString().trim()}`);
            });

            process.on('error', (error) => {
                clearTimeout(timeout);
                console.error(`[QTunnel] Process error: ${error.message}`);
                reject(error);
            });

            process.on('exit', (code) => {
                clearTimeout(timeout);
                console.log(`[QTunnel] Process exited with code ${code}`);
                
                // Remove from active tunnels
                this.activeTunnels.delete(tunnelId);
                
                if (!urlFound) {
                    reject(new Error(`QTunnel process exited with code ${code}`));
                }
            });
        });
    }

    /**
     * Close specific tunnel
     */
    async closeTunnel(serviceName) {
        const tunnelId = `${serviceName}-${this.botInstance}`;
        const tunnelInfo = this.activeTunnels.get(tunnelId);
        
        if (!tunnelInfo) {
            console.log(`[QTunnel] No tunnel found for ${serviceName}`);
            return;
        }

        try {
            if (tunnelInfo.process && !tunnelInfo.process.killed) {
                console.log(`[QTunnel] Closing ${serviceName} tunnel...`);
                tunnelInfo.process.kill('SIGTERM');
                
                // Wait a bit for graceful shutdown, then force kill if needed
                setTimeout(() => {
                    if (!tunnelInfo.process.killed) {
                        tunnelInfo.process.kill('SIGKILL');
                    }
                }, 2000);
            }
            this.activeTunnels.delete(tunnelId);
            console.log(`[QTunnel] ✅ Closed ${serviceName} tunnel`);
        } catch (error) {
            console.error(`[QTunnel] Error closing ${serviceName} tunnel:`, error.message);
        }
    }

    /**
     * Close all tunnels
     */
    async closeAllTunnels() {
        console.log(`[QTunnel] Closing all tunnels...`);
        
        for (const [tunnelId, tunnelInfo] of this.activeTunnels) {
            try {
                if (tunnelInfo.process && !tunnelInfo.process.killed) {
                    tunnelInfo.process.kill('SIGTERM');
                    
                    // Force kill after timeout
                    setTimeout(() => {
                        if (!tunnelInfo.process.killed) {
                            tunnelInfo.process.kill('SIGKILL');
                        }
                    }, 2000);
                }
            } catch (error) {
                console.error(`[QTunnel] Error closing tunnel ${tunnelId}:`, error.message);
            }
        }
        
        this.activeTunnels.clear();
        console.log(`[QTunnel] ✅ All tunnels closed`);
    }

    /**
     * Get tunnel information
     */
    getTunnelInfo(serviceName) {
        const tunnelId = `${serviceName}-${this.botInstance}`;
        return this.activeTunnels.get(tunnelId);
    }

    /**
     * Get all active tunnels
     */
    getActiveTunnels() {
        const tunnels = [];
        for (const [tunnelId, tunnelInfo] of this.activeTunnels) {
            tunnels.push({
                id: tunnelId,
                serviceName: tunnelInfo.serviceName,
                url: tunnelInfo.url,
                port: tunnelInfo.port,
                status: tunnelInfo.process && !tunnelInfo.process.killed ? 'active' : 'inactive'
            });
        }
        return tunnels;
    }

    /**
     * Test qtunnel availability
     */
    async testAvailability() {
        try {
            await execAsync('which qtunnel');
            if (!this.token) {
                return 'qtunnel available but token not configured';
            }
            return `qtunnel available (server: ${this.server})`;
        } catch (error) {
            return `qtunnel not available: ${error.message}`;
        }
    }

    /**
     * Get tunnel statistics with enhanced monitoring data
     */
    getTunnelStats() {
        const tunnels = this.getActiveTunnels();
        const now = new Date();
        
        const stats = {
            provider: 'qtunnel',
            server: this.server,
            activeTunnels: this.activeTunnels.size,
            tunnels: tunnels,
            health: {
                allActive: tunnels.every(t => t.status === 'active'),
                hasReconnects: tunnels.some(t => t.reconnectAttempts > 0),
                avgReconnects: tunnels.length > 0 ? 
                    tunnels.reduce((sum, t) => sum + (t.reconnectAttempts || 0), 0) / tunnels.length : 0,
                oldestTunnel: tunnels.length > 0 ? 
                    Math.min(...tunnels.map(t => t.lastSeen ? now - new Date(t.lastSeen) : 0)) : 0
            }
        };
        
        // Add stability warnings
        stats.warnings = [];
        tunnels.forEach(tunnel => {
            if (tunnel.reconnectAttempts > 2) {
                stats.warnings.push(`${tunnel.serviceName}: High reconnection count (${tunnel.reconnectAttempts})`);
            }
            if (tunnel.lastSeen && (now - new Date(tunnel.lastSeen)) > 60000) {
                stats.warnings.push(`${tunnel.serviceName}: No activity for ${Math.round((now - new Date(tunnel.lastSeen)) / 1000)}s`);
            }
            if (tunnel.status !== 'active') {
                stats.warnings.push(`${tunnel.serviceName}: Status is ${tunnel.status}`);
            }
        });
        
        return stats;
    }

    /**
     * Diagnostic method to check tunnel health and server connectivity
     */
    async runDiagnostics() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            qtunnelAvailable: false,
            serverReachable: false,
            tokenValid: false,
            activeTunnels: this.activeTunnels.size,
            tunnelDetails: [],
            systemInfo: {}
        };

        // Check qtunnel binary
        try {
            const { stdout } = await execAsync('which qtunnel');
            diagnostics.qtunnelAvailable = true;
            diagnostics.systemInfo.qtunnelPath = stdout.trim();
            
            // Try to get version
            try {
                const { stdout: version } = await execAsync('qtunnel --version');
                diagnostics.systemInfo.qtunnelVersion = version.trim();
            } catch (e) {
                diagnostics.systemInfo.qtunnelVersion = 'unknown';
            }
        } catch (error) {
            diagnostics.qtunnelAvailable = false;
            diagnostics.errors = diagnostics.errors || [];
            diagnostics.errors.push(`qtunnel not found: ${error.message}`);
        }

        // Check token configuration
        if (this.token) {
            diagnostics.tokenValid = true;
            diagnostics.systemInfo.tokenPrefix = this.token.substring(0, 8) + '...';
        } else {
            diagnostics.tokenValid = false;
            diagnostics.errors = diagnostics.errors || [];
            diagnostics.errors.push('QTunnel token not configured');
        }

        // Check active tunnels health
        for (const [tunnelId, tunnelInfo] of this.activeTunnels) {
            const now = new Date();
            const lastSeenMs = tunnelInfo.lastSeen ? now - new Date(tunnelInfo.lastSeen) : null;
            
            diagnostics.tunnelDetails.push({
                id: tunnelId,
                serviceName: tunnelInfo.serviceName,
                url: tunnelInfo.url,
                port: tunnelInfo.port,
                status: tunnelInfo.status,
                reconnectAttempts: tunnelInfo.reconnectAttempts || 0,
                lastSeenAgo: lastSeenMs ? `${Math.round(lastSeenMs / 1000)}s` : 'unknown',
                processAlive: tunnelInfo.process && !tunnelInfo.process.killed,
                processExitCode: tunnelInfo.process?.exitCode || null
            });
        }

        // Server connectivity test (basic)
        try {
            // Test if we can resolve the domain
            const serverUrl = new URL(this.server);
            diagnostics.systemInfo.serverHost = serverUrl.host;
            diagnostics.serverReachable = true; // We'll assume reachable if URL parses
        } catch (error) {
            diagnostics.serverReachable = false;
            diagnostics.errors = diagnostics.errors || [];
            diagnostics.errors.push(`Server URL invalid: ${error.message}`);
        }

        return diagnostics;
    }

    /**
     * Enhanced monitoring with health checks
     */
    startHealthMonitoring(intervalMs = 30000) {
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
        }

        this.healthMonitorInterval = setInterval(async () => {
            const stats = this.getTunnelStats();
            
            if (stats.warnings.length > 0) {
                console.warn(`[QTunnel] Health warnings:`, stats.warnings);
            }
            
            // Check for dead tunnels
            const now = new Date();
            for (const [tunnelId, tunnelInfo] of this.activeTunnels) {
                if (tunnelInfo.process && tunnelInfo.process.killed) {
                    console.warn(`[QTunnel] Removing dead tunnel: ${tunnelId}`);
                    this.activeTunnels.delete(tunnelId);
                }
                
                // Check for very old last activity
                if (tunnelInfo.lastSeen && (now - new Date(tunnelInfo.lastSeen)) > 300000) { // 5 minutes
                    console.warn(`[QTunnel] Tunnel ${tunnelId} has been inactive for 5+ minutes`);
                }
            }
        }, intervalMs);

        console.log(`[QTunnel] Health monitoring started (${intervalMs}ms interval)`);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
            console.log(`[QTunnel] Health monitoring stopped`);
        }
    }
}

module.exports = QTunnel;
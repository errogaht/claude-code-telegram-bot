const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

/**
 * QTunnel Integration
 * Connects to qtunnel server with WebSocket-based tunneling
 * Based on: https://github.com/errogaht/qtunnel
 */
class QTunnel {
    constructor(options = {}) {
        this.server = options.server || 'wss://qtunnel.q9x.ru/ws';
        this.token = options.token || null;
        this.botInstance = options.botInstance || 'bot1';
        this.activeTunnels = new Map();
        
        console.log(`[QTunnel] Initialized for ${this.botInstance}`);
        if (this.token) {
            console.log(`[QTunnel] Token configured: ${this.token.substring(0, 8)}...`);
        }
    }

    /**
     * Create tunnel using qtunnel
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
            const process = spawn('qtunnel', [
                '--server', this.server,
                '--token', this.token,
                port.toString()
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let urlFound = false;
            const timeout = setTimeout(() => {
                if (!urlFound) {
                    process.kill();
                    reject(new Error('QTunnel timeout - tunnel creation took too long'));
                }
            }, 30000); // 30 second timeout

            const handleOutput = (data) => {
                const output = data.toString();
                console.log(`[QTunnel Debug] ${output.trim()}`);
                
                // Look for public URL pattern: https://xxxxx-tun.q9x.ru
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
                        serviceName: serviceName
                    };
                    
                    this.activeTunnels.set(tunnelId, tunnelInfo);
                    console.log(`[QTunnel] ✅ ${serviceName} tunnel created: ${urlMatch[1]}`);
                    resolve(urlMatch[1]);
                }
            };

            process.stdout.on('data', handleOutput);
            process.stderr.on('data', handleOutput);

            process.on('error', (error) => {
                clearTimeout(timeout);
                console.error(`[QTunnel] Process error: ${error.message}`);
                reject(error);
            });

            process.on('exit', (code) => {
                clearTimeout(timeout);
                if (!urlFound) {
                    console.error(`[QTunnel] Process exited with code ${code}`);
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
     * Get tunnel statistics
     */
    getTunnelStats() {
        return {
            provider: 'qtunnel',
            server: this.server,
            activeTunnels: this.activeTunnels.size,
            tunnels: this.getActiveTunnels()
        };
    }
}

module.exports = QTunnel;
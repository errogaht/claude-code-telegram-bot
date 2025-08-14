const net = require('net');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Smart Port Resolver - Advanced port allocation with large random ranges
 * Fixes restart loops caused by port conflicts between multiple servers
 */
class SmartPortResolver {
    constructor(options = {}) {
        // Use large port range as requested: 8000-9999 (2000 ports)
        this.minPort = options.minPort || 8000;
        this.maxPort = options.maxPort || 9999;
        this.maxAttempts = options.maxAttempts || 50;
        this.timeout = options.timeout || 3000; // 3 second timeout
        
        // Track allocated ports to avoid immediate reuse
        this.allocatedPorts = new Set();
        this.lastCleanup = Date.now();
        this.cleanupInterval = 60000; // Clean up after 1 minute
        
        console.log(`[SmartPortResolver] Initialized with range ${this.minPort}-${this.maxPort} (${this.maxPort - this.minPort + 1} ports available)`);
    }

    /**
     * Get a random port within the configured range
     */
    getRandomPort() {
        return Math.floor(Math.random() * (this.maxPort - this.minPort + 1)) + this.minPort;
    }

    /**
     * Check if a port is available using multiple methods
     */
    async isPortAvailable(port) {
        // Method 1: Try JavaScript native approach first (fastest)
        const isAvailableJS = await this.isPortAvailableJS(port);
        if (!isAvailableJS) {
            return false;
        }

        // Method 2: Use Unix utilities for additional verification
        const isAvailableUnix = await this.isPortAvailableUnix(port);
        return isAvailableUnix;
    }

    /**
     * JavaScript-based port availability check
     */
    async isPortAvailableJS(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            const onError = () => {
                resolve(false);
            };
            
            const onListening = () => {
                server.close(() => {
                    resolve(true);
                });
            };
            
            server.on('error', onError);
            server.on('listening', onListening);
            
            // Set timeout to prevent hanging
            const timeout = setTimeout(() => {
                server.removeAllListeners();
                try {
                    server.close();
                } catch (e) {
                    // Ignore close errors
                }
                resolve(false);
            }, this.timeout);
            
            server.listen(port, 'localhost', () => {
                clearTimeout(timeout);
                onListening();
            });
        });
    }

    /**
     * Unix utilities-based port availability check
     */
    async isPortAvailableUnix(port) {
        try {
            // Use netstat to check if port is in use
            // -tuln: TCP and UDP, listening, numerical addresses
            const { stdout } = await execAsync(`netstat -tuln 2>/dev/null | grep :${port} || true`, {
                timeout: 2000
            });
            
            // If no output, port is available
            const isInUse = stdout.trim().length > 0;
            
            if (isInUse) {
                // Double-check with lsof if available
                try {
                    const { stdout: lsofOutput } = await execAsync(`lsof -i:${port} 2>/dev/null || true`, {
                        timeout: 1000
                    });
                    return lsofOutput.trim().length === 0;
                } catch (e) {
                    // If lsof fails, trust netstat result
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            // If Unix utilities fail, fall back to JS-only check
            console.log(`[SmartPortResolver] Unix check failed for port ${port}, using JS fallback: ${error.message}`);
            return true; // Already verified by JS method
        }
    }

    /**
     * Find an available port using smart random allocation
     */
    async findAvailablePort(botInstance = 'unknown') {
        console.log(`[SmartPortResolver] Finding available port for ${botInstance}...`);
        
        // Clean up old allocations periodically
        this.cleanupAllocatedPorts();
        
        const startTime = Date.now();
        
        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            const port = this.getRandomPort();
            
            // Skip recently allocated ports to avoid immediate conflicts
            if (this.allocatedPorts.has(port)) {
                continue;
            }
            
            console.log(`[SmartPortResolver] ${botInstance} - Attempt ${attempt}/${this.maxAttempts}: Testing port ${port}`);
            
            const isAvailable = await this.isPortAvailable(port);
            
            if (isAvailable) {
                // Mark port as allocated
                this.allocatedPorts.add(port);
                
                const duration = Date.now() - startTime;
                console.log(`[SmartPortResolver] ✅ Found available port ${port} for ${botInstance} in ${duration}ms (attempt ${attempt})`);
                
                return port;
            } else {
                console.log(`[SmartPortResolver] ❌ Port ${port} is occupied`);
            }
        }
        
        const duration = Date.now() - startTime;
        const errorMsg = `Unable to find available port for ${botInstance} after ${this.maxAttempts} attempts in ${duration}ms. Range: ${this.minPort}-${this.maxPort}`;
        console.error(`[SmartPortResolver] ${errorMsg}`);
        throw new Error(errorMsg);
    }

    /**
     * Release a port allocation (call when server stops)
     */
    releasePort(port, botInstance = 'unknown') {
        if (this.allocatedPorts.has(port)) {
            this.allocatedPorts.delete(port);
            console.log(`[SmartPortResolver] Released port ${port} for ${botInstance}`);
        }
    }

    /**
     * Clean up old port allocations
     */
    cleanupAllocatedPorts() {
        const now = Date.now();
        if (now - this.lastCleanup > this.cleanupInterval) {
            const oldSize = this.allocatedPorts.size;
            // Clear all allocations after cleanup interval
            // This allows ports to be reused after servers have had time to start
            this.allocatedPorts.clear();
            this.lastCleanup = now;
            
            if (oldSize > 0) {
                console.log(`[SmartPortResolver] Cleaned up ${oldSize} old port allocations`);
            }
        }
    }

    /**
     * Get statistics about port usage
     */
    getStats() {
        return {
            portRange: `${this.minPort}-${this.maxPort}`,
            totalPorts: this.maxPort - this.minPort + 1,
            allocatedPorts: this.allocatedPorts.size,
            availablePorts: (this.maxPort - this.minPort + 1) - this.allocatedPorts.size,
            lastCleanup: new Date(this.lastCleanup).toISOString()
        };
    }

    /**
     * Test port availability with detailed diagnostics
     */
    async testPort(port) {
        console.log(`[SmartPortResolver] Testing port ${port} with detailed diagnostics...`);
        
        const jsResult = await this.isPortAvailableJS(port);
        console.log(`[SmartPortResolver] JavaScript check: ${jsResult ? 'AVAILABLE' : 'OCCUPIED'}`);
        
        const unixResult = await this.isPortAvailableUnix(port);
        console.log(`[SmartPortResolver] Unix utilities check: ${unixResult ? 'AVAILABLE' : 'OCCUPIED'}`);
        
        const finalResult = jsResult && unixResult;
        console.log(`[SmartPortResolver] Final result: ${finalResult ? 'AVAILABLE' : 'OCCUPIED'}`);
        
        return finalResult;
    }
}

module.exports = SmartPortResolver;
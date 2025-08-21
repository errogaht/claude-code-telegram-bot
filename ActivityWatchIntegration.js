const axios = require('axios');

/**
 * ActivityWatch Integration
 * Tracks Claude bot sessions in ActivityWatch time tracker
 * API Documentation: https://github.com/ActivityWatch/activitywatch
 */
class ActivityWatchIntegration {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:5600/api/0';
        this.bucketId = options.bucketId || 'claude-bot-sessions';
        this.hostname = require('os').hostname();
        this.enabled = options.enabled !== false; // Enabled by default
        
        console.log(`[ActivityWatch] Integration ${this.enabled ? 'enabled' : 'disabled'}`);
        if (this.enabled) {
            console.log(`[ActivityWatch] URL: ${this.baseUrl}, Bucket: ${this.bucketId}`);
        }
    }

    /**
     * Initialize ActivityWatch bucket for Claude sessions
     */
    async initialize() {
        if (!this.enabled) return;

        try {
            // Try to create bucket (will fail silently if already exists)
            await axios.post(`${this.baseUrl}/buckets/${this.bucketId}`, {
                type: 'claude.session',
                client: 'claude-telegram-bot',
                hostname: this.hostname
            });
            console.log(`[ActivityWatch] Bucket '${this.bucketId}' initialized`);
        } catch (error) {
            if (error.response?.status === 409) {
                // Bucket already exists - that's fine
                console.log(`[ActivityWatch] Bucket '${this.bucketId}' already exists`);
            } else {
                console.error('[ActivityWatch] Error initializing bucket:', error.message);
                this.enabled = false; // Disable on error
            }
        }
    }

    /**
     * Record a Claude session in ActivityWatch
     */
    async recordSession(sessionData) {
        if (!this.enabled) return;

        try {
            const {
                sessionId,
                userId,
                duration, // in milliseconds
                message,
                success = true,
                tokens = null,
                cost = null,
                model = null
            } = sessionData;

            // Convert duration from milliseconds to seconds for ActivityWatch
            const durationSeconds = duration / 1000;

            const event = {
                timestamp: new Date().toISOString(),
                duration: durationSeconds,
                data: {
                    session_id: sessionId ? sessionId.slice(-8) : 'unknown', // Short ID for privacy
                    user_id: userId ? `user_${userId}` : 'unknown', // Anonymized user ID
                    message_preview: message ? message.substring(0, 100) + '...' : 'No message',
                    status: success ? 'completed' : 'failed',
                    tokens: tokens,
                    cost: cost,
                    model: model,
                    app: 'claude-telegram-bot',
                    category: 'AI Assistant'
                }
            };

            const response = await axios.post(
                `${this.baseUrl}/buckets/${this.bucketId}/events`,
                [event], // ActivityWatch expects array of events
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000 // 5 second timeout
                }
            );

            const eventId = response.data[0]?.id;
            console.log(`[ActivityWatch] Session recorded: ${sessionId?.slice(-8)} (${durationSeconds.toFixed(1)}s) -> Event ID: ${eventId}`);
            
            return eventId;
        } catch (error) {
            console.error('[ActivityWatch] Error recording session:', error.message);
            
            // If ActivityWatch is down, disable temporarily
            if (error.code === 'ECONNREFUSED') {
                console.warn('[ActivityWatch] Service appears to be down, disabling temporarily');
                this.enabled = false;
            }
            
            return null;
        }
    }

    /**
     * Test connection to ActivityWatch
     */
    async testConnection() {
        try {
            const response = await axios.get(`${this.baseUrl}/info`, { timeout: 3000 });
            console.log(`[ActivityWatch] Connected successfully to v${response.data.version} on ${response.data.hostname}`);
            return true;
        } catch (error) {
            console.error('[ActivityWatch] Connection test failed:', error.message);
            return false;
        }
    }

    /**
     * Get recent Claude sessions from ActivityWatch
     */
    async getRecentSessions(limit = 10) {
        if (!this.enabled) return [];

        try {
            const response = await axios.get(
                `${this.baseUrl}/buckets/${this.bucketId}/events?limit=${limit}`,
                { timeout: 5000 }
            );
            
            return response.data.map(event => ({
                id: event.id,
                timestamp: event.timestamp,
                duration: event.duration,
                sessionId: event.data.session_id,
                userId: event.data.user_id,
                status: event.data.status,
                tokens: event.data.tokens,
                cost: event.data.cost,
                model: event.data.model
            }));
        } catch (error) {
            console.error('[ActivityWatch] Error fetching recent sessions:', error.message);
            return [];
        }
    }

    /**
     * Get stats about recorded sessions
     */
    async getSessionStats() {
        if (!this.enabled) return null;

        try {
            const sessions = await this.getRecentSessions(100);
            
            const stats = {
                totalSessions: sessions.length,
                totalTime: sessions.reduce((sum, s) => sum + s.duration, 0),
                completedSessions: sessions.filter(s => s.status === 'completed').length,
                failedSessions: sessions.filter(s => s.status === 'failed').length,
                totalTokens: sessions.reduce((sum, s) => sum + (s.tokens || 0), 0),
                totalCost: sessions.reduce((sum, s) => sum + (s.cost || 0), 0),
                averageSessionTime: 0
            };
            
            if (stats.totalSessions > 0) {
                stats.averageSessionTime = stats.totalTime / stats.totalSessions;
            }
            
            return stats;
        } catch (error) {
            console.error('[ActivityWatch] Error fetching session stats:', error.message);
            return null;
        }
    }

    /**
     * Enable/disable integration
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`[ActivityWatch] Integration ${enabled ? 'enabled' : 'disabled'}`);
    }
}

module.exports = ActivityWatchIntegration;
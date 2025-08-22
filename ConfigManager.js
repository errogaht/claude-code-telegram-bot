const fs = require('fs');
const path = require('path');

/**
 * ConfigManager - In-memory config management with persistence
 * 
 * Solves the performance issue of reading config from disk on every operation.
 * Loads config once into memory and only writes to disk when changes occur.
 */
class ConfigManager {
    constructor(configFilePath) {
        this.configFilePath = configFilePath;
        this.config = {};
        this.isLoaded = false;
        
        // Load initial config
        this.loadConfig();
    }

    /**
     * Load config from disk into memory (called once on startup)
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configFilePath)) {
                const configData = fs.readFileSync(this.configFilePath, 'utf8');
                this.config = JSON.parse(configData);
                console.log(`[ConfigManager] Config loaded from ${this.configFilePath}`);
            } else {
                this.config = {};
                console.log(`[ConfigManager] Config file not found, starting with empty config`);
            }
            this.isLoaded = true;
        } catch (error) {
            console.error(`[ConfigManager] Error loading config:`, error);
            this.config = {};
            this.isLoaded = true;
        }
    }

    /**
     * Get entire config object (read from memory)
     */
    getConfig() {
        if (!this.isLoaded) {
            this.loadConfig();
        }
        return { ...this.config }; // Return copy to prevent direct mutations
    }

    /**
     * Get specific config value (read from memory)
     */
    get(key, defaultValue = undefined) {
        if (!this.isLoaded) {
            this.loadConfig();
        }
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    /**
     * Set specific config value (update memory and persist to disk)
     */
    set(key, value) {
        if (!this.isLoaded) {
            this.loadConfig();
        }
        
        // Check if value actually changed
        if (this.config[key] === value) {
            return; // No change, skip disk write
        }
        
        this.config[key] = value;
        this.persistToDisk();
    }

    /**
     * Update multiple config values at once (batch operation)
     */
    update(updates) {
        if (!this.isLoaded) {
            this.loadConfig();
        }
        
        let hasChanges = false;
        
        // Check if any values actually changed
        for (const [key, value] of Object.entries(updates)) {
            if (this.config[key] !== value) {
                this.config[key] = value;
                hasChanges = true;
            }
        }
        
        // Only write to disk if there were actual changes
        if (hasChanges) {
            this.persistToDisk();
        }
    }

    /**
     * Delete a config key (update memory and persist to disk)
     */
    delete(key) {
        if (!this.isLoaded) {
            this.loadConfig();
        }
        
        if (this.config[key] !== undefined) {
            delete this.config[key];
            this.persistToDisk();
        }
    }

    /**
     * Check if a config key exists (read from memory)
     */
    has(key) {
        if (!this.isLoaded) {
            this.loadConfig();
        }
        return this.config[key] !== undefined;
    }

    /**
     * Get current thinking mode (frequently accessed)
     */
    getThinkingMode() {
        return this.get('thinkingMode', null);
    }

    /**
     * Set thinking mode (frequently updated)
     */
    setThinkingMode(mode) {
        this.set('thinkingMode', mode);
    }

    /**
     * Get current project (frequently accessed)
     */
    getCurrentProject() {
        return this.get('currentProject', null);
    }

    /**
     * Set current project (frequently updated)
     */
    setCurrentProject(project) {
        this.set('currentProject', project);
    }

    /**
     * Get QTunnel token (occasionally accessed)
     */
    getQTunnelToken() {
        return this.get('qTunnelToken', null);
    }

    /**
     * Set QTunnel token
     */
    setQTunnelToken(token) {
        this.set('qTunnelToken', token);
    }

    /**
     * Get admin user ID
     */
    getAdminUserId() {
        return this.get('adminUserId', null);
    }

    /**
     * Set admin user ID
     */
    setAdminUserId(userId) {
        this.set('adminUserId', userId);
    }

    /**
     * Get project sessions (complex nested data)
     */
    getProjectSessions() {
        return this.get('projectSessions', {});
    }

    /**
     * Update project sessions (helper for complex nested updates)
     */
    updateProjectSessions(sessionUpdates) {
        const currentSessions = this.getProjectSessions();
        const updatedSessions = { ...currentSessions, ...sessionUpdates };
        this.set('projectSessions', updatedSessions);
    }

    /**
     * Get ActivityWatch enabled state
     */
    getActivityWatchEnabled() {
        return this.get('activityWatchEnabled', true);
    }

    /**
     * Set ActivityWatch enabled state
     */
    setActivityWatchEnabled(enabled) {
        this.set('activityWatchEnabled', enabled);
    }

    /**
     * Get ActivityWatch time multiplier
     */
    getActivityWatchTimeMultiplier() {
        return this.get('activityWatchTimeMultiplier', 1.0);
    }

    /**
     * Set ActivityWatch time multiplier
     */
    setActivityWatchTimeMultiplier(multiplier) {
        this.set('activityWatchTimeMultiplier', multiplier);
    }

    /**
     * Persist current in-memory config to disk
     * Only called when config actually changes
     */
    persistToDisk() {
        try {
            // Ensure directory exists
            const configDir = path.dirname(this.configFilePath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            // Write config to disk with pretty formatting
            const configData = JSON.stringify(this.config, null, 2);
            fs.writeFileSync(this.configFilePath, configData, 'utf8');
            
            console.log(`[ConfigManager] Config persisted to ${this.configFilePath}`);
        } catch (error) {
            console.error(`[ConfigManager] Error persisting config:`, error);
        }
    }

    /**
     * Force reload config from disk (useful for external changes)
     */
    reloadFromDisk() {
        console.log(`[ConfigManager] Reloading config from disk...`);
        this.loadConfig();
    }

    /**
     * Get config file path
     */
    getConfigFilePath() {
        return this.configFilePath;
    }

    /**
     * Check if config is loaded
     */
    isConfigLoaded() {
        return this.isLoaded;
    }
}

module.exports = ConfigManager;
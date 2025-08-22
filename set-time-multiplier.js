#!/usr/bin/env node

/**
 * Set ActivityWatch time multiplier for Claude bot
 * Usage: node set-time-multiplier.js [multiplier]
 */

const fs = require('fs');
const path = require('path');

function setTimeMultiplier(multiplier) {
    const configPath = path.join(__dirname, 'configs', 'config.json');
    
    try {
        // Read current config
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        // Update multiplier
        config.activityWatchTimeMultiplier = parseFloat(multiplier);

        // Save config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`✅ Time multiplier set to ${multiplier}x`);
        console.log('🔄 Restart bot to apply changes: pm2 restart bot1');
        
    } catch (error) {
        console.error('❌ Error updating config:', error.message);
    }
}

const multiplier = process.argv[2];
if (!multiplier || isNaN(multiplier)) {
    console.log('Usage: node set-time-multiplier.js [multiplier]');
    console.log('Examples:');
    console.log('  node set-time-multiplier.js 1.0   # Record actual time');
    console.log('  node set-time-multiplier.js 2.0   # Record 2x time');  
    console.log('  node set-time-multiplier.js 3.0   # Record 3x time (current)');
} else {
    setTimeMultiplier(multiplier);
}
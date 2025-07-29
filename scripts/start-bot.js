#!/usr/bin/env node

/**
 * Bot Launcher Script
 * Loads JSON configuration and starts the specified bot instance
 */

const path = require('path');
const fs = require('fs');

function loadBotConfig(botName) {
  const configFile = path.join(__dirname, '..', 'configs', `${botName}.json`);
  
  // Check if config file exists
  if (!fs.existsSync(configFile)) {
    console.error(`❌ Configuration file not found: ${configFile}`);
    console.log('💡 Available options:');
    
    // Show available .json files
    const configsDir = path.join(__dirname, '..', 'configs');
    if (fs.existsSync(configsDir)) {
      const configFiles = fs.readdirSync(configsDir)
        .filter(file => file.endsWith('.json') && !file.endsWith('.example'))
        .map(file => file.replace('.json', ''));
      
      if (configFiles.length > 0) {
        configFiles.forEach(name => console.log(`   npm run ${name}`));
      } else {
        console.log('   No config files found. Run: npm run setup');
      }
    }
    
    console.log('\n💡 To create a new bot configuration:');
    console.log('   npm run setup');
    process.exit(1);
  }
  
  // Load and validate JSON configuration
  try {
    const configData = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(configData);
    
    // Validate required fields
    const required = ['botName', 'botToken'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
      console.error(`❌ Missing required configuration fields: ${missing.join(', ')}`);
      console.error(`📝 Please check your configuration file: ${configFile}`);
      process.exit(1);
    }
    
    // Config will be passed directly to bot constructor
    
    console.log(`🚀 Starting ${config.botName} (${botName})...`);
    console.log(`🤖 Default model: ${config.defaultModel || 'sonnet'}`);
    if (config.adminUserId) {
      console.log(`👤 Admin: ${config.adminUserId} (saved permanently)`);
    } else {
      console.log('👤 Admin: will auto-detect and save from first message');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return { config, configFilePath: configFile };
    
  } catch (error) {
    console.error(`❌ Error parsing configuration file: ${configFile}`);
    console.error(`📝 Error: ${error.message}`);
    console.log('\n💡 Check that your JSON file is valid.');
    process.exit(1);
  }
}

// Get bot name from command line arguments
const botName = process.argv[2];

if (!botName) {
  console.error('❌ Bot name is required');
  console.log('💡 Usage: npm run bot1 | npm run bot2 | npm run bot3');
  console.log('💡 Or: node scripts/start-bot.js <bot-name>');
  process.exit(1);
}

// Load configuration and start bot
const { config, configFilePath } = loadBotConfig(botName);

// Import the bot class and create instance
const StreamTelegramBot = require('../bot.js');

console.log('🔧 Creating bot instance...');

try {
  const bot = new StreamTelegramBot(config.botToken, {
    model: config.defaultModel || 'sonnet',
    nexaraApiKey: config.nexaraApiKey,
    adminUserId: config.adminUserId,
    configFilePath: configFilePath  // Pass config file path for saving admin ID
  });
  
  console.log('✅ Bot instance created successfully');
  console.log(`🚀 ${config.botName} is running!`);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`📦 Shutting down ${config.botName} gracefully...`);
    bot.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log(`📦 Shutting down ${config.botName} gracefully...`);
    bot.cleanup();
    process.exit(0);
  });
  
} catch (error) {
  console.error('❌ Error creating bot instance:', error);
  process.exit(1);
}
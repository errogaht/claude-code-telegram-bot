#!/usr/bin/env node

/**
 * Interactive Bot Setup Script
 * Creates JSON configuration files for multiple bot instances
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupBot() {
  console.log('🤖 Claude Code Telegram Bot - Multi-Instance Setup');
  console.log('════════════════════════════════════════════════');
  console.log();
  
  // Create configs directory first
  const configsDir = path.join(__dirname, '..', 'configs');
  if (!fs.existsSync(configsDir)) {
    fs.mkdirSync(configsDir, { recursive: true });
  }
  
  // Auto-generate bot name based on existing configs
  const existingConfigs = fs.readdirSync(configsDir)
    .filter(file => file.endsWith('.json') && !file.endsWith('.example'))
    .map(file => file.replace('.json', ''));

  let botName;
  let displayName;

  if (existingConfigs.length === 0) {
    botName = 'bot1';
    displayName = 'MainBot';
  } else {
    // Generate next bot name
    const nextNum = existingConfigs.length + 1;
    botName = `bot${nextNum}`;
    displayName = `Bot${nextNum}`;
  }

  console.log(`\n🔧 Auto-generating configuration: ${displayName} (${botName})...\n`);
  
  // Collect configuration
  const config = {};
  
  config.BOT_NAME = displayName;
  
  console.log('\n📱 Telegram Bot Token:');
  console.log('💡 Get it from @BotFather on Telegram');
  config.TELEGRAM_TOKEN = await question('Telegram Bot Token: ');
  
  if (!config.TELEGRAM_TOKEN) {
    console.log('❌ Telegram token is required');
    process.exit(1);
  }
  
  console.log('\n👤 Admin User ID:');
  console.log('💡 Send any message to your bot after setup to become admin');
  console.log('💡 Or get your ID from @userinfobot');
  config.ADMIN_USER_ID = await question('Admin User ID (optional, leave empty for auto-detection): ');
  
  console.log('\n🎙️ Nexara API Key (for voice messages):');
  console.log('💡 Get it from nexara.ru (optional)');
  config.NEXARA_API_KEY = await question('Nexara API Key (optional): ');
  
  // Skip working directory - Claude Code works globally
  console.log('\n📁 Working Directory: Claude Code works globally, no specific directory needed.');
  
  console.log('\n🤖 Default Claude Model:');
  const model = await question('Default model (sonnet/opus) [sonnet]: ') || 'sonnet';
  config.DEFAULT_MODEL = ['sonnet', 'opus'].includes(model) ? model : 'sonnet';
  
  console.log('\n📝 Log Level:');
  const logLevel = await question('Log level (info/debug/error) [info]: ') || 'info';
  config.LOG_LEVEL = ['info', 'debug', 'error'].includes(logLevel) ? logLevel : 'info';
  
  // Create JSON configuration object
  const jsonConfig = {
    botName: config.BOT_NAME,
    botToken: config.TELEGRAM_TOKEN,
    defaultModel: config.DEFAULT_MODEL,
    logLevel: config.LOG_LEVEL,
    generatedAt: new Date().toISOString()
  };
  
  // Add optional fields
  if (config.NEXARA_API_KEY) {
    jsonConfig.nexaraApiKey = config.NEXARA_API_KEY;
  }
  
  if (config.ADMIN_USER_ID) {
    jsonConfig.adminUserId = config.ADMIN_USER_ID;
  }
  
  // Create JSON configuration file
  const configFile = path.join(configsDir, `${botName}.json`);
  
  // Write JSON configuration file
  fs.writeFileSync(configFile, JSON.stringify(jsonConfig, null, 2));
  
  console.log('\n✅ Bot configuration created successfully!');
  console.log(`📄 Configuration file: ${configFile}`);
  console.log('\n🚀 To start your bot:');
  console.log(`   npm run ${botName}`);
  console.log('\n💡 To create another bot:');
  console.log('   npm run setup');
  
  // Show all available bots
  console.log('\n📋 Available bots:');
  const configFiles = fs.readdirSync(configsDir)
    .filter(file => file.endsWith('.json') && !file.endsWith('.example'))
    .map(file => file.replace('.json', ''));
  
  configFiles.forEach(name => {
    console.log(`   npm run ${name}`);
  });
  
  rl.close();
}

// Handle Ctrl+C gracefully
rl.on('SIGINT', () => {
  console.log('\n\n👋 Setup cancelled');
  process.exit(0);
});

// Start setup
setupBot().catch(console.error);
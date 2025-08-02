---
description: Create a new Telegram bot with PM2 configuration and start it
argument-hint: <bot-name> <bot-token>
allowed-tools: Bash, Read, Write, Edit
---

# New Bot Creation Command

Create a new Telegram bot instance with complete PM2 configuration and automatic startup.

**Usage:** `/newbot bot4 1234567890:AAaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQq`

## Arguments
- `$ARGUMENTS` should contain: `<bot-name> <bot-token>`
- Example: `bot4 1234567890:AAaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQq`

## Process Overview

This command will automatically:

1. **Create bot configuration file** (`configs/{bot-name}.json`)
2. **Add PM2 configuration** to `ecosystem.config.js`  
3. **Start the bot** with PM2
4. **Verify bot is running**

## Implementation Steps

### Step 1: Parse Arguments and Validate

Extract bot name and token from arguments. Validate that:
- Bot name follows naming convention (bot + number)
- Token has correct Telegram bot token format
- Bot name doesn't already exist

### Step 2: Create Bot Configuration

Create `configs/{bot-name}.json` with the same way as previous existing bot has

**Important:** This file will NOT be added to git as it's in `.gitignore` for security.

### Step 3: Update PM2 Ecosystem Configuration

Add a new bot entry to `ecosystem.config.js` the same way as other records

### Step 4: Start Bot with PM2

Execute: `pm2 start ecosystem.config.js --only {bot-name}`

### Step 5: Verify and Report

- Check PM2 status: `pm2 status`
- Show recent logs: `pm2 logs {bot-name} --lines 20`
- Report success with bot information
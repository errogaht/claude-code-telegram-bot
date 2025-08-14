# Web Server API - Adding Protected Pages

This document explains how to easily add new secure web pages to the bot ecosystem using the BaseWebServer API.

## Quick Start

### Option 1: Extend BaseWebServer

```javascript
const BaseWebServer = require('./BaseWebServer');

class MyCustomPage extends BaseWebServer {
    setupRoutes() {
        super.setupRoutes(); // Include basic routes
        
        // Add your custom routes - automatically protected!
        this.app.get('/', (req, res) => {
            const content = '<h2>Welcome to my custom page!</h2>';
            res.send(this.generateBasePage('My Page', content));
        });
        
        this.app.get('/api/data', (req, res) => {
            res.json({ message: 'Hello from protected API!' });
        });
    }
}

// Usage
const myPage = new MyCustomPage('bot1', ngrokToken);
myPage.start().then(url => {
    console.log(`My page is live: ${url}`);
});
```

### Option 2: Use Constructor Routes

```javascript
const BaseWebServer = require('./BaseWebServer');

const quickPage = new BaseWebServer({
    botInstance: 'bot1',
    ngrokAuthToken: 'your-token',
    routes: [
        {
            method: 'GET',
            path: '/',
            handler: (req, res) => {
                res.send('<h1>Quick Page Setup!</h1>');
            }
        },
        {
            method: 'POST',
            path: '/api/submit',
            handler: (req, res) => {
                res.json({ success: true, data: req.body });
            }
        }
    ]
});

quickPage.start();
```

## Core Features

### Automatic Security Protection

All routes are automatically protected with token-based authentication:

- **Token validation**: Every request requires a valid security token
- **Static assets excluded**: `/static`, `/assets`, `/public` paths bypass tokens
- **Professional error pages**: Beautiful 403 pages for unauthorized access
- **Access logging**: All access attempts are logged with IP and token status

### Built-in Utilities

#### Secure URL Generation

```javascript
// For internal links within your pages
const internalLink = this.getSecureUrl('/dashboard', { tab: 'stats' });

// For external links (Telegram bot buttons)
const telegramButton = this.getSecureExternalUrl('/admin', { action: 'restart' });
```

#### HTML Page Template

```javascript
this.app.get('/my-page', (req, res) => {
    const content = `
        <h2>Dashboard</h2>
        <p>Server status: Online</p>
        <a href="${this.getSecureUrl('/settings')}">Settings</a>
    `;
    
    const customStyles = `
        .dashboard { background: #f5f5f5; padding: 20px; }
        .status { color: green; font-weight: bold; }
    `;
    
    res.send(this.generateBasePage('Dashboard', content, customStyles));
});
```

#### Add Routes Dynamically

```javascript
const server = new BaseWebServer({ botInstance: 'bot1' });

// Add routes after initialization
server.addRoute('GET', '/health', (req, res) => {
    res.json({ status: 'OK' });
});

server.addRoute('POST', '/webhook', (req, res) => {
    // Handle webhook
    res.json({ received: true });
});
```

## Multi-Bot Support

Each bot instance gets its own port range to avoid conflicts:

- **bot1**: Starts from port 3947 (base + 100)
- **bot2**: Starts from port 3948 (base + 100)
- **bot3**: Starts from port 3949 (base + 100)
- **bot4**: Starts from port 3950 (base + 100)

Port ranges are automatically managed - no configuration needed!

## Integration with Telegram Bot

### Getting Public URLs for Bot Buttons

```javascript
// In your bot command handler
const webServer = new MyCustomPage('bot1', ngrokToken);
const publicUrl = await webServer.start();

if (publicUrl) {
    // Only show URL button if public URL is available (not localhost)
    const keyboard = [[{
        text: '🌐 Open Web Dashboard',
        url: publicUrl
    }]];
    
    bot.sendMessage(chatId, 'Web dashboard is ready!', {
        reply_markup: { inline_keyboard: keyboard }
    });
} else {
    // Fallback for localhost-only access
    bot.sendMessage(chatId, 'Web dashboard started locally (ngrok not available)');
}
```

### Automatic Integration in Bot Class

```javascript
// In your bot.js constructor
const MyCustomPage = require('./MyCustomPage');

class TelegramBot {
    constructor(options) {
        // ... existing code ...
        
        // Add your custom page
        this.customPage = new MyCustomPage(
            this.botInstanceName, 
            this.getNgrokTokenFromConfig()
        );
        
        // Auto-start if needed
        this.autoStartCustomPage();
    }
    
    async autoStartCustomPage() {
        try {
            const url = await this.customPage.start();
            console.log(`Custom page available: ${url}`);
        } catch (error) {
            console.log('Custom page failed to start:', error.message);
        }
    }
}
```

## Security Features

### Token Management

- **Automatic generation**: 64-character cryptographically secure tokens
- **Per-restart regeneration**: New token on every bot restart
- **Token exclusions**: Static assets don't need tokens

### Access Control

```javascript
// Custom middleware for additional security
this.app.use('/admin', (req, res, next) => {
    // Add admin-only authentication
    const isAdmin = checkAdminStatus(req);
    if (!isAdmin) {
        return res.status(403).send('Admin access required');
    }
    next();
});
```

### Logging and Monitoring

All access attempts are automatically logged:

```
[bot1] ✅ Authorized access: 192.168.1.100 -> /dashboard
[bot1] 🚫 Unauthorized access: 203.0.113.1 -> /admin (invalid token)
```

## Complete Examples

See the `examples/` directory for full working examples:

- **SimpleStatusPage.js**: Bot status dashboard with system information
- **FileManager.js**: File upload/download interface
- **AdminPanel.js**: Bot administration interface

## Best Practices

1. **Always call `super.setupRoutes()`** when overriding setupRoutes()
2. **Use `this.generateBasePage()`** for consistent styling
3. **Generate secure URLs** with `this.getSecureUrl()` for internal links
4. **Handle ngrok failures gracefully** - not all environments support public URLs
5. **Test locally first** before enabling ngrok tunneling
6. **Keep pages mobile-friendly** - most users access via Telegram mobile app

## Migration from Custom Security

If you have existing web servers with custom security, migration is simple:

### Before (Custom Security)
```javascript
app.use((req, res, next) => {
    if (req.query.token !== myToken) {
        return res.status(403).send('Access denied');
    }
    next();
});
```

### After (BaseWebServer)
```javascript
class MyPage extends BaseWebServer {
    setupRoutes() {
        super.setupRoutes();
        // Security is automatically handled!
        // Just add your routes normally
    }
}
```

The BaseWebServer automatically provides all security features with no additional code needed.
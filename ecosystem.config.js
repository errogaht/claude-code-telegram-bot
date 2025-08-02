module.exports = {
  apps: [
    {
      name: 'bot1',
      script: 'scripts/start-bot.js',
      args: 'bot1',
      cwd: '/home/errogaht/aiprojects/claude-code-telegram-control',
      env: {
        NODE_ENV: 'production'
      },
      // Автоперезапуск настройки
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      
      // Логирование
      log_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot1-combined.log',
      out_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot1-out.log',
      error_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot1-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Производительность
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    },
    {
      name: 'bot2',
      script: 'scripts/start-bot.js',
      args: 'bot2',
      cwd: '/home/errogaht/aiprojects/claude-code-telegram-control',
      env: {
        NODE_ENV: 'production'
      },
      // Автоперезапуск настройки
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      
      // Логирование
      log_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot2-combined.log',
      out_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot2-out.log',
      error_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Производительность
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    },
    {
      name: 'bot3',
      script: 'scripts/start-bot.js',
      args: 'bot3',
      cwd: '/home/errogaht/aiprojects/claude-code-telegram-control',
      env: {
        NODE_ENV: 'production'
      },
      // Автоперезапуск настройки
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      
      // Логирование
      log_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot3-combined.log',
      out_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot3-out.log',
      error_file: '/home/errogaht/aiprojects/claude-code-telegram-control/logs/bot3-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Производительность
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    }
  ]
};
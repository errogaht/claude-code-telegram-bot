module.exports = {
  apps: [
    {
      name: 'bot1',
      script: 'scripts/start-bot.js',
      args: 'bot1',
      cwd: '.',
      env: {
        NODE_ENV: 'production'
      },

      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/bot1.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    },
    {
      name: 'bot2',
      script: 'scripts/start-bot.js',
      args: 'bot2',
      cwd: '.',
      env: {
        NODE_ENV: 'production'
      },

      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/bot2.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    },
    {
      name: 'bot3',
      script: 'scripts/start-bot.js',
      args: 'bot3',
      cwd: '.',
      env: {
        NODE_ENV: 'production'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/bot3.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    },
    {
      name: 'bot4',
      script: 'scripts/start-bot.js',
      args: 'bot4',
      cwd: '.',
      env: {
        NODE_ENV: 'production'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/bot4.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    }
  ]
};
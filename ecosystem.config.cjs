// ============================================
// EnviroMaster Backend - PM2 Ecosystem Config
// ============================================
// Production-ready process management configuration

module.exports = {
  apps: [
    {
      // Application name
      name: 'enviro-backend',

      // Entry point
      script: './server.js',

      // Instances configuration
      instances: process.env.PM2_INSTANCES || 2, // Use 2 instances by default, or from env
      exec_mode: 'cluster', // Cluster mode for load balancing

      // Environment variables
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5000,
      },

      // Auto restart configuration
      autorestart: true,
      watch: false, // Disable watch in production
      max_memory_restart: '500M', // Restart if memory exceeds 500MB

      // Process management
      min_uptime: '10s', // Consider app crashed if doesn't stay up for 10s
      max_restarts: 10, // Max restart attempts
      restart_delay: 4000, // Delay between restarts (4s)

      // Logging configuration
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Advanced features
      listen_timeout: 10000, // Timeout for app to start (10s)
      kill_timeout: 5000, // Timeout for graceful shutdown (5s)
      shutdown_with_message: false,

      // Source map support for better error traces
      source_map_support: true,

      // Process management hooks
      post_update: ['npm install --production', 'echo "Dependencies updated"'],

      // Graceful shutdown
      kill_retry_time: 100,

      // Node.js specific options
      node_args: '--max-old-space-size=512', // Limit memory to 512MB

      // Cron restart (optional - restart at 3 AM daily for memory cleanup)
      cron_restart: '0 3 * * *',

      // Health check (works with PM2 Plus)
      health_check: {
        enabled: true,
        endpoint: '/health',
        interval: 30000, // Check every 30 seconds
        timeout: 10000 // 10 second timeout
      },

      // Metrics (if using PM2 Plus)
      instance_var: 'INSTANCE_ID',

      // Environment-specific settings
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      }
    }
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'nodejs',
      host: process.env.DEPLOY_HOST || 'production-server',
      ref: 'origin/main',
      repo: 'https://github.com/YaswanthVanama123/enviro-bckend.git',
      path: '/var/www/enviro-backend',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.cjs --env production',
      'pre-deploy-local': '',
      'post-setup': ''
    }
  }
};

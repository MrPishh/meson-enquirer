/**
 * pm2 process definition — keeps the bot running and restarts it if it crashes. Start it with:
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save        # remember it, so it comes back after a reboot
 *
 * Start-on-reboot is handled outside this project by the Windows scheduled task "PM2 Resurrect on Login", which runs `pm2 resurrect` at login and restores every saved app (this bot and the others on this machine).
 *
 * Secrets stay in .env — dotenv reads it from `cwd`, never from this file.
 */
module.exports = {
  apps: [
    {
      name: 'meson-bot',
      script: 'src/index.js',
      cwd: __dirname,
      // Back off between crash restarts instead of hammering Discord's login.
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
    },
  ],
}

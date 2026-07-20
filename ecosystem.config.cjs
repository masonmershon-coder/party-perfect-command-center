/** PM2 process file — run on Tulsa Server after build.
 *  Usage: pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: "party-perfect-dashboard",
      cwd: __dirname,
      script: ".next/standalone/server.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};

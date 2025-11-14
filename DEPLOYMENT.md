# Deployment Guide

Comprehensive guide for deploying the Frontier Flight Scraper to production environments.

## Pre-Deployment Checklist

- [ ] Node.js 18+ installed on server
- [ ] Decodo proxy credentials obtained
- [ ] `.env` file configured with production settings
- [ ] Firewall rules configured (port 3000)
- [ ] HTTPS certificate ready (if using SSL)
- [ ] Domain name configured (optional)

## Deployment Options

### Option 1: Local/VPS Server (Recommended)

Best for: Full control, custom configurations, high-volume scraping

#### Step 1: Prepare Server

```bash
# Update system (Ubuntu/Debian)
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools
sudo apt install -y build-essential

# Verify installation
node --version  # Should show v18.x or higher
npm --version
```

#### Step 2: Upload Application

```bash
# Option A: Git clone (if using version control)
git clone <your-repo-url>
cd frontier-scraper-production

# Option B: Direct upload
# Use SCP, SFTP, or your hosting provider's file manager
# Upload entire frontier-scraper-production folder
```

#### Step 3: Install Dependencies

```bash
cd frontier-scraper-production

# Install Node packages
npm install --production

# Install Playwright browsers
npm run install-browsers

# Copy and configure environment
cp .env.example .env
nano .env  # Edit with your settings
```

#### Step 4: Setup Process Manager (PM2)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start application with PM2
pm2 start backend/server.js --name frontier-scraper

# Configure auto-restart on server reboot
pm2 startup
pm2 save

# View logs
pm2 logs frontier-scraper

# Monitor
pm2 monit
```

#### Step 5: Configure Nginx Reverse Proxy (Optional)

```nginx
# /etc/nginx/sites-available/frontier-scraper
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/frontier-scraper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Option 2: Docker Deployment

Best for: Consistent environments, easy scaling, containerization

#### Create Dockerfile

```dockerfile
FROM node:18-alpine

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application
COPY . .

# Create directories
RUN mkdir -p logs cache

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "backend/server.js"]
```

#### Create docker-compose.yml

```yaml
version: '3.8'

services:
  frontier-scraper:
    build: .
    container_name: frontier-scraper
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
      - ./cache:/app/cache
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### Deploy with Docker

```bash
# Build image
docker-compose build

# Start container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

### Option 3: Cloud Platforms

#### Heroku

1. Install Heroku CLI
2. Create `Procfile`:
   ```
   web: node backend/server.js
   ```

3. Add Playwright buildpack:
   ```bash
   heroku buildpacks:add https://github.com/mxschmitt/heroku-playwright-buildpack
   heroku buildpacks:add heroku/nodejs
   ```

4. Deploy:
   ```bash
   heroku create your-app-name
   heroku config:set DECODO_USERNAME=your_username
   heroku config:set DECODO_PASSWORD=your_password
   git push heroku main
   ```

#### DigitalOcean App Platform

1. Create new app from GitHub repo
2. Configure environment variables
3. Set build command: `npm install && npm run install-browsers`
4. Set run command: `npm start`
5. Deploy

#### Railway

1. Create new project
2. Connect GitHub repo or upload files
3. Configure environment variables
4. Railway auto-detects Node.js
5. Deploy automatically

## SSL/HTTPS Setup

### Let's Encrypt (Free SSL)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (runs twice daily)
sudo systemctl status certbot.timer
```

### Manual SSL Configuration

Update nginx config:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # ... rest of config
}
```

## Environment Variables for Production

```env
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Decodo (REQUIRED)
DECODO_USERNAME=your_production_username
DECODO_PASSWORD=your_production_password
DECODO_MAX_USES_PER_MINUTE=2
DECODO_MAX_WORKERS=5

# Scraper
SCRAPER_METHOD=decodo
SCRAPER_TIMEOUT_SECONDS=120
SCRAPER_MAX_RETRIES=5
SCRAPER_CONCURRENT_ROUTES=10

# Security
API_KEY=<generate-with-openssl-rand-hex-32>

# Logging
LOG_LEVEL=info

# Cache
CACHE_ENABLED=true
CACHE_TTL_HOURS=24
```

## Security Hardening

### 1. Firewall Setup

```bash
# Ubuntu UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. Fail2Ban (Prevent brute force)

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Node.js dependencies
cd /path/to/app
npm audit
npm update
```

### 4. Secure Environment Variables

Never commit `.env` to version control!

Options:
- Use environment variables directly on server
- Use secrets management (HashiCorp Vault, AWS Secrets Manager)
- Encrypted config files

### 5. Rate Limiting

Add rate limiting middleware:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Monitoring & Maintenance

### 1. Application Monitoring

```bash
# PM2 monitoring
pm2 monit

# Check logs
pm2 logs frontier-scraper --lines 100

# Check status
pm2 status
```

### 2. Log Rotation

```bash
# Install logrotate
sudo apt install logrotate

# Create config: /etc/logrotate.d/frontier-scraper
/path/to/frontier-scraper-production/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

### 3. Health Checks

Monitor endpoint: `GET /api/health`

Setup automated monitoring:
- UptimeRobot (free)
- Pingdom
- StatusCake

### 4. Backup Strategy

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/frontier-scraper"

# Backup logs
tar -czf $BACKUP_DIR/logs-$DATE.tar.gz /path/to/app/logs/

# Backup cache (optional)
tar -czf $BACKUP_DIR/cache-$DATE.tar.gz /path/to/app/cache/

# Keep only last 7 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

Add to crontab:
```bash
crontab -e
0 2 * * * /path/to/backup-script.sh
```

## Performance Optimization

### 1. Increase Node.js Memory

```bash
# PM2
pm2 start backend/server.js --name frontier-scraper --max-memory-restart 1G --node-args="--max-old-space-size=2048"

# Direct
node --max-old-space-size=2048 backend/server.js
```

### 2. Enable Compression

Already enabled via `compression` middleware in server.js

### 3. Connection Pooling

Increase `maxWorkers` in `.env` for high-volume scraping:
```env
DECODO_MAX_WORKERS=10
SCRAPER_CONCURRENT_ROUTES=20
```

Monitor server resources and adjust accordingly.

### 4. Caching

Enable caching to reduce redundant scrapes:
```env
CACHE_ENABLED=true
CACHE_TTL_HOURS=24
```

## Troubleshooting Production Issues

### Server Won't Start

```bash
# Check PM2 logs
pm2 logs frontier-scraper --err

# Check port availability
sudo lsof -i :3000

# Check environment variables
pm2 env 0
```

### High Memory Usage

```bash
# Monitor memory
pm2 monit

# Restart with memory limit
pm2 restart frontier-scraper --max-memory-restart 1G
```

### WebSocket Disconnections

Check nginx configuration for WebSocket support.

Ensure `proxy_set_header Upgrade` is set.

### Slow Performance

- Reduce `SCRAPER_CONCURRENT_ROUTES`
- Increase server resources
- Enable caching
- Check Decodo proxy performance

## Scaling Strategies

### Horizontal Scaling

1. **Load Balancer**: nginx, HAProxy
2. **Multiple Instances**: Run on different ports
3. **Shared State**: Use Redis for session management

### Vertical Scaling

- Increase server RAM
- Add more CPU cores
- Increase `maxWorkers` and `concurrentRoutes`

## Rollback Procedure

```bash
# PM2
pm2 stop frontier-scraper
cd /path/to/app
git checkout <previous-version>
npm install
pm2 restart frontier-scraper

# Docker
docker-compose down
git checkout <previous-version>
docker-compose up -d
```

## Production Checklist

Before going live:

- [ ] All dependencies installed
- [ ] Environment variables configured
- [ ] HTTPS/SSL enabled
- [ ] Firewall configured
- [ ] PM2/process manager setup
- [ ] Log rotation configured
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Health checks active
- [ ] Documentation reviewed
- [ ] Test scraping works
- [ ] Load testing completed

## Support

For deployment issues:
1. Check application logs: `logs/scraper-*.log`
2. Check PM2 logs: `pm2 logs`
3. Verify environment variables
4. Test Decodo proxy connection
5. Check server resources (RAM, CPU, disk)

---

**Deployment Date**: _____________
**Deployed By**: _____________
**Server**: _____________
**Version**: 1.0.0

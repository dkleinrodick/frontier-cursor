# Frontier Flight Scraper - Production Build

A production-ready web application for scraping Frontier Airlines GoWild flight data with Decodo residential proxy integration, real-time WebSocket updates, and a modern web interface.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

✨ **Modern Web Interface**
- Clean, responsive UI with dark theme
- Real-time activity feed via WebSocket
- Single and bulk route scraping
- Proxy statistics dashboard
- System configuration panel

🔄 **Intelligent Scraping**
- Playwright-based browser automation
- Decodo residential proxy rotation
- Rate limiting and retry logic
- PerimeterX bypass capabilities
- Concurrent route processing

📊 **Proxy Management**
- 10 Decodo residential proxy endpoints
- Automatic round-robin rotation
- Configurable rate limiting
- Usage statistics tracking
- Health monitoring

🚀 **Production Ready**
- RESTful API with Express
- WebSocket for real-time updates
- Comprehensive logging
- Error handling
- Security headers (Helmet)
- Response compression

## Quick Start

### 1. Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- Decodo proxy credentials (optional but recommended)

### 2. Installation

```bash
# Clone or extract to your directory
cd frontier-scraper-production

# Install dependencies
npm install

# Install Playwright browsers
npm run install-browsers
```

### 3. Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Server
PORT=3000
HOST=localhost
NODE_ENV=production

# Decodo Proxies (REQUIRED for production)
DECODO_USERNAME=your_username
DECODO_PASSWORD=your_password
DECODO_MAX_USES_PER_MINUTE=2
DECODO_MAX_WORKERS=3

# Scraper
SCRAPER_METHOD=decodo
# Options: playwright (direct), decodo (with proxies - recommended)
SCRAPER_TIMEOUT_SECONDS=90
SCRAPER_MAX_RETRIES=3
SCRAPER_CONCURRENT_ROUTES=5
```

### 4. Start the Server

```bash
# Production mode
npm start

# Development mode (auto-reload)
npm run dev
```

The application will be available at:
- **Web Interface**: http://localhost:3000
- **API**: http://localhost:3000/api/
- **WebSocket**: ws://localhost:3000

## Usage

### Web Interface

1. **Open Browser**: Navigate to http://localhost:3000
2. **Scrape Single Route**:
   - Enter origin airport (e.g., ORD)
   - Enter destination airport (e.g., CUN)
   - Select date
   - Click "Start Scraping"

3. **Bulk Scraping**:
   - Switch to "Bulk Scraping" tab
   - Enter routes (one per line):
     ```
     ORD CUN 2025-11-15
     DEN LAX 2025-11-16
     ATL MIA 2025-11-17
     ```
   - Click "Start Bulk Scraping"
   - Monitor progress in real-time

4. **Proxy Status**:
   - Switch to "Proxy Status" tab
   - View statistics for all 10 proxies
   - Check availability and success rates
   - Refresh stats anytime

### API Endpoints

#### Health Check
```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "version": "1.0.0",
  "wsConnections": 2
}
```

#### Scrape Single Route
```bash
POST /api/scraper/scrape
Content-Type: application/json

{
  "origin": "ORD",
  "destination": "CUN",
  "date": "2025-11-15"
}
```

Response:
```json
{
  "success": true,
  "flights": [
    {
      "origin": "ORD",
      "destination": "CUN",
      "flightNumber": "F9 1234",
      "departureDate": "2025-11-15T10:30:00",
      "arrivalDate": "2025-11-15T14:45:00",
      "duration": "4h 15m",
      "stops": "Nonstop",
      "price": "$49"
    }
  ],
  "proxyUsed": "decodo-3",
  "attempts": 1,
  "elapsed": 15234
}
```

#### Bulk Scraping
```bash
POST /api/scraper/bulk
Content-Type: application/json

{
  "routes": [
    { "origin": "ORD", "destination": "CUN", "date": "2025-11-15" },
    { "origin": "DEN", "destination": "LAX", "date": "2025-11-16" }
  ]
}
```

Response (immediate):
```json
{
  "status": "started",
  "totalRoutes": 2,
  "message": "Bulk scraping started. Monitor progress via WebSocket."
}
```

Progress updates sent via WebSocket.

#### Proxy Statistics
```bash
GET /api/proxy/stats
```

Response:
```json
{
  "totalProxies": 10,
  "activeWorkers": 1,
  "maxWorkers": 3,
  "maxUsesPerMinute": 2,
  "proxies": [
    {
      "id": "decodo-1",
      "host": "dc.decodo.com:10001",
      "totalRequests": 45,
      "failedRequests": 2,
      "successRate": 95.56,
      "recentUses": 1,
      "canUseNow": true
    }
  ]
}
```

#### Configuration
```bash
GET /api/config
```

Returns current system configuration.

## Architecture

```
frontier-scraper-production/
├── backend/
│   ├── server.js                 # Express server & WebSocket
│   ├── routes/
│   │   ├── scraper.js           # Scraping endpoints
│   │   ├── proxy.js             # Proxy management endpoints
│   │   └── config.js            # Configuration endpoints
│   ├── services/
│   │   ├── scraper.js           # Flight scraping logic
│   │   └── decodoProxyManager.js # Proxy rotation & management
│   └── utils/
│       └── logger.js            # Logging utility
├── frontend/
│   ├── index.html               # Main HTML
│   ├── css/
│   │   └── styles.css          # Styles
│   └── js/
│       └── app.js              # Frontend application
├── logs/                        # Application logs
├── cache/                       # Cache directory
├── config/                      # Configuration files
├── package.json
└── .env                         # Environment variables
```

## Configuration Options

### Scraper Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPER_METHOD` | `playwright` | Scraping method: `playwright`, `decodo` |
| `SCRAPER_TIMEOUT_SECONDS` | `90` | Timeout per scraping attempt |
| `SCRAPER_MAX_RETRIES` | `3` | Max retry attempts |
| `SCRAPER_CONCURRENT_ROUTES` | `5` | Max concurrent routes in bulk mode |

### Decodo Proxy Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DECODO_USERNAME` | - | Decodo authentication username |
| `DECODO_PASSWORD` | - | Decodo authentication password |
| `DECODO_MAX_USES_PER_MINUTE` | `2` | Max uses per proxy per minute |
| `DECODO_MAX_WORKERS` | `3` | Max concurrent proxy connections |

### Recommended Settings

**Development**:
```env
SCRAPER_METHOD=playwright
NODE_ENV=development
LOG_LEVEL=debug
```

**Production**:
```env
SCRAPER_METHOD=decodo
NODE_ENV=production
LOG_LEVEL=info
DECODO_MAX_WORKERS=3
DECODO_MAX_USES_PER_MINUTE=2
```

## Deployment

### Option 1: Local Server

```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start backend/server.js --name frontier-scraper

# View logs
pm2 logs frontier-scraper

# Stop
pm2 stop frontier-scraper
```

### Option 2: Docker

```dockerfile
# Create Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
RUN npx playwright install-deps
RUN npx playwright install chromium
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Build
docker build -t frontier-scraper .

# Run
docker run -p 3000:3000 --env-file .env frontier-scraper
```

### Option 3: Cloud Deployment

Compatible with:
- **Heroku**: Add `Procfile` with `web: npm start`
- **AWS EC2**: Standard Node.js deployment
- **DigitalOcean**: Node.js droplet
- **Railway**: Auto-detected Node.js app

## Monitoring

### Logs

Logs are written to `logs/scraper-YYYY-MM-DD.log`:

```bash
# View today's logs
tail -f logs/scraper-$(date +%Y-%m-%d).log

# View errors only
grep ERROR logs/scraper-*.log
```

### Health Monitoring

```bash
# Check server health
curl http://localhost:3000/api/health

# Check proxy stats
curl http://localhost:3000/api/proxy/stats
```

### WebSocket Monitoring

Connect via browser console:
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## Troubleshooting

### Server Won't Start

**Issue**: Port already in use
```bash
# Find process using port 3000
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill process or change PORT in .env
```

**Issue**: Missing dependencies
```bash
npm install
npm run install-browsers
```

### Scraping Fails

**Issue**: PerimeterX blocking
- Enable Decodo proxies (`SCRAPER_METHOD=decodo`)
- Reduce `DECODO_MAX_USES_PER_MINUTE` to 1
- Increase retry attempts

**Issue**: No proxies available
- Check Decodo credentials in `.env`
- Verify proxies aren't all rate-limited (check Proxy Status tab)
- Increase `DECODO_MAX_WORKERS`

### WebSocket Not Connecting

**Issue**: Connection refused
- Ensure server is running
- Check firewall settings
- Verify correct host/port

## Security

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `API_KEY` (if implementing auth)
- [ ] Enable HTTPS (reverse proxy with nginx/Apache)
- [ ] Restrict CORS origins
- [ ] Keep dependencies updated: `npm audit`
- [ ] Secure Decodo credentials (environment variables, not code)
- [ ] Implement rate limiting on API endpoints
- [ ] Monitor logs for suspicious activity

### Environment Variables

Never commit `.env` files! Add to `.gitignore`:

```gitignore
.env
.env.local
.env.production
logs/
cache/
node_modules/
```

## Performance Tips

1. **Optimize Concurrent Routes**: Start with 3-5, increase gradually
2. **Proxy Rate Limiting**: Keep at 2 uses/minute for best results
3. **Cache Results**: Enable caching to avoid re-scraping
4. **Monitor Memory**: Playwright can use significant RAM
5. **Batch Processing**: Process routes in smaller batches (10-20 at a time)

## API Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/scraper/scrape` | 100 | 15 min |
| `/api/scraper/bulk` | 10 | 15 min |
| `/api/proxy/*` | 200 | 15 min |

## Support

### Documentation

- **API Reference**: See endpoints above
- **Frontend Guide**: Check browser DevTools console for debugging
- **Logs**: Check `logs/` directory

### Common Issues

1. **Timeout errors**: Increase `SCRAPER_TIMEOUT_SECONDS`
2. **Proxy exhaustion**: Reduce concurrent routes or increase workers
3. **Memory issues**: Restart server, reduce concurrent operations

## License

MIT License - Free for personal and commercial use

## Credits

- **Playwright**: Browser automation
- **Express**: Web server
- **WebSocket**: Real-time updates
- **Decodo**: Residential proxy service

---

**Version**: 1.0.0
**Build Date**: November 2025
**Status**: Production Ready

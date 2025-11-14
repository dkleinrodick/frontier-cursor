# Quick Start Guide

Get the Frontier Flight Scraper running in under 5 minutes!

## Windows Users

### Method 1: Automatic Installation (Recommended)

1. **Double-click** `install.bat`
2. **Wait** for installation to complete
3. **Edit** `.env` file with your Decodo credentials (optional)
4. **Double-click** `start.bat`
5. **Open** http://localhost:3000 in your browser

### Method 2: Manual Installation

```batch
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npm run install-browsers

# 3. Copy config
copy .env.example .env

# 4. Edit .env with your credentials

# 5. Start server
npm start
```

## Mac/Linux Users

### Method 1: Automatic Installation (Recommended)

```bash
# 1. Make scripts executable
chmod +x install.sh start.sh

# 2. Run installation
./install.sh

# 3. Edit .env with your credentials
nano .env  # or use your preferred editor

# 4. Start server
./start.sh
```

### Method 2: Manual Installation

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npm run install-browsers

# 3. Copy config
cp .env.example .env

# 4. Edit .env with your credentials
nano .env

# 5. Start server
npm start
```

## Configuration (Required)

Edit `.env` file and add your Decodo credentials:

```env
# Decodo Proxy Configuration
DECODO_USERNAME=your_username_here
DECODO_PASSWORD=your_password_here

# Scraper Method (use 'decodo' for production)
SCRAPER_METHOD=decodo
```

If you don't have Decodo credentials yet:
- Set `SCRAPER_METHOD=playwright` for testing (may be blocked)
- Or get Decodo credentials from your provider

## First Test

1. Open http://localhost:3000
2. Enter test route:
   - **Origin**: ORD
   - **Destination**: CUN
   - **Date**: Pick tomorrow's date
3. Click "Start Scraping"
4. Watch the results appear!

## Troubleshooting

### Port Already in Use

Change the port in `.env`:
```env
PORT=3001
```

### Node.js Not Found

Install Node.js 18+ from:
https://nodejs.org/

### Decodo Proxies Not Working

Check:
1. Credentials are correct in `.env`
2. `SCRAPER_METHOD=decodo` is set
3. Your Decodo subscription is active

## Next Steps

- **Read** `README.md` for full documentation
- **Check** Proxy Status tab to see proxy health
- **Try** bulk scraping with multiple routes
- **Monitor** the activity feed for real-time updates

## Support

Having issues? Check:
1. `logs/` directory for error messages
2. `README.md` for detailed troubleshooting
3. Ensure all prerequisites are installed

---

**That's it! Happy scraping! 🚀**

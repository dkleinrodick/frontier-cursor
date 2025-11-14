# Windows Installation Fix

If you got an error about `better-sqlite3` during installation, I've fixed it!

## What Happened

The original `package.json` included `better-sqlite3` which requires Visual Studio build tools on Windows. Since we're not actually using SQLite in this version, I've removed it.

## How to Fix

### Option 1: Re-run Installation (Recommended)

```batch
# Delete the failed installation
rmdir /s /q node_modules
del package-lock.json

# Run install again
install.bat
```

The updated `package.json` no longer has `better-sqlite3`, so it should work fine now!

### Option 2: Manual Fix

1. Delete these if they exist:
   - `node_modules` folder
   - `package-lock.json` file

2. Run:
   ```batch
   npm install
   npm run install-browsers
   ```

3. Then start normally:
   ```batch
   start.bat
   ```

## Verification

After successful installation, you should see:
```
[2/5] Installing dependencies...
    [OK] Dependencies installed

[3/5] Installing Playwright browsers...
    [OK] Playwright browsers installed
```

## If You Still Get Errors

### Missing Playwright Dependencies

If you see errors about Playwright, run:
```batch
npx playwright install-deps
npx playwright install chromium
```

### Port Already in Use

If port 3000 is taken, edit `.env`:
```env
PORT=3001
```

### Node Version Issues

Make sure you have Node.js 18 or higher:
```batch
node --version
```

If below v18, download from https://nodejs.org/

## Alternative: Skip Installation Script

You can also install manually:

```batch
# 1. Install dependencies
npm install

# 2. Install browsers
npm run install-browsers

# 3. Setup config
copy .env.example .env
notepad .env

# 4. Start server
npm start
```

## Need Help?

Check the main `README.md` for troubleshooting or open the application directory and look for error logs in the `logs/` folder after trying to start the server.

---

**Fixed!** The updated package.json should install without issues now. Just re-run `install.bat`!

# Bandwidth Optimization Summary

## Overview

The scraper has been optimized to minimize data usage while maintaining full functionality. This is especially important when using metered proxy services.

## Optimizations Applied

### 1. Aggressive Resource Blocking
- **Images**: All images blocked (not needed for data extraction)
- **Fonts**: All web fonts blocked
- **Media**: Video/audio content blocked
- **External Stylesheets**: Only Frontier's own CSS is allowed
- **WebSockets**: Blocked to prevent unnecessary connections

### 2. Domain Blocking
The following domains are automatically blocked:
- Google Analytics & Tag Manager
- Facebook/Twitter/LinkedIn tracking
- Advertising networks (DoubleClick, etc.)
- CDN services (Cloudflare, jsDelivr, etc.)
- Font services (Google Fonts, FontAwesome, etc.)

### 3. Smart Waiting
- Replaced fixed 3-second wait with intelligent script detection
- Waits specifically for the `FlightData` script to load
- Reduces unnecessary waiting time

### 4. Request Optimization
- Only loads essential HTML and JavaScript
- Uses `domcontentloaded` instead of `networkidle` (already implemented)
- Blocks unnecessary HTTP requests before they're made

## Expected Results

### Before Optimization
- **Average per scrape**: 2-5 MB
- **Components**: HTML (~100 KB), JS (~500 KB), CSS (~200 KB), Images (~2-3 MB), Fonts (~500 KB), Tracking (~500 KB)

### After Optimization
- **Average per scrape**: 200-500 KB
- **Components**: HTML (~100 KB), Essential JS (~300 KB), Frontier CSS (~100 KB)
- **Savings**: 80-90% reduction in bandwidth

### Example Calculation
If you scrape 1000 routes:
- **Before**: 2-5 GB
- **After**: 200-500 MB
- **Savings**: 1.5-4.5 GB (75-90% reduction)

## Settings Explanation

### `SCRAPER_CONCURRENT_ROUTES` (concurrentRoutes)
- Controls how many routes can be scraped concurrently in bulk operations
- Limits parallel scraping operations
- **Default**: 5
- **Recommendation**: Set to 3-5 for bandwidth-conscious usage

### `DECODO_MAX_WORKERS` (maxWorkers)
- Controls how many proxy connections can be active simultaneously
- Limits concurrent proxy usage to prevent overwhelming the proxy service
- **Default**: Same as `SCRAPER_CONCURRENT_ROUTES` (5)
- **Recommendation**: Keep the same as `concurrentRoutes` for optimal performance

### Synchronization
- **Both settings are automatically kept in sync**
- When you change one, the other updates automatically
- This ensures optimal resource usage - no idle proxies or waiting scrapes
- In the frontend configuration, both fields show they sync with each other

### Relationship
- Lower values = less bandwidth usage but slower scraping
- Higher values = faster scraping but more bandwidth usage
- Balance based on your bandwidth budget and time constraints
- **Recommended**: Keep both values the same (default behavior)

## Testing

A test script is available in `bandwidth-test/test-bandwidth-scraper.js` to verify:
1. Bandwidth usage per scrape
2. Resource blocking effectiveness
3. Flight data extraction still works correctly

## No Configuration Required

These optimizations are automatically active. No changes to your `.env` file or configuration are needed.

## Monitoring

You can monitor bandwidth usage through:
1. Proxy service dashboard (if available)
2. Server network monitoring
3. Logs (check for resource blocking messages)

## Additional Tips

1. **Use Cache**: Enable caching to avoid re-scraping the same routes
2. **Batch Operations**: Scrape during off-peak hours if possible
3. **Monitor Usage**: Keep track of your bandwidth usage to optimize further
4. **Adjust Concurrency**: Lower `concurrentRoutes` if you need even less bandwidth usage


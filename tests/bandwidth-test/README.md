# Bandwidth Optimization Test

This folder contains a test version of the scraper with aggressive bandwidth optimizations.

## What Was Optimized

1. **Resource Blocking**: Blocks images, fonts, media, and external stylesheets
2. **Domain Blocking**: Blocks tracking, analytics, and advertising domains
3. **Smart Waiting**: Waits for FlightData script instead of fixed timeouts
4. **Reduced Requests**: Only loads essential HTML and JavaScript

## Expected Bandwidth Reduction

- **Before**: ~2-5 MB per scrape (with images, fonts, tracking scripts)
- **After**: ~200-500 KB per scrape (only HTML + essential JS)
- **Savings**: ~80-90% reduction in data usage

## Testing

```bash
# From the main project directory
cd bandwidth-test
node test-bandwidth-scraper.js
```

The test will:
1. Scrape a sample route (DEN -> ORD)
2. Display bandwidth statistics
3. Show what resources were loaded vs blocked
4. Verify flight data extraction still works

## Integration

Once tested, the optimizations have been integrated into:
- `backend/services/scraper.js` - Main scraper service

The optimizations are automatically active and require no configuration changes.


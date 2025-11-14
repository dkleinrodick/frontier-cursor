# Settings Explanation

## maxWorkers and concurrentRoutes (Now Synced)

### `SCRAPER_CONCURRENT_ROUTES` (concurrentRoutes)
- **Purpose**: Controls how many routes can be scraped concurrently in bulk operations
- **Location**: Used in bulk scraping endpoints
- **Effect**: Limits parallel scraping operations to control server load and rate limiting
- **Default**: 5
- **Example**: If set to 5, only 5 routes will be scraped at the same time during bulk operations

### `DECODO_MAX_WORKERS` (maxWorkers)
- **Purpose**: Controls how many proxy connections can be active simultaneously
- **Location**: Used in `DecodoProxyManager` class
- **Effect**: Limits concurrent proxy usage to prevent overwhelming the proxy service
- **Default**: Same as `SCRAPER_CONCURRENT_ROUTES` (5)
- **Example**: If set to 5, only 5 proxies can be in use at the same time

### Synchronization
- **Both settings are now automatically kept in sync**
- When you change `concurrentRoutes`, `maxWorkers` automatically updates to match
- When you change `maxWorkers`, `concurrentRoutes` automatically updates to match
- This ensures optimal resource usage - no idle proxies or waiting scrapes
- In the frontend, both fields show a note indicating they sync with each other

### Why They're Synced
- `maxWorkers` limits proxy connections (infrastructure level)
- `concurrentRoutes` limits scraping operations (application level)
- Keeping them the same ensures:
  - No idle proxies (if maxWorkers > concurrentRoutes)
  - No waiting scrapes (if concurrentRoutes > maxWorkers)
  - Optimal resource utilization

### Recommended Settings
- **Low bandwidth/rate limits**: `3` (both settings)
- **Balanced**: `5` (default, both settings)
- **High throughput**: `10` (both settings)

### Override
- You can still set `DECODO_MAX_WORKERS` explicitly in your `.env` file to override the sync
- However, it's recommended to keep them the same for optimal performance


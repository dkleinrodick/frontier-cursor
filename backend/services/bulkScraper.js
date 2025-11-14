/**
 * Bulk Scraper Service
 * Modular service for handling bulk scraping operations with cache awareness
 */

const { scrapeFlights } = require('./scraper');
const { getCache } = require('./cache');
const { getRouteStorage } = require('./routeStorage');
const logger = require('../utils/logger');

/**
 * Process routes concurrently with a limit
 * Initial batch starts with random delays to avoid detection
 * Subsequent routes start immediately when one finishes
 */
async function processRoutesConcurrently(routes, processRoute, maxConcurrent) {
  const inProgress = new Set();
  let currentIndex = 0;
  let initialBatchScheduled = false;
  let initialBatchStarted = false;

  // Helper to start a route with optional delay
  const startRoute = (route, routeIndex, total, delay = 0) => {
    if (delay > 0) {
      // Schedule route to start after delay
      setTimeout(() => {
        const promise = processRoute(route, routeIndex, total)
          .finally(() => {
            inProgress.delete(promise);
          });
        
        inProgress.add(promise);
        logger.info(`Started route ${routeIndex}/${total} (${inProgress.size} concurrent) [delayed ${(delay/1000).toFixed(1)}s]`);
      }, delay);
    } else {
      // Start immediately
      const promise = processRoute(route, routeIndex, total)
        .finally(() => {
          inProgress.delete(promise);
        });
      
      inProgress.add(promise);
      logger.info(`Started route ${routeIndex}/${total} (${inProgress.size} concurrent)`);
    }
  };

  // Start initial batch with random delays (1-5 seconds apart)
  if (routes.length > 0 && !initialBatchScheduled) {
    initialBatchScheduled = true;
    const initialCount = Math.min(maxConcurrent, routes.length);
    
    logger.info(`Scheduling initial batch of ${initialCount} routes with staggered delays (1-5 seconds apart)...`);
    
    // Schedule all initial routes with staggered delays
    for (let i = 0; i < initialCount; i++) {
      const route = routes[currentIndex++];
      const routeIndex = currentIndex;
      
      // Random delay between 1-5 seconds for initial batch
      // First route starts immediately, others are staggered
      const delay = i === 0 ? 0 : Math.floor(Math.random() * 4000) + 1000; // 1-5 seconds
      
      startRoute(route, routeIndex, routes.length, delay);
    }
    
    // If first route starts immediately, mark as started
    // Otherwise wait for at least one route to start
    if (inProgress.size > 0) {
      initialBatchStarted = true;
    }
  }

  // Wait for at least one route from initial batch to actually start
  if (initialBatchScheduled && !initialBatchStarted) {
    // Wait a bit for routes to start (max 6 seconds for longest delay)
    let waitTime = 0;
    while (inProgress.size === 0 && waitTime < 6000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitTime += 100;
    }
    initialBatchStarted = true;
  }

  // Process remaining routes: when one finishes, start the next immediately
  while (currentIndex < routes.length || inProgress.size > 0) {
    // Wait for at least one route to complete
    if (inProgress.size > 0) {
      await Promise.race(Array.from(inProgress));
    }

    // Start new routes immediately when slots become available
    while (inProgress.size < maxConcurrent && currentIndex < routes.length) {
      const route = routes[currentIndex++];
      const routeIndex = currentIndex;
      
      // Start immediately (no delay for subsequent routes)
      startRoute(route, routeIndex, routes.length, 0);
    }
  }

  // Wait for any remaining promises to complete
  if (inProgress.size > 0) {
    await Promise.all(Array.from(inProgress));
  }
  
  logger.info(`All ${routes.length} routes processed`);
}

/**
 * Scrape all routes from a specific origin
 * Returns hierarchical results: { origin, destinations: { dest: flights[] } }
 */
async function scrapeRoutesByOrigin(origin, date, useCache = true) {
  const routeStorage = getRouteStorage();
  const cache = getCache();
  const routes = routeStorage.getAllRoutesForOrigin(origin);

  if (routes.length === 0) {
    return {
      success: false,
      error: `No routes found for origin ${origin}`
    };
  }

  logger.info(`Scraping ${routes.length} routes from ${origin} for date ${date}`);

  const results = {
    origin,
    date,
    destinations: {},
    stats: {
      total: routes.length,
      cached: 0,
      scraped: 0,
      failed: 0,
      processed: 0
    }
  };

  // Get concurrency limit
  const maxConcurrent = parseInt(process.env.SCRAPER_CONCURRENT_ROUTES) || 5;
  logger.info(`Processing ${routes.length} routes with max concurrency of ${maxConcurrent}`);

  // Broadcast start
  if (global.broadcast) {
    global.broadcast({
      type: 'bulk_by_origin_started',
      origin,
      date,
      total: routes.length,
      timestamp: new Date().toISOString()
    });
  }

  // Process route function
  const processRoute = async (route, current, total) => {
    const { destination } = route;
    
    // Broadcast progress
    if (global.broadcast) {
      global.broadcast({
        type: 'bulk_by_origin_progress',
        origin,
        destination,
        current,
        total,
        route: `${origin}-${destination}`,
        timestamp: new Date().toISOString()
      });
    }

    try {
      // Check cache if enabled
      let cachedData = null;
      if (useCache && cache.shouldUseCache()) {
        cachedData = await cache.get(origin, destination, date);
      } else if (useCache) {
        // Even if cache checking is disabled, check if data exists for stats
        cachedData = await cache.getUnchecked(origin, destination, date);
      }

      if (cachedData) {
        results.destinations[destination] = cachedData.flights || [];
        // Atomic stats update
        const cachedCount = ++results.stats.cached;
        const processedCount = ++results.stats.processed;
        
        logger.info(`[${origin}-${destination}] Cached (${processedCount}/${total} processed, ${cachedCount} cached)`);
        
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_cached',
            origin,
            destination,
            route: `${origin}-${destination}`,
            flightCount: cachedData.flights?.length || 0,
            current,
            total,
            stats: { 
              cached: results.stats.cached,
              scraped: results.stats.scraped,
              failed: results.stats.failed,
              processed: results.stats.processed,
              total: results.stats.total
            },
            timestamp: new Date().toISOString()
          });
        }
        
        return { destination, success: true, cached: true };
      } else {
        // Scrape live
        logger.info(`[${origin}-${destination}] Starting live scrape (${current}/${total})`);
        const result = await scrapeFlights(origin, destination, date);
        
        if (result.success) {
          results.destinations[destination] = result.flights || [];
          const scrapedCount = ++results.stats.scraped;
          const processedCount = ++results.stats.processed;
          logger.info(`[${origin}-${destination}] Scraped ${result.flights?.length || 0} flights (${processedCount}/${total} processed, ${scrapedCount} scraped)`);
        } else {
          results.destinations[destination] = [];
          const failedCount = ++results.stats.failed;
          const processedCount = ++results.stats.processed;
          logger.warn(`[${origin}-${destination}] Failed (${processedCount}/${total} processed, ${failedCount} failed)`);
        }

        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_complete',
            origin,
            destination,
            route: `${origin}-${destination}`,
            success: result.success,
            flightCount: result.flights?.length || 0,
            current,
            total,
            stats: { 
              cached: results.stats.cached,
              scraped: results.stats.scraped,
              failed: results.stats.failed,
              processed: results.stats.processed,
              total: results.stats.total
            },
            timestamp: new Date().toISOString()
          });
        }
        
        return { destination, success: result.success };
      }
    } catch (error) {
      logger.error(`Error scraping ${origin}-${destination}: ${error.message}`);
      results.destinations[destination] = [];
      const failedCount = ++results.stats.failed;
      const processedCount = ++results.stats.processed;
      logger.warn(`[${origin}-${destination}] Error (${processedCount}/${total} processed, ${failedCount} failed)`);

      if (global.broadcast) {
        global.broadcast({
          type: 'bulk_route_error',
          origin,
          destination,
          route: `${origin}-${destination}`,
          error: error.message,
          current,
          total,
          stats: { ...results.stats },
          timestamp: new Date().toISOString()
        });
      }
      
      return { destination, success: false, error: error.message };
    }
  };

  // Process routes concurrently
  await processRoutesConcurrently(routes, processRoute, maxConcurrent);

  results.success = results.stats.failed < results.stats.total;
  return results;
}

/**
 * Scrape all available routes
 * Returns hierarchical results: { origins: { origin: { destinations: { dest: flights[] } } } }
 */
async function scrapeAllRoutes(date, useCache = true) {
  const routeStorage = getRouteStorage();
  const cache = getCache();
  const allRoutes = routeStorage.getAllRoutes();
  const origins = routeStorage.getOrigins();

  if (allRoutes.length === 0) {
    return {
      success: false,
      error: 'No routes available. Please update routes first.'
    };
  }

  logger.info(`Scraping all ${allRoutes.length} routes for date ${date}`);

  const results = {
    date,
    origins: {},
    stats: {
      total: allRoutes.length,
      cached: 0,
      scraped: 0,
      failed: 0,
      processed: 0
    }
  };

  // Initialize structure
  origins.forEach(origin => {
    results.origins[origin] = {
      destinations: {}
    };
  });

  // Get concurrency limit
  const maxConcurrent = parseInt(process.env.SCRAPER_CONCURRENT_ROUTES) || 5;
  logger.info(`Processing ${allRoutes.length} routes with max concurrency of ${maxConcurrent}`);

  // Broadcast start
  if (global.broadcast) {
    global.broadcast({
      type: 'bulk_all_started',
      date,
      total: allRoutes.length,
      timestamp: new Date().toISOString()
    });
  }

  // Process route function
  const processRoute = async (route, current, total) => {
    const { origin, destination } = route;
    
    // Broadcast progress
    if (global.broadcast) {
      global.broadcast({
        type: 'bulk_all_progress',
        origin,
        destination,
        route: `${origin}-${destination}`,
        current,
        total,
        timestamp: new Date().toISOString()
      });
    }

    try {
      // Check cache if enabled
      let cachedData = null;
      if (useCache && cache.shouldUseCache()) {
        cachedData = await cache.get(origin, destination, date);
      } else if (useCache) {
        cachedData = await cache.getUnchecked(origin, destination, date);
      }

      if (cachedData) {
        results.origins[origin].destinations[destination] = cachedData.flights || [];
        // Atomic stats update
        const cachedCount = ++results.stats.cached;
        const processedCount = ++results.stats.processed;
        
        logger.info(`[${origin}-${destination}] Cached (${processedCount}/${total} processed, ${cachedCount} cached)`);
        
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_cached',
            origin,
            destination,
            route: `${origin}-${destination}`,
            flightCount: cachedData.flights?.length || 0,
            current,
            total,
            stats: { 
              cached: results.stats.cached,
              scraped: results.stats.scraped,
              failed: results.stats.failed,
              processed: results.stats.processed,
              total: results.stats.total
            },
            timestamp: new Date().toISOString()
          });
        }
        
        return { origin, destination, success: true, cached: true };
      } else {
        // Scrape live
        logger.info(`[${origin}-${destination}] Starting live scrape (${current}/${total})`);
        const result = await scrapeFlights(origin, destination, date);
        
        if (result.success) {
          results.origins[origin].destinations[destination] = result.flights || [];
          const scrapedCount = ++results.stats.scraped;
          const processedCount = ++results.stats.processed;
          logger.info(`[${origin}-${destination}] Scraped ${result.flights?.length || 0} flights (${processedCount}/${total} processed, ${scrapedCount} scraped)`);
        } else {
          results.origins[origin].destinations[destination] = [];
          const failedCount = ++results.stats.failed;
          const processedCount = ++results.stats.processed;
          logger.warn(`[${origin}-${destination}] Failed (${processedCount}/${total} processed, ${failedCount} failed)`);
        }

        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_complete',
            origin,
            destination,
            route: `${origin}-${destination}`,
            success: result.success,
            flightCount: result.flights?.length || 0,
            current,
            total,
            stats: { 
              cached: results.stats.cached,
              scraped: results.stats.scraped,
              failed: results.stats.failed,
              processed: results.stats.processed,
              total: results.stats.total
            },
            timestamp: new Date().toISOString()
          });
        }
        
        return { origin, destination, success: result.success };
      }
    } catch (error) {
      logger.error(`Error scraping ${origin}-${destination}: ${error.message}`);
      results.origins[origin].destinations[destination] = [];
      const failedCount = ++results.stats.failed;
      const processedCount = ++results.stats.processed;
      logger.warn(`[${origin}-${destination}] Error (${processedCount}/${total} processed, ${failedCount} failed)`);

      if (global.broadcast) {
        global.broadcast({
          type: 'bulk_route_error',
          origin,
          destination,
          route: `${origin}-${destination}`,
          error: error.message,
          current,
          total,
          stats: { ...results.stats },
          timestamp: new Date().toISOString()
        });
      }
      
      return { origin, destination, success: false, error: error.message };
    }
  };

  // Process routes concurrently
  await processRoutesConcurrently(allRoutes, processRoute, maxConcurrent);

  results.success = results.stats.failed < results.stats.total;
  return results;
}

module.exports = {
  scrapeRoutesByOrigin,
  scrapeAllRoutes
};


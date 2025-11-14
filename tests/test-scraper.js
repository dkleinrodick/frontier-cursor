/**
 * Test script for scraper with PerimeterX detection
 */

const { scrapeFlights } = require('./backend/services/scraper');
const { getCache } = require('./backend/services/cache');
const { getDecodoProxyManager } = require('./backend/services/decodoProxyManager');
const logger = require('./backend/utils/logger');

// Initialize cache
const cache = getCache();

// Initialize Decodo proxy manager if credentials are provided
if (process.env.DECODO_USERNAME && process.env.DECODO_PASSWORD) {
  const proxyManager = getDecodoProxyManager(
    process.env.DECODO_USERNAME,
    process.env.DECODO_PASSWORD
  );
  logger.info('Decodo proxy manager initialized');
} else {
  logger.warn('Decodo credentials not provided, using direct connection');
}

async function testScraper() {
  const origin = 'ORD';
  const destination = 'CUN';
  const date = '2025-11-22';

  logger.info(`Testing scraper for ${origin}-${destination} on ${date}`);
  
  try {
    const result = await scrapeFlights(origin, destination, date);
    
    if (result.success) {
      logger.info(`✓ Success! Found ${result.flights?.length || 0} flights`);
      logger.info(`Elapsed time: ${result.elapsed}ms`);
      if (result.cached) {
        logger.info('Data was retrieved from cache');
      } else {
        logger.info(`Proxy used: ${result.proxyUsed || 'direct'}`);
        logger.info(`Attempts: ${result.attempts || 1}`);
      }
      
      if (result.flights && result.flights.length > 0) {
        logger.info('\nSample flights:');
        result.flights.slice(0, 3).forEach((flight, idx) => {
          logger.info(`  ${idx + 1}. ${flight.flightNumber} - ${flight.price} (${flight.stops})`);
        });
      }
    } else {
      logger.error(`✗ Failed: ${result.error}`);
      logger.error(`Attempts: ${result.attempts || 1}`);
      logger.error(`Proxies tried: ${result.proxiesTried || 0}`);
    }
  } catch (error) {
    logger.error(`✗ Error: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
  }
  
  process.exit(0);
}

testScraper();


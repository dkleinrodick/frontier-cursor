/**
 * Flight Scraper Service
 * Handles scraping of Frontier Airlines flights with multiple methods
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { getProxyManager } = require('./decodoProxyManager');
const { getCache } = require('./cache');
const logger = require('../utils/logger');

chromium.use(stealth);

const SCRAPER_METHOD = process.env.SCRAPER_METHOD || 'playwright';
const TIMEOUT_SECONDS = parseInt(process.env.SCRAPER_TIMEOUT_SECONDS) || 90;
const MAX_RETRIES = parseInt(process.env.SCRAPER_MAX_RETRIES) || 3;

/**
 * Scrape flights using Playwright with optional proxy
 */
async function scrapeFlightsPlaywright(origin, destination, date, proxyConfig = null) {
  let browser = null;

  try {
    const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

    logger.info(`Scraping ${origin}->${destination} on ${date}${proxyConfig ? ` with proxy ${proxyConfig.server}` : ' (direct)'}`);

    // Launch browser
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    };

    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }

    browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/Chicago',
      geolocation: { latitude: 41.8781, longitude: -87.6298 },
    });

    await context.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Connection': 'keep-alive'
    });

    const page = await context.newPage();

    // Track PerimeterX blocking
    let perimeterXDetected = false;
    let responseReceived = false;

    // Intercept responses to detect PerimeterX early
    page.on('response', async (response) => {
      responseReceived = true;
      const url = response.url();
      const status = response.status();
      
      // Check for PerimeterX indicators in response
      if (url.includes('perimeterx') || url.includes('px-captcha') || url.includes('px-block')) {
        logger.warn(`PerimeterX detected in response: ${url}`);
        perimeterXDetected = true;
        return;
      }

      // Check response headers
      const headers = response.headers();
      if (headers['x-px-block'] || headers['px-block'] || headers['server']?.includes('PerimeterX')) {
        logger.warn(`PerimeterX detected in headers`);
        perimeterXDetected = true;
        return;
      }

      // Check response body for PerimeterX (if it's HTML)
      if (status === 403 || status === 429) {
        try {
          const text = await response.text();
          if (text.includes('PerimeterX') || text.includes('Access Denied') || text.includes('px-captcha')) {
            logger.warn(`PerimeterX detected in response body (status ${status})`);
            perimeterXDetected = true;
          }
        } catch (e) {
          // Ignore errors reading response
        }
      }
    });

    // Block unnecessary resources
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      const url = route.request().url();

      const blockedDomains = ['google-analytics.com', 'googletagmanager.com', 'doubleclick.net'];
      const shouldBlock = blockedDomains.some(d => url.includes(d)) ||
                         ['image', 'media', 'font'].includes(resourceType);

      shouldBlock ? route.abort() : route.continue();
    });

    // Use a shorter timeout for navigation (30 seconds)
    const NAVIGATION_TIMEOUT = 30000;
    page.setDefaultTimeout(NAVIGATION_TIMEOUT);

    logger.info(`Navigating to: ${url}`);
    
    let navigationCompleted = false;
    let navigationError = null;
    let timeoutReached = false;
    
    // Set up a hard timeout that will force failure after 30 seconds
    const hardTimeout = setTimeout(() => {
      if (!navigationCompleted) {
        timeoutReached = true;
        logger.warn('Hard timeout reached (30s) - navigation taking too long');
      }
    }, NAVIGATION_TIMEOUT);
    
    try {
      // Set up a timeout that will reject if navigation takes too long
      const navigationPromise = page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: NAVIGATION_TIMEOUT 
      }).then(() => {
        navigationCompleted = true;
        clearTimeout(hardTimeout);
      }).catch((err) => {
        navigationError = err;
        clearTimeout(hardTimeout);
        throw err;
      });

      // Set up PerimeterX checker that runs every 2 seconds and also checks page state
      const perimeterXChecker = new Promise((_, reject) => {
        const checkInterval = setInterval(async () => {
          if (perimeterXDetected) {
            clearInterval(checkInterval);
            clearTimeout(hardTimeout);
            navigationCompleted = true;
            reject(new Error('BLOCKED_BY_PERIMETERX'));
            return;
          }
          
          // Check if hard timeout was reached
          if (timeoutReached) {
            clearInterval(checkInterval);
            clearTimeout(hardTimeout);
            navigationCompleted = true;
            reject(new Error('BLOCKED_BY_PERIMETERX'));
            return;
          }
          
          // Periodically check page state even if no response came in
          try {
            const pageTitle = await page.title().catch(() => '');
            const url = page.url();
            
            // Check if we're stuck on a different page or blocked
            if (pageTitle.includes('denied') || pageTitle.includes('blocked') || 
                url.includes('perimeterx') || url.includes('px-captcha')) {
              logger.warn(`PerimeterX detected via page state check: title="${pageTitle}", url="${url}"`);
              perimeterXDetected = true;
              clearInterval(checkInterval);
              clearTimeout(hardTimeout);
              navigationCompleted = true;
              reject(new Error('BLOCKED_BY_PERIMETERX'));
              return;
            }
          } catch (checkError) {
            // Ignore errors from checking page state
          }
          
          // If navigation completed, stop checking
          if (navigationCompleted) {
            clearInterval(checkInterval);
            clearTimeout(hardTimeout);
          }
        }, 2000);
        
        // Clear interval after timeout
        setTimeout(() => {
          clearInterval(checkInterval);
        }, NAVIGATION_TIMEOUT + 1000);
      });

      // Race between navigation and PerimeterX detection
      await Promise.race([navigationPromise, perimeterXChecker]);
      
      clearTimeout(hardTimeout);
      logger.info('Navigation completed successfully');
    } catch (error) {
      clearTimeout(hardTimeout);
      logger.error(`Navigation error: ${error.message}`);
      
      // Check if it's a timeout or if we detected PerimeterX
      if (error.message === 'BLOCKED_BY_PERIMETERX' || perimeterXDetected || timeoutReached) {
        logger.warn('Navigation failed - treating as PerimeterX block');
        
        // Try to get page content to check for PerimeterX
        try {
          const pageContent = await page.content().catch(() => '');
          const pageTitle = await page.title().catch(() => '');
          
          logger.info(`Page state after failure: title="${pageTitle.substring(0, 100)}", content length=${pageContent.length}`);
          
          if (pageTitle.includes('denied') || pageContent.includes('PerimeterX') || 
              pageContent.includes('px-captcha') || pageContent.includes('Access Denied')) {
            logger.warn('PerimeterX confirmed in page content');
          }
        } catch (checkError) {
          logger.warn(`Could not check page content: ${checkError.message}`);
        }
        
        await browser.close();
        throw new Error('BLOCKED_BY_PERIMETERX');
      }
      
      // Check if it's a timeout error
      if (error.message.includes('Timeout') || error.message.includes('timeout') || 
          error.name === 'TimeoutError' || !navigationCompleted) {
        logger.warn('Navigation timed out - likely blocked or slow connection');
        await browser.close();
        throw new Error('BLOCKED_BY_PERIMETERX');
      }
      
      // Re-throw other errors
      throw error;
    }

    // Final check for PerimeterX after navigation
    if (perimeterXDetected) {
      logger.warn('PerimeterX detected after navigation');
      await browser.close();
      throw new Error('BLOCKED_BY_PERIMETERX');
    }

    logger.info(`Page loaded, waiting 3 seconds for content...`);
    await page.waitForTimeout(3000);
    logger.info(`Extracting flight data...`);

    // Final check for bot detection in page content
    const pageContent = await page.content();
    const pageTitle = await page.title();

    if (pageTitle.includes('denied') || pageContent.includes('PerimeterX') || 
        pageContent.includes('px-captcha') || pageContent.includes('Access Denied')) {
      await browser.close();
      throw new Error('BLOCKED_BY_PERIMETERX');
    }

    // Extract flight data
    const flightData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        if (content.includes('FlightData')) {
          const match = content.match(/FlightData\s*=\s*'([^']+)'/);
          if (match) {
            try {
              const decoded = match[1]
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'");
              return JSON.parse(decoded);
            } catch (e) {
              return null;
            }
          }
        }
      }
      return null;
    });

    await browser.close();

    if (!flightData || !flightData.journeys || !flightData.journeys[0]) {
      logger.warn(`No flight data found for ${origin}-${destination}. Page title: ${pageTitle}`);
      logger.warn(`Page content preview: ${pageContent.substring(0, 500)}`);
      throw new Error('NO_FLIGHT_DATA');
    }
    
    logger.info(`Found flight data with ${flightData.journeys.length} journey(s)`);

    const journey = flightData.journeys[0];
    const flights = [];

    if (journey.flights && Array.isArray(journey.flights)) {
      journey.flights.forEach(flight => {
        if (flight.legs && flight.legs.length > 0) {
          const firstLeg = flight.legs[0];
          const lastLeg = flight.legs[flight.legs.length - 1];
          const flightNumbers = flight.legs.map(leg => `F9 ${leg.flightNumber}`);

          flights.push({
            origin: firstLeg.departureStation || origin,
            destination: lastLeg.arrivalStation || destination,
            departureDate: firstLeg.departureDate,
            arrivalDate: lastLeg.arrivalDate,
            flightNumber: flightNumbers.join(', '),
            duration: flight.duration || flight.durationFormatted || 'N/A',
            stops: flight.stopsText || 'Nonstop',
            stopCount: flight.legs.length - 1,
            price: `$${flight.goWildFare}`,
            rawFare: flight.goWildFare
          });
        }
      });
    }

    // Filter out flights that cost less than $3
    const filteredFlights = flights.filter(flight => flight.rawFare >= 3);

    return filteredFlights;

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }
    throw error;
  }
}

/**
 * Scrape flights with Decodo proxy rotation
 * For PerimeterX blocks, tries all available proxies while respecting rate limits
 */
async function scrapeFlightsWithDecodo(origin, destination, date) {
  const proxyManager = getProxyManager();

  if (!proxyManager) {
    throw new Error('Decodo proxy manager not initialized');
  }

  let attempt = 0;
  let lastError = null;
  let consecutiveBlocks = 0;
  const triedProxies = new Set();
  const totalProxies = 10; // Total Decodo proxies available
  const maxWaitTime = 120000; // Max 2 minutes total wait time

  const startTime = Date.now();

  while (attempt < MAX_RETRIES || (lastError && lastError.message === 'BLOCKED_BY_PERIMETERX' && triedProxies.size < totalProxies)) {
    // Check if we've exceeded max wait time
    if (Date.now() - startTime > maxWaitTime) {
      logger.warn(`Max wait time exceeded for ${origin}-${destination}`);
      break;
    }

    attempt++;

    // Broadcast status update
    if (global.broadcast) {
      const maxAttempts = lastError && lastError.message === 'BLOCKED_BY_PERIMETERX' ? totalProxies : MAX_RETRIES;
      global.broadcast({
        type: 'scrape_attempt',
        route: `${origin}-${destination}`,
        attempt,
        maxAttempts,
        timestamp: new Date().toISOString()
      });
    }

    const proxy = proxyManager.getNextProxy();

    if (!proxy) {
      // No proxies available due to rate limiting
      logger.info(`Waiting for available proxy (${triedProxies.size}/${totalProxies} tried)...`);

      // Wait for a proxy to become available
      const waitedProxy = await proxyManager.waitForAvailableProxy(30000);

      if (!waitedProxy) {
        // If all proxies have been tried and none are available, we're done
        if (triedProxies.size >= totalProxies) {
          logger.warn(`All ${totalProxies} proxies have been tried for ${origin}-${destination}`);
          break;
        }
        logger.warn(`No proxies available after waiting`);
        break;
      }

      continue;
    }

    triedProxies.add(proxy.proxyId);
    logger.info(`Attempt ${attempt} using proxy ${proxy.proxyId} (${triedProxies.size}/${totalProxies} proxies tried)`);

    try {
      logger.info(`Starting scrape attempt ${attempt} for ${origin}-${destination} using ${proxy.proxyId}`);
      const flights = await scrapeFlightsPlaywright(origin, destination, date, proxy.playwrightConfig);

      proxyManager.releaseProxy(proxy.proxyId, true, false);

      logger.info(`Successfully scraped ${flights.length} flights for ${origin}-${destination} using ${proxy.proxyId}`);

      return {
        success: true,
        flights,
        proxyUsed: proxy.proxyId,
        attempts: attempt
      };

    } catch (error) {
      logger.error(`Attempt ${attempt} with ${proxy.proxyId} failed: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      
      const isPerimeterX = error.message === 'BLOCKED_BY_PERIMETERX';
      proxyManager.releaseProxy(proxy.proxyId, false, isPerimeterX);
      lastError = error;

      if (isPerimeterX) {
        consecutiveBlocks++;
        logger.warn(`PerimeterX block detected (${consecutiveBlocks} consecutive blocks) - proxy ${proxy.proxyId} will be cooldowned`);
        // Continue trying with other proxies
        continue;
      }

      // For non-PerimeterX errors, respect MAX_RETRIES
      if (attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  return {
    success: false,
    error: lastError ? lastError.message : 'Unknown error',
    attempts: attempt,
    proxiesTried: triedProxies.size
  };
}

/**
 * Main scrape function
 */
async function scrapeFlights(origin, destination, date) {
  const startTime = Date.now();
  const cache = getCache();

  try {
    // Check cache first
    const cachedData = await cache.get(origin, destination, date);
    if (cachedData) {
      logger.info(`Returning cached data for ${origin}-${destination} on ${date}`);

      if (global.broadcast) {
        global.broadcast({
          type: 'scrape_complete',
          route: `${origin}-${destination}`,
          success: true,
          flightCount: cachedData.flights ? cachedData.flights.length : 0,
          cached: true,
          elapsed: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
      }

      return {
        ...cachedData,
        cached: true,
        elapsed: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }

    // No cache, scrape live
    let result;

    if (SCRAPER_METHOD === 'decodo') {
      result = await scrapeFlightsWithDecodo(origin, destination, date);
    } else {
      const flights = await scrapeFlightsPlaywright(origin, destination, date);
      result = { success: true, flights, attempts: 1 };
    }

    const elapsed = Date.now() - startTime;

    // Save to cache if successful
    if (result.success) {
      await cache.set(origin, destination, date, result);
    }

    // Broadcast success
    if (global.broadcast) {
      global.broadcast({
        type: 'scrape_complete',
        route: `${origin}-${destination}`,
        success: result.success,
        flightCount: result.flights ? result.flights.length : 0,
        elapsed,
        timestamp: new Date().toISOString()
      });
    }

    return {
      ...result,
      elapsed,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error(`Scraping failed for ${origin}-${destination}: ${error.message}`);
    logger.error(`Error details:`, error);
    if (error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }

    if (global.broadcast) {
      global.broadcast({
        type: 'scrape_error',
        route: `${origin}-${destination}`,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: false,
      error: error.message,
      elapsed: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  scrapeFlights,
  scrapeFlightsPlaywright,
  scrapeFlightsWithDecodo
};

/**
 * BYPASS1 Scraper - Context Pooling Approach
 * 
 * This scraper uses a pool of browser contexts that are refreshed after each use
 * to avoid PerimeterX detection. Based on the frontier/backend/services/bypass1Scraper.js
 * 
 * Key features:
 * - Context pooling for efficiency
 * - Aggressive context refresh after each use (fresh fingerprint)
 * - Random delays to mimic human behavior
 * - Low bandwidth by blocking unnecessary resources
 * - Modular design for easy integration
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { getProxyManager } = require('./decodoProxyManager');
const logger = require('../utils/logger');

chromium.use(stealth);

class Bypass1Scraper {
  constructor(options = {}) {
    this.browser = null;
    this.contexts = [];
    this.initialized = false;
    this.parallelContexts = options.parallelContexts || 5;
    this.timeout = options.timeout || 30000;
    this.waitAfterLoad = options.waitAfterLoad || 5000;
    this.headless = options.headless !== false;
    this.useProxy = options.useProxy !== false; // Use proxies by default if available
    this.proxyManager = options.useProxy ? getProxyManager() : null;
  }

  /**
   * Initialize browser and context pool
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    logger.info(`[BYPASS1] Initializing with ${this.parallelContexts} parallel contexts...`);

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-setuid-sandbox'
      ]
    });

    // Create context pool (without proxies initially - proxies assigned per-request)
    for (let i = 0; i < this.parallelContexts; i++) {
      await this.createContext(i + 1, null);
    }

    this.initialized = true;
    logger.info(`[BYPASS1] Initialization complete`);
  }

  /**
   * Create a new browser context with optional proxy
   */
  async createContext(id, proxyConfig = null) {
    const contextOptions = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/Chicago',
      permissions: [],
      colorScheme: 'light',
      hasTouch: false,
      deviceScaleFactor: 1,
      isMobile: false
    };

    // Add proxy if provided
    if (proxyConfig) {
      contextOptions.proxy = {
        server: proxyConfig.server,
        username: proxyConfig.username,
        password: proxyConfig.password
      };
      logger.debug(`[BYPASS1] Context ${id} created with proxy ${proxyConfig.server}`);
    }

    const context = await this.browser.newContext(contextOptions);

    // Add anti-detection script
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    // Block unnecessary resources to reduce bandwidth
    await context.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      const url = route.request().url();

      // Block images, fonts, media, websockets
      if (['image', 'font', 'media', 'websocket'].includes(resourceType)) {
        return route.abort();
      }

      // Block tracking/analytics domains
      const blockedDomains = [
        'google-analytics.com',
        'googletagmanager.com',
        'facebook.com',
        'doubleclick.net',
        'adservice',
        'adsystem',
        'advertising',
        'tracking',
        'analytics'
      ];

      if (blockedDomains.some(domain => url.includes(domain))) {
        return route.abort();
      }

      // Block stylesheets except from booking.flyfrontier.com
      if (resourceType === 'stylesheet' && !url.includes('booking.flyfrontier.com')) {
        return route.abort();
      }

      route.continue();
    });

    const page = await context.newPage();

    this.contexts.push({
      context,
      page,
      usageCount: 0,
      inUse: false,
      id
    });

    logger.info(`[BYPASS1] Context ${id} created`);
  }

  /**
   * Get an available context from the pool
   */
  async acquireContext() {
    if (!this.initialized) {
      await this.initialize();
    }

    // Find first available context
    let availableContext = this.contexts.find(ctx => !ctx.inUse);

    // If all busy, wait and retry
    if (!availableContext) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.acquireContext();
    }

    availableContext.inUse = true;
    return availableContext;
  }

  /**
   * Release a context back to the pool and refresh it
   */
  async releaseContext(contextInfo) {
    if (!contextInfo) {
      return;
    }
    
    contextInfo.inUse = false;
    contextInfo.usageCount++;

    // Refresh context after every use to get fresh fingerprint
    // Use a small delay to ensure any pending operations complete
    try {
      // Small delay to let any pending operations finish
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.refreshContext(contextInfo);
    } catch (err) {
      logger.debug(`[BYPASS1] Error refreshing context ${contextInfo.id}: ${err.message}`);
      // If refresh fails, try to recreate the context without proxy
      try {
        await this.refreshContext(contextInfo, null);
      } catch (e) {
        logger.warn(`[BYPASS1] Failed to recreate context ${contextInfo.id}: ${e.message}`);
      }
    }
  }

  /**
   * Refresh a context (close and recreate) for fresh fingerprint
   */
  async refreshContext(contextInfo, proxyConfig = null) {
    try {
      // Close old page and context if they exist
      if (contextInfo.page) {
        try {
          if (!contextInfo.page.isClosed()) {
            await contextInfo.page.close();
          }
        } catch (e) {
          // Page might already be closed - ignore
          logger.debug(`[BYPASS1] Page ${contextInfo.id} already closed or error: ${e.message}`);
        }
      }
      if (contextInfo.context) {
        try {
          await contextInfo.context.close();
        } catch (e) {
          // Context might already be closed - ignore
          logger.debug(`[BYPASS1] Context ${contextInfo.id} already closed or error: ${e.message}`);
        }
      }

      // Recreate context with optional proxy
      const contextOptions = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/Chicago',
        permissions: [],
        colorScheme: 'light',
        hasTouch: false,
        deviceScaleFactor: 1,
        isMobile: false
      };

      if (proxyConfig) {
        contextOptions.proxy = {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password
        };
      }

      const context = await this.browser.newContext(contextOptions);

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });

      // Re-apply resource blocking
      await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const url = route.request().url();

        if (['image', 'font', 'media', 'websocket'].includes(resourceType)) {
          return route.abort();
        }

        const blockedDomains = [
          'google-analytics.com',
          'googletagmanager.com',
          'facebook.com',
          'doubleclick.net',
          'adservice',
          'adsystem',
          'advertising',
          'tracking',
          'analytics'
        ];

        if (blockedDomains.some(domain => url.includes(domain))) {
          return route.abort();
        }

        if (resourceType === 'stylesheet' && !url.includes('booking.flyfrontier.com')) {
          return route.abort();
        }

        route.continue();
      });

      contextInfo.context = context;
      contextInfo.page = await context.newPage();
      contextInfo.usageCount = 0;

      logger.debug(`[BYPASS1] Context ${contextInfo.id} refreshed`);
    } catch (error) {
      logger.error(`[BYPASS1] Failed to refresh context ${contextInfo.id}: ${error.message}`);
    }
  }

  /**
   * Scrape a single route with optional proxy
   */
  async scrapeRoute(origin, destination, date, proxyConfig = null) {
    // If using proxy manager, get a proxy
    let proxy = null;
    let proxyId = null;
    
    if (this.useProxy && this.proxyManager && !proxyConfig) {
      proxy = this.proxyManager.getNextProxy();
      if (proxy) {
        proxyConfig = proxy.playwrightConfig;
        proxyId = proxy.proxyId;
        logger.info(`[BYPASS1] Using proxy ${proxyId} for ${origin}-${destination}`);
      }
    } else if (proxyConfig) {
      // Use provided proxy config
      logger.info(`[BYPASS1] Using provided proxy for ${origin}-${destination}`);
    }

    // Get context from pool
    const contextInfo = await this.acquireContext();
    const { id } = contextInfo;
    
    // If proxy is needed, refresh context with proxy (contexts are refreshed after each use anyway)
    if (proxyConfig) {
      await this.refreshContext(contextInfo, proxyConfig);
    }

    // Get the page reference AFTER refresh (in case context was refreshed)
    let page = contextInfo.page;
    
    // Verify page is still valid
    if (!page || page.isClosed()) {
      logger.warn(`[BYPASS1-${id}] Page was closed, refreshing context...`);
      await this.refreshContext(contextInfo, proxyConfig);
      page = contextInfo.page;
    }

    try {
      const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

      logger.info(`[BYPASS1-${id}] Scraping ${origin} -> ${destination} on ${date}`);

      // Random human-like delay before navigating (1-3 seconds)
      const randomDelay = 1000 + Math.random() * 2000;
      try {
        await page.waitForTimeout(randomDelay);
      } catch (e) {
        if (e.message.includes('closed') || e.message.includes('Target')) {
          logger.warn(`[BYPASS1-${id}] Page closed during wait, refreshing...`);
          await this.refreshContext(contextInfo, proxyConfig);
          page = contextInfo.page;
        } else {
          throw e;
        }
      }

      // Navigate with timeout
      let navigationError = null;
      try {
        await Promise.race([
          page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: this.timeout 
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Navigation timeout')), this.timeout)
          )
        ]);
      } catch (error) {
        // Check if page/context was closed or timeout occurred
        if (error.message.includes('closed') || error.message.includes('Target')) {
          // Page/context was closed - this is a fatal error
          throw new Error('Navigation timeout');
        } else if (error.message.includes('Navigation timeout')) {
          // Timeout occurred - try to check if it's PerimeterX before throwing
          try {
            if (!page.isClosed()) {
              const pageTitle = await page.title().catch(() => '');
              const pageUrl = page.url();
              if (pageTitle.includes('denied') || pageTitle.includes('blocked') || 
                  pageUrl.includes('perimeterx') || pageUrl.includes('px-captcha')) {
                throw new Error('BLOCKED_BY_PERIMETERX');
              }
            }
          } catch (checkError) {
            // If it's PerimeterX, throw that; otherwise throw timeout
            if (checkError.message === 'BLOCKED_BY_PERIMETERX') {
              throw checkError;
            }
            // Otherwise, page is closed or other error - throw timeout
            throw new Error('Navigation timeout');
          }
          // If we get here, it's just a timeout
          throw new Error('Navigation timeout');
        } else {
          // Other navigation error
          throw error;
        }
      }

      // Quick PerimeterX check
      let pageTitle = '';
      let pageUrl = '';
      try {
        pageTitle = await page.title().catch(() => '');
        pageUrl = page.url();
      } catch (e) {
        if (e.message.includes('closed') || e.message.includes('Target')) {
          throw new Error('Navigation timeout');
        }
        throw e;
      }
      
      if (pageTitle.includes('denied') || pageTitle.includes('blocked') || 
          pageUrl.includes('perimeterx') || pageUrl.includes('px-captcha')) {
        logger.warn(`[BYPASS1-${id}] PerimeterX detected in title/URL`);
        throw new Error('BLOCKED_BY_PERIMETERX');
      }

      // Wait for FlightData script with randomization
      const extraWait = Math.random() * 2000; // 0-2 seconds extra
      try {
        await page.waitForTimeout(this.waitAfterLoad + extraWait);
      } catch (e) {
        if (e.message.includes('closed') || e.message.includes('Target')) {
          throw new Error('Navigation timeout');
        }
        throw e;
      }

      // Extract flight data - verify page is still valid
      if (page.isClosed()) {
        throw new Error('Navigation timeout');
      }
      
      const result = await page.evaluate(({ origin, destination }) => {
        // Check for PerimeterX blocking
        const html = document.documentElement.innerHTML;
        if (html.includes('PerimeterX') || html.includes('Access Denied') || 
            html.includes('px-captcha') || html.includes('px-block')) {
          return { error: 'Blocked by PerimeterX', blocked: true };
        }

        // Extract FlightData from script tags (same approach as working scraper)
        let flightDataJson = null;
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
                flightDataJson = JSON.parse(decoded);
                break;
              } catch (e) {
                // Continue searching
              }
            }
          }
        }

        if (!flightDataJson) {
          return { 
            error: 'FlightData not found', 
            blocked: false,
            debug: {
              title: document.title,
              bodyPreview: document.body ? document.body.innerText.substring(0, 200) : 'No body'
            }
          };
        }

        try {

          // Extract flights
          const flights = [];
          if (flightDataJson.journeys && flightDataJson.journeys[0]) {
            const journey = flightDataJson.journeys[0];
            if (journey.flights && Array.isArray(journey.flights)) {
              const flightMap = new Map();

              journey.flights.forEach(flight => {
                if (flight.legs && flight.legs.length > 0) {
                  const firstLeg = flight.legs[0];
                  const lastLeg = flight.legs[flight.legs.length - 1];
                  const flightNumbers = flight.legs.map(leg => `F9 ${leg.flightNumber}`).join(', ');
                  
                  const key = `${firstLeg.departureDate}_${lastLeg.arrivalDate}_${flightNumbers}`;

                  if (!flightMap.has(key)) {
                    flightMap.set(key, {
                      origin: firstLeg.departureStation || origin,
                      destination: lastLeg.arrivalStation || destination,
                      departureDate: firstLeg.departureDate,
                      arrivalDate: lastLeg.arrivalDate,
                      flightNumber: flightNumbers,
                      duration: flight.duration || flight.durationFormatted || 'N/A',
                      stops: flight.stopsText || (flight.legs.length === 1 ? 'Nonstop' : `${flight.legs.length - 1} stop(s)`),
                      stopCount: flight.legs.length - 1,
                      price: `$${flight.goWildFare}`,
                      rawFare: flight.goWildFare
                    });
                  }
                }
              });

              flights.push(...flightMap.values());
            }
          }

          return { flights, blocked: false };
        } catch (parseError) {
          return { error: parseError.message, blocked: false };
        }
      }, { origin, destination }).catch(e => {
        // If page evaluation fails due to closed page, return error
        if (e.message.includes('closed') || e.message.includes('Target')) {
          throw new Error('Navigation timeout');
        }
        throw e;
      });

      if (result.blocked) {
        logger.warn(`[BYPASS1-${id}] BLOCKED by PerimeterX`);
        // Release proxy with PerimeterX flag
        if (this.proxyManager && proxyId) {
          this.proxyManager.releaseProxy(proxyId, false, true);
        }
        await this.releaseContext(contextInfo);
        throw new Error('BLOCKED_BY_PERIMETERX');
      }

      // Release proxy if we used one (success case)
      if (this.proxyManager && proxyId) {
        this.proxyManager.releaseProxy(proxyId, true, false);
      }

      await this.releaseContext(contextInfo);

      if (result.error) {
        logger.warn(`[BYPASS1-${id}] Error: ${result.error}`);
        if (result.debug) {
          logger.debug(`[BYPASS1-${id}] Page title: "${result.debug.title}"`);
        }
        throw new Error('NO_FLIGHT_DATA');
      }

      // Filter out flights that cost less than $3
      const filteredFlights = result.flights.filter(flight => flight.rawFare >= 3);

      logger.info(`[BYPASS1-${id}] Found ${filteredFlights.length} flights`);
      return filteredFlights;

    } catch (error) {
      // Release proxy on error
      if (this.proxyManager && proxyId) {
        const isPerimeterX = error.message === 'BLOCKED_BY_PERIMETERX' || 
                            error.message.includes('PerimeterX') ||
                            error.message.includes('BLOCKED');
        this.proxyManager.releaseProxy(proxyId, false, isPerimeterX);
      }
      
      // Release context (don't await to avoid hanging if context is already closed)
      this.releaseContext(contextInfo).catch(e => {
        logger.debug(`[BYPASS1-${contextInfo.id}] Error releasing context: ${e.message}`);
      });
      
      logger.error(`[BYPASS1-${contextInfo.id}] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup all contexts and browser
   */
  async cleanup() {
    logger.info('[BYPASS1] Cleaning up...');

    try {
      for (const ctx of this.contexts) {
        if (ctx.page) await ctx.page.close().catch(() => {});
        if (ctx.context) await ctx.context.close().catch(() => {});
      }

      if (this.browser) {
        await this.browser.close();
      }

      this.contexts = [];
      this.browser = null;
      this.initialized = false;

      logger.info('[BYPASS1] Cleanup complete');
    } catch (error) {
      logger.error(`[BYPASS1] Cleanup error: ${error.message}`);
    }
  }
}

// Singleton instance
let scraperInstance = null;

/**
 * Get the BYPASS1 scraper instance (singleton)
 */
function getInstance(options = {}) {
  if (!scraperInstance) {
    scraperInstance = new Bypass1Scraper(options);
  }
  return scraperInstance;
}

/**
 * Scrape flights using BYPASS1 method
 */
async function scrapeFlightsBypass1(origin, destination, date, options = {}) {
  // Get or create instance with options
  // Note: Options are applied on first call, subsequent calls use the same instance
  if (!scraperInstance) {
    scraperInstance = new Bypass1Scraper(options);
  } else {
    // Update options if instance exists but options changed
    if (options.headless !== undefined && scraperInstance.headless !== (options.headless !== false)) {
      scraperInstance.headless = options.headless !== false;
    }
    if (options.useProxy !== undefined) {
      scraperInstance.useProxy = options.useProxy !== false;
      scraperInstance.proxyManager = options.useProxy ? getProxyManager() : null;
    }
  }
  
  return await scraperInstance.scrapeRoute(origin, destination, date);
}

/**
 * Cleanup the scraper instance
 */
async function cleanupBypass1() {
  if (scraperInstance) {
    await scraperInstance.cleanup();
    scraperInstance = null;
  }
}

// Cleanup on process exit
process.on('SIGINT', async () => {
  await cleanupBypass1();
  process.exit();
});

process.on('SIGTERM', async () => {
  await cleanupBypass1();
  process.exit();
});

module.exports = {
  scrapeFlightsBypass1,
  cleanupBypass1,
  getInstance,
  Bypass1Scraper
};


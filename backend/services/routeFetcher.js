/**
 * Route Fetcher Service
 * Fetches and parses available routes from Frontier Airlines sitemap
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../utils/logger');
const { cityToIata, extractCitiesFromText, extractCitiesFromUrl } = require('../utils/cityToIata');

chromium.use(stealth);

const SITEMAP_BASE_URL = 'https://flights.flyfrontier.com/en/sitemap/city-to-city-flights/page-';

/**
 * Fetch routes from a single sitemap page
 */
async function fetchRoutesFromPage(pageNumber) {
  try {
    const url = `${SITEMAP_BASE_URL}${pageNumber}`;
    logger.info(`Fetching routes from page ${pageNumber}: ${url}`);

    // Use axios first (faster for simple HTML)
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    const routes = [];
    const routeSet = new Set(); // For deduplication

    // Try multiple selectors to find route links
    const selectors = [
      'ul li a[href*="flights-from-"]',
      'a[href*="flights-from-"]',
      'ul a[href*="flights-from-"]'
    ];

    let foundLinks = 0;
    let parsedRoutes = 0;
    let unmappedCities = [];

    for (const selector of selectors) {
      const links = $(selector);
      if (links.length > 0) {
        logger.info(`Found ${links.length} links matching selector: ${selector}`);
        foundLinks = links.length;
        
        links.each((i, elem) => {
          const $elem = $(elem);
          const text = $elem.text().trim();
          const href = $elem.attr('href') || '';

          if (!href || !href.includes('flights-from-')) {
            logger.debug(`Skipping link - no valid href: ${href}`);
            return;
          }

          logger.info(`Processing link ${i + 1}/${links.length}: href="${href}", text="${text}"`);

          // Try extracting from URL first (more reliable)
          let cities = extractCitiesFromUrl(href);
          
          // Fallback to extracting from link text
          if (!cities) {
            cities = extractCitiesFromText(text);
          }

          if (cities) {
            logger.info(`Extracted cities: origin="${cities.originCity}", dest="${cities.destinationCity}" from href="${href}"`);
            const originIatas = cityToIata(cities.originCity);
            const destIatas = cityToIata(cities.destinationCity);

            // Handle multi-airport cities (arrays) and single airports (strings)
            const originList = Array.isArray(originIatas) ? originIatas : (originIatas ? [originIatas] : []);
            const destList = Array.isArray(destIatas) ? destIatas : (destIatas ? [destIatas] : []);

            logger.info(`Mapped to IATA: origin="${JSON.stringify(originList)}", dest="${JSON.stringify(destList)}"`);

            // Create routes for all combinations
            let routeAdded = false;
            originList.forEach(originIata => {
              destList.forEach(destIata => {
                if (originIata && destIata && originIata !== destIata) {
                  const routeKey = `${originIata}-${destIata}`;
                  
                  // Only add if not already seen
                  if (!routeSet.has(routeKey)) {
                    routeSet.add(routeKey);
                    routes.push({ 
                      origin: originIata, 
                      destination: destIata,
                      originCity: cities.originCity,
                      destinationCity: cities.destinationCity
                    });
                    parsedRoutes++;
                    routeAdded = true;
                    logger.debug(`Added route: ${originIata}-${destIata}`);
                  }
                }
              });
            });

            // Track unmapped cities for debugging
            if (!routeAdded && (originList.length === 0 || destList.length === 0)) {
              if (originList.length === 0) {
                logger.warn(`Unmapped origin city: "${cities.originCity}" from href: ${href}`);
                unmappedCities.push(`Origin: ${cities.originCity} (from: ${href})`);
              }
              if (destList.length === 0) {
                logger.warn(`Unmapped destination city: "${cities.destinationCity}" from href: ${href}`);
                unmappedCities.push(`Destination: ${cities.destinationCity} (from: ${href})`);
              }
            }
          } else {
            // Log if we couldn't extract cities at all
            logger.warn(`Could not extract cities from: href="${href}", text="${text}"`);
          }
        });
        
        // If we found links with this selector, break
        if (foundLinks > 0) break;
      }
    }

    if (foundLinks === 0) {
      logger.warn(`No route links found. Sample HTML structure: ${$('ul').first().html()?.substring(0, 200)}`);
    }

    if (unmappedCities.length > 0) {
      logger.warn(`Found ${unmappedCities.length} unmapped cities. First 10: ${unmappedCities.slice(0, 10).join(', ')}`);
    }

    logger.info(`Parsed ${parsedRoutes} routes from ${foundLinks} links`);

    // Remove duplicates
    const uniqueRoutes = Array.from(
      new Map(routes.map(r => [`${r.origin}-${r.destination}`, r])).values()
    );

    logger.info(`Found ${uniqueRoutes.length} unique routes on page ${pageNumber}`);
    return uniqueRoutes;

  } catch (error) {
    logger.error(`Error fetching page ${pageNumber}: ${error.message}`);
    
    // Fallback: try with Playwright if axios fails
    return await fetchRoutesFromPageWithPlaywright(pageNumber);
  }
}

/**
 * Fallback: Fetch routes using Playwright (for JavaScript-rendered content)
 */
async function fetchRoutesFromPageWithPlaywright(pageNumber) {
  let browser = null;
  try {
    const url = `${SITEMAP_BASE_URL}${pageNumber}`;
    logger.info(`Fetching routes with Playwright from page ${pageNumber}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const content = await page.content();
    const $ = cheerio.load(content);
    const routes = [];
    const routeSet = new Set();

    // Same parsing logic as above with multiple selectors
    const selectors = [
      'ul li a[href*="flights-from-"]',
      'a[href*="flights-from-"]',
      'ul a[href*="flights-from-"]'
    ];

    for (const selector of selectors) {
      const links = $(selector);
      if (links.length > 0) {
        logger.info(`Found ${links.length} links with Playwright using selector: ${selector}`);
        
        links.each((i, elem) => {
          const $elem = $(elem);
          const text = $elem.text().trim();
          const href = $elem.attr('href') || '';

          if (!href || !href.includes('flights-from-')) {
            return;
          }

          let cities = extractCitiesFromUrl(href);
          
          if (!cities) {
            cities = extractCitiesFromText(text);
          }

          if (cities) {
            const originIatas = cityToIata(cities.originCity);
            const destIatas = cityToIata(cities.destinationCity);

            // Handle multi-airport cities (arrays) and single airports (strings)
            const originList = Array.isArray(originIatas) ? originIatas : (originIatas ? [originIatas] : []);
            const destList = Array.isArray(destIatas) ? destIatas : (destIatas ? [destIatas] : []);

            // Create routes for all combinations
            originList.forEach(originIata => {
              destList.forEach(destIata => {
                if (originIata && destIata && originIata !== destIata) {
                  const routeKey = `${originIata}-${destIata}`;
                  
                  if (!routeSet.has(routeKey)) {
                    routeSet.add(routeKey);
                    routes.push({ 
                      origin: originIata, 
                      destination: destIata,
                      originCity: cities.originCity,
                      destinationCity: cities.destinationCity
                    });
                  }
                }
              });
            });
          }
        });
        
        if (links.length > 0) break;
      }
    }

    await browser.close();

    const uniqueRoutes = Array.from(
      new Map(routes.map(r => [`${r.origin}-${r.destination}`, r])).values()
    );

    logger.info(`Found ${uniqueRoutes.length} unique routes on page ${pageNumber} (via Playwright)`);
    return uniqueRoutes;

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }
    logger.error(`Error fetching page ${pageNumber} with Playwright: ${error.message}`);
    return [];
  }
}

/**
 * Fetch all routes from page 2 of the sitemap
 * If page 2 has no routes (e.g., only navigation links), fall back to page 1
 */
async function fetchAllRoutes() {
  const allRoutes = [];
  let targetPage = 2; // Try page 2 first

  logger.info(`Starting route fetch from Frontier sitemap page ${targetPage}`);

  try {
    const routes = await fetchRoutesFromPage(targetPage);
    allRoutes.push(...routes);
    logger.info(`Fetched ${routes.length} routes from page ${targetPage}`);
    
    // If no routes found on page 2, try page 1 as fallback
    if (routes.length === 0) {
      logger.warn(`No routes found on page ${targetPage}. Trying page 1 as fallback...`);
      targetPage = 1;
      const fallbackRoutes = await fetchRoutesFromPage(targetPage);
      allRoutes.push(...fallbackRoutes);
      logger.info(`Fetched ${fallbackRoutes.length} routes from page ${targetPage} (fallback)`);
    }
  } catch (error) {
    logger.error(`Failed to fetch page ${targetPage}: ${error.message}`);
    // Try page 1 as fallback if page 2 fails
    if (targetPage === 2) {
      logger.info('Attempting fallback to page 1...');
      try {
        const fallbackRoutes = await fetchRoutesFromPage(1);
        allRoutes.push(...fallbackRoutes);
        logger.info(`Fetched ${fallbackRoutes.length} routes from page 1 (fallback)`);
      } catch (fallbackError) {
        logger.error(`Fallback to page 1 also failed: ${fallbackError.message}`);
        throw error; // Throw original error
      }
    } else {
      throw error;
    }
  }

  // Remove duplicates
  const uniqueRoutes = Array.from(
    new Map(allRoutes.map(r => [`${r.origin}-${r.destination}`, r])).values()
  );

  logger.info(`Total unique routes found: ${uniqueRoutes.length}`);
  
  if (uniqueRoutes.length === 0) {
    logger.warn('No routes were parsed. This could mean:');
    logger.warn('1. Both page 1 and page 2 are empty or have different structures');
    logger.warn('2. The HTML structure is different than expected');
    logger.warn('3. City names in URLs are not mapped to IATA codes');
    logger.warn('Check the logs above for unmapped cities or parsing issues.');
    throw new Error('No routes found on any page');
  }
  
  return uniqueRoutes;
}

/**
 * Build route map structure for easy lookup
 * Returns: { origins: Set, destinations: Map<origin, Set<destinations>> }
 */
function buildRouteMap(routes) {
  const routeMap = {
    origins: new Set(),
    destinations: new Map() // origin -> Set of destinations
  };

  routes.forEach(route => {
    routeMap.origins.add(route.origin);
    
    if (!routeMap.destinations.has(route.origin)) {
      routeMap.destinations.set(route.origin, new Set());
    }
    
    routeMap.destinations.get(route.origin).add(route.destination);
  });

  return routeMap;
}

module.exports = {
  fetchAllRoutes,
  fetchRoutesFromPage,
  buildRouteMap
};


/**
 * Bandwidth-Optimized Scraper Test
 * Tests aggressive resource blocking to minimize data usage
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

async function testBandwidthOptimizedScraper(origin, destination, date, proxyConfig = null) {
  let browser = null;

  try {
    const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

    console.log(`Testing bandwidth-optimized scraper for ${origin}->${destination} on ${date}`);

    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-images', // Additional Chrome flag
        '--disable-javascript-harmony-shipping'
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
      // Disable images and other media
      javaScriptEnabled: true, // We need JS for flight data
    });

    await context.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Connection': 'keep-alive',
      // Don't accept images, fonts, etc.
      'Accept-Encoding': 'gzip, deflate, br'
    });

    const page = await context.newPage();

    // Track data usage
    let totalBytes = 0;
    const resourceStats = {
      html: 0,
      script: 0,
      stylesheet: 0,
      image: 0,
      font: 0,
      other: 0,
      blocked: 0
    };

    // Aggressive resource blocking
    await page.route('**/*', (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();

      // Block list - comprehensive
      const blockedDomains = [
        'google-analytics.com',
        'googletagmanager.com',
        'doubleclick.net',
        'googleadservices.com',
        'facebook.com',
        'facebook.net',
        'twitter.com',
        'linkedin.com',
        'pinterest.com',
        'instagram.com',
        'youtube.com',
        'youtube-nocookie.com',
        'gstatic.com',
        'googleapis.com',
        'cloudflare.com',
        'cdnjs.cloudflare.com',
        'jsdelivr.net',
        'unpkg.com',
        'bootstrapcdn.com',
        'fontawesome.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com',
        'adservice',
        'adsystem',
        'advertising',
        'tracking',
        'analytics',
        'pixel',
        'beacon',
        'collector'
      ];

      const isBlockedDomain = blockedDomains.some(domain => url.includes(domain));
      
      // Block resource types we don't need
      const shouldBlock = 
        isBlockedDomain ||
        resourceType === 'image' ||
        resourceType === 'media' ||
        resourceType === 'font' ||
        resourceType === 'websocket' ||
        (resourceType === 'stylesheet' && !url.includes('booking.flyfrontier.com')); // Only allow Frontier CSS

      if (shouldBlock) {
        resourceStats.blocked++;
        route.abort();
        return;
      }

      // Track allowed resources
      if (resourceType === 'document') resourceStats.html++;
      else if (resourceType === 'script') resourceStats.script++;
      else if (resourceType === 'stylesheet') resourceStats.stylesheet++;
      else resourceStats.other++;

      route.continue();
    });

    // Track response sizes
    page.on('response', async (response) => {
      try {
        const headers = response.headers();
        const contentLength = headers['content-length'];
        if (contentLength) {
          totalBytes += parseInt(contentLength);
        }
      } catch (e) {
        // Ignore
      }
    });

    console.log('Navigating to page...');
    const startTime = Date.now();
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', // Don't wait for all resources
      timeout: 30000 
    });

    console.log(`Page loaded in ${Date.now() - startTime}ms`);
    console.log(`Waiting for flight data script...`);

    // Wait for the specific script that contains FlightData
    await page.waitForFunction(() => {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        if (script.textContent && script.textContent.includes('FlightData')) {
          return true;
        }
      }
      return false;
    }, { timeout: 10000 }).catch(() => {
      console.log('FlightData script not found, trying to extract anyway...');
    });

    // Small delay to ensure script is parsed
    await page.waitForTimeout(2000);

    console.log('Extracting flight data...');

    // Debug: Check what scripts are available
    const scriptInfo = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.map(s => ({
        hasContent: !!s.textContent,
        contentLength: s.textContent ? s.textContent.length : 0,
        hasFlightData: s.textContent ? s.textContent.includes('FlightData') : false,
        src: s.src || 'inline'
      }));
    });
    console.log(`Found ${scriptInfo.length} scripts:`, scriptInfo.filter(s => s.hasFlightData || s.contentLength > 1000).map(s => `src=${s.src}, hasFlightData=${s.hasFlightData}, length=${s.contentLength}`));

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

    const elapsed = Date.now() - startTime;
    const dataMB = (totalBytes / (1024 * 1024)).toFixed(2);

    console.log('\n=== Bandwidth Statistics ===');
    console.log(`Total data loaded: ${dataMB} MB`);
    console.log(`Time elapsed: ${elapsed}ms`);
    console.log(`Resources loaded:`);
    console.log(`  - HTML: ${resourceStats.html}`);
    console.log(`  - Scripts: ${resourceStats.script}`);
    console.log(`  - Stylesheets: ${resourceStats.stylesheet}`);
    console.log(`  - Other: ${resourceStats.other}`);
    console.log(`Resources blocked: ${resourceStats.blocked}`);
    console.log('===========================\n');

    if (!flightData || !flightData.journeys || !flightData.journeys[0]) {
      throw new Error('NO_FLIGHT_DATA');
    }

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

    const filteredFlights = flights.filter(flight => flight.rawFare >= 3);

    return {
      success: true,
      flights: filteredFlights,
      bandwidth: {
        totalBytes,
        totalMB: parseFloat(dataMB),
        resourcesLoaded: resourceStats.html + resourceStats.script + resourceStats.stylesheet + resourceStats.other,
        resourcesBlocked: resourceStats.blocked,
        elapsed
      }
    };

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

// Test function
async function runTest() {
  const testProxy = {
    server: 'http://dc.decodo.com:10001',
    username: 'spae6it3gy',
    password: 'apzKUcU82p4+cDi3zq'
  };

  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 7); // Try 7 days instead of 30
  const dateStr = testDate.toISOString().split('T')[0];

  console.log('Testing bandwidth-optimized scraper...\n');
  console.log(`Route: DEN -> ORD`);
  console.log(`Date: ${dateStr}`);
  console.log(`Proxy: ${testProxy.server}\n`);

  try {
    const result = await testBandwidthOptimizedScraper('DEN', 'ORD', dateStr, testProxy);
    
    console.log(`\n✅ Success! Found ${result.flights.length} flights`);
    console.log(`\nBandwidth Usage:`);
    console.log(`  Total: ${result.bandwidth.totalMB} MB`);
    console.log(`  Resources loaded: ${result.bandwidth.resourcesLoaded}`);
    console.log(`  Resources blocked: ${result.bandwidth.resourcesBlocked}`);
    console.log(`  Time: ${result.bandwidth.elapsed}ms`);
    
    if (result.flights.length > 0) {
      console.log(`\nSample flight:`);
      console.log(JSON.stringify(result.flights[0], null, 2));
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run if called directly
if (require.main === module) {
  runTest().then(() => {
    console.log('\nTest complete!');
    process.exit(0);
  }).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { testBandwidthOptimizedScraper };


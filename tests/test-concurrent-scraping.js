/**
 * Test script to verify concurrent route processing
 */

require('dotenv').config();
const { scrapeRoutesByOrigin } = require('./backend/services/bulkScraper');

async function testConcurrentScraping() {
  console.log('Testing concurrent route processing...\n');
  
  const origin = 'DEN';
  const date = '2025-12-14';
  const maxConcurrent = parseInt(process.env.SCRAPER_CONCURRENT_ROUTES) || 5;
  
  console.log(`Configuration:`);
  console.log(`  Origin: ${origin}`);
  console.log(`  Date: ${date}`);
  console.log(`  Max Concurrent: ${maxConcurrent}\n`);
  
  const startTime = Date.now();
  console.log(`Starting bulk scrape at ${new Date().toISOString()}\n`);
  
  try {
    const result = await scrapeRoutesByOrigin(origin, date, true);
    
    const elapsed = Date.now() - startTime;
    const elapsedSeconds = (elapsed / 1000).toFixed(2);
    
    console.log(`\n=== Results ===`);
    console.log(`Total routes: ${result.stats.total}`);
    console.log(`Cached: ${result.stats.cached}`);
    console.log(`Scraped: ${result.stats.scraped}`);
    console.log(`Failed: ${result.stats.failed}`);
    console.log(`Total time: ${elapsedSeconds} seconds`);
    console.log(`Average time per route: ${(elapsed / result.stats.total).toFixed(2)} seconds`);
    
    if (result.stats.scraped > 0) {
      const expectedSequentialTime = result.stats.scraped * 15; // Assume 15 seconds per scrape
      const expectedConcurrentTime = Math.ceil(result.stats.scraped / maxConcurrent) * 15;
      console.log(`\nExpected sequential time: ~${expectedSequentialTime} seconds`);
      console.log(`Expected concurrent time (${maxConcurrent}): ~${expectedConcurrentTime} seconds`);
      console.log(`Actual time: ${elapsedSeconds} seconds`);
      
      if (elapsed < expectedSequentialTime * 0.7) {
        console.log(`\n✅ Concurrent processing appears to be working!`);
      } else {
        console.log(`\n⚠️  Processing may still be sequential. Check logs.`);
      }
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run test
testConcurrentScraping().then(() => {
  console.log('\nTest complete!');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});


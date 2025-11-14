/**
 * Test script for BYPASS1 scraper
 * Tests the context pooling approach with low bandwidth
 */

require('dotenv').config();
const { scrapeFlightsBypass1, cleanupBypass1 } = require('./backend/services/scraperBypass1');

async function testBypass1Scraper() {
  console.log('🧪 Testing BYPASS1 Scraper\n');

  const testRoutes = [
    { origin: 'ORD', destination: 'DEN', date: '2025-12-14' },
    { origin: 'DEN', destination: 'LAS', date: '2025-12-14' },
    { origin: 'LAS', destination: 'PHX', date: '2025-12-14' }
  ];

  const options = {
    parallelContexts: 3,
    timeout: 30000,
    waitAfterLoad: 5000,
    headless: true
  };

  console.log('Configuration:');
  console.log(`  Parallel contexts: ${options.parallelContexts}`);
  console.log(`  Timeout: ${options.timeout}ms`);
  console.log(`  Wait after load: ${options.waitAfterLoad}ms\n`);

  const results = [];

  for (const route of testRoutes) {
    const startTime = Date.now();
    console.log(`\n📡 Testing: ${route.origin} -> ${route.destination} on ${route.date}`);

    try {
      const flights = await scrapeFlightsBypass1(
        route.origin,
        route.destination,
        route.date,
        options
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      if (flights && flights.length > 0) {
        console.log(`✅ Success: Found ${flights.length} flights in ${elapsed}s`);
        console.log(`   Sample flight: ${flights[0].flightNumber} - ${flights[0].price}`);
        results.push({ route, success: true, flights: flights.length, elapsed });
      } else {
        console.log(`⚠️  No flights found (${elapsed}s)`);
        results.push({ route, success: true, flights: 0, elapsed });
      }
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`❌ Error: ${error.message} (${elapsed}s)`);
      results.push({ route, success: false, error: error.message, elapsed });
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log('='.repeat(50));

  const successful = results.filter(r => r.success && r.flights > 0).length;
  const noFlights = results.filter(r => r.success && r.flights === 0).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Successful with flights: ${successful}/${testRoutes.length}`);
  console.log(`⚠️  No flights found: ${noFlights}/${testRoutes.length}`);
  console.log(`❌ Failed: ${failed}/${testRoutes.length}`);

  if (failed > 0) {
    console.log('\nFailed routes:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.route.origin}->${r.route.destination}: ${r.error}`);
    });
  }

  const avgTime = (results.reduce((sum, r) => sum + parseFloat(r.elapsed), 0) / results.length).toFixed(2);
  console.log(`\n⏱️  Average time per route: ${avgTime}s`);

  // Cleanup
  await cleanupBypass1();
  console.log('\n✅ Test complete!');
}

// Run test
testBypass1Scraper().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  cleanupBypass1().then(() => process.exit(1));
});


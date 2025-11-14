/**
 * Frontier Flight Scraper - Frontend Application
 * Handles UI interactions, WebSocket communication, and API calls
 */

class FrontierScraperApp {
  constructor() {
    this.ws = null;
    this.apiBase = window.location.origin;
    this.wsConnected = false;
    this.routeManager = new RouteManager(this.apiBase);
    this.bulkResults = null; // Store hierarchical bulk results

    this.init();
  }

  async init() {
    this.setupWebSocket();
    this.setupTabs();
    this.setupForms();
    this.setupEventListeners();
    await this.loadRoutes();
    this.loadInitialData();
    this.setDefaultDate();
    this.setupRouteUpdate();
    this.setupBulkModeToggle();
  }

  /**
   * WebSocket Setup
   */
  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.wsConnected = true;
      this.updateConnectionStatus(true);
      this.addActivity('System', 'Connected to server');
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.wsConnected = false;
      this.updateConnectionStatus(false);
      this.addActivity('System', 'Disconnected from server');

      // Reconnect after 3 seconds
      setTimeout(() => this.setupWebSocket(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus(false);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }

  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'connected':
        console.log('Server welcome:', data.message);
        break;

      case 'scrape_attempt':
        this.addActivity(data.route, `Attempt ${data.attempt}/${data.maxAttempts}`);
        this.updateProgressAttempt(data.attempt, data.maxAttempts);
        break;

      case 'scrape_complete':
        if (data.success) {
          this.addActivity(data.route, `✓ Found ${data.flightCount} flights (${data.elapsed}ms)`);
        } else {
          this.addActivity(data.route, `✗ Failed`);
        }
        break;

      case 'scrape_error':
        this.addActivity(data.route, `✗ Error: ${data.error}`);
        break;

      case 'bulk_progress':
        this.updateBulkProgress(data);
        break;

      case 'bulk_complete':
        this.handleBulkComplete(data);
        break;

      case 'route_update_started':
        this.addActivity('Route Update', data.message);
        break;

      case 'route_update_complete':
        if (data.success) {
          this.addActivity('Route Update', `✓ Updated ${data.routeCount} routes`);
          this.loadRoutes();
        } else {
          this.addActivity('Route Update', `✗ Failed: ${data.error}`);
        }
        break;

      case 'bulk_by_origin_complete':
        this.handleBulkByOriginComplete(data);
        break;

      case 'bulk_all_complete':
        this.handleBulkAllComplete(data);
        break;

      case 'proxy_test_complete':
        this.addActivity('Proxy Test', `✓ Tested ${data.working}/${data.total} proxies (${data.failed} failed)`);
        this.loadProxyStats();
        break;

      case 'proxy_test_error':
        this.addActivity('Proxy Test', `✗ Error: ${data.error}`);
        break;

      case 'proxy_batch_test_complete':
        this.handleProxyBatchTestComplete(data);
        break;

      case 'bulk_route_cached':
      case 'bulk_route_complete':
      case 'bulk_route_error':
        // Individual route updates during bulk operations
        break;
    }
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    const statusText = statusEl.querySelector('.status-text');

    if (connected) {
      statusEl.classList.add('connected');
      statusEl.classList.remove('disconnected');
      statusText.textContent = 'Connected';
    } else {
      statusEl.classList.remove('connected');
      statusEl.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
    }
  }

  /**
   * Tab Navigation
   */
  setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        // Update active states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        button.classList.add('active');
        document.getElementById(tabName).classList.add('active');

        // Load tab-specific data
        this.onTabChange(tabName);
      });
    });
  }

  onTabChange(tabName) {
    switch (tabName) {
      case 'proxy':
        this.loadProxyStats();
        break;
      case 'config':
        this.loadConfig();
        break;
    }
  }

  /**
   * Form Setup
   */
  setupForms() {
    // Single scrape form
    const scrapeForm = document.getElementById('scrapeForm');
    scrapeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSingleScrape();
    });

    // Bulk scrape button
    const bulkButton = document.getElementById('bulkScrapeButton');
    bulkButton.addEventListener('click', () => this.handleBulkScrape());
  }

  setupEventListeners() {
    // Refresh proxy stats button
    const refreshButton = document.getElementById('refreshProxyStats');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.loadProxyStats());
    }

    // Test all proxies button
    const testAllButton = document.getElementById('testAllProxies');
    if (testAllButton) {
      testAllButton.addEventListener('click', () => this.testAllProxies());
    }

    // Proxy management buttons
    const testProxyListBtn = document.getElementById('testProxyList');
    if (testProxyListBtn) {
      testProxyListBtn.addEventListener('click', () => this.testProxyList());
    }

    const loadProxyListBtn = document.getElementById('loadProxyList');
    if (loadProxyListBtn) {
      loadProxyListBtn.addEventListener('click', () => this.loadProxyList());
    }
  }

  async testAllProxies() {
    const button = document.getElementById('testAllProxies');
    if (!button) return;

    button.disabled = true;
    button.textContent = 'Testing...';

    try {
      const response = await fetch(`${this.apiBase}/api/proxy/test-all`, { method: 'POST' });
      const result = await response.json();
      
      this.addActivity('Proxy Test', 'Started testing all proxies. Results will appear as tests complete.');
      
      // Poll for updates
      const checkInterval = setInterval(async () => {
        await this.loadProxyStats();
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 120000);

    } catch (error) {
      this.addActivity('Proxy Test', `Error starting proxy tests: ${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        Test All Proxies
      `;
    }
  }

  setDefaultDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const minDate = new Date().toISOString().split('T')[0];

    // Set default date for all date inputs
    const dateInputs = ['date', 'bulkDate', 'bulkAllDate'];
    dateInputs.forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.value = dateStr;
        input.min = minDate;
      }
    });
  }

  /**
   * Single Scrape
   */
  async handleSingleScrape() {
    const origin = document.getElementById('origin').value.toUpperCase();
    const destination = document.getElementById('destination').value.toUpperCase();
    const date = document.getElementById('date').value;

    const button = document.getElementById('scrapeButton');
    const progress = document.getElementById('scrapeProgress');
    const results = document.getElementById('scrapeResults');

    // Show progress
    button.disabled = true;
    progress.style.display = 'block';
    results.style.display = 'none';
    results.innerHTML = '';

    this.updateProgressText(`Scraping ${origin} → ${destination}...`);

    try {
      const response = await fetch(`${this.apiBase}/api/scraper/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, date })
      });

      const data = await response.json();

      this.displayScrapeResults(data);

    } catch (error) {
      this.displayError('Scraping failed: ' + error.message);
    } finally {
      button.disabled = false;
      progress.style.display = 'none';
    }
  }

  displayScrapeResults(data) {
    const results = document.getElementById('scrapeResults');
    results.style.display = 'block';

    if (data.success && data.flights && data.flights.length > 0) {
      results.innerHTML = this.createFlightsHTML(data);
    } else if (data.success && (!data.flights || data.flights.length === 0)) {
      // Successful scrape but no flights found
      results.innerHTML = this.createNoFlightsHTML(data);
    } else {
      // Actual error occurred
      results.innerHTML = this.createErrorHTML(data.error || 'Scraping failed');
    }

    results.classList.add('fade-in');
  }

  createNoFlightsHTML(data) {
    const meta = `${data.elapsed}ms${data.proxyUsed ? ` • Proxy: ${data.proxyUsed}` : ''}${data.cached ? ' • Cached' : ''}`;

    return `
      <div class="result-card" style="border-left-color: var(--warning);">
        <div class="result-header">
          <div class="result-title">ℹ️ No Available GoWild Flights</div>
          <div class="result-meta">${meta}</div>
        </div>
        <p style="color: var(--text-secondary); margin-top: 15px;">
          No GoWild flights found for this route on this date. This could mean:
        </p>
        <ul style="color: var(--text-secondary); margin-top: 10px; padding-left: 20px;">
          <li>All flights on this route are sold out</li>
          <li>No flights operate on this date</li>
          <li>All available flights cost less than $3</li>
        </ul>
      </div>
    `;
  }

  createFlightsHTML(data) {
    const meta = `Found ${data.flights.length} flights • ${data.elapsed}ms${data.proxyUsed ? ` • Proxy: ${data.proxyUsed}` : ''}${data.cached ? ' • Cached' : ''}`;

    const flightsHTML = data.flights.map(flight => `
      <div class="flight-card">
        <div class="flight-header">
          <div class="flight-route">${flight.origin} → ${flight.destination}</div>
          <div class="flight-price">${flight.price}</div>
        </div>
        <div class="flight-details">
          <div class="flight-detail">
            <div class="flight-detail-label">Flight</div>
            <div class="flight-detail-value">${flight.flightNumber}</div>
          </div>
          <div class="flight-detail">
            <div class="flight-detail-label">Departs</div>
            <div class="flight-detail-value">${this.formatDate(flight.departureDate)}</div>
          </div>
          <div class="flight-detail">
            <div class="flight-detail-label">Arrives</div>
            <div class="flight-detail-value">${this.formatDate(flight.arrivalDate)}</div>
          </div>
          <div class="flight-detail">
            <div class="flight-detail-label">Duration</div>
            <div class="flight-detail-value">${flight.duration}</div>
          </div>
          <div class="flight-detail">
            <div class="flight-detail-label">Stops</div>
            <div class="flight-detail-value">${flight.stops}</div>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <div class="result-card success">
        <div class="result-header">
          <div class="result-title">✓ Scraping Successful</div>
          <div class="result-meta">${meta}</div>
        </div>
        <div class="flights-grid">${flightsHTML}</div>
      </div>
    `;
  }

  createErrorHTML(error) {
    return `
      <div class="result-card error">
        <div class="result-header">
          <div class="result-title">✗ Scraping Failed</div>
        </div>
        <p style="color: var(--text-secondary);">${error}</p>
      </div>
    `;
  }

  /**
   * Bulk Scrape
   */
  async handleBulkScrape() {
    const routesInput = document.getElementById('routesInput').value.trim();
    const button = document.getElementById('bulkScrapeButton');
    const progress = document.getElementById('bulkProgress');

    if (!routesInput) {
      alert('Please enter at least one route');
      return;
    }

    // Parse routes
    const routes = this.parseRoutes(routesInput);

    if (routes.length === 0) {
      alert('No valid routes found. Format: ORIGIN DESTINATION YYYY-MM-DD');
      return;
    }

    button.disabled = true;
    progress.style.display = 'block';

    // Reset counters
    document.getElementById('bulkTotal').textContent = routes.length;
    document.getElementById('bulkProcessed').textContent = '0';
    document.getElementById('bulkSuccess').textContent = '0';
    document.getElementById('bulkFailed').textContent = '0';

    this.addActivity('Bulk', `Starting bulk scrape of ${routes.length} routes`);

    try {
      await fetch(`${this.apiBase}/api/scraper/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes })
      });

      // Results will come via WebSocket
    } catch (error) {
      alert('Bulk scraping failed: ' + error.message);
      button.disabled = false;
    }
  }

  parseRoutes(input) {
    const lines = input.split('\n').map(line => line.trim()).filter(line => line);
    const routes = [];

    for (const line of lines) {
      const parts = line.split(/[\s,]+/);

      if (parts.length >= 3) {
        routes.push({
          origin: parts[0].toUpperCase(),
          destination: parts[1].toUpperCase(),
          date: parts[2]
        });
      }
    }

    return routes;
  }

  updateBulkProgress(data) {
    document.getElementById('bulkProcessed').textContent = data.processed;
  }

  handleBulkComplete(data) {
    document.getElementById('bulkProcessed').textContent = data.totalRoutes;
    document.getElementById('bulkSuccess').textContent = data.successful;
    document.getElementById('bulkFailed').textContent = data.failed;

    document.getElementById('bulkScrapeButton').disabled = false;

    this.addActivity('Bulk', `✓ Complete: ${data.successful}/${data.totalRoutes} successful`);

    // Display results
    this.displayBulkResults(data.results);
  }

  displayBulkResults(results) {
    const resultsDiv = document.getElementById('bulkResults');
    resultsDiv.style.display = 'block';

    const html = results.map(result => {
      const route = `${result.route.origin} → ${result.route.destination}`;

      if (result.success) {
        return `
          <div class="result-card success">
            <div class="result-header">
              <div class="result-title">✓ ${route}</div>
              <div class="result-meta">${result.flights.length} flights • ${result.elapsed}ms</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="result-card error">
            <div class="result-header">
              <div class="result-title">✗ ${route}</div>
              <div class="result-meta">${result.error}</div>
            </div>
          </div>
        `;
      }
    }).join('');

    resultsDiv.innerHTML = html;
  }

  /**
   * Proxy Stats
   */
  async loadProxyStats() {
    try {
      const response = await fetch(`${this.apiBase}/api/proxy/stats`);
      const data = await response.json();

      this.displayProxyStats(data);
      this.displayProxyDetails(data.proxies);

    } catch (error) {
      console.error('Failed to load proxy stats:', error);
      this.displayProxyError(error.message);
    }
  }

  displayProxyStats(data) {
    const statsDiv = document.getElementById('proxyStats');

    statsDiv.innerHTML = `
      <div class="proxy-stat">
        <div class="proxy-stat-label">Total Proxies</div>
        <div class="proxy-stat-value">${data.totalProxies}</div>
      </div>
      <div class="proxy-stat">
        <div class="proxy-stat-label">Enabled</div>
        <div class="proxy-stat-value">${data.enabledProxies || data.totalProxies}</div>
      </div>
      <div class="proxy-stat">
        <div class="proxy-stat-label">Disabled</div>
        <div class="proxy-stat-value" style="color: ${data.disabledProxies > 0 ? 'var(--error)' : 'inherit'}">${data.disabledProxies || 0}</div>
      </div>
      <div class="proxy-stat">
        <div class="proxy-stat-label">Blacklisted</div>
        <div class="proxy-stat-value" style="color: ${data.blacklistedProxies > 0 ? 'var(--error)' : 'inherit'}">${data.blacklistedProxies || 0}</div>
      </div>
      <div class="proxy-stat">
        <div class="proxy-stat-label">In Cooldown</div>
        <div class="proxy-stat-value" style="color: ${data.cooldownProxies > 0 ? 'var(--warning)' : 'inherit'}">${data.cooldownProxies || 0}</div>
      </div>
      <div class="proxy-stat">
        <div class="proxy-stat-label">Active Workers</div>
        <div class="proxy-stat-value">${data.activeWorkers} / ${data.maxWorkers}</div>
      </div>
      <div class="proxy-stat">
        <div class="proxy-stat-label">Max Uses/Minute</div>
        <div class="proxy-stat-value">${data.maxUsesPerMinute}</div>
      </div>
      <div class="proxy-stat">
        <div class="proxy-stat-label">Available</div>
        <div class="proxy-stat-value">${data.proxies.filter(p => p.canUseNow).length}</div>
      </div>
    `;
  }

  displayProxyDetails(proxies) {
    const detailsDiv = document.getElementById('proxyDetails');

    const html = proxies.map(proxy => {
      // Determine status class based on cooldown/blacklist
      let statusClass = 'available';
      if (proxy.blacklisted) {
        statusClass = 'blacklisted';
      } else if (proxy.disabled) {
        statusClass = 'disabled';
      } else if (proxy.cooldownStatus === 'cooldown') {
        statusClass = 'cooldown';
      } else if (!proxy.canUseNow) {
        statusClass = 'rate-limited';
      }

      const testStatus = proxy.testResult || 'untested';
      const testStatusClass = testStatus === 'working' ? 'success' : (testStatus === 'failed' ? 'error' : 'warning');
      
      // Cooldown status badge
      let cooldownBadge = '';
      if (proxy.cooldownStatus === 'blacklisted') {
        cooldownBadge = '<span style="background: var(--error); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; font-weight: bold;">BLACKLISTED</span>';
      } else if (proxy.cooldownStatus === 'cooldown') {
        const cooldownColor = proxy.cooldownLevel === 1 ? 'var(--warning)' : (proxy.cooldownLevel === 2 ? '#ff8800' : '#ff4400');
        cooldownBadge = `<span style="background: ${cooldownColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">${proxy.cooldownMessage}</span>`;
      } else if (proxy.perimeterXBlocks > 0) {
        cooldownBadge = `<span style="background: var(--warning); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">${proxy.perimeterXBlocks} PX block(s)</span>`;
      }
      
      return `
      <div class="proxy-item ${statusClass}">
        <div class="proxy-info">
          <div class="proxy-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div class="proxy-id">
              ${proxy.id} 
              ${proxy.disabled ? '<span style="color: var(--error);">(DISABLED)</span>' : ''}
              ${proxy.blacklisted ? '<span style="color: var(--error); font-weight: bold;">(BLACKLISTED)</span>' : ''}
            </div>
            <div class="proxy-actions" style="display: flex; gap: 8px;">
              <button class="btn btn-sm btn-secondary test-proxy-btn" data-proxy-id="${proxy.id}" ${proxy.disabled || proxy.blacklisted ? 'disabled' : ''}>
                Test
              </button>
              ${proxy.disabled ? 
                `<button class="btn btn-sm btn-success enable-proxy-btn" data-proxy-id="${proxy.id}">Enable</button>` :
                `<button class="btn btn-sm btn-danger disable-proxy-btn" data-proxy-id="${proxy.id}">Disable</button>`
              }
            </div>
          </div>
          <div class="proxy-meta" style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.9em; color: var(--text-secondary);">
            <span>Host: ${proxy.host}</span>
            <span>Requests: ${proxy.totalRequests}</span>
            <span>Success Rate: ${proxy.successRate}%</span>
            <span>Recent Uses: ${proxy.recentUses}</span>
            <span class="test-status ${testStatusClass}" style="padding: 2px 8px; border-radius: 4px; background: ${testStatusClass === 'success' ? 'var(--success)' : (testStatusClass === 'error' ? 'var(--error)' : 'var(--warning)')}; color: white;">
              Test: ${testStatus === 'working' ? '✓ Working' : (testStatus === 'failed' ? '✗ Failed' : '? Untested')}
            </span>
            ${proxy.lastTested ? `<span>Last Tested: ${new Date(proxy.lastTested).toLocaleString()}</span>` : ''}
            ${proxy.disabledReason ? `<span style="color: var(--error);">Reason: ${proxy.disabledReason}</span>` : ''}
            ${proxy.hasCustomCredentials ? `<span style="color: var(--success);">✓ Custom credentials</span>` : ''}
          </div>
          ${cooldownBadge ? `<div style="margin-top: 8px;">${cooldownBadge}</div>` : ''}
        </div>
        <div class="proxy-status ${statusClass}" style="margin-top: 8px; padding: 4px 8px; border-radius: 4px; text-align: center; font-size: 0.85em;">
          ${proxy.blacklisted ? 'Blacklisted' : (proxy.disabled ? 'Disabled' : (proxy.cooldownStatus === 'cooldown' ? 'In Cooldown' : (proxy.canUseNow ? 'Available' : 'Rate Limited')))}
        </div>
      </div>
    `;
    }).join('');

    detailsDiv.innerHTML = html || '<p style="color: var(--text-secondary);">No proxy data available</p>';
    
    // Add event listeners for test/enable/disable buttons
    this.setupProxyButtons();
  }

  setupProxyButtons() {
    // Test buttons
    document.querySelectorAll('.test-proxy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const proxyId = e.target.dataset.proxyId;
        e.target.disabled = true;
        e.target.textContent = 'Testing...';
        
        try {
          const response = await fetch(`${this.apiBase}/api/proxy/test/${proxyId}`);
          const result = await response.json();
          
          if (result.success) {
            this.addActivity('Proxy Test', `${proxyId}: ${result.message}`);
          } else {
            this.addActivity('Proxy Test', `${proxyId}: ${result.message}`);
          }
          
          // Reload stats to show updated status
          await this.loadProxyStats();
        } catch (error) {
          this.addActivity('Proxy Test', `${proxyId}: Error - ${error.message}`);
        } finally {
          e.target.disabled = false;
          e.target.textContent = 'Test';
        }
      });
    });

    // Enable buttons
    document.querySelectorAll('.enable-proxy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const proxyId = e.target.dataset.proxyId;
        try {
          const response = await fetch(`${this.apiBase}/api/proxy/${proxyId}/enable`, { method: 'POST' });
          const result = await response.json();
          this.addActivity('Proxy', result.message);
          await this.loadProxyStats();
        } catch (error) {
          this.addActivity('Proxy', `Error enabling ${proxyId}: ${error.message}`);
        }
      });
    });

    // Disable buttons
    document.querySelectorAll('.disable-proxy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const proxyId = e.target.dataset.proxyId;
        try {
          const response = await fetch(`${this.apiBase}/api/proxy/${proxyId}/disable`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Manual disable' })
          });
          const result = await response.json();
          this.addActivity('Proxy', result.message);
          await this.loadProxyStats();
        } catch (error) {
          this.addActivity('Proxy', `Error disabling ${proxyId}: ${error.message}`);
        }
      });
    });
  }

  displayProxyError(error) {
    document.getElementById('proxyStats').innerHTML = `
      <p style="color: var(--error); padding: 20px; text-align: center;">
        ${error}
      </p>
    `;
  }

  async testProxyList() {
    const username = document.getElementById('proxyUsername').value.trim();
    const password = document.getElementById('proxyPassword').value.trim();
    const proxyListText = document.getElementById('proxyList').value.trim();

    if (!proxyListText) {
      alert('Please enter at least one proxy');
      return;
    }

    // Parse proxy list (one per line)
    const proxies = proxyListText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.includes(':'));

    if (proxies.length === 0) {
      alert('No valid proxies found. Format: host:port or host:port:username:password (one per line)');
      return;
    }

    // Check if proxies have embedded credentials or need form credentials
    const proxiesWithCredentials = proxies.filter(p => p.split(':').length >= 4);
    const proxiesWithoutCredentials = proxies.filter(p => p.split(':').length < 4);

    // If any proxy doesn't have embedded credentials, require form credentials
    if (proxiesWithoutCredentials.length > 0 && (!username || !password)) {
      alert('Please enter username and password, or include credentials in proxy format: host:port:username:password');
      return;
    }

    const testBtn = document.getElementById('testProxyList');
    const loadBtn = document.getElementById('loadProxyList');
    const resultsDiv = document.getElementById('proxyTestResults');

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    loadBtn.disabled = true;
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<p>Testing proxies... This may take a while.</p>';

    try {
      const response = await fetch(`${this.apiBase}/api/proxy/test-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxies, username, password })
      });

      const result = await response.json();
      this.addActivity('Proxy Test', `Started testing ${proxies.length} proxies...`);

      // Store results for later use
      this.pendingProxyTest = { proxies, username, password };

    } catch (error) {
      this.addActivity('Proxy Test', `Error: ${error.message}`);
      resultsDiv.innerHTML = `<p style="color: var(--error);">Error: ${error.message}</p>`;
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        Test Proxies
      `;
    }
  }

  handleProxyBatchTestComplete(data) {
    const resultsDiv = document.getElementById('proxyTestResults');
    const loadBtn = document.getElementById('loadProxyList');

    if (!resultsDiv) return;

    const working = data.results.filter(r => r.success);
    const failed = data.results.filter(r => !r.success);

    let html = `
      <div style="margin-bottom: 15px;">
        <h3>Test Results: ${data.working}/${data.total} Working</h3>
        <p><strong>Working:</strong> ${data.working} | <strong>Failed:</strong> ${data.failed}</p>
      </div>
      <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); padding: 10px; border-radius: 4px;">
    `;

    data.results.forEach(result => {
      const status = result.success ? '✓' : '✗';
      const color = result.success ? 'var(--success)' : 'var(--error)';
      const details = result.success 
        ? ` (${result.elapsed}ms, IP: ${result.detectedIP || 'unknown'})`
        : ` (${result.error || 'Unknown error'})`;
      
      html += `
        <div style="padding: 5px; border-bottom: 1px solid var(--border);">
          <span style="color: ${color}; font-weight: bold;">${status}</span>
          <span style="margin-left: 10px;">${result.proxy}</span>
          <span style="color: var(--text-secondary); font-size: 0.9em;">${details}</span>
        </div>
      `;
    });

    html += '</div>';

    // Only show working proxies for loading
    const workingProxies = working.map(r => r.proxy);
    if (workingProxies.length > 0 && this.pendingProxyTest) {
      this.pendingProxyTest.workingProxies = workingProxies;
      loadBtn.disabled = false;
      html += `
        <div style="margin-top: 15px; padding: 10px; background: var(--success); color: white; border-radius: 4px;">
          ${workingProxies.length} working proxies ready to load. Click "Load Proxies" to add them.
        </div>
      `;
    } else {
      loadBtn.disabled = true;
      html += `
        <div style="margin-top: 15px; padding: 10px; background: var(--error); color: white; border-radius: 4px;">
          No working proxies found. Please check your credentials and proxy list.
        </div>
      `;
    }

    resultsDiv.innerHTML = html;
    this.addActivity('Proxy Test', `Test complete: ${data.working}/${data.total} working`);
  }

  async loadProxyList() {
    if (!this.pendingProxyTest || !this.pendingProxyTest.workingProxies) {
      alert('No tested proxies available. Please test proxies first.');
      return;
    }

    const replace = document.querySelector('input[name="proxyMode"]:checked').value === 'replace';
    const { workingProxies, username, password } = this.pendingProxyTest;

    // Get current form values (may have changed)
    const formUsername = document.getElementById('proxyUsername').value.trim();
    const formPassword = document.getElementById('proxyPassword').value.trim();

    // Use form credentials if provided, otherwise use test credentials
    const finalUsername = formUsername || username;
    const finalPassword = formPassword || password;

    const loadBtn = document.getElementById('loadProxyList');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';

    try {
      const response = await fetch(`${this.apiBase}/api/proxy/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxies: workingProxies,
          replace: replace,
          username: finalUsername || undefined,
          password: finalPassword || undefined
        })
      });

      const result = await response.json();

      if (result.success) {
        this.addActivity('Proxy Update', result.message);
        alert(`Success! ${result.message}`);
        
        // Clear form
        document.getElementById('proxyList').value = '';
        document.getElementById('proxyTestResults').style.display = 'none';
        this.pendingProxyTest = null;
        loadBtn.disabled = true;

        // Reload proxy stats
        await this.loadProxyStats();
      } else {
        throw new Error(result.error || 'Failed to load proxies');
      }

    } catch (error) {
      this.addActivity('Proxy Update', `Error: ${error.message}`);
      alert(`Error loading proxies: ${error.message}`);
    } finally {
      loadBtn.disabled = false;
      loadBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Load Proxies
      `;
    }
  }

  /**
   * Configuration
   */
  async loadConfig() {
    try {
      const [configRes, healthRes] = await Promise.all([
        fetch(`${this.apiBase}/api/config`),
        fetch(`${this.apiBase}/api/health`)
      ]);

      const config = await configRes.json();
      const health = await healthRes.json();

      this.displayConfig(config);
      this.displayHealth(health);

    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  displayConfig(config) {
    const configDiv = document.getElementById('configDisplay');

    // Define editable fields with their types
    const editableFields = {
      'scraper.method': { type: 'select', options: ['playwright', 'decodo'], env: 'SCRAPER_METHOD' },
      'scraper.timeoutSeconds': { type: 'number', min: 30, max: 300, env: 'SCRAPER_TIMEOUT_SECONDS' },
      'scraper.maxRetries': { type: 'number', min: 1, max: 10, env: 'SCRAPER_MAX_RETRIES' },
      'scraper.concurrentRoutes': { type: 'number', min: 1, max: 20, env: 'SCRAPER_CONCURRENT_ROUTES' },
      'decodo.maxUsesPerMinute': { type: 'number', min: 1, max: 5, env: 'DECODO_MAX_USES_PER_MINUTE' },
      'decodo.maxWorkers': { type: 'number', min: 1, max: 10, env: 'DECODO_MAX_WORKERS' },
      'cache.enabled': { type: 'boolean', env: 'CACHE_ENABLED' },
      'logging.level': { type: 'select', options: ['error', 'warn', 'info', 'debug'], env: 'LOG_LEVEL' }
    };

    const createField = (section, key, value) => {
      const fieldKey = `${section.toLowerCase()}.${key}`;
      const editable = editableFields[fieldKey];

      if (!editable) {
        // Read-only field
        return `
          <div class="config-field">
            <span class="config-key">${key}</span>
            <span class="config-value">${typeof value === 'boolean' ? (value ? '✓ Enabled' : '✗ Disabled') : value}</span>
          </div>
        `;
      }

      // Editable field
      let inputHTML = '';

      if (editable.type === 'select') {
        inputHTML = `
          <select class="config-input" data-env="${editable.env}">
            ${editable.options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>
        `;
      } else if (editable.type === 'boolean') {
        inputHTML = `
          <select class="config-input" data-env="${editable.env}">
            <option value="true" ${value === true ? 'selected' : ''}>Enabled</option>
            <option value="false" ${value === false ? 'selected' : ''}>Disabled</option>
          </select>
        `;
      } else if (editable.type === 'number') {
        inputHTML = `
          <input type="number" class="config-input" data-env="${editable.env}"
                 value="${value}" min="${editable.min}" max="${editable.max}">
        `;
      }

      return `
        <div class="config-field">
          <span class="config-key">${key}</span>
          ${inputHTML}
        </div>
      `;
    };

    const sections = [
      { title: 'Server', data: config.server },
      { title: 'Scraper', data: config.scraper },
      { title: 'Decodo', data: config.decodo },
      { title: 'Cache', data: config.cache },
      { title: 'Logging', data: config.logging }
    ];

    configDiv.innerHTML = `
      ${sections.map(section => `
        <div class="config-item">
          <div class="config-section">${section.title}</div>
          <div class="config-fields">
            ${Object.entries(section.data).map(([key, value]) => createField(section.title, key, value)).join('')}
          </div>
        </div>
      `).join('')}
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button id="saveConfigButton" class="btn btn-primary">Save Configuration</button>
        <button id="clearCacheButton" class="btn btn-secondary">Clear Cache</button>
        <div id="configMessage" style="margin-left: 15px; display: none;"></div>
      </div>
    `;

    // Add event listeners
    document.getElementById('saveConfigButton').addEventListener('click', () => this.saveConfig());
    document.getElementById('clearCacheButton').addEventListener('click', () => this.clearCache());
  }

  async saveConfig() {
    const inputs = document.querySelectorAll('.config-input');
    const updates = {};

    inputs.forEach(input => {
      const envKey = input.getAttribute('data-env');
      updates[envKey] = input.value;
    });

    try {
      const response = await fetch(`${this.apiBase}/api/config/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      const result = await response.json();

      const messageDiv = document.getElementById('configMessage');
      messageDiv.style.display = 'block';
      messageDiv.style.color = result.success ? 'var(--success)' : 'var(--error)';
      messageDiv.textContent = result.message;

      setTimeout(() => {
        messageDiv.style.display = 'none';
      }, 5000);

    } catch (error) {
      alert('Failed to save configuration: ' + error.message);
    }
  }

  async clearCache() {
    if (!confirm('Are you sure you want to clear the cache?')) {
      return;
    }

    try {
      const response = await fetch(`${this.apiBase}/api/config/clear-cache`, {
        method: 'POST'
      });

      const result = await response.json();

      const messageDiv = document.getElementById('configMessage');
      messageDiv.style.display = 'block';
      messageDiv.style.color = result.success ? 'var(--success)' : 'var(--error)';
      messageDiv.textContent = result.message;

      setTimeout(() => {
        messageDiv.style.display = 'none';
      }, 3000);

    } catch (error) {
      alert('Failed to clear cache: ' + error.message);
    }
  }

  displayHealth(health) {
    const healthDiv = document.getElementById('healthCheck');

    healthDiv.innerHTML = `
      <div class="config-item">
        <div class="config-section">System Health</div>
        <div class="config-fields">
          <div class="config-field">
            <span class="config-key">Status</span>
            <span class="config-value" style="color: var(--success);">✓ ${health.status}</span>
          </div>
          <div class="config-field">
            <span class="config-key">Uptime</span>
            <span class="config-value">${Math.floor(health.uptime / 60)} minutes</span>
          </div>
          <div class="config-field">
            <span class="config-key">Version</span>
            <span class="config-value">${health.version}</span>
          </div>
          <div class="config-field">
            <span class="config-key">WebSocket Connections</span>
            <span class="config-value">${health.wsConnections}</span>
          </div>
          <div class="config-field">
            <span class="config-key">Environment</span>
            <span class="config-value">${health.environment}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * UI Helpers
   */
  updateProgressText(text) {
    document.getElementById('progressText').textContent = text;
  }

  updateProgressAttempt(attempt, max) {
    const badge = document.getElementById('progressAttempt');
    if (badge) {
      badge.textContent = `Attempt ${attempt}/${max}`;
    }
  }

  addActivity(source, message) {
    const feed = document.getElementById('activityFeed');
    const time = new Date().toLocaleTimeString();

    const item = document.createElement('div');
    item.className = 'activity-item fade-in';
    item.innerHTML = `
      <span class="activity-time">${time}</span>
      <span class="activity-message"><strong>${source}:</strong> ${message}</span>
    `;

    feed.insertBefore(item, feed.firstChild);

    // Keep only last 50 items
    while (feed.children.length > 50) {
      feed.removeChild(feed.lastChild);
    }
  }

  displayError(message) {
    const results = document.getElementById('scrapeResults');
    results.style.display = 'block';
    results.innerHTML = this.createErrorHTML(message);
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async loadInitialData() {
    // Load proxy stats if on proxy tab
    const activeTab = document.querySelector('.tab-button.active');
    if (activeTab && activeTab.dataset.tab === 'proxy') {
      this.loadProxyStats();
    }
  }

  /**
   * Route Management
   */
  async loadRoutes() {
    try {
      const loaded = await this.routeManager.loadRoutes();
      if (loaded) {
        // Also load origins with city names for display
        await this.routeManager.loadOrigins();
        this.populateOriginDropdowns();
        this.updateRouteStats();
        console.log(`Loaded ${this.routeManager.getRouteCount()} routes`);
      } else {
        console.warn('No routes loaded - routes may not be available yet');
      }
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  }

  populateOriginDropdowns() {
    const origins = this.routeManager.getOrigins();
    const originsWithCities = this.routeManager.originsWithCities || [];
    
    // Populate single scrape origin
    const originSelect = document.getElementById('origin');
    if (originSelect) {
      originSelect.innerHTML = '<option value="">Select origin...</option>' +
        origins.map(origin => {
          const display = this.routeManager.getOriginDisplay(origin);
          return `<option value="${origin}">${display}</option>`;
        }).join('');
    }

    // Populate bulk origin
    const bulkOriginSelect = document.getElementById('bulkOrigin');
    if (bulkOriginSelect) {
      bulkOriginSelect.innerHTML = '<option value="">Select origin...</option>' +
        origins.map(origin => {
          const display = this.routeManager.getOriginDisplay(origin);
          return `<option value="${origin}">${display}</option>`;
        }).join('');
    }

    // Setup origin change handler for destination filtering
    if (originSelect) {
      originSelect.addEventListener('change', (e) => {
        this.updateDestinationDropdown(e.target.value, 'destination');
      });
    }

    if (bulkOriginSelect) {
      bulkOriginSelect.addEventListener('change', (e) => {
        // Just enable the select, destinations not needed for bulk by origin
      });
    }
  }

  async updateDestinationDropdown(origin, selectId) {
    const destSelect = document.getElementById(selectId);
    if (!destSelect || !origin) {
      if (destSelect) destSelect.disabled = true;
      return;
    }

    // Always load destinations to ensure we have city data
    await this.routeManager.loadDestinations(origin);
    
    // Get destinations with city info
    const destinationsWithCities = this.routeManager.destinationsWithCities.get(origin) || [];
    
    if (destinationsWithCities.length === 0) {
      // Fallback to IATA codes if city data not available
      const destinations = this.routeManager.getDestinations(origin);
      destSelect.innerHTML = '<option value="">Select destination...</option>' +
        destinations.map(dest => {
          const display = this.routeManager.getDestinationDisplay(origin, dest);
          return `<option value="${dest}">${display}</option>`;
        }).join('');
    } else {
      // Use city data directly for proper sorting and display
      destSelect.innerHTML = '<option value="">Select destination...</option>' +
        destinationsWithCities.map(dest => {
          return `<option value="${dest.iata}">${dest.display}</option>`;
        }).join('');
    }
    destSelect.disabled = false;
  }

  setupRouteUpdate() {
    const updateButton = document.getElementById('updateRoutesButton');
    if (updateButton) {
      updateButton.addEventListener('click', () => this.updateRoutes());
    }
  }

  async updateRoutes() {
    const button = document.getElementById('updateRoutesButton');
    const statusDiv = document.getElementById('routeUpdateStatus');
    
    button.disabled = true;
    statusDiv.style.display = 'block';
    statusDiv.style.color = 'var(--info)';
    statusDiv.textContent = 'Updating routes... This may take a few minutes.';

    try {
      const response = await fetch(`${this.apiBase}/api/routes/update`, {
        method: 'POST'
      });

      const result = await response.json();
      
      if (result.success) {
        statusDiv.style.color = 'var(--success)';
        statusDiv.textContent = 'Route update started. Monitor progress in the activity feed.';
      } else {
        statusDiv.style.color = 'var(--error)';
        statusDiv.textContent = 'Failed to start route update: ' + (result.error || 'Unknown error');
      }
    } catch (error) {
      statusDiv.style.color = 'var(--error)';
      statusDiv.textContent = 'Error: ' + error.message;
    } finally {
      setTimeout(() => {
        button.disabled = false;
      }, 2000);
    }
  }

  async updateRouteStats() {
    try {
      const response = await fetch(`${this.apiBase}/api/routes/stats`);
      const data = await response.json();
      
      if (data.success) {
        document.getElementById('routeCount').textContent = data.totalRoutes || 0;
        const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Never';
        document.getElementById('routeLastUpdated').textContent = lastUpdated;
      }
    } catch (error) {
      console.error('Failed to load route stats:', error);
    }
  }

  /**
   * Bulk Mode Toggle
   */
  setupBulkModeToggle() {
    const bulkModeSelect = document.getElementById('bulkMode');
    if (bulkModeSelect) {
      bulkModeSelect.addEventListener('change', (e) => {
        this.switchBulkMode(e.target.value);
      });
    }

    // Setup bulk buttons
    const bulkByOriginBtn = document.getElementById('bulkByOriginButton');
    if (bulkByOriginBtn) {
      bulkByOriginBtn.addEventListener('click', () => this.handleBulkByOrigin());
    }

    const bulkAllBtn = document.getElementById('bulkAllButton');
    if (bulkAllBtn) {
      bulkAllBtn.addEventListener('click', () => this.handleBulkAll());
    }
  }

  switchBulkMode(mode) {
    document.getElementById('bulkByOriginSection').style.display = mode === 'by-origin' ? 'block' : 'none';
    document.getElementById('bulkAllSection').style.display = mode === 'all' ? 'block' : 'none';
    document.getElementById('bulkCustomSection').style.display = mode === 'custom' ? 'block' : 'none';
  }

  /**
   * New Bulk Scraping Handlers
   */
  async handleBulkByOrigin() {
    const origin = document.getElementById('bulkOrigin').value;
    const date = document.getElementById('bulkDate').value;

    if (!origin || !date) {
      alert('Please select origin and date');
      return;
    }

    const button = document.getElementById('bulkByOriginButton');
    const resultsDiv = document.getElementById('bulkResults');
    
    button.disabled = true;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';

    try {
      const response = await fetch(`${this.apiBase}/api/scraper/bulk-by-origin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, date, useCache: true })
      });

      const result = await response.json();
      
      if (result.status === 'started') {
        this.addActivity('Bulk Scrape', `Started scraping all routes from ${origin}`);
      }
    } catch (error) {
      alert('Failed to start bulk scraping: ' + error.message);
      button.disabled = false;
    }
  }

  async handleBulkAll() {
    const date = document.getElementById('bulkAllDate').value;

    if (!date) {
      alert('Please select a date');
      return;
    }

    const button = document.getElementById('bulkAllButton');
    const resultsDiv = document.getElementById('bulkResults');
    
    button.disabled = true;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';

    try {
      const response = await fetch(`${this.apiBase}/api/scraper/bulk-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, useCache: true })
      });

      const result = await response.json();
      
      if (result.status === 'started') {
        this.addActivity('Bulk Scrape', `Started scraping all ${result.totalRoutes} routes`);
      }
    } catch (error) {
      alert('Failed to start bulk scraping: ' + error.message);
      button.disabled = false;
    }
  }

  handleBulkByOriginComplete(data) {
    this.bulkResults = data;
    this.displayBulkByOriginResults(data);
    document.getElementById('bulkByOriginButton').disabled = false;
  }

  handleBulkAllComplete(data) {
    this.bulkResults = data;
    this.displayBulkAllResults(data);
    document.getElementById('bulkAllButton').disabled = false;
  }

  displayBulkByOriginResults(data) {
    const resultsDiv = document.getElementById('bulkResults');
    resultsDiv.style.display = 'block';

    const destinations = Object.keys(data.destinations || {});
    
    if (destinations.length === 0) {
      resultsDiv.innerHTML = '<div class="result-card"><p>No destinations found for this origin.</p></div>';
      return;
    }

    let html = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-title">Routes from ${data.origin}</div>
          <div class="result-meta">${data.stats.cached} cached, ${data.stats.scraped} scraped, ${data.stats.failed} failed</div>
        </div>
        <div class="destinations-list">
    `;

    destinations.forEach(dest => {
      const flights = data.destinations[dest] || [];
      const flightCount = flights.length;
      html += `
        <div class="destination-item" onclick="app.showDestinationFlights('${data.origin}', '${dest}')">
          <div class="destination-route">${data.origin} → ${dest}</div>
          <div class="destination-count">${flightCount} flight${flightCount !== 1 ? 's' : ''}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    resultsDiv.innerHTML = html;
  }

  displayBulkAllResults(data) {
    const resultsDiv = document.getElementById('bulkResults');
    resultsDiv.style.display = 'block';

    const origins = Object.keys(data.origins || {});
    
    if (origins.length === 0) {
      resultsDiv.innerHTML = '<div class="result-card"><p>No results found.</p></div>';
      return;
    }

    let html = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-title">All Routes Results</div>
          <div class="result-meta">${data.stats.cached} cached, ${data.stats.scraped} scraped, ${data.stats.failed} failed</div>
        </div>
        <div class="origins-list">
    `;

    origins.forEach(origin => {
      const destinations = Object.keys(data.origins[origin].destinations || {});
      const totalFlights = destinations.reduce((sum, dest) => {
        return sum + (data.origins[origin].destinations[dest]?.length || 0);
      }, 0);

      html += `
        <div class="origin-item" onclick="app.showOriginDestinations('${origin}')">
          <div class="origin-code">${origin}</div>
          <div class="origin-stats">${destinations.length} destinations, ${totalFlights} flights</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    resultsDiv.innerHTML = html;
  }

  showDestinationFlights(origin, destination) {
    if (!this.bulkResults || !this.bulkResults.destinations) return;
    
    const flights = this.bulkResults.destinations[destination] || [];
    const resultsDiv = document.getElementById('bulkResults');
    
    let html = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-title">${origin} → ${destination}</div>
          <button onclick="app.displayBulkByOriginResults(app.bulkResults)" class="btn btn-secondary" style="margin-left: auto;">← Back</button>
        </div>
    `;

    if (flights.length === 0) {
      html += '<p>No flights found for this route.</p>';
    } else {
      html += '<div class="flights-grid">';
      flights.forEach(flight => {
        html += `
          <div class="flight-card">
            <div class="flight-header">
              <div class="flight-route">${flight.origin} → ${flight.destination}</div>
              <div class="flight-price">${flight.price}</div>
            </div>
            <div class="flight-details">
              <div class="flight-detail">
                <div class="flight-detail-label">Flight</div>
                <div class="flight-detail-value">${flight.flightNumber}</div>
              </div>
              <div class="flight-detail">
                <div class="flight-detail-label">Departs</div>
                <div class="flight-detail-value">${this.formatDate(flight.departureDate)}</div>
              </div>
              <div class="flight-detail">
                <div class="flight-detail-label">Arrives</div>
                <div class="flight-detail-value">${this.formatDate(flight.arrivalDate)}</div>
              </div>
              <div class="flight-detail">
                <div class="flight-detail-label">Duration</div>
                <div class="flight-detail-value">${flight.duration}</div>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    html += '</div>';
    resultsDiv.innerHTML = html;
  }

  showOriginDestinations(origin) {
    if (!this.bulkResults || !this.bulkResults.origins) return;
    
    const originData = this.bulkResults.origins[origin];
    if (!originData) return;

    const destinations = Object.keys(originData.destinations || {});
    const resultsDiv = document.getElementById('bulkResults');
    
    let html = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-title">Routes from ${origin}</div>
          <button onclick="app.displayBulkAllResults(app.bulkResults)" class="btn btn-secondary" style="margin-left: auto;">← Back</button>
        </div>
        <div class="destinations-list">
    `;

    destinations.forEach(dest => {
      const flights = originData.destinations[dest] || [];
      const flightCount = flights.length;
      html += `
        <div class="destination-item" onclick="app.showOriginDestinationFlights('${origin}', '${dest}')">
          <div class="destination-route">${origin} → ${dest}</div>
          <div class="destination-count">${flightCount} flight${flightCount !== 1 ? 's' : ''}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    resultsDiv.innerHTML = html;
  }

  showOriginDestinationFlights(origin, destination) {
    if (!this.bulkResults || !this.bulkResults.origins) return;
    
    const flights = this.bulkResults.origins[origin]?.destinations[destination] || [];
    const resultsDiv = document.getElementById('bulkResults');
    
    let html = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-title">${origin} → ${destination}</div>
          <button onclick="app.showOriginDestinations('${origin}')" class="btn btn-secondary" style="margin-left: auto;">← Back</button>
        </div>
    `;

    if (flights.length === 0) {
      html += '<p>No flights found for this route.</p>';
    } else {
      html += '<div class="flights-grid">';
      flights.forEach(flight => {
        html += `
          <div class="flight-card">
            <div class="flight-header">
              <div class="flight-route">${flight.origin} → ${flight.destination}</div>
              <div class="flight-price">${flight.price}</div>
            </div>
            <div class="flight-details">
              <div class="flight-detail">
                <div class="flight-detail-label">Flight</div>
                <div class="flight-detail-value">${flight.flightNumber}</div>
              </div>
              <div class="flight-detail">
                <div class="flight-detail-label">Departs</div>
                <div class="flight-detail-value">${this.formatDate(flight.departureDate)}</div>
              </div>
              <div class="flight-detail">
                <div class="flight-detail-label">Arrives</div>
                <div class="flight-detail-value">${this.formatDate(flight.arrivalDate)}</div>
              </div>
              <div class="flight-detail">
                <div class="flight-detail-label">Duration</div>
                <div class="flight-detail-value">${flight.duration}</div>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    html += '</div>';
    resultsDiv.innerHTML = html;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new FrontierScraperApp();
});

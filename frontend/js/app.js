/**
 * Frontier Flight Scraper - Frontend Application
 * Handles UI interactions, WebSocket communication, and API calls
 */

class FrontierScraperApp {
  constructor() {
    this.ws = null;
    this.apiBase = window.location.origin;
    this.wsConnected = false;

    this.init();
  }

  init() {
    this.setupWebSocket();
    this.setupTabs();
    this.setupForms();
    this.setupEventListeners();
    this.loadInitialData();
    this.setDefaultDate();
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
  }

  setDefaultDate() {
    const dateInput = document.getElementById('date');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = tomorrow.toISOString().split('T')[0];
    dateInput.min = new Date().toISOString().split('T')[0];
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

    const html = proxies.map(proxy => `
      <div class="proxy-item ${proxy.canUseNow ? 'available' : 'rate-limited'}">
        <div class="proxy-info">
          <div class="proxy-id">${proxy.id}</div>
          <div class="proxy-meta">
            <span>Host: ${proxy.host}</span>
            <span>Requests: ${proxy.totalRequests}</span>
            <span>Success Rate: ${proxy.successRate}%</span>
            <span>Recent Uses: ${proxy.recentUses}</span>
          </div>
        </div>
        <div class="proxy-status ${proxy.canUseNow ? 'available' : 'rate-limited'}">
          ${proxy.canUseNow ? 'Available' : 'Rate Limited'}
        </div>
      </div>
    `).join('');

    detailsDiv.innerHTML = html || '<p style="color: var(--text-secondary);">No proxy data available</p>';
  }

  displayProxyError(error) {
    document.getElementById('proxyStats').innerHTML = `
      <p style="color: var(--error); padding: 20px; text-align: center;">
        ${error}
      </p>
    `;
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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new FrontierScraperApp();
});

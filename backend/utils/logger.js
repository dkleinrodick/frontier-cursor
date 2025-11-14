/**
 * Logger utility
 * Simple but effective logging for production
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const colors = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[90m', // Gray
  reset: '\x1b[0m'
};

function getLogFileName() {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `scraper-${date}.log`);
}

function formatMessage(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');

  return `[${timestamp}] [${level.toUpperCase()}] ${message} ${formattedArgs}`.trim();
}

function log(level, message, ...args) {
  if (levels[level] <= levels[LOG_LEVEL]) {
    const formatted = formatMessage(level, message, ...args);

    // Console output with colors
    const color = colors[level] || colors.reset;
    console.log(`${color}${formatted}${colors.reset}`);

    // File output
    try {
      fs.appendFileSync(getLogFileName(), formatted + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
}

module.exports = {
  error: (message, ...args) => log('error', message, ...args),
  warn: (message, ...args) => log('warn', message, ...args),
  info: (message, ...args) => log('info', message, ...args),
  debug: (message, ...args) => log('debug', message, ...args)
};

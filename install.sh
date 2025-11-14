#!/bin/bash
# Frontier Flight Scraper - Installation Script for Linux/Mac
# Run: chmod +x install.sh && ./install.sh

set -e

echo ""
echo "================================================================================"
echo " FRONTIER FLIGHT SCRAPER - Installation"
echo "================================================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo ""
    echo "Please download and install Node.js 18+ from:"
    echo "https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[1/5] Checking Node.js..."
echo "     [OK] Node.js $(node --version) is installed"
echo ""

# Install dependencies
echo "[2/5] Installing dependencies..."
npm install
echo "     [OK] Dependencies installed"
echo ""

# Install Playwright browsers
echo "[3/5] Installing Playwright browsers (this may take a few minutes)..."
npm run install-browsers
echo "     [OK] Playwright browsers installed"
echo ""

# Create .env file
echo "[4/5] Setting up configuration..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "     [OK] Created .env configuration file"
else
    echo "     [OK] .env file already exists"
fi
echo ""

# Create directories
echo "[5/5] Creating directories..."
mkdir -p logs cache
echo "     [OK] Directories created"
echo ""

echo "================================================================================"
echo " INSTALLATION COMPLETE!"
echo "================================================================================"
echo ""
echo "Next steps:"
echo "  1. Edit .env file with your Decodo credentials (optional but recommended)"
echo "  2. Run ./start.sh to start the server"
echo "  3. Open http://localhost:3000 in your browser"
echo ""
echo "For help, see README.md"
echo ""

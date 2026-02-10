#!/bin/bash

# EC029 Gate - Quick Setup Script

set -e

echo "🚪 Fox Lair - Setup Script"
echo "================================"
echo ""

# Check if running on Raspberry Pi
if [ -f /proc/device-tree/model ]; then
  MODEL=$(cat /proc/device-tree/model)
  echo "📟 Detected: $MODEL"
  echo ""
fi

# Check if .env exists
if [ ! -f .env ]; then
  echo "⚠️  .env file not found. Creating from template..."
  cp .env.example .env
  echo "✅ Created .env file. Please edit it with your credentials:"
  echo "   nano .env"
  echo ""
  read -p "Press Enter after editing .env to continue..."
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
  echo "⚠️  pnpm not found. Installing..."
  npm install --global corepack@latest
  corepack enable pnpm
  echo "✅ pnpm installed"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build frontend
echo "🔨 Building frontend..."
pnpm build

# Check GPIO permissions (on Raspberry Pi)
if [ -d /sys/class/gpio ]; then
  if groups $USER | grep -q '\bgpio\b'; then
    echo "✅ User is in gpio group"
  else
    echo "⚠️  User not in gpio group. Adding..."
    sudo usermod -a -G gpio $USER
    echo "✅ Added to gpio group. Please log out and log back in for changes to take effect."
  fi
fi

echo ""
echo "================================"
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your Discord credentials"
echo "2. Run 'pnpm dev' for development"
echo "3. Run 'pnpm start' for production"
echo ""
echo "For systemd service setup, see DEPLOYMENT.md"
echo "================================"

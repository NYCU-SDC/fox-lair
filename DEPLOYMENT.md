# Deployment Guide

## Raspberry Pi 5 Setup

### 1. System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install git
sudo apt install -y git
```

### 2. Clone and Setup Project

```bash
# Clone repository
cd ~
git clone <your-repo-url> door-manager
cd door-manager

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
nano .env  # Edit with your configuration
```

### 3. Build Frontend

```bash
pnpm build
```

### 4. Setup as System Service

Create service file:
```bash
sudo nano /etc/systemd/system/door-manager.service
```

Add content:
```ini
[Unit]
Description=Fox Lair Control System
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/fox-lair
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable door-manager
sudo systemctl start door-manager
sudo systemctl status door-manager
```

### 5. GPIO Permissions

Add user to gpio group:
```bash
sudo usermod -a -G gpio pi
```

Or use sudo (less secure):
```bash
# Edit service file to run as root (not recommended)
sudo nano /etc/systemd/system/door-manager.service
# Change User=pi to User=root
```

## Hardware Connection

### Relay Wiring

```
Raspberry Pi Pin Layout (BCM numbering):
 - GPIO 17 (Pin 11) → Relay IN
 - GND (Pin 6) → Relay GND
 - 5V (Pin 2) → Relay VCC

Relay to Door Lock:
 - Relay COM → Door Lock Power (+12V/+24V)
 - Relay NO (Normally Open) → Power Supply (+)
 - Power Supply (-) → Door Lock Power (-)
```

### Testing GPIO

```bash
# Install gpio tools
sudo apt install -y gpiod

# Test GPIO 17
gpioset gpiochip0 17=1  # Turn on
sleep 2
gpioset gpiochip0 17=0  # Turn off
```

## Discord Bot Setup

### 1. Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it "Fox Lair" and create

### 2. Setup OAuth2

1. Go to OAuth2 → General
2. Add redirect URL: `https://your-domain.com/api/auth/discord/callback`
3. Copy Client ID and Client Secret

### 3. Setup Bot

1. Go to Bot section
2. Click "Add Bot"
3. Enable "Server Members Intent"
4. Copy Bot Token

### 4. Invite Bot to Server

Generate OAuth2 URL:
1. Go to OAuth2 → URL Generator
2. Scopes: `bot`, `applications.commands`
3. Bot Permissions: `Send Messages`, `Use Slash Commands`
4. Open generated URL in browser
5. Select server and authorize

## Optional: Setup Caddy Reverse Proxy

If you want to use Caddy as a reverse proxy (for automatic HTTPS or multiple services):

### Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Configure Caddy

```bash
# Edit domain in Caddyfile
nano Caddyfile

# Copy to Caddy config directory
sudo cp Caddyfile /etc/caddy/Caddyfile

# Test configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
sudo systemctl restart caddy
sudo systemctl enable caddy
```

**Features:**
- ✨ Automatic HTTPS with Let's Encrypt (no manual cert setup!)
- 🔄 Auto-renewal of certificates
- 🗜️ Built-in compression
- 🛡️ Security headers
- 📝 Easy configuration

**Note:** The application serves the frontend directly in production mode, so Caddy is optional.

## Monitoring

### View Logs

```bash
# Service logs
sudo journalctl -u door-manager -f

# System logs
tail -f /var/log/syslog
```

### Check Status

```bash
# Service status
sudo systemctl status door-manager

# Process info
ps aux | grep node
```

### Database Backup

```bash
# Create backup script
nano ~/backup-door-db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp ~/door-manager/data/door.db ~/backups/door_$DATE.db
# Keep only last 30 backups
ls -t ~/backups/door_*.db | tail -n +31 | xargs rm -f
```

```bash
chmod +x ~/backup-door-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/pi/backup-door-db.sh
```

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u door-manager -n 50

# Check permissions
ls -la ~/door-manager

# Test manually
cd ~/door-manager
node server/index.js
```

### GPIO not working

```bash
# Check permissions
groups pi  # Should include 'gpio'

# Test GPIO directly
gpioinfo | grep 17

# Check if pin is in use
lsof | grep gpio
```

### Discord bot offline

```bash
# Check token
grep DISCORD_BOT_TOKEN ~/door-manager/.env

# Check bot status
# View logs for Discord-related errors
sudo journalctl -u door-manager | grep -i discord
```

## Security Checklist

- [ ] Strong `SESSION_SECRET` in production
- [ ] Strong `ADMIN_PASSWORD`
- [ ] HTTPS enabled (SSL certificate)
- [ ] Firewall configured (ufw)
- [ ] SSH key authentication only
- [ ] Regular system updates
- [ ] Database backups enabled
- [ ] Limited GPIO permissions
- [ ] Discord bot token secure
- [ ] Monitoring enabled

## Maintenance

### Update Application

```bash
cd ~/door-manager
git pull
pnpm install
pnpm build
sudo systemctl restart door-manager
```

### Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot  # If kernel updated
```

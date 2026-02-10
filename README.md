<div align=center>

# Fox Lair

EC029 IoT Control System

</div>

## Features / 功能

- 🔐 **Dual Authentication / 雙重認證**: Login with Discord OAuth or admin password
- 🚪 **Door Control / 門禁控制**: Unlock door with automatic 8-second lock timer
- 👥 **Role-Based Access / 角色權限**: Discord role-based access control
- 📋 **Access Logging / 存取記錄**: Complete audit trail of door access
- 💬 **Discord Bot / Discord 機器人**: Interactive buttons for door access via Discord
- 🎨 **Beautiful UI / 美觀介面**: Catppuccin Mocha color palette
- 🔌 **GPIO Control / GPIO 控制**: Direct Raspberry Pi GPIO control for relay

## Architecture / 架構

### Hardware / 硬體
- Raspberry Pi 5
- Door Lock (power-controlled) / 電控門鎖
- Relay Module / 繼電器模組
- Power Supply / 電源供應器

### Software Stack / 軟體架構
- **Backend**: Node.js, Express, Discord.js
- **Frontend**: React, Vite
- **Database**: SQLite
- **GPIO**: onoff library for Raspberry Pi

## Quick Start / 快速開始

### Prerequisites / 前置需求
- Node.js 18+ and pnpm
- Discord Bot Token and OAuth credentials
- Raspberry Pi 5 (for GPIO control)

### Installation / 安裝

1. **Install dependencies / 安裝相依套件**
   ```bash
   pnpm install
   ```

2. **Configure environment / 設定環境變數**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start development server / 啟動開發伺服器**
   ```bash
   pnpm dev
   ```

Visit / 訪問: http://localhost:5173

## Environment Variables / 環境變數

See [.env.example](./.env.example) for all configuration options.

Key variables / 主要變數:
- `DISCORD_CLIENT_ID` - Discord OAuth Client ID
- `DISCORD_CLIENT_SECRET` - Discord OAuth Secret
- `DISCORD_BOT_TOKEN` - Discord Bot Token
- `ADMIN_PASSWORD` - Admin password for web login
- `RELAY_GPIO_PIN` - GPIO pin number (default: 17)

## Usage / 使用方式

### Web Interface / 網頁介面

1. **Login / 登入** with Discord or admin password
2. **Unlock Door / 開門** - Click button, auto-locks after 8 seconds
3. **Admin Panel / 管理面板** (Admin only):
   - Add Discord roles for access control
   - View access logs

### Discord Bot / Discord 機器人

1. Invite bot to your server
2. Use `/setup-door` command to create unlock button
3. Click button to unlock door (role check required)

## Deployment / 部署

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed Raspberry Pi deployment instructions.

### Quick Production Start / 快速生產環境啟動

```bash
# Build frontend
pnpm build

# Start server (serves both API and static files)
NODE_ENV=production pnpm start
```

The server will serve the frontend at http://localhost:3000 in production mode.

## Project Structure / 專案結構

```
door-mananger/
├── server/              # Backend server
│   ├── db/             # Database functions
│   ├── discord/        # Discord bot
│   ├── gpio/           # GPIO controller
│   └── routes/         # API routes
├── client/             # Frontend React app
│   └── src/
│       ├── components/ # React components
│       └── pages/      # Page components
├── data/               # SQLite database (auto-created)
└── .env.example        # Environment template
```

## Development / 開發

```bash
# Install dependencies
pnpm install

# Run dev server (both frontend & backend)
pnpm dev

# Format code
pnpm format

# Build for production
pnpm build
```

## Security / 安全性

- Always use HTTPS in production / 生產環境務必使用 HTTPS
- Keep credentials secure / 保管好憑證
- Review access logs regularly / 定期檢查存取記錄
- Use strong passwords / 使用強密碼

## 授權條款 / License

本專案採用[你他媽的想幹嘛就幹嘛公眾授權條款](https://www.wtfpl.net/)授權，詳情請參閱 [LICENSE](./LICENSE) 檔案。

This project is licensed under the [WTFPL License](./LICENSE).

![](https://www.wtfpl.net/wp-content/uploads/2012/12/wtfpl-badge-1.png)

## Optional Reverse Proxy

The app serves static files directly, but you can use Caddy for automatic HTTPS:

```bash
# Install Caddy and use included Caddyfile
sudo apt install caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Caddy automatically handles SSL certificates with Let's Encrypt!

## Credits

- **Color Palette**: [Catppuccin Mocha](https://github.com/catppuccin/catppuccin)
- **Discord**: Integration powered by Discord.js

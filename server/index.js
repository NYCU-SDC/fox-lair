import express from 'express';
import session from 'express-session';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRouter from './routes/auth.js';
import doorRouter from './routes/door.js';
import adminRouter from './routes/admin.js';
import { initDatabase } from './database.js';
import { initBot } from './bot.js';
import { initGPIO } from './controller.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

await initDatabase();
await initBot();
initGPIO();

app.use('/api/auth', authRouter);
app.use('/api/door', doorRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

  const clientDistPath = join(__dirname, '../client/dist');
  app.use(express.static(clientDistPath));
  // Serve index.html for all non-API routes (SPA support)
  app.get('*', (req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

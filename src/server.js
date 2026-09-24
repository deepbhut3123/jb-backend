import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, getDatabaseStatus } from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import productRoutes from './routes/productRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import leadOptionRoutes from './routes/leadOptionRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import pricingSettingsRoutes from './routes/pricingSettingsRoutes.js';
import { startWhatsAppService, stopWhatsAppService } from './services/whatsapp.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, '');
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
const frontendVercelProject = process.env.FRONTEND_VERCEL_PROJECT || 'jb-frontend';
const frontendVercelScope = process.env.FRONTEND_VERCEL_SCOPE || 'deep-bhuts-projects';

function isFrontendVercelOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:'
      && url.hostname.endsWith('.vercel.app')
      && (url.hostname === `${frontendVercelProject}.vercel.app`
        || (url.hostname.startsWith(`${frontendVercelProject}-`)
          && url.hostname.endsWith(`-${frontendVercelScope}.vercel.app`)));
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = origin ? normalizeOrigin(origin) : '';
    if (!origin || allowedOrigins.includes(normalizedOrigin) || isFrontendVercelOrigin(normalizedOrigin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
}));
app.use(express.json());
app.use('/public', express.static(path.join(currentDirectory, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/products', productRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/lead-options', leadOptionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/pricing-settings', pricingSettingsRoutes);

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'jb-backend',
    message: 'Backend is running.',
    database: getDatabaseStatus(),
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.message === 'SMTP configuration is missing.' ? 503 : 500).json({
    message: error.message === 'SMTP configuration is missing.'
      ? 'Email service is not configured yet.'
      : 'Something went wrong on the server.',
  });
});

connectDatabase()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
    });
    startWhatsAppService().catch((error) => console.error('WhatsApp service startup failed:', error.message));
    let stopping = false;
    async function shutdown() {
      if (stopping) return;
      stopping = true;
      const timeout = setTimeout(() => process.exit(1), 15000);
      timeout.unref();
      server.close();
      try { await stopWhatsAppService(); process.exit(0); }
      catch { process.exit(1); }
    }
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });

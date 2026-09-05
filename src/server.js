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

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
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

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
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
    app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });

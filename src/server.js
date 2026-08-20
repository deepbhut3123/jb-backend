import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { connectDatabase, getDatabaseStatus } from './config/database.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    message: 'Backend is running.',
    database: getDatabaseStatus(),
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

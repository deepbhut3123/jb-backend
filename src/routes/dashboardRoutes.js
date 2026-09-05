import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/summary', requireAuth, async (request, response) => {
  response.json({
    user: { name: request.user.name, email: request.user.email, role: request.user.role },
    metrics: [
      { label: 'Active Customers', value: '—' },
      { label: 'Open Enquiries', value: '—' },
      { label: 'Pending Follow-ups', value: '—' },
    ],
  });
});

export default router;

import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

router.get('/summary', requireAuth, requirePermission('dashboard.view'), async (request, response) => {
  response.json({
    user: { name: request.user.name, email: request.user.email, role: request.user.role },
    metrics: [
      { label: 'Active Companies', value: '—' },
      { label: 'Open Enquiries', value: '—' },
      { label: 'Pending Follow-ups', value: '—' },
    ],
  });
});

export default router;

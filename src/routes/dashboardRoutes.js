import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { isAdministrator } from '../config/permissions.js';
import User from '../models/User.js';
import Quotation from '../models/Quotation.js';

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

router.get('/targets', requireAuth, requirePermission('dashboard.view'), async (request, response, next) => {
  try {
    const admin = isAdministrator(request.user);
    const [users, stageTotals] = await Promise.all([
      admin ? User.find({ role: 2 }).select('name salesTarget').sort({ name: 1 }).lean() : Promise.resolve([]),
      Quotation.aggregate([
        ...(!admin ? [{ $match: { createdBy: request.user._id } }] : []),
        { $addFields: { quoteRoot: { $ifNull: ['$revisionRoot', { $ifNull: ['$revisedFrom', '$_id'] }] } } },
        { $sort: { revisionNumber: -1, updatedAt: -1 } },
        { $group: { _id: '$quoteRoot', quotation: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$quotation' } },
        { $group: { _id: { userId: '$createdBy', status: '$status' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);
    const totals = new Map();
    for (const row of stageTotals) {
      const key = String(row._id.userId);
      if (!totals.has(key)) totals.set(key, { Draft: { count: 0, amount: 0 }, Sent: { count: 0, amount: 0 }, Accepted: { count: 0, amount: 0 }, Rejected: { count: 0, amount: 0 } });
      if (totals.get(key)[row._id.status]) totals.get(key)[row._id.status] = { count: row.count, amount: row.amount };
    }
    const describe = (user) => {
      const stages = totals.get(String(user._id)) || { Draft: { count: 0, amount: 0 }, Sent: { count: 0, amount: 0 }, Accepted: { count: 0, amount: 0 }, Rejected: { count: 0, amount: 0 } };
      const target = Number(user.salesTarget || 0);
      const achieved = Number(stages.Accepted.amount || 0);
      return { userId: String(user._id), name: user.name, target, achieved, remaining: Math.max(0, target - achieved), achievementPercent: target > 0 ? Math.round(achieved / target * 100) : 0, stages };
    };
    return response.json({ mine: describe(request.user), team: admin ? users.map(describe) : undefined });
  } catch (error) { return next(error); }
});

export default router;

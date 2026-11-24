import { Router } from 'express';
import BankSettings from '../models/BankSettings.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
const fields = { accountName: 100, bankName: 100, accountNumber: 50, ifsc: 20, branch: 100, upiId: 100 };

router.use(requireAuth);
router.get('/', requireAnyPermission('settings.view', 'quotations.view'), async (_request, response, next) => {
  try {
    const settings = await BankSettings.findOneAndUpdate(
      { key: 'company-bank' },
      { $setOnInsert: { key: 'company-bank' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return response.json({ settings });
  } catch (error) { return next(error); }
});

router.put('/', requirePermission('settings.edit'), async (request, response, next) => {
  try {
    const values = Object.fromEntries(Object.entries(fields).map(([field]) => [field, String(request.body?.[field] ?? '').trim()]));
    values.ifsc = values.ifsc.toUpperCase();
    for (const [field, limit] of Object.entries(fields)) {
      if (!values[field] || values[field].length > limit) return response.status(400).json({ message: `Enter a valid ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.` });
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(values.ifsc)) return response.status(400).json({ message: 'Enter a valid 11-character IFSC code.' });
    if (!/^[^\s@]+@[^\s@]+$/.test(values.upiId)) return response.status(400).json({ message: 'Enter a valid UPI ID.' });
    const settings = await BankSettings.findOneAndUpdate(
      { key: 'company-bank' },
      { $set: { ...values, updatedBy: request.user._id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return response.json({ settings });
  } catch (error) { return next(error); }
});

export default router;

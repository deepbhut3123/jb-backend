import { Router } from 'express';
import ProductPricingSettings from '../models/ProductPricingSettings.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const requireAdmin = (request, response, next) => {
  if (![1, 3].includes(request.user.role)) return response.status(403).json({ message: 'Only administrators can manage pricing settings.' });
  return next();
};
const normalize = (body = {}) => ({
  dollarRate: Number(body.dollarRate),
  multiplier: Number(body.multiplier),
});
const validate = (value) => {
  if (![value.dollarRate, value.multiplier].every((number) => Number.isFinite(number) && number >= 0)) return 'Pricing values must be valid non-negative numbers.';
  if (value.dollarRate === 0 || value.multiplier === 0) return 'Dollar rate and multiplier must be greater than zero.';
  return null;
};

router.use(requireAuth, requireAdmin);
router.get('/', async (_request, response, next) => {
  try {
    const settings = await ProductPricingSettings.findOneAndUpdate({ key: 'product-pricing' }, { $setOnInsert: { key: 'product-pricing' } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    return response.json({ settings });
  } catch (error) { return next(error); }
});
router.put('/', async (request, response, next) => {
  try {
    const values = normalize(request.body);
    const validationError = validate(values);
    if (validationError) return response.status(400).json({ message: validationError });
    const settings = await ProductPricingSettings.findOneAndUpdate({ key: 'product-pricing' }, { ...values, updatedBy: request.user._id }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }).lean();
    return response.json({ settings });
  } catch (error) { return next(error); }
});

export default router;

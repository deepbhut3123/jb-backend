import { Router } from 'express';
import LeadOption from '../models/LeadOption.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const types = ['customerType', 'segment', 'leadSource'];
const isAdmin = (user) => [1, 3].includes(user.role);

function requireAdmin(request, response, next) {
  if (!isAdmin(request.user)) return response.status(403).json({ message: 'Only administrators can manage lead dropdown values.' });
  return next();
}

router.use(requireAuth);

router.get('/', async (_request, response, next) => {
  try {
    const options = await LeadOption.find().sort({ type: 1, value: 1 }).lean();
    return response.json({ options });
  } catch (error) { return next(error); }
});

router.post('/', requireAdmin, async (request, response, next) => {
  try {
    const type = String(request.body?.type || '').trim();
    const value = String(request.body?.value || '').trim();
    if (!types.includes(type) || !value) return response.status(400).json({ message: 'A valid dropdown type and value are required.' });
    const option = await LeadOption.create({ type, value });
    return response.status(201).json({ option });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: 'This dropdown value already exists.' });
    return next(error);
  }
});

router.put('/:id', requireAdmin, async (request, response, next) => {
  try {
    const value = String(request.body?.value || '').trim();
    if (!value) return response.status(400).json({ message: 'Dropdown value is required.' });
    const option = await LeadOption.findByIdAndUpdate(request.params.id, { value }, { new: true, runValidators: true });
    if (!option) return response.status(404).json({ message: 'Dropdown value not found.' });
    return response.json({ option });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: 'This dropdown value already exists.' });
    return next(error);
  }
});

router.delete('/:id', requireAdmin, async (request, response, next) => {
  try {
    const option = await LeadOption.findByIdAndDelete(request.params.id);
    if (!option) return response.status(404).json({ message: 'Dropdown value not found.' });
    return response.json({ message: 'Dropdown value deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;

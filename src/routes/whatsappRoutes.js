import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import WhatsAppSettings from '../models/WhatsAppSettings.js';
import WhatsAppEvent from '../models/WhatsAppEvent.js';
import User from '../models/User.js';
import LeadOption from '../models/LeadOption.js';
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppState, retryWhatsAppEvent } from '../services/whatsapp.js';
import { matchesMessage, matchModes, statuses, priorities } from '../services/whatsappRules.js';

const router = Router();
export function requireWhatsAppAdmin(request, response, next) {
  if (![1, 3].includes(request.user.role)) return response.status(403).json({ message: 'Only administrators can manage WhatsApp.' });
  return next();
}
router.use(requireAuth, requireWhatsAppAdmin);
router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });

router.get('/settings', async (_request, response, next) => {
  try {
    const settings = await WhatsAppSettings.findById('company').lean() || new WhatsAppSettings().toObject();
    return response.json({ settings });
  } catch (error) { return next(error); }
});

router.put('/settings', async (request, response, next) => {
  try {
    const body = request.body || {};
    const settings = {
      enabled: body.enabled === true,
      assignedTo: body.assignedTo || null,
      status: body.status,
      source: typeof body.source === 'string' ? body.source.trim() : '',
      customerType: typeof body.customerType === 'string' ? body.customerType.trim() : '',
      segment: typeof body.segment === 'string' ? body.segment.trim() : '',
      priority: body.priority,
      matchMode: body.matchMode,
      matchText: typeof body.matchText === 'string' ? body.matchText.trim() : '',
      caseSensitive: body.caseSensitive === true,
      updatedBy: request.user._id,
    };
    if (!statuses.includes(settings.status) || !priorities.includes(settings.priority) || !matchModes.includes(settings.matchMode)) return response.status(400).json({ message: 'Select a valid status, priority, and matching mode.' });
    if (!settings.source || settings.source.length > 50 || settings.customerType.length > 60 || settings.segment.length > 60 || settings.matchText.length > 2000) return response.status(400).json({ message: 'Source is required. Check the field length limits.' });
    if (settings.assignedTo && (!mongoose.isValidObjectId(settings.assignedTo) || !await User.exists({ _id: settings.assignedTo }))) return response.status(400).json({ message: 'Select an existing default assignee.' });
    if (settings.enabled && (!settings.assignedTo || !settings.matchText)) return response.status(400).json({ message: 'Choose an assignee and enter matching text before enabling automation.' });
    const current = await WhatsAppSettings.findById('company').lean();
    const options = await LeadOption.find().lean();
    for (const [field, type] of [['source', 'leadSource'], ['customerType', 'customerType'], ['segment', 'segment']]) {
      const value = settings[field];
      if (value && !(field === 'source' && value === 'WhatsApp') && value !== current?.[field] && !options.some((option) => option.type === type && option.value === value)) return response.status(400).json({ message: `Choose a configured ${type} value. Add new values through the dropdown first.` });
    }
    if (settings.enabled && !current?.enabled) settings.enabledAt = new Date();
    const saved = await WhatsAppSettings.findByIdAndUpdate('company', { $set: settings }, { upsert: true, new: true, runValidators: true });
    return response.json({ settings: saved });
  } catch (error) { return next(error); }
});

router.post('/preview', (request, response) => {
  const { message, matchText, matchMode, caseSensitive } = request.body || {};
  if (typeof message !== 'string' || message.length > 10000 || typeof matchText !== 'string' || matchText.length > 2000 || !matchModes.includes(matchMode)) return response.status(400).json({ message: 'Enter a valid sample message and matching rule.' });
  return response.json({ matches: matchesMessage(message, { matchText, matchMode, caseSensitive: caseSensitive === true }) });
});

router.get('/status', (_request, response) => response.json({ connection: getWhatsAppState() }));
router.post('/connect', async (_request, response, next) => {
  try { return response.json({ connection: await connectWhatsApp() }); } catch (error) { return next(error); }
});
router.post('/disconnect', async (_request, response, next) => {
  try { return response.json({ connection: await disconnectWhatsApp() }); } catch (error) { return next(error); }
});
router.get('/activity', async (_request, response, next) => {
  try {
    const events = await WhatsAppEvent.find().sort({ createdAt: -1 }).limit(30).select('name phone body receivedAt outcome error lead attempts').lean();
    return response.json({ events });
  } catch (error) { return next(error); }
});
router.post('/activity/:id/retry', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) return response.status(400).json({ message: 'Invalid activity ID.' });
    if (!await WhatsAppSettings.exists({ _id: 'company', enabled: true })) return response.status(409).json({ message: 'Save and enable automation before retrying.' });
    if (!await WhatsAppEvent.exists({ _id: request.params.id })) return response.status(404).json({ message: 'Activity not found.' });
    await retryWhatsAppEvent(request.params.id);
    return response.json({ message: 'Retry completed. Check the activity result.' });
  } catch (error) { return next(error); }
});

export default router;

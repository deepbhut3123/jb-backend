import { Router } from 'express';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const isAdmin = (user) => [1, 3].includes(user.role);

function requireAdmin(request, response, next) {
  if (!isAdmin(request.user)) return response.status(403).json({ message: 'Only administrators can manage leads.' });
  return next();
}

function serializeLead(lead) {
  return {
    _id: lead._id,
    name: lead.name,
    company: lead.company || 'N/A',
    address1: lead.address1 || '', address2: lead.address2 || '', area: lead.area || '', city: lead.city || '', state: lead.state || '', website: lead.website || '',
    customerType: lead.customerType || '', segment: lead.segment || '', companyPersons: lead.companyPersons || [], leadSource: lead.leadSource || lead.source || '', stage: lead.stage || lead.status || 'New',
    email: lead.email || '',
    phone: lead.phone || '',
    source: lead.leadSource || lead.source || 'Website',
    status: lead.stage || lead.status || 'New',
    priority: lead.priority || 'Medium',
    nextFollowUp: lead.nextFollowUp || null,
    followUps: lead.followUps || [],
    notes: lead.notes || '',
    assignedTo: lead.assignedTo?._id || lead.assignedTo,
    assignedName: lead.assignedTo?.name || 'Unassigned',
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

router.get('/', requireAuth, async (request, response, next) => {
  try {
    const { status, search, dateFrom, dateTo } = request.query;
    const page = Math.max(Number.parseInt(request.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 20, 1), 100);
    const filter = isAdmin(request.user) ? {} : { assignedTo: request.user._id };
    const validStatuses = ['New', 'Quotation', 'Followup', 'Performa-Invoice', 'Done', 'Lost'];

    if (status && status !== 'All' && validStatuses.includes(status)) filter.status = status;
    if (search?.trim()) {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { company: { $regex: escapedSearch, $options: 'i' } }, { city: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } }, { contactNumber: { $regex: escapedSearch, $options: 'i' } },
      ];
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) filter.createdAt.$lt = new Date(`${dateTo}T00:00:00.000Z`);
      if (Number.isNaN(filter.createdAt.$gte?.getTime()) || Number.isNaN(filter.createdAt.$lt?.getTime())) delete filter.createdAt;
    }

    const [total, leads] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter).populate('assignedTo', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return response.json({
      leads: leads.map(serializeLead),
      scope: isAdmin(request.user) ? 'all' : 'assigned',
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
  } catch (error) { return next(error); }
});

router.post('/', requireAuth, async (request, response, next) => {
  try {
    const { name, company, address1, address2, area, city, state, email, website, phone, contactNumber, customerType, segment, companyPersons, leadSource, source, stage, status, priority, nextFollowUp, notes, assignedTo } = request.body || {};
    const selectedAssignee = isAdmin(request.user) ? assignedTo : request.user._id;
    if (!selectedAssignee) return response.status(400).json({ message: 'An assigned user is required.' });
    const assignee = await User.findById(selectedAssignee).select('_id name').lean();
    if (!assignee) return response.status(404).json({ message: 'Assigned user was not found.' });
    const followUps = notes?.trim() || nextFollowUp ? [{ date: new Date(), description: notes?.trim() || 'Lead created', nextDate: nextFollowUp || undefined }] : [];
    const lead = await Lead.create({ name: name?.trim() || '', company: company?.trim(), address1, address2, area, city, state, email, website, phone: contactNumber || phone, customerType, segment, companyPersons, leadSource: leadSource || source || '', source: leadSource || source || '', stage: stage || status || 'New', status: stage || status || 'New', priority: priority || 'Medium', nextFollowUp: nextFollowUp || undefined, notes: notes?.trim(), followUps, assignedTo: assignee._id, createdBy: request.user._id });
    const populated = await lead.populate('assignedTo', 'name');
    return response.status(201).json({ lead: serializeLead(populated.toObject()) });
  } catch (error) { return next(error); }
});

router.put('/:id', requireAuth, async (request, response, next) => {
  try {
    const lead = await Lead.findById(request.params.id);
    if (!lead) return response.status(404).json({ message: 'Lead not found.' });
    if (!isAdmin(request.user) && lead.assignedTo.toString() !== request.user._id.toString()) return response.status(403).json({ message: 'You can only edit leads assigned to you.' });
    const { name, company, address1, address2, area, city, state, email, website, phone, contactNumber, customerType, segment, companyPersons, leadSource, source, stage, status, priority, nextFollowUp, notes, assignedTo } = request.body || {};
    Object.assign(lead, { name: name?.trim() || '', company: company?.trim(), address1, address2, area, city, state, email, website, phone: contactNumber || phone, customerType, segment, companyPersons, leadSource: leadSource || source || '', source: leadSource || source || '', stage: stage || status || 'New', status: stage || status || 'New', priority: priority || 'Medium', nextFollowUp: nextFollowUp || undefined, notes: notes?.trim() });
    if (isAdmin(request.user) && assignedTo) lead.assignedTo = assignedTo;
    await lead.save();
    const populated = await lead.populate('assignedTo', 'name');
    return response.json({ lead: serializeLead(populated.toObject()) });
  } catch (error) { return next(error); }
});

router.delete('/:id', requireAuth, async (request, response, next) => {
  try {
    const lead = await Lead.findById(request.params.id);
    if (!lead) return response.status(404).json({ message: 'Lead not found.' });
    if (!isAdmin(request.user) && lead.assignedTo.toString() !== request.user._id.toString()) return response.status(403).json({ message: 'You can only delete leads assigned to you.' });
    await lead.deleteOne();
    return response.json({ message: 'Lead deleted successfully.' });
  } catch (error) { return next(error); }
});

async function getAccessibleLead(request, id) {
  const lead = await Lead.findById(id);
  if (!lead) return { error: 'Lead not found.', status: 404 };
  if (!isAdmin(request.user) && lead.assignedTo.toString() !== request.user._id.toString()) return { error: 'You can only manage follow-ups for leads assigned to you.', status: 403 };
  return { lead };
}

router.post('/:id/followups', requireAuth, async (request, response, next) => {
  try {
    const result = await getAccessibleLead(request, request.params.id);
    if (result.error) return response.status(result.status).json({ message: result.error });
    const { date, description, nextDate } = request.body || {};
    if (!date || !description?.trim()) return response.status(400).json({ message: 'Follow-up date and description are required.' });
    result.lead.followUps.push({ date, description: description.trim(), nextDate: nextDate || undefined });
    result.lead.nextFollowUp = nextDate || undefined;
    await result.lead.save();
    const populated = await result.lead.populate('assignedTo', 'name');
    return response.status(201).json({ lead: serializeLead(populated.toObject()) });
  } catch (error) { return next(error); }
});

router.put('/:id/followups/:followUpId', requireAuth, async (request, response, next) => {
  try {
    const result = await getAccessibleLead(request, request.params.id);
    if (result.error) return response.status(result.status).json({ message: result.error });
    const followUp = result.lead.followUps.id(request.params.followUpId);
    if (!followUp) return response.status(404).json({ message: 'Follow-up not found.' });
    const { date, description, nextDate } = request.body || {};
    if (!date || !description?.trim()) return response.status(400).json({ message: 'Follow-up date and description are required.' });
    followUp.date = date;
    followUp.description = description.trim();
    followUp.nextDate = nextDate || undefined;
    result.lead.nextFollowUp = nextDate || undefined;
    await result.lead.save();
    const populated = await result.lead.populate('assignedTo', 'name');
    return response.json({ lead: serializeLead(populated.toObject()) });
  } catch (error) { return next(error); }
});

router.delete('/:id/followups/:followUpId', requireAuth, async (request, response, next) => {
  try {
    const result = await getAccessibleLead(request, request.params.id);
    if (result.error) return response.status(result.status).json({ message: result.error });
    const followUp = result.lead.followUps.id(request.params.followUpId);
    if (!followUp) return response.status(404).json({ message: 'Follow-up not found.' });
    followUp.deleteOne();
    await result.lead.save();
    const populated = await result.lead.populate('assignedTo', 'name');
    return response.json({ lead: serializeLead(populated.toObject()) });
  } catch (error) { return next(error); }
});

export default router;

import { Router } from 'express';
import mongoose from 'mongoose';
import Quotation from '../models/Quotation.js';
import QuotationCounter from '../models/QuotationCounter.js';
import Product from '../models/Product.js';
import Lead from '../models/Lead.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const isAdmin = (user) => [1, 3].includes(user.role);
const statuses = ['Draft', 'Sent', 'Accepted', 'Rejected'];

function serializeQuotation(quotation) {
  const populatedLead = quotation.leadId && typeof quotation.leadId === 'object' && quotation.leadId._id ? quotation.leadId : null;
  return {
    _id: quotation._id,
    leadId: quotation.leadId?._id || quotation.leadId,
    leadName: quotation.leadId?.company || quotation.company || '',
    leadAddress: populatedLead ? {
      address1: populatedLead.address1 || '',
      address2: populatedLead.address2 || '',
      area: populatedLead.area || '',
      city: populatedLead.city || '',
      state: populatedLead.state || '',
    } : null,
    revisedFrom: quotation.revisedFrom?._id || quotation.revisedFrom || null,
    revisionRoot: quotation.revisionRoot?._id || quotation.revisionRoot || null,
    revisionNumber: quotation.revisionNumber || 0,
    quotationYear: quotation.quotationYear || null,
    serialNumber: quotation.serialNumber || null,
    creatorInitial: quotation.creatorInitial || '',
    contactName: quotation.contactName || quotation.customerName || '',
    contactPersonId: quotation.contactPersonId || null,
    contactRole: quotation.contactRole || '',
    company: quotation.company || '',
    email: quotation.email || '',
    phone: quotation.phone || '',
    items: quotation.items || [],
    subtotal: quotation.subtotal ?? quotation.amount,
    freightPacking: quotation.freightPacking || 0,
    discountPercent: quotation.discountPercent || 0,
    discountAmount: quotation.discountAmount || 0,
    generalDiscountPercent: quotation.generalDiscountPercent || 0,
    generalDiscountAmount: quotation.generalDiscountAmount || 0,
    amount: quotation.amount,
    quotationDate: quotation.quotationDate || quotation.createdAt,
    status: quotation.status,
    createdBy: quotation.createdBy?._id || quotation.createdBy,
    createdByName: quotation.createdBy?.name || '',
    createdAt: quotation.createdAt,
    updatedAt: quotation.updatedAt,
  };
}

async function normalizeQuotation(body = {}) {
  const requestedItems = Array.isArray(body.items) ? body.items : [];
  const productIds = [...new Set(requestedItems.map((item) => String(item.productId || '')).filter(Boolean))];
  const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const items = requestedItems.map((item) => {
    const product = productMap.get(String(item.productId));
    const quantity = Number(item.quantity);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) return null;
    const unitPrice = Number(product.mrp ?? product.salePrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;
    const lineSubtotal = Number((quantity * unitPrice).toFixed(2));
    const usesDiscountAmount = item.discountMode === 'amount';
    const requestedDiscountPercent = Number(item.discountPercent || 0);
    const safeDiscountPercent = Number.isFinite(requestedDiscountPercent) ? Math.min(Math.max(requestedDiscountPercent, 0), 100) : 0;
    const requestedDiscountAmount = Number(item.discountAmount || 0);
    const discountAmount = usesDiscountAmount && Number.isFinite(requestedDiscountAmount)
      ? Number(Math.min(Math.max(requestedDiscountAmount, 0), lineSubtotal).toFixed(2))
      : Number((lineSubtotal * safeDiscountPercent / 100).toFixed(2));
    const discountPercent = lineSubtotal > 0 ? Number(((discountAmount / lineSubtotal) * 100).toFixed(6)) : 0;
    const lineTotal = Number((lineSubtotal - discountAmount).toFixed(2));
    const description = String(item.description ?? product.description ?? product.name ?? '').trim();
    return { productId: product._id, productName: product.description || product.name, productCode: product.partCode || product.code, description, unit: product.unit || '', quantity, unitPrice, taxRate: product.taxRate, lineSubtotal, discountPercent, discountAmount, lineTotal };
  }).filter(Boolean);
  const subtotal = Number(items.reduce((total, item) => total + item.lineSubtotal, 0).toFixed(2));
  const discountAmount = Number(items.reduce((total, item) => total + item.discountAmount, 0).toFixed(2));
  const discountPercent = subtotal > 0 ? Number(((discountAmount / subtotal) * 100).toFixed(6)) : 0;
  const productsAmount = Number(items.reduce((total, item) => total + item.lineTotal, 0).toFixed(2));
  const usesGeneralDiscountAmount = body.generalDiscountMode === 'amount';
  const requestedGeneralDiscountPercent = Number(body.generalDiscountPercent || 0);
  const safeGeneralDiscountPercent = Number.isFinite(requestedGeneralDiscountPercent) ? Math.min(Math.max(requestedGeneralDiscountPercent, 0), 100) : 0;
  const requestedGeneralDiscountAmount = Number(body.generalDiscountAmount || 0);
  const generalDiscountAmount = usesGeneralDiscountAmount && Number.isFinite(requestedGeneralDiscountAmount)
    ? Number(Math.min(Math.max(requestedGeneralDiscountAmount, 0), productsAmount).toFixed(2))
    : Number((productsAmount * safeGeneralDiscountPercent / 100).toFixed(2));
  const generalDiscountPercent = productsAmount > 0 ? Number(((generalDiscountAmount / productsAmount) * 100).toFixed(6)) : 0;
  const requestedFreightPacking = Number(body.freightPacking || 0);
  const freightPacking = Number((Number.isFinite(requestedFreightPacking) ? Math.max(requestedFreightPacking, 0) : 0).toFixed(2));
  return {
    leadId: String(body.leadId || '').trim(),
    contactName: String(body.contactName || body.customerName || '').trim(),
    contactPersonId: String(body.contactPersonId || '').trim() || null,
    contactRole: String(body.contactRole || '').trim(),
    company: String(body.company || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    items,
    subtotal,
    freightPacking,
    discountPercent,
    discountAmount,
    generalDiscountPercent,
    generalDiscountAmount,
    amount: Number((productsAmount - generalDiscountAmount + freightPacking).toFixed(2)),
    quotationDate: body.quotationDate ? new Date(body.quotationDate) : new Date(),
    status: String(body.status || 'Draft').trim(),
  };
}

function validateQuotation(quotation) {
  if (!mongoose.Types.ObjectId.isValid(quotation.leadId)) return 'Please select a valid lead.';
  if (quotation.contactPersonId && !mongoose.Types.ObjectId.isValid(quotation.contactPersonId)) return 'Please select a valid person.';
  if (!quotation.items.length) return 'Please add at least one active product from Product Master.';
  if (Number.isNaN(quotation.quotationDate.getTime())) return 'Please select a valid quotation date.';
  if (!statuses.includes(quotation.status)) return 'Please select a valid quotation status.';
  return null;
}

router.use(requireAuth);

function quotationScope(user) {
  return isAdmin(user) ? {} : { createdBy: user._id };
}

function leadScope(user, leadId) {
  return isAdmin(user) ? { _id: leadId } : { _id: leadId, assignedTo: user._id };
}

async function assignLegacyQuotationNumbers() {
  const unnumbered = await Quotation.find({
    revisionNumber: 0,
    $or: [{ serialNumber: { $exists: false } }, { serialNumber: null }],
  }).populate('createdBy', 'name').sort({ quotationDate: 1, createdAt: 1 }).lean();
  for (const quotation of unnumbered) {
    const quotationYear = new Date(quotation.quotationDate || quotation.createdAt).getFullYear();
    const counter = await QuotationCounter.findOneAndUpdate(
      { _id: `quotation-${quotationYear}` },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const creatorInitial = String(quotation.createdBy?.name || 'J').trim().charAt(0).toUpperCase();
    const result = await Quotation.updateOne(
      { _id: quotation._id, $or: [{ serialNumber: { $exists: false } }, { serialNumber: null }] },
      { $set: { quotationYear, serialNumber: counter.sequence, creatorInitial } },
    );
    if (result.modifiedCount) {
      await Quotation.updateMany(
        { revisionRoot: quotation._id, $or: [{ serialNumber: { $exists: false } }, { serialNumber: null }] },
        { $set: { quotationYear, serialNumber: counter.sequence, creatorInitial } },
      );
    }
  }
}

router.get('/summary', async (request, response, next) => {
  try {
    const filter = quotationScope(request.user);
    const [total, sent, draft, revisions] = await Promise.all([
      Quotation.countDocuments(filter),
      Quotation.countDocuments({ ...filter, status: 'Sent' }),
      Quotation.countDocuments({ ...filter, status: 'Draft' }),
      Quotation.countDocuments({ ...filter, revisionNumber: { $gt: 0 } }),
    ]);
    return response.json({ summary: { total, sent, draft, revisions } });
  } catch (error) { return next(error); }
});

router.get('/', async (request, response, next) => {
  try {
    await assignLegacyQuotationNumbers();
    const filter = quotationScope(request.user);
    const queryConditions = [];
    if (request.query.search?.trim()) {
      const escapedSearch = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      queryConditions.push({ $or: [
        { contactName: { $regex: escapedSearch, $options: 'i' } },
        { customerName: { $regex: escapedSearch, $options: 'i' } },
        { company: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } },
        { 'items.productName': { $regex: escapedSearch, $options: 'i' } },
        { 'items.productCode': { $regex: escapedSearch, $options: 'i' } },
      ] });
    }
    if (request.query.leadId) {
      if (!mongoose.Types.ObjectId.isValid(request.query.leadId)) return response.status(400).json({ message: 'Invalid lead.' });
      filter.leadId = request.query.leadId;
    }
    if (request.query.dateFrom || request.query.dateTo) {
      const dateRange = {};
      if (request.query.dateFrom) dateRange.$gte = new Date(`${request.query.dateFrom}T00:00:00.000Z`);
      if (request.query.dateTo) dateRange.$lt = new Date(`${request.query.dateTo}T00:00:00.000Z`);
      if (!Number.isNaN(dateRange.$gte?.getTime()) && !Number.isNaN(dateRange.$lt?.getTime())) {
        queryConditions.push({ $or: [{ quotationDate: dateRange }, { quotationDate: { $exists: false }, createdAt: dateRange }] });
      }
    }
    if (queryConditions.length) filter.$and = queryConditions;
    const quotations = await Quotation.find(filter).populate('createdBy', 'name').populate('leadId', 'name company address1 address2 area city state').sort({ createdAt: -1 }).lean();
    const summary = {
      total: quotations.length,
      sent: quotations.filter((item) => item.status === 'Sent').length,
      draft: quotations.filter((item) => item.status === 'Draft').length,
      revisions: quotations.filter((item) => item.revisionNumber > 0).length,
    };
    return response.json({ quotations: quotations.map(serializeQuotation), summary, scope: isAdmin(request.user) ? 'all' : 'own' });
  } catch (error) { return next(error); }
});

router.post('/', async (request, response, next) => {
  try {
    const quotationData = await normalizeQuotation(request.body);
    const validationError = validateQuotation(quotationData);
    if (validationError) return response.status(400).json({ message: validationError });
    const lead = await Lead.findOne(leadScope(request.user, quotationData.leadId)).lean();
    if (!lead) return response.status(404).json({ message: 'Lead not found or is not available to you.' });
    if (quotationData.contactPersonId && !lead.companyPersons?.some((person) => String(person._id) === quotationData.contactPersonId)) return response.status(400).json({ message: 'The selected person does not belong to this lead.' });
    let revisedFrom = null;
    let revisionRoot = null;
    let revisionNumber = 0;
    let quotationYear;
    let serialNumber;
    let creatorInitial;
    if (request.body?.revisedFromId) {
      if (!mongoose.Types.ObjectId.isValid(request.body.revisedFromId)) return response.status(400).json({ message: 'Invalid quotation to revise.' });
      const source = await Quotation.findOne({ ...quotationScope(request.user), _id: request.body.revisedFromId, leadId: quotationData.leadId }).lean();
      if (!source) return response.status(404).json({ message: 'The original quotation was not found for this lead.' });
      revisedFrom = source._id;
      revisionRoot = source.revisionRoot || source._id;
      const latestRevision = await Quotation.findOne({ ...quotationScope(request.user), revisionRoot }).sort({ revisionNumber: -1 }).select('revisionNumber').lean();
      revisionNumber = Math.max(source.revisionNumber || 0, latestRevision?.revisionNumber || 0) + 1;
      quotationYear = source.quotationYear || new Date(source.quotationDate || source.createdAt).getFullYear();
      serialNumber = source.serialNumber;
      creatorInitial = source.creatorInitial || String(request.user.name || 'J').trim().charAt(0).toUpperCase();
    } else {
      quotationYear = quotationData.quotationDate.getFullYear();
      const counter = await QuotationCounter.findOneAndUpdate(
        { _id: `quotation-${quotationYear}` },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      serialNumber = counter.sequence;
      creatorInitial = String(request.user.name || 'J').trim().charAt(0).toUpperCase();
    }
    const quotation = await Quotation.create({ ...quotationData, revisedFrom, revisionRoot, revisionNumber, quotationYear, serialNumber, creatorInitial, createdBy: request.user._id });
    await Lead.updateOne({ _id: lead._id }, { $set: { stage: 'Quotation', status: 'Quotation' } });
    await quotation.populate([{ path: 'createdBy', select: 'name' }, { path: 'leadId', select: 'name company address1 address2 area city state' }]);
    return response.status(201).json({ quotation: serializeQuotation(quotation.toObject()) });
  } catch (error) { return next(error); }
});

router.put('/:id', async (request, response, next) => {
  try {
    const filter = isAdmin(request.user) ? { _id: request.params.id } : { _id: request.params.id, createdBy: request.user._id };
    const quotationData = await normalizeQuotation(request.body);
    const validationError = validateQuotation(quotationData);
    if (validationError) return response.status(400).json({ message: validationError });
    const lead = await Lead.findOne(leadScope(request.user, quotationData.leadId)).lean();
    if (!lead) return response.status(404).json({ message: 'Lead not found or is not available to you.' });
    if (quotationData.contactPersonId && !lead.companyPersons?.some((person) => String(person._id) === quotationData.contactPersonId)) return response.status(400).json({ message: 'The selected person does not belong to this lead.' });
    const quotation = await Quotation.findOneAndUpdate(filter, quotationData, { new: true, runValidators: true }).populate([{ path: 'createdBy', select: 'name' }, { path: 'leadId', select: 'name company address1 address2 area city state' }]);
    if (!quotation) return response.status(404).json({ message: 'Quotation not found.' });
    return response.json({ quotation: serializeQuotation(quotation.toObject()) });
  } catch (error) { return next(error); }
});

router.patch('/:id/status', async (request, response, next) => {
  try {
    const status = request.body?.status;
    if (!statuses.includes(status)) return response.status(400).json({ message: 'Please select a valid quotation status.' });
    const filter = isAdmin(request.user) ? { _id: request.params.id } : { _id: request.params.id, createdBy: request.user._id };
    const quotation = await Quotation.findOneAndUpdate(filter, { $set: { status } }, { new: true, runValidators: true }).populate([{ path: 'createdBy', select: 'name' }, { path: 'leadId', select: 'name company address1 address2 area city state' }]);
    if (!quotation) return response.status(404).json({ message: 'Quotation not found.' });
    return response.json({ quotation: serializeQuotation(quotation.toObject()) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request, response, next) => {
  try {
    const filter = isAdmin(request.user) ? { _id: request.params.id } : { _id: request.params.id, createdBy: request.user._id };
    const quotation = await Quotation.findOneAndDelete(filter);
    if (!quotation) return response.status(404).json({ message: 'Quotation not found.' });
    return response.json({ message: 'Quotation deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;

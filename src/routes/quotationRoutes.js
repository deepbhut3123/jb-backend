import { Router } from 'express';
import Quotation from '../models/Quotation.js';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const isAdmin = (user) => [1, 3].includes(user.role);
const statuses = ['Draft', 'Sent', 'Accepted', 'Rejected'];

function serializeQuotation(quotation) {
  return {
    _id: quotation._id,
    customerName: quotation.customerName,
    company: quotation.company || '',
    email: quotation.email || '',
    phone: quotation.phone || '',
    items: quotation.items || [],
    amount: quotation.amount,
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
    const lineTotal = quantity * unitPrice;
    return { productId: product._id, productName: product.description || product.name, productCode: product.partCode || product.code, unit: product.unit || '', quantity, unitPrice, taxRate: product.taxRate, lineTotal };
  }).filter(Boolean);
  return {
    customerName: String(body.customerName || '').trim(),
    company: String(body.company || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    items,
    amount: items.reduce((total, item) => total + item.lineTotal, 0),
    status: String(body.status || 'Draft').trim(),
  };
}

function validateQuotation(quotation) {
  if (!quotation.customerName) return 'Customer name is required.';
  if (!quotation.items.length) return 'Please add at least one active product from Product Master.';
  if (!statuses.includes(quotation.status)) return 'Please select a valid quotation status.';
  return null;
}

router.use(requireAuth);

router.get('/', async (request, response, next) => {
  try {
    const filter = isAdmin(request.user) ? {} : { createdBy: request.user._id };
    const quotations = await Quotation.find(filter).populate('createdBy', 'name').sort({ createdAt: -1 }).lean();
    return response.json({ quotations: quotations.map(serializeQuotation), scope: isAdmin(request.user) ? 'all' : 'own' });
  } catch (error) { return next(error); }
});

router.post('/', async (request, response, next) => {
  try {
    const quotationData = await normalizeQuotation(request.body);
    const validationError = validateQuotation(quotationData);
    if (validationError) return response.status(400).json({ message: validationError });
    const quotation = await Quotation.create({ ...quotationData, createdBy: request.user._id });
    const populated = await quotation.populate('createdBy', 'name');
    return response.status(201).json({ quotation: serializeQuotation(populated.toObject()) });
  } catch (error) { return next(error); }
});

router.put('/:id', async (request, response, next) => {
  try {
    const filter = isAdmin(request.user) ? { _id: request.params.id } : { _id: request.params.id, createdBy: request.user._id };
    const quotationData = await normalizeQuotation(request.body);
    const validationError = validateQuotation(quotationData);
    if (validationError) return response.status(400).json({ message: validationError });
    const quotation = await Quotation.findOneAndUpdate(filter, quotationData, { new: true, runValidators: true }).populate('createdBy', 'name');
    if (!quotation) return response.status(404).json({ message: 'Quotation not found.' });
    return response.json({ quotation: serializeQuotation(quotation.toObject()) });
  } catch (error) { return next(error); }
});

router.patch('/:id/status', async (request, response, next) => {
  try {
    const status = request.body?.status;
    if (!statuses.includes(status)) return response.status(400).json({ message: 'Please select a valid quotation status.' });
    const filter = isAdmin(request.user) ? { _id: request.params.id } : { _id: request.params.id, createdBy: request.user._id };
    const quotation = await Quotation.findOneAndUpdate(filter, { $set: { status } }, { new: true, runValidators: true }).populate('createdBy', 'name');
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

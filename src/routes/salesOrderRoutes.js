import { Router } from 'express';
import mongoose from 'mongoose';
import SalesOrder from '../models/SalesOrder.js';
import Lead from '../models/Lead.js';
import Quotation from '../models/Quotation.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { createSalesOrderForLead, createSalesOrderForQuotation } from '../services/salesOrders.js';

const router = Router();
const isAdmin = (user) => [1, 3].includes(Number(user.role));
const statuses = ['Pending', 'Processing', 'Completed', 'Cancelled'];

function orderScope(request) {
  return isAdmin(request.user) || request.permissions?.includes('salesOrders.viewAll') ? {} : { createdBy: request.user._id };
}

function serializeOrder(order) {
  const lead = order.leadId && typeof order.leadId === 'object' ? order.leadId : null;
  return {
    ...order,
    _id: String(order._id),
    leadId: lead?._id ? String(lead._id) : order.leadId ? String(order.leadId) : null,
    leadName: lead?.company || '',
    createdBy: order.createdBy?._id ? String(order.createdBy._id) : order.createdBy ? String(order.createdBy) : '',
    createdByName: order.createdBy?.name || '',
    orderNumber: `SO-${new Date(order.createdAt || order.orderDate || Date.now()).getFullYear()}-${String(order._id).slice(-6).toUpperCase()}`,
  };
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).map((item) => {
    const productName = String(item.productName || '').trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const taxRate = Number(item.taxRate ?? 0);
    if (!productName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return null;
    return {
      productId: mongoose.Types.ObjectId.isValid(item.productId) ? item.productId : null,
      productName,
      productCode: String(item.productCode || '').trim(),
      description: String(item.description || productName).trim(),
      unit: String(item.unit || '').trim(),
      quantity,
      unitPrice,
      taxRate,
      lineTotal: Number((quantity * unitPrice).toFixed(2)),
    };
  }).filter(Boolean);
}

function normalizeOrder(body = {}) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = normalizeItems(rawItems);
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const freightPacking = Math.max(Number(body.freightPacking) || 0, 0);
  const orderDate = body.orderDate ? new Date(body.orderDate) : new Date();
  return {
    company: String(body.company || '').trim(),
    contactName: String(body.contactName || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    address: String(body.address || '').trim(),
    items,
    invalidItems: rawItems.length !== items.length || rawItems.length > 100,
    subtotal,
    freightPacking,
    amount: Number((subtotal + freightPacking).toFixed(2)),
    orderDate,
    status: String(body.status || 'Pending'),
    notes: String(body.notes || '').trim(),
  };
}

function validateOrder(order) {
  if (!order.company) return 'Customer or company name is required.';
  if (order.invalidItems) return 'Check the product names, quantities, and rates.';
  if (!order.items.length) return 'Add at least one valid product to the sales order.';
  if (Number.isNaN(order.orderDate.getTime())) return 'Enter a valid order date.';
  if (!statuses.includes(order.status)) return 'Choose a valid sales order status.';
  if (order.notes.length > 3000) return 'Notes cannot exceed 3,000 characters.';
  return null;
}

router.use(requireAuth);

router.get('/', requirePermission('salesOrders.view'), async (request, response, next) => {
  try {
    const filter = orderScope(request);
    if (statuses.includes(request.query.status)) filter.status = request.query.status;
    if (request.query.search?.trim()) {
      const query = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ company: { $regex: query, $options: 'i' } }, { contactName: { $regex: query, $options: 'i' } }, { 'items.productName': { $regex: query, $options: 'i' } }];
    }
    const page = Math.max(Number.parseInt(request.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 20, 1), 100);
    const [total, orders] = await Promise.all([
      SalesOrder.countDocuments(filter),
      SalesOrder.find(filter).populate('leadId', 'company name').populate('createdBy', 'name').sort({ orderDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return response.json({ orders: orders.map(serializeOrder), pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } });
  } catch (error) { return next(error); }
});

router.post('/', requirePermission('salesOrders.create'), async (request, response, next) => {
  try {
    if (request.body?.quotationId) {
      if (!mongoose.Types.ObjectId.isValid(request.body.quotationId)) return response.status(400).json({ message: 'Invalid quotation.' });
      const quotation = await Quotation.findById(request.body.quotationId).populate('leadId', 'name company address1 address2 area city state').lean();
      if (!quotation) return response.status(404).json({ message: 'Quotation not found.' });
      const canAccessQuotation = isAdmin(request.user) || request.permissions?.includes('quotations.viewAll') || String(quotation.createdBy) === String(request.user._id);
      if (!canAccessQuotation) return response.status(403).json({ message: 'You do not have access to this quotation.' });
      if (quotation.status !== 'Accepted') return response.status(400).json({ message: 'Only accepted quotations can be made into sales orders.' });
      const result = await createSalesOrderForQuotation(quotation, request.user._id);
      const order = await SalesOrder.findById(result.order._id).populate('leadId', 'company name').populate('createdBy', 'name').lean();
      return response.status(result.created ? 201 : 200).json({ order: serializeOrder(order), alreadyExists: !result.created });
    }

    if (request.body?.leadId) {
      if (!mongoose.Types.ObjectId.isValid(request.body.leadId)) return response.status(400).json({ message: 'Invalid lead.' });
      const lead = await Lead.findById(request.body.leadId).lean();
      if (!lead) return response.status(404).json({ message: 'Lead not found.' });
      const canAccessLead = isAdmin(request.user) || request.permissions?.includes('salesOrders.viewAll') || request.permissions?.includes('leads.viewAll') || String(lead.createdBy) === String(request.user._id) || String(lead.assignedTo) === String(request.user._id);
      if (!canAccessLead) return response.status(403).json({ message: 'You do not have access to this lead.' });
      const result = await createSalesOrderForLead(lead, request.user._id, 'lead-action');
      const order = await SalesOrder.findById(result.order._id).populate('leadId', 'company name').populate('createdBy', 'name').lean();
      return response.status(result.created ? 201 : 200).json({ order: serializeOrder(order), alreadyExists: !result.created });
    }

    const orderData = normalizeOrder(request.body);
    const validationError = validateOrder(orderData);
    if (validationError) return response.status(400).json({ message: validationError });
    const order = await SalesOrder.create({ ...orderData, source: 'manual', createdBy: request.user._id });
    const populated = await SalesOrder.findById(order._id).populate('createdBy', 'name').lean();
    return response.status(201).json({ order: serializeOrder(populated) });
  } catch (error) { return next(error); }
});

router.put('/:id', requirePermission('salesOrders.edit'), async (request, response, next) => {
  try {
    const orderData = normalizeOrder(request.body);
    const validationError = validateOrder(orderData);
    if (validationError) return response.status(400).json({ message: validationError });
    const order = await SalesOrder.findOneAndUpdate({ ...orderScope(request), _id: request.params.id }, orderData, { new: true, runValidators: true }).populate('leadId', 'company name').populate('createdBy', 'name');
    if (!order) return response.status(404).json({ message: 'Sales order not found.' });
    return response.json({ order: serializeOrder(order.toObject()) });
  } catch (error) { return next(error); }
});

router.patch('/:id/status', requirePermission('salesOrders.edit'), async (request, response, next) => {
  try {
    const status = String(request.body?.status || '');
    if (!statuses.includes(status)) return response.status(400).json({ message: 'Choose a valid sales order status.' });
    const order = await SalesOrder.findOneAndUpdate(
      { ...orderScope(request), _id: request.params.id },
      { $set: { status } },
      { new: true, runValidators: true },
    ).populate('leadId', 'company name').populate('createdBy', 'name');
    if (!order) return response.status(404).json({ message: 'Sales order not found.' });
    return response.json({ order: serializeOrder(order.toObject()) });
  } catch (error) { return next(error); }
});

router.delete('/:id', requirePermission('salesOrders.delete'), async (request, response, next) => {
  try {
    const order = await SalesOrder.findOneAndDelete({ ...orderScope(request), _id: request.params.id });
    if (!order) return response.status(404).json({ message: 'Sales order not found.' });
    return response.json({ message: 'Sales order deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;

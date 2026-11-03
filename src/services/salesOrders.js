import SalesOrder from '../models/SalesOrder.js';

export async function createSalesOrderForLead(lead, createdBy, source = 'lead-stage') {
  const existing = await SalesOrder.findOne({ leadId: lead._id }).lean();
  if (existing) return { order: existing, created: false };

  const firstPerson = lead.companyPersons?.[0] || {};
  const payload = {
    leadId: lead._id,
    company: lead.company || lead.name || 'Unnamed company',
    contactName: firstPerson.name || lead.name || '',
    email: firstPerson.email || lead.email || '',
    phone: firstPerson.number || lead.phone || '',
    address: [lead.address1, lead.address2, lead.area, lead.city, lead.state].filter(Boolean).join(', '),
    items: [],
    subtotal: 0,
    freightPacking: 0,
    amount: 0,
    notes: '',
    source,
    createdBy,
  };
  try {
    const order = await SalesOrder.create(payload);
    return { order: order.toObject(), created: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    return { order: await SalesOrder.findOne({ leadId: lead._id }).lean(), created: false };
  }
}

export async function createSalesOrderForQuotation(quotation, createdBy) {
  const leadId = quotation.leadId?._id || quotation.leadId;
  const existing = await SalesOrder.findOne({ $or: [{ quotationId: quotation._id }, { leadId }] }).lean();
  if (existing) return { order: existing, created: false };

  const lead = quotation.leadId && typeof quotation.leadId === 'object' ? quotation.leadId : {};
  const payload = {
    leadId,
    quotationId: quotation._id,
    company: quotation.company || lead.company || lead.name || 'Unnamed company',
    contactName: quotation.contactName || quotation.customerName || '',
    email: quotation.email || '',
    phone: quotation.phone || '',
    address: [lead.address1, lead.address2, lead.area, lead.city, lead.state].filter(Boolean).join(', '),
    items: (quotation.items || []).map((item) => ({
      productId: item.productId || null,
      productName: item.productName,
      productCode: item.productCode || '',
      description: item.description || item.productName,
      unit: item.unit || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate ?? 0,
      lineTotal: item.lineTotal,
    })),
    subtotal: quotation.subtotal || 0,
    freightPacking: quotation.freightPacking || 0,
    amount: quotation.amount || 0,
    orderDate: quotation.quotationDate || new Date(),
    notes: quotation.notes || '',
    source: 'quotation-accepted',
    createdBy,
  };
  try {
    const order = await SalesOrder.create(payload);
    return { order: order.toObject(), created: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    return { order: await SalesOrder.findOne({ leadId: payload.leadId }).lean(), created: false };
  }
}

import { Router } from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Lead from '../models/Lead.js';
import Product from '../models/Product.js';
import Quotation from '../models/Quotation.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import WhatsAppEvent from '../models/WhatsAppEvent.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
const col = (key, label, type = 'text') => ({ key, label, type });
const report = (key, label, description) => ({ key, label, description });
const isAdmin = (request) => [1, 3].includes(Number(request.user.role));
const can = (request, permission) => isAdmin(request) || request.permissions?.includes(permission);
const text = (value) => String(value || '').trim();
const join = (values) => values.map(text).filter(Boolean).join(', ');
const id = (value) => String(value?._id || value || '');
const validIds = (values) => [...new Set(Array.isArray(values) ? values : [])].filter((value) => mongoose.Types.ObjectId.isValid(value));
const qNumber = (item) => item.serialNumber ? `JB/${item.creatorInitial || 'J'}/${item.quotationYear || new Date(item.quotationDate || item.createdAt).getFullYear()}/${String(item.serialNumber).padStart(3, '0')}${item.revisionNumber ? `/R${item.revisionNumber}` : ''}` : 'Unnumbered';

const modules = {
  users: { label: 'Users', singular: 'user', permission: 'users.view', reports: [report('profiles', 'User details', 'Account, contact, and assigned role'), report('leadsAssigned', 'Leads assigned', 'Leads currently assigned to the selected users'), report('leadsCreated', 'Leads created', 'Leads added by the selected users'), report('customers', 'Customers managed', 'Customer contacts under assigned leads'), report('followups', 'Follow-up activity', 'Follow-ups on assigned leads'), report('quotations', 'Quotations created', 'Quotations added by the selected users'), report('performance', 'Sales value & estimated profit', 'Lead counts, quotation totals, accepted value, and estimated profit'), report('productsAdded', 'Products added', 'Products created by the selected users'), report('categoriesAdded', 'Categories added', 'Categories created by the selected users')] },
  leads: { label: 'Leads', singular: 'lead', permission: 'leads.view', reports: [report('details', 'Lead details', 'Company, status, source, priority, and assignee'), report('contacts', 'Customer contacts', 'People registered under the selected leads'), report('followups', 'Follow-up history', 'Completed and scheduled follow-ups'), report('quotations', 'Related quotations', 'Quotations raised for the selected leads'), report('items', 'Quoted products', 'Every product quoted to these leads'), report('performance', 'Lead value & estimated profit', 'Quotation totals, accepted value, and estimated profit by lead')] },
  customers: { label: 'Customers', singular: 'customer', permission: 'customers.view', reports: [report('details', 'Customer details', 'Contact and company information'), report('leads', 'Company/lead details', 'The company record connected to each customer'), report('followups', 'Company follow-ups', 'Follow-up activity for their companies'), report('quotations', 'Customer quotations', 'Quotations addressed to selected customers'), report('performance', 'Customer value & estimated profit', 'Quotation totals, accepted value, and estimated profit')] },
  followups: { label: 'Follow-ups', singular: 'follow-up', permission: 'leads.view', reports: [report('details', 'Follow-up details', 'Date, notes, next date, and assigned user'), report('leads', 'Related lead details', 'Company and lead status for each follow-up')] },
  quotations: { label: 'Quotations', singular: 'quotation', permission: 'quotations.view', reports: [report('details', 'Quotation details', 'Customer, status, dates, and totals'), report('items', 'Quotation items', 'Product, quantity, rates, discounts, and totals'), report('financials', 'Financial & estimated profit', 'Revenue, discounts, costs, and estimated profit'), report('revisions', 'Revision history', 'Original quotation and all revisions')] },
  products: { label: 'Products', singular: 'product', permission: 'products.view', reports: [report('details', 'Product details', 'Codes, category, GST, pricing, and status'), report('usage', 'Quotation usage', 'Where and when products were quoted'), report('performance', 'Product sales & estimated profit', 'Quoted quantity, revenue, accepted value, and estimated profit')] },
  categories: { label: 'Categories', singular: 'category', permission: 'categories.view', reports: [report('details', 'Category hierarchy', 'Categories, sub-categories, and sub-sub-categories'), report('products', 'Products in category', 'Products belonging to selected categories'), report('usage', 'Quotation usage', 'Quoted products from selected categories'), report('performance', 'Category sales & estimated profit', 'Product count, quotation value, and estimated profit')] },
  roles: { label: 'Roles & Permissions', singular: 'role', adminOnly: true, reports: [report('details', 'Role details', 'Status, permissions, and description'), report('users', 'Users assigned', 'Users currently assigned to selected roles'), report('performance', 'Team activity & sales', 'Leads, quotations, accepted value, and estimated profit by role')] },
  whatsapp: { label: 'WhatsApp Activity', singular: 'activity record', permission: 'whatsapp.view', reports: [report('details', 'Message activity', 'Sender, message, result, and received time'), report('leads', 'Leads created/found', 'Lead records connected to selected messages'), report('outcomes', 'Outcome summary', 'Created, existing, failed, and pending totals')] },
};

const allowedModules = (request) => Object.entries(modules).filter(([, item]) => item.adminOnly ? isAdmin(request) : can(request, item.permission));
const leadScope = (request, module = 'leads') => isAdmin(request) || request.permissions?.includes(`${module}.viewAll`) || request.permissions?.includes('leads.viewAll') ? {} : { createdBy: request.user._id };
const quoteScope = (request) => isAdmin(request) || request.permissions?.includes('quotations.viewAll') ? {} : { createdBy: request.user._id };

function rangeFrom(body = {}) {
  if (!body.dateFrom && !body.dateTo) return null;
  const range = {};
  if (body.dateFrom) range.$gte = new Date(`${body.dateFrom}T00:00:00.000Z`);
  if (body.dateTo) { range.$lt = new Date(`${body.dateTo}T00:00:00.000Z`); range.$lt.setUTCDate(range.$lt.getUTCDate() + 1); }
  if (Object.values(range).some((date) => Number.isNaN(date.getTime()))) return false;
  return range;
}
const inRange = (value, range) => !range || (value && (!range.$gte || new Date(value) >= range.$gte) && (!range.$lt || new Date(value) < range.$lt));
const dateQuery = (field, range) => range ? { [field]: range } : {};
const section = (key, title, columns, rows, summary) => ({ key, title, columns, rows, ...(summary ? { summary } : {}) });

async function loadOptions(request, moduleKey) {
  if (moduleKey === 'users') return (await User.find().select('name email roleProfile').populate('roleProfile', 'name').sort({ name: 1 }).lean()).map((item) => ({ id: id(item), label: item.name, subtitle: join([item.email, item.roleProfile?.name || 'Administrator']) }));
  if (moduleKey === 'leads') return (await Lead.find(leadScope(request)).populate('assignedTo', 'name').sort({ company: 1 }).lean()).map((item) => ({ id: id(item), label: item.company || item.name || 'Unnamed company', subtitle: join([item.city, item.stage || item.status, item.assignedTo?.name]) }));
  if (moduleKey === 'customers') return (await Lead.find(leadScope(request, 'customers')).sort({ company: 1 }).lean()).flatMap((lead) => (lead.companyPersons || []).map((person) => ({ id: id(person), label: person.name || 'Unnamed contact', subtitle: join([lead.company, person.role || person.designation, person.number || person.contactNumber]), meta: { leadId: id(lead) } })));
  if (moduleKey === 'followups') return (await Lead.find(leadScope(request)).sort({ updatedAt: -1 }).lean()).flatMap((lead) => (lead.followUps || []).map((item) => ({ id: id(item), label: `${lead.company || lead.name || 'Lead'} — ${text(item.description).slice(0, 65) || 'Follow-up'}`, subtitle: item.date ? new Date(item.date).toLocaleDateString('en-IN') : 'No date', meta: { leadId: id(lead) } })));
  if (moduleKey === 'quotations') return (await Quotation.find(quoteScope(request)).sort({ quotationDate: -1 }).lean()).map((item) => ({ id: id(item), label: `${qNumber(item)} — ${item.company || 'Unnamed company'}`, subtitle: join([item.status, `₹${Number(item.amount || 0).toLocaleString('en-IN')}`]) }));
  if (moduleKey === 'products') return (await Product.find().sort({ description: 1, name: 1 }).lean()).map((item) => ({ id: id(item), label: item.description || item.name || 'Unnamed product', subtitle: join([item.partCode || item.code, item.category, item.brand]) }));
  if (moduleKey === 'categories') return (await Category.find().sort({ name: 1 }).lean()).map((item) => ({ id: id(item), label: item.name, subtitle: `${item.subCategories?.length || 0} sub-categories` }));
  if (moduleKey === 'roles') return (await Role.find().sort({ name: 1 }).lean()).map((item) => ({ id: id(item), label: item.name, subtitle: `${item.permissions?.length || 0} permissions · ${item.isActive === false ? 'Inactive' : 'Active'}` }));
  if (moduleKey === 'whatsapp') return (await WhatsAppEvent.find().sort({ receivedAt: -1, createdAt: -1 }).limit(5000).lean()).map((item) => ({ id: id(item), label: join([item.name || item.phone || item.sender, text(item.body).slice(0, 55)]), subtitle: join([item.outcome, item.receivedAt ? new Date(item.receivedAt).toLocaleString('en-IN') : '']) }));
  return [];
}

async function quotationMetrics(quotations) {
  const productIds = [...new Set(quotations.flatMap((quote) => (quote.items || []).map((item) => id(item.productId))).filter(Boolean))];
  const products = await Product.find({ _id: { $in: validIds(productIds) } }).select('convertedAmount priceMultiplier finalRate mrp').lean();
  const productMap = new Map(products.map((item) => [id(item), item]));
  const metrics = new Map();
  for (const quote of quotations) {
    const cost = (quote.items || []).reduce((total, item) => { const product = productMap.get(id(item.productId)); const base = Number(product?.convertedAmount || 0) * Number(product?.priceMultiplier || 1); return total + base * Number(item.quantity || 0); }, 0);
    metrics.set(id(quote), { cost: Number(cost.toFixed(2)), profit: Number((Number(quote.amount || 0) - cost).toFixed(2)) });
  }
  return metrics;
}

const leadRow = (item) => ({ company: item.company || item.name || '', city: item.city || '', state: item.state || '', source: item.leadSource || item.source || '', status: item.stage || item.status || '', priority: item.priority || '', assignedTo: item.assignedTo?.name || 'Unassigned', createdBy: item.createdBy?.name || '', createdAt: item.createdAt });
const quoteRow = (item) => ({ quotation: qNumber(item), company: item.company || '', contact: item.contactName || item.customerName || '', status: item.status || '', items: item.items?.length || 0, subtotal: item.subtotal ?? item.amount ?? 0, discount: Number(item.discountAmount || 0) + Number(item.generalDiscountAmount || 0), amount: item.amount || 0, createdBy: item.createdBy?.name || '', date: item.quotationDate || item.createdAt });
const leadColumns = [col('company', 'Company'), col('city', 'City'), col('source', 'Source'), col('status', 'Status'), col('priority', 'Priority'), col('assignedTo', 'Assigned to'), col('createdAt', 'Created', 'date')];
const quoteColumns = [col('quotation', 'Quotation'), col('company', 'Company'), col('contact', 'Contact'), col('status', 'Status'), col('items', 'Items', 'number'), col('amount', 'Amount', 'currency'), col('createdBy', 'Created by'), col('date', 'Date', 'date')];
const followupColumns = [col('company', 'Company'), col('description', 'Description'), col('date', 'Date', 'date'), col('nextDate', 'Next date', 'date'), col('assignedTo', 'Assigned to')];
const itemColumns = [col('quotation', 'Quotation'), col('company', 'Company'), col('product', 'Product'), col('code', 'Code'), col('quantity', 'Qty', 'number'), col('unitPrice', 'Rate', 'currency'), col('discount', 'Discount', 'currency'), col('total', 'Total', 'currency')];

async function buildSections(request, moduleKey, selectedIds, selectedReports, range) {
  const wanted = new Set(selectedReports);
  const sections = [];
  const selected = new Set(selectedIds);
  if (moduleKey === 'users') {
    const users = await User.find({ _id: { $in: validIds(selectedIds) } }).select('name email phone role roleProfile isVerified createdAt').populate('roleProfile', 'name').lean();
    const userIds = users.map((item) => item._id);
    const [assigned, created, quotes, products, categories] = await Promise.all([
      Lead.find({ ...leadScope(request), assignedTo: { $in: userIds }, ...dateQuery('createdAt', range) }).populate('assignedTo createdBy', 'name').lean(),
      Lead.find({ ...leadScope(request), createdBy: { $in: userIds }, ...dateQuery('createdAt', range) }).populate('assignedTo createdBy', 'name').lean(),
      Quotation.find({ ...quoteScope(request), createdBy: { $in: userIds }, ...dateQuery('quotationDate', range) }).populate('createdBy', 'name').lean(),
      Product.find({ createdBy: { $in: userIds }, ...dateQuery('createdAt', range) }).populate('createdBy', 'name').lean(),
      Category.find({ createdBy: { $in: userIds }, ...dateQuery('createdAt', range) }).populate('createdBy', 'name').lean(),
    ]);
    if (wanted.has('profiles')) sections.push(section('profiles', 'User details', [col('name', 'Name'), col('email', 'Email'), col('phone', 'Phone'), col('accountType', 'Account type'), col('role', 'Role'), col('verified', 'Verified'), col('createdAt', 'Joined', 'date')], users.map((item) => ({ name: item.name, email: item.email, phone: item.phone, accountType: [1, 3].includes(Number(item.role)) ? 'Administrator' : 'User', role: item.roleProfile?.name || 'Administrator', verified: item.isVerified ? 'Yes' : 'No', createdAt: item.createdAt }))));
    if (wanted.has('leadsAssigned')) sections.push(section('leadsAssigned', 'Leads assigned', leadColumns, assigned.map(leadRow)));
    if (wanted.has('leadsCreated')) sections.push(section('leadsCreated', 'Leads created', leadColumns, created.map(leadRow)));
    if (wanted.has('customers')) sections.push(section('customers', 'Customers managed', [col('user', 'Assigned user'), col('company', 'Company'), col('name', 'Customer'), col('role', 'Role'), col('phone', 'Phone'), col('email', 'Email')], assigned.flatMap((lead) => (lead.companyPersons || []).map((person) => ({ user: lead.assignedTo?.name || '', company: lead.company || '', name: person.name || '', role: person.role || person.designation || '', phone: person.number || person.contactNumber || '', email: person.email || '' })))));
    if (wanted.has('followups')) {
      const rows = assigned.flatMap((lead) => (lead.followUps || [])
        .filter((item) => inRange(item.date, range))
        .map((item) => ({ company: lead.company || '', description: item.description || '', date: item.date, nextDate: item.nextDate, assignedTo: lead.assignedTo?.name || '' })));
      sections.push(section('followups', 'Follow-up activity', followupColumns, rows));
    }
    if (wanted.has('quotations')) sections.push(section('quotations', 'Quotations created', quoteColumns, quotes.map(quoteRow)));
    if (wanted.has('productsAdded')) sections.push(section('productsAdded', 'Products added', [col('createdBy', 'Created by'), col('code', 'Part code'), col('product', 'Product'), col('category', 'Category'), col('rate', 'Final rate', 'currency'), col('date', 'Created', 'date')], products.map((item) => ({ createdBy: item.createdBy?.name || '', code: item.partCode || item.code || '', product: item.description || item.name || '', category: item.category || '', rate: item.finalRate ?? item.mrp ?? 0, date: item.createdAt }))));
    if (wanted.has('categoriesAdded')) sections.push(section('categoriesAdded', 'Categories added', [col('createdBy', 'Created by'), col('category', 'Category'), col('subCategories', 'Sub-categories', 'number'), col('date', 'Created', 'date')], categories.map((item) => ({ createdBy: item.createdBy?.name || '', category: item.name, subCategories: item.subCategories?.length || 0, date: item.createdAt }))));
    if (wanted.has('performance')) { const metrics = await quotationMetrics(quotes); sections.push(section('performance', 'Sales value & estimated profit', [col('user', 'User'), col('assignedLeads', 'Assigned leads', 'number'), col('createdLeads', 'Created leads', 'number'), col('quotations', 'Quotations', 'number'), col('quotationValue', 'Quotation value', 'currency'), col('acceptedValue', 'Accepted value', 'currency'), col('estimatedProfit', 'Estimated profit', 'currency')], users.map((user) => { const ownQuotes = quotes.filter((quote) => id(quote.createdBy) === id(user)); return { user: user.name, assignedLeads: assigned.filter((lead) => id(lead.assignedTo) === id(user)).length, createdLeads: created.filter((lead) => id(lead.createdBy) === id(user)).length, quotations: ownQuotes.length, quotationValue: ownQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0), acceptedValue: ownQuotes.filter((quote) => quote.status === 'Accepted').reduce((sum, quote) => sum + Number(quote.amount || 0), 0), estimatedProfit: ownQuotes.reduce((sum, quote) => sum + Number(metrics.get(id(quote))?.profit || 0), 0) }; }))); }
  }
  if (moduleKey === 'leads') {
    const leads = await Lead.find({ ...leadScope(request), _id: { $in: validIds(selectedIds) } }).populate('assignedTo createdBy', 'name').lean();
    const quotes = await Quotation.find({ ...quoteScope(request), leadId: { $in: leads.map((item) => item._id) }, ...dateQuery('quotationDate', range) }).populate('createdBy', 'name').lean();
    if (wanted.has('details')) sections.push(section('details', 'Lead details', [...leadColumns, col('createdBy', 'Created by')], leads.map(leadRow)));
    if (wanted.has('contacts')) sections.push(section('contacts', 'Customer contacts', [col('company', 'Company'), col('name', 'Name'), col('role', 'Role'), col('department', 'Department'), col('phone', 'Phone'), col('email', 'Email')], leads.flatMap((lead) => (lead.companyPersons || []).map((person) => ({ company: lead.company || '', name: person.name || '', role: person.role || person.designation || '', department: person.department || '', phone: person.number || person.contactNumber || '', email: person.email || '' })))));
    if (wanted.has('followups')) {
      const rows = leads.flatMap((lead) => (lead.followUps || [])
        .filter((item) => inRange(item.date, range))
        .map((item) => ({ company: lead.company || '', description: item.description || '', date: item.date, nextDate: item.nextDate, assignedTo: lead.assignedTo?.name || '' })));
      sections.push(section('followups', 'Follow-up history', followupColumns, rows));
    }
    if (wanted.has('quotations')) sections.push(section('quotations', 'Related quotations', quoteColumns, quotes.map(quoteRow)));
    if (wanted.has('items')) {
      const rows = quotes.flatMap((quote) => (quote.items || []).map((item) => ({ quotation: qNumber(quote), company: quote.company || '', product: item.productName || '', code: item.productCode || '', quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discountAmount || 0, total: item.lineTotal || 0 })));
      sections.push(section('items', 'Quoted products', itemColumns, rows));
    }
    if (wanted.has('performance')) { const metrics = await quotationMetrics(quotes); sections.push(section('performance', 'Lead value & estimated profit', [col('lead', 'Lead'), col('quotations', 'Quotations', 'number'), col('value', 'Quotation value', 'currency'), col('accepted', 'Accepted value', 'currency'), col('estimatedProfit', 'Estimated profit', 'currency')], leads.map((lead) => { const own = quotes.filter((quote) => id(quote.leadId) === id(lead)); return { lead: lead.company || lead.name || '', quotations: own.length, value: own.reduce((sum, quote) => sum + Number(quote.amount || 0), 0), accepted: own.filter((quote) => quote.status === 'Accepted').reduce((sum, quote) => sum + Number(quote.amount || 0), 0), estimatedProfit: own.reduce((sum, quote) => sum + Number(metrics.get(id(quote))?.profit || 0), 0) }; }))); }
  }
  if (moduleKey === 'customers') {
    const leads = await Lead.find(leadScope(request, 'customers')).populate('assignedTo', 'name').lean();
    const customers = leads.flatMap((lead) => (lead.companyPersons || []).filter((person) => selected.has(id(person))).map((person) => ({ person, lead })));
    const leadIds = [...new Set(customers.map(({ lead }) => id(lead)))];
    const quotes = await Quotation.find({ ...quoteScope(request), leadId: { $in: validIds(leadIds) }, ...dateQuery('quotationDate', range) }).populate('createdBy', 'name').lean();
    const customerQuotes = quotes.filter((quote) => customers.some(({ person, lead }) => id(lead) === id(quote.leadId) && (id(person) === id(quote.contactPersonId) || (!quote.contactPersonId && text(person.name).toLowerCase() === text(quote.contactName || quote.customerName).toLowerCase()))));
    if (wanted.has('details')) sections.push(section('details', 'Customer details', [col('company', 'Company'), col('name', 'Name'), col('role', 'Role'), col('department', 'Department'), col('phone', 'Phone'), col('email', 'Email'), col('city', 'City'), col('assignedTo', 'Assigned to')], customers.map(({ person, lead }) => ({ company: lead.company || '', name: person.name || '', role: person.role || person.designation || '', department: person.department || '', phone: person.number || person.contactNumber || '', email: person.email || '', city: lead.city || '', assignedTo: lead.assignedTo?.name || '' }))));
    if (wanted.has('leads')) sections.push(section('leads', 'Company/lead details', leadColumns, [...new Map(customers.map(({ lead }) => [id(lead), lead])).values()].map(leadRow)));
    if (wanted.has('followups')) {
      const rows = [...new Map(customers.map(({ lead }) => [id(lead), lead])).values()]
        .flatMap((lead) => (lead.followUps || []).filter((item) => inRange(item.date, range)).map((item) => ({ company: lead.company || '', description: item.description || '', date: item.date, nextDate: item.nextDate, assignedTo: lead.assignedTo?.name || '' })));
      sections.push(section('followups', 'Company follow-ups', followupColumns, rows));
    }
    if (wanted.has('quotations')) sections.push(section('quotations', 'Customer quotations', quoteColumns, customerQuotes.map(quoteRow)));
    if (wanted.has('performance')) { const metrics = await quotationMetrics(customerQuotes); sections.push(section('performance', 'Customer value & estimated profit', [col('customer', 'Customer'), col('company', 'Company'), col('quotations', 'Quotations', 'number'), col('value', 'Quotation value', 'currency'), col('accepted', 'Accepted value', 'currency'), col('estimatedProfit', 'Estimated profit', 'currency')], customers.map(({ person, lead }) => { const own = customerQuotes.filter((quote) => id(lead) === id(quote.leadId) && (id(person) === id(quote.contactPersonId) || text(person.name).toLowerCase() === text(quote.contactName || quote.customerName).toLowerCase())); return { customer: person.name || '', company: lead.company || '', quotations: own.length, value: own.reduce((sum, quote) => sum + Number(quote.amount || 0), 0), accepted: own.filter((quote) => quote.status === 'Accepted').reduce((sum, quote) => sum + Number(quote.amount || 0), 0), estimatedProfit: own.reduce((sum, quote) => sum + Number(metrics.get(id(quote))?.profit || 0), 0) }; }))); }
  }
  if (moduleKey === 'followups') {
    const leads = await Lead.find(leadScope(request)).populate('assignedTo', 'name').lean();
    const rows = leads.flatMap((lead) => (lead.followUps || []).filter((item) => selected.has(id(item)) && inRange(item.date, range)).map((item) => ({ lead, item })));
    if (wanted.has('details')) sections.push(section('details', 'Follow-up details', followupColumns, rows.map(({ lead, item }) => ({ company: lead.company || '', description: item.description || '', date: item.date, nextDate: item.nextDate, assignedTo: lead.assignedTo?.name || '' }))));
    if (wanted.has('leads')) sections.push(section('leads', 'Related lead details', leadColumns, [...new Map(rows.map(({ lead }) => [id(lead), lead])).values()].map(leadRow)));
  }
  if (moduleKey === 'quotations') {
    const quotes = await Quotation.find({ ...quoteScope(request), _id: { $in: validIds(selectedIds) } }).populate('createdBy', 'name').lean();
    const dated = quotes.filter((item) => inRange(item.quotationDate || item.createdAt, range));
    if (wanted.has('details')) sections.push(section('details', 'Quotation details', quoteColumns, dated.map(quoteRow)));
    if (wanted.has('items')) {
      const rows = dated.flatMap((quote) => (quote.items || []).map((item) => ({ quotation: qNumber(quote), company: quote.company || '', product: item.productName || '', code: item.productCode || '', quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discountAmount || 0, total: item.lineTotal || 0 })));
      sections.push(section('items', 'Quotation items', itemColumns, rows));
    }
    if (wanted.has('financials')) { const metrics = await quotationMetrics(dated); sections.push(section('financials', 'Financial & estimated profit', [col('quotation', 'Quotation'), col('company', 'Company'), col('status', 'Status'), col('subtotal', 'Subtotal', 'currency'), col('discount', 'Discount', 'currency'), col('freight', 'Freight', 'currency'), col('amount', 'Revenue', 'currency'), col('cost', 'Estimated cost', 'currency'), col('profit', 'Estimated profit', 'currency')], dated.map((quote) => ({ quotation: qNumber(quote), company: quote.company || '', status: quote.status, subtotal: quote.subtotal ?? quote.amount, discount: Number(quote.discountAmount || 0) + Number(quote.generalDiscountAmount || 0), freight: quote.freightPacking || 0, amount: quote.amount || 0, cost: metrics.get(id(quote))?.cost || 0, profit: metrics.get(id(quote))?.profit || 0 })))); }
    if (wanted.has('revisions')) { const roots = [...new Set(quotes.map((item) => id(item.revisionRoot || item._id)))]; const history = await Quotation.find({ $or: [{ _id: { $in: validIds(roots) } }, { revisionRoot: { $in: validIds(roots) } }] }).populate('createdBy', 'name').sort({ revisionNumber: 1 }).lean(); sections.push(section('revisions', 'Revision history', quoteColumns, history.filter((item) => inRange(item.quotationDate || item.createdAt, range)).map(quoteRow))); }
  }
  if (moduleKey === 'products' || moduleKey === 'categories') {
    const categories = moduleKey === 'categories' ? await Category.find({ _id: { $in: validIds(selectedIds) } }).lean() : [];
    const categoryNames = new Set(categories.map((item) => item.name));
    const products = await Product.find(moduleKey === 'products' ? { _id: { $in: validIds(selectedIds) } } : { category: { $in: [...categoryNames] } }).lean();
    const productIds = products.map((item) => item._id);
    const quotes = (await Quotation.find({ ...quoteScope(request), 'items.productId': { $in: productIds }, ...dateQuery('quotationDate', range) }).lean());
    if (moduleKey === 'products' && wanted.has('details')) sections.push(section('details', 'Product details', [col('code', 'Part code'), col('product', 'Product'), col('brand', 'Brand'), col('category', 'Category'), col('hsn', 'HSN'), col('gst', 'GST', 'percent'), col('rate', 'Final rate', 'currency'), col('margin', 'Margin', 'percent'), col('status', 'Status')], products.map((item) => ({ code: item.partCode || item.code || '', product: item.description || item.name || '', brand: item.brand || '', category: join([item.category, item.subCategory, item.subSubCategory]), hsn: item.hsnCode || '', gst: item.taxRate || 0, rate: item.finalRate ?? item.mrp ?? 0, margin: item.marginPercent || 0, status: item.isActive === false ? 'Inactive' : 'Active' }))));
    if (moduleKey === 'categories' && wanted.has('details')) sections.push(section('details', 'Category hierarchy', [col('category', 'Category'), col('subCategories', 'Sub-categories'), col('subSubCategories', 'Sub-sub-categories')], categories.map((item) => ({ category: item.name, subCategories: join((item.subCategories || []).map((sub) => sub.name)), subSubCategories: join((item.subCategories || []).flatMap((sub) => (sub.subSubCategories || []).map((child) => `${sub.name} / ${child.name}`))) }))));
    if (moduleKey === 'categories' && wanted.has('products')) sections.push(section('products', 'Products in category', [col('category', 'Category'), col('code', 'Part code'), col('product', 'Product'), col('brand', 'Brand'), col('rate', 'Rate', 'currency'), col('status', 'Status')], products.map((item) => ({ category: item.category || '', code: item.partCode || item.code || '', product: item.description || item.name || '', brand: item.brand || '', rate: item.finalRate ?? item.mrp ?? 0, status: item.isActive === false ? 'Inactive' : 'Active' }))));
    const usageRows = quotes.flatMap((quote) => (quote.items || []).filter((item) => productIds.some((productId) => id(productId) === id(item.productId))).map((item) => ({ quotation: qNumber(quote), company: quote.company || '', product: item.productName || '', code: item.productCode || '', quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discountAmount || 0, total: item.lineTotal || 0 })));
    if (wanted.has('usage')) sections.push(section('usage', 'Quotation usage', itemColumns, usageRows));
    if (wanted.has('performance')) { const productMap = new Map(products.map((item) => [id(item), item])); const groupItems = moduleKey === 'products' ? products.map((item) => ({ key: id(item), label: item.description || item.name || '', productIds: [id(item)] })) : categories.map((category) => ({ key: id(category), label: category.name, productIds: products.filter((item) => item.category === category.name).map(id) })); sections.push(section('performance', moduleKey === 'products' ? 'Product sales & estimated profit' : 'Category sales & estimated profit', [col('name', moduleKey === 'products' ? 'Product' : 'Category'), col('productCount', 'Products', 'number'), col('quotations', 'Quotations', 'number'), col('quantity', 'Quoted qty', 'number'), col('revenue', 'Revenue', 'currency'), col('accepted', 'Accepted value', 'currency'), col('profit', 'Estimated profit', 'currency')], groupItems.map((group) => { const matched = quotes.flatMap((quote) => (quote.items || []).filter((item) => group.productIds.includes(id(item.productId))).map((item) => ({ quote, item }))); return { name: group.label, productCount: group.productIds.length, quotations: new Set(matched.map(({ quote }) => id(quote))).size, quantity: matched.reduce((sum, row) => sum + Number(row.item.quantity || 0), 0), revenue: matched.reduce((sum, row) => sum + Number(row.item.lineTotal || 0), 0), accepted: matched.filter((row) => row.quote.status === 'Accepted').reduce((sum, row) => sum + Number(row.item.lineTotal || 0), 0), profit: matched.reduce((sum, row) => { const product = productMap.get(id(row.item.productId)); const cost = Number(product?.convertedAmount || 0) * Number(product?.priceMultiplier || 1) * Number(row.item.quantity || 0); return sum + Number(row.item.lineTotal || 0) - cost; }, 0) }; }))); }
  }
  if (moduleKey === 'roles') {
    const roles = await Role.find({ _id: { $in: validIds(selectedIds) } }).lean();
    const users = await User.find({ roleProfile: { $in: roles.map((item) => item._id) } }).populate('roleProfile', 'name').lean();
    if (wanted.has('details')) sections.push(section('details', 'Role details', [col('name', 'Role'), col('description', 'Description'), col('status', 'Status'), col('permissions', 'Permissions', 'number'), col('permissionList', 'Permission list')], roles.map((item) => ({ name: item.name, description: item.description || '', status: item.isActive === false ? 'Inactive' : 'Active', permissions: item.permissions?.length || 0, permissionList: join(item.permissions || []) }))));
    if (wanted.has('users')) sections.push(section('users', 'Users assigned', [col('role', 'Role'), col('name', 'Name'), col('email', 'Email'), col('phone', 'Phone'), col('joined', 'Joined', 'date')], users.map((item) => ({ role: item.roleProfile?.name || '', name: item.name, email: item.email, phone: item.phone, joined: item.createdAt }))));
    if (wanted.has('performance')) { const userIds = users.map((item) => item._id); const [leads, quotes] = await Promise.all([Lead.find({ assignedTo: { $in: userIds }, ...dateQuery('createdAt', range) }).lean(), Quotation.find({ createdBy: { $in: userIds }, ...dateQuery('quotationDate', range) }).lean()]); const metrics = await quotationMetrics(quotes); sections.push(section('performance', 'Team activity & sales', [col('role', 'Role'), col('users', 'Users', 'number'), col('leads', 'Assigned leads', 'number'), col('quotations', 'Quotations', 'number'), col('value', 'Quotation value', 'currency'), col('accepted', 'Accepted value', 'currency'), col('profit', 'Estimated profit', 'currency')], roles.map((role) => { const members = users.filter((user) => id(user.roleProfile) === id(role)); const memberIds = new Set(members.map(id)); const ownQuotes = quotes.filter((quote) => memberIds.has(id(quote.createdBy))); return { role: role.name, users: members.length, leads: leads.filter((lead) => memberIds.has(id(lead.assignedTo))).length, quotations: ownQuotes.length, value: ownQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0), accepted: ownQuotes.filter((quote) => quote.status === 'Accepted').reduce((sum, quote) => sum + Number(quote.amount || 0), 0), profit: ownQuotes.reduce((sum, quote) => sum + Number(metrics.get(id(quote))?.profit || 0), 0) }; }))); }
  }
  if (moduleKey === 'whatsapp') {
    const events = await WhatsAppEvent.find({ _id: { $in: validIds(selectedIds) } }).populate('lead', 'company city status').lean();
    const dated = events.filter((item) => inRange(item.receivedAt || item.createdAt, range));
    if (wanted.has('details')) sections.push(section('details', 'Message activity', [col('name', 'Name'), col('phone', 'Phone'), col('message', 'Message'), col('outcome', 'Outcome'), col('attempts', 'Attempts', 'number'), col('error', 'Error'), col('receivedAt', 'Received', 'date')], dated.map((item) => ({ name: item.name || '', phone: item.phone || item.sender || '', message: item.body || '', outcome: item.outcome || '', attempts: item.attempts || 0, error: item.error || '', receivedAt: item.receivedAt || item.createdAt }))));
    if (wanted.has('leads')) sections.push(section('leads', 'Leads created/found', [col('sender', 'Sender'), col('company', 'Lead company'), col('city', 'City'), col('status', 'Status'), col('outcome', 'WhatsApp outcome')], dated.filter((item) => item.lead).map((item) => ({ sender: item.name || item.phone || '', company: item.lead?.company || '', city: item.lead?.city || '', status: item.lead?.status || '', outcome: item.outcome || '' }))));
    if (wanted.has('outcomes')) sections.push(section('outcomes', 'Outcome summary', [col('outcome', 'Outcome'), col('records', 'Records', 'number')], ['created', 'existing', 'failed', 'pending'].map((outcome) => ({ outcome, records: dated.filter((item) => item.outcome === outcome).length }))));
  }
  return sections;
}

router.use(requireAuth, requirePermission('reports.view'));
router.get('/catalog', (request, response) => response.json({ modules: allowedModules(request).map(([key, item]) => ({ key, label: item.label, singular: item.singular, reports: item.reports })) }));
router.get('/options', async (request, response, next) => { try { const moduleKey = text(request.query.module); if (!allowedModules(request).some(([key]) => key === moduleKey)) return response.status(403).json({ message: 'You do not have permission to report on this module.' }); return response.json({ options: await loadOptions(request, moduleKey) }); } catch (error) { return next(error); } });
router.post('/preview', async (request, response, next) => {
  try {
    const moduleKey = text(request.body?.module);
    const definition = modules[moduleKey];
    if (!definition || !allowedModules(request).some(([key]) => key === moduleKey)) return response.status(403).json({ message: 'You do not have permission to report on this module.' });
    const selectedIds = [...new Set(Array.isArray(request.body.selectedIds) ? request.body.selectedIds.map(String) : [])];
    const selectedReports = [...new Set(Array.isArray(request.body.reports) ? request.body.reports : [])].filter((key) => definition.reports.some((item) => item.key === key));
    if (!selectedIds.length) return response.status(400).json({ message: `Select at least one ${definition.singular}.` });
    if (!selectedReports.length) return response.status(400).json({ message: 'Select at least one type of information.' });
    const range = rangeFrom(request.body);
    if (range === false) return response.status(400).json({ message: 'Select a valid date range.' });
    const sections = await buildSections(request, moduleKey, selectedIds, selectedReports, range);
    return response.json({ module: moduleKey, title: `${definition.label} Report`, selectedCount: selectedIds.length, generatedAt: new Date().toISOString(), dateFrom: request.body.dateFrom || '', dateTo: request.body.dateTo || '', sections, totalRows: sections.reduce((sum, item) => sum + item.rows.length, 0) });
  } catch (error) { return next(error); }
});

export default router;

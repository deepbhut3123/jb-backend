import { Router } from 'express';
import Category from '../models/Category.js';
import Lead from '../models/Lead.js';
import Product from '../models/Product.js';
import Quotation from '../models/Quotation.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const isAdmin = (user) => [1, 3].includes(user.role);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matches = (value, regex) => regex.test(String(value || ''));

router.get('/', requireAuth, async (request, response, next) => {
  try {
    const query = String(request.query.q || '').trim().slice(0, 80);
    if (query.length < 2) return response.json({ results: [] });
    const regex = new RegExp(escapeRegex(query), 'i');
    const admin = isAdmin(request.user);
    const leadScope = admin ? {} : { assignedTo: request.user._id };
    const quotationScope = admin ? {} : { createdBy: request.user._id };
    const leadMatch = {
      ...leadScope,
      $or: [
        { company: regex }, { address1: regex }, { address2: regex }, { area: regex }, { city: regex }, { state: regex },
        { website: regex }, { customerType: regex }, { segment: regex }, { leadSource: regex }, { status: regex },
        { 'companyPersons.name': regex }, { 'companyPersons.role': regex }, { 'companyPersons.number': regex }, { 'companyPersons.email': regex },
      ],
    };
    const quotationMatch = {
      ...quotationScope,
      $or: [
        { company: regex }, { contactName: regex }, { contactRole: regex }, { email: regex }, { phone: regex }, { status: regex },
        { 'items.productName': regex }, { 'items.productCode': regex }, { 'items.description': regex },
      ],
    };

    const [leads, quotations, products, categories, users] = await Promise.all([
      Lead.find(leadMatch).select('company city state status companyPersons').sort({ updatedAt: -1 }).limit(8).lean(),
      Quotation.find(quotationMatch).select('company contactName status items revisionRoot revisionNumber quotationDate').sort({ quotationDate: -1 }).limit(8).lean(),
      admin ? Product.find({ $or: [{ partCode: regex }, { code: regex }, { name: regex }, { description: regex }, { brand: regex }, { category: regex }, { subCategory: regex }, { subSubCategory: regex }, { hsnCode: regex }] }).select('partCode code name description brand category').limit(8).lean() : [],
      admin ? Category.find({ $or: [{ name: regex }, { 'subCategories.name': regex }, { 'subCategories.subSubCategories.name': regex }] }).select('name subCategories').limit(8).lean() : [],
      admin ? User.find({ $or: [{ name: regex }, { email: regex }, { phone: regex }] }).select('name email phone role').limit(8).lean() : [],
    ]);

    const customerResults = leads.flatMap((lead) => (lead.companyPersons || [])
      .filter((person) => [person.name, person.role, person.number, person.email, lead.company].some((value) => matches(value, regex)))
      .slice(0, 4)
      .map((person) => ({
        id: String(person._id), module: 'Customers', section: 'customers', title: person.name || 'Unnamed customer',
        subtitle: [lead.company, person.role, person.number || person.email].filter(Boolean).join(' · '), leadId: String(lead._id),
      }))).slice(0, 8);

    const combinedResults = [
      ...leads.map((lead) => ({ id: String(lead._id), module: 'Leads', section: 'leads', title: lead.company || 'Unnamed company', subtitle: [lead.city, lead.state, lead.status].filter(Boolean).join(' · ') })),
      ...customerResults,
      ...quotations.map((quotation) => ({ id: String(quotation.revisionRoot || quotation._id), module: 'Quotations', section: 'quotations', title: quotation.company || quotation.contactName || 'Quotation', subtitle: [quotation.items?.map((item) => item.productCode || item.productName).filter(Boolean).join(', '), quotation.status].filter(Boolean).join(' · ') })),
      ...products.map((product) => ({ id: String(product._id), module: 'Products', section: 'products', title: product.partCode || product.code || product.name || 'Product', subtitle: [product.description || product.name, product.brand, product.category].filter(Boolean).join(' · ') })),
      ...categories.map((category) => ({ id: String(category._id), module: 'Categories', section: 'categories', title: category.name, subtitle: 'Product category' })),
      ...users.map((user) => ({ id: String(user._id), module: 'User Management', section: 'users', title: user.name, subtitle: [user.email, user.phone].filter(Boolean).join(' · ') })),
    ];
    const seen = new Set();
    const results = combinedResults.filter((result) => {
      const key = `${result.module}:${result.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return response.json({ results, query });
  } catch (error) { return next(error); }
});

export default router;

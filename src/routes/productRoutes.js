import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const taxRates = [0, 5, 12, 18, 28];
const productRoutesDirectory = path.dirname(fileURLToPath(import.meta.url));
const productImageDirectory = path.join(productRoutesDirectory, '..', '..', 'public', 'products');
const imageStorage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    fs.mkdirSync(productImageDirectory, { recursive: true });
    callback(null, productImageDirectory);
  },
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});
const uploadProductImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith('image/')) return callback(null, true);
    return callback(new Error('Only image files are allowed.'));
  },
});

function requireAdmin(request, response, next) {
  if (![1, 3].includes(request.user.role)) return response.status(403).json({ message: 'Only administrators can manage Product Master.' });
  return next();
}

function normalizeProduct(body = {}, imageFile) {
  return {
    name: String(body.name || body.description || '').trim(),
    partCode: String(body.partCode || body.code || '').trim().toUpperCase(),
    code: String(body.partCode || body.code || '').trim().toUpperCase(),
    description: String(body.description || '').trim(),
    brand: String(body.brand || '').trim(),
    category: String(body.category || '').trim(),
    subCategory: String(body.subCategory || '').trim(),
    subSubCategory: String(body.subSubCategory || '').trim(),
    image: imageFile ? `/public/products/${imageFile.filename}` : String(body.image || '').trim(),
    taxRate: body.taxRate === '' || body.taxRate == null ? Number.NaN : Number(body.taxRate),
    hsnCode: String(body.hsnCode || '').trim(),
    mrp: body.mrp === '' || body.mrp == null ? Number.NaN : Number(body.mrp),
    isActive: body.isActive !== false,
  };
}

function validateProduct(product) {
  if (!product.partCode || !product.description || !product.category) return 'Part code, description, and category are required.';
  if (!Number.isFinite(product.mrp) || product.mrp < 0) return 'MRP must be a valid non-negative number.';
  if (!taxRates.includes(product.taxRate)) return 'Please select a valid GST rate.';
  return null;
}

router.use(requireAuth);

router.get('/', async (request, response, next) => {
  try {
    const page = Math.max(Number.parseInt(request.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 10, 1), 1000);
    const filter = {};
    if (request.query.status === 'active') filter.isActive = true;
    if (request.query.status === 'inactive') filter.isActive = false;
    if (request.query.search?.trim()) { const query = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ partCode: { $regex: query, $options: 'i' } }, { code: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }, { name: { $regex: query, $options: 'i' } }, { brand: { $regex: query, $options: 'i' } }, { category: { $regex: query, $options: 'i' } }, { subCategory: { $regex: query, $options: 'i' } }, { subSubCategory: { $regex: query, $options: 'i' } }, { hsnCode: { $regex: query, $options: 'i' } }]; }
    const [total, products] = await Promise.all([Product.countDocuments(filter), Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()]);
    return response.json({ products, pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } });
  } catch (error) { return next(error); }
});

router.use(requireAdmin);

router.post('/', uploadProductImage.single('image'), async (request, response, next) => {
  try {
    const productData = normalizeProduct(request.body, request.file);
    const validationError = validateProduct(productData);
    if (validationError) return response.status(400).json({ message: validationError });
    if (await Product.exists({ $or: [{ partCode: productData.partCode }, { code: productData.partCode }] })) return response.status(409).json({ message: 'A product with this part code already exists.' });
    const product = await Product.create({ ...productData, createdBy: request.user._id });
    return response.status(201).json({ product });
  } catch (error) { return next(error); }
});

router.put('/:id', uploadProductImage.single('image'), async (request, response, next) => {
  try {
    const existingProduct = await Product.findById(request.params.id).lean();
    if (!existingProduct) return response.status(404).json({ message: 'Product not found.' });
    const productData = normalizeProduct({ ...existingProduct, ...request.body }, request.file);
    const validationError = validateProduct(productData);
    if (validationError) return response.status(400).json({ message: validationError });
    if (await Product.exists({ $or: [{ partCode: productData.partCode }, { code: productData.partCode }], _id: { $ne: request.params.id } })) return response.status(409).json({ message: 'A product with this part code already exists.' });
    const product = await Product.findByIdAndUpdate(request.params.id, productData, { new: true, runValidators: true });
    return response.json({ product });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request, response, next) => {
  try {
    const product = await Product.findByIdAndDelete(request.params.id);
    if (!product) return response.status(404).json({ message: 'Product not found.' });
    return response.json({ message: 'Product deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;

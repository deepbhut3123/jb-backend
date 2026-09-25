import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';
import ProductPricingSettings from '../models/ProductPricingSettings.js';

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

async function removeStoredProductImage(image) {
  if (!String(image || '').startsWith('/public/products/')) return;
  const filename = path.basename(image);
  const target = path.join(productImageDirectory, filename);
  if (path.dirname(target) !== productImageDirectory) return;
  try { await fs.promises.unlink(target); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function requireAdmin(request, response, next) {
  if (![1, 3].includes(request.user.role)) return response.status(403).json({ message: 'Only administrators can manage Product Master.' });
  return next();
}

function normalizeProduct(body = {}, imageFile) {
  const hasDollarAmount = body.dollarAmount !== '' && body.dollarAmount != null;
  const dollarAmount = hasDollarAmount ? Number(body.dollarAmount) : 0;
  const dollarRate = body.dollarRate === '' || body.dollarRate == null ? 1 : Number(body.dollarRate);
  const marginPercent = body.marginPercent === '' || body.marginPercent == null ? 0 : Number(body.marginPercent);
  const priceMultiplier = body.priceMultiplier === '' || body.priceMultiplier == null ? 1 : Number(body.priceMultiplier);
  const convertedAmount = Number.isFinite(dollarAmount * dollarRate) ? Number((dollarAmount * dollarRate).toFixed(2)) : Number.NaN;
  const legacyMrp = body.mrp === '' || body.mrp == null ? Number.NaN : Number(body.mrp);
  const finalRate = !hasDollarAmount && Number.isFinite(legacyMrp) ? legacyMrp : (Number.isFinite(convertedAmount) ? Number((convertedAmount * (1 + marginPercent / 100) * priceMultiplier).toFixed(2)) : Number.NaN);
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
    // Keep the legacy MRP field synchronized so older tables and integrations use the finalized rate.
    mrp: finalRate,
    dollarAmount, convertedAmount, finalRate, dollarRate, marginPercent, priceMultiplier,
    isActive: body.isActive !== false,
  };
}

function validateProduct(product) {
  if (!product.partCode || !product.description || !product.category) return 'Part code, description, and category are required.';
  if (!Number.isFinite(product.mrp) || product.mrp < 0) return 'Price must be a valid non-negative number.';
  if (![product.dollarAmount, product.convertedAmount, product.finalRate, product.dollarRate, product.marginPercent, product.priceMultiplier].every((number) => Number.isFinite(number) && number >= 0)) return 'Pricing values must be valid non-negative numbers.';
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
    const settings = await ProductPricingSettings.findOne({ key: 'product-pricing' }).lean();
    const productData = normalizeProduct({ ...(settings || {}), ...request.body, dollarRate: request.body.dollarRate ?? settings?.dollarRate, marginPercent: request.body.marginPercent ?? 0, priceMultiplier: request.body.priceMultiplier ?? settings?.multiplier }, request.file);
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
    const settings = await ProductPricingSettings.findOne({ key: 'product-pricing' }).lean();
    const productData = normalizeProduct({ ...existingProduct, ...(settings || {}), ...request.body, dollarRate: request.body.dollarRate ?? existingProduct.dollarRate ?? settings?.dollarRate, marginPercent: request.body.marginPercent ?? existingProduct.marginPercent ?? 0, priceMultiplier: request.body.priceMultiplier ?? existingProduct.priceMultiplier ?? settings?.multiplier }, request.file);
    const validationError = validateProduct(productData);
    if (validationError) return response.status(400).json({ message: validationError });
    if (await Product.exists({ $or: [{ partCode: productData.partCode }, { code: productData.partCode }], _id: { $ne: request.params.id } })) return response.status(409).json({ message: 'A product with this part code already exists.' });
    const product = await Product.findByIdAndUpdate(request.params.id, productData, { new: true, runValidators: true });
    if (existingProduct.image && existingProduct.image !== product.image) await removeStoredProductImage(existingProduct.image);
    return response.json({ product });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request, response, next) => {
  try {
    const product = await Product.findByIdAndDelete(request.params.id);
    if (!product) return response.status(404).json({ message: 'Product not found.' });
    await removeStoredProductImage(product.image);
    return response.json({ message: 'Product deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;

import { Router } from 'express';
import Category from '../models/Category.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';

const router = Router();
const isAdmin = (user) => [1, 3].includes(user.role);

function requireAdmin(request, response, next) {
  if (!isAdmin(request.user)) return response.status(403).json({ message: 'Only administrators can manage categories.' });
  return next();
}

function cleanName(value) { return String(value || '').trim(); }

router.use(requireAuth);

router.get('/', requireAnyPermission('categories.view', 'products.view', 'quotations.view'), async (_request, response, next) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1, _id: -1 }).lean();
    return response.json({ categories });
  } catch (error) { return next(error); }
});

router.post('/', requirePermission('categories.create'), async (request, response, next) => {
  try {
    const name = cleanName(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Category name is required.' });
    const category = await Category.create({ name, createdBy: request.user._id });
    return response.status(201).json({ category });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: 'This category already exists.' });
    return next(error);
  }
});

router.put('/:id', requirePermission('categories.edit'), async (request, response, next) => {
  try {
    const name = cleanName(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Category name is required.' });
    const category = await Category.findByIdAndUpdate(request.params.id, { name }, { new: true, runValidators: true });
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    return response.json({ category });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: 'This category already exists.' });
    return next(error);
  }
});

router.delete('/:id', requirePermission('categories.delete'), async (request, response, next) => {
  try {
    const category = await Category.findByIdAndDelete(request.params.id);
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    return response.json({ message: 'Category deleted successfully.' });
  } catch (error) { return next(error); }
});

router.post('/:id/subcategories', requirePermission('categories.create'), async (request, response, next) => {
  try {
    const name = cleanName(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Sub category name is required.' });
    const category = await Category.findById(request.params.id);
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    if (category.subCategories.some((item) => item.name.toLowerCase() === name.toLowerCase())) return response.status(409).json({ message: 'This sub category already exists under the selected category.' });
    category.subCategories.unshift({ name });
    await category.save();
    return response.status(201).json({ category });
  } catch (error) { return next(error); }
});

router.put('/:id/subcategories/:subCategoryId', requirePermission('categories.edit'), async (request, response, next) => {
  try {
    const name = cleanName(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Sub category name is required.' });
    const category = await Category.findById(request.params.id);
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    const subCategory = category.subCategories.id(request.params.subCategoryId);
    if (!subCategory) return response.status(404).json({ message: 'Sub category not found.' });
    if (category.subCategories.some((item) => String(item._id) !== request.params.subCategoryId && item.name.toLowerCase() === name.toLowerCase())) return response.status(409).json({ message: 'This sub category already exists under the selected category.' });
    subCategory.name = name;
    await category.save();
    return response.json({ category });
  } catch (error) { return next(error); }
});

router.delete('/:id/subcategories/:subCategoryId', requirePermission('categories.delete'), async (request, response, next) => {
  try {
    const category = await Category.findById(request.params.id);
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    const subCategory = category.subCategories.id(request.params.subCategoryId);
    if (!subCategory) return response.status(404).json({ message: 'Sub category not found.' });
    subCategory.deleteOne();
    await category.save();
    return response.json({ category });
  } catch (error) { return next(error); }
});

router.post('/:id/subcategories/:subCategoryId/subsubcategories', requirePermission('categories.create'), async (request, response, next) => {
  try {
    const name = cleanName(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Sub-sub category name is required.' });
    const category = await Category.findById(request.params.id);
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    const subCategory = category.subCategories.id(request.params.subCategoryId);
    if (!subCategory) return response.status(404).json({ message: 'Sub category not found.' });
    if (subCategory.subSubCategories.some((item) => item.name.toLowerCase() === name.toLowerCase())) return response.status(409).json({ message: 'This sub-sub category already exists under the selected sub category.' });
    subCategory.subSubCategories.unshift({ name });
    await category.save();
    return response.status(201).json({ category });
  } catch (error) { return next(error); }
});

router.put('/:id/subcategories/:subCategoryId/subsubcategories/:subSubCategoryId', requirePermission('categories.edit'), async (request, response, next) => {
  try {
    const name = cleanName(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Sub-sub category name is required.' });
    const category = await Category.findById(request.params.id);
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    const subCategory = category.subCategories.id(request.params.subCategoryId);
    if (!subCategory) return response.status(404).json({ message: 'Sub category not found.' });
    const subSubCategory = subCategory.subSubCategories.id(request.params.subSubCategoryId);
    if (!subSubCategory) return response.status(404).json({ message: 'Sub-sub category not found.' });
    if (subCategory.subSubCategories.some((item) => String(item._id) !== request.params.subSubCategoryId && item.name.toLowerCase() === name.toLowerCase())) return response.status(409).json({ message: 'This sub-sub category already exists under the selected sub category.' });
    subSubCategory.name = name;
    await category.save();
    return response.json({ category });
  } catch (error) { return next(error); }
});

router.delete('/:id/subcategories/:subCategoryId/subsubcategories/:subSubCategoryId', requirePermission('categories.delete'), async (request, response, next) => {
  try {
    const category = await Category.findById(request.params.id);
    if (!category) return response.status(404).json({ message: 'Category not found.' });
    const subCategory = category.subCategories.id(request.params.subCategoryId);
    if (!subCategory) return response.status(404).json({ message: 'Sub category not found.' });
    const subSubCategory = subCategory.subSubCategories.id(request.params.subSubCategoryId);
    if (!subSubCategory) return response.status(404).json({ message: 'Sub-sub category not found.' });
    subSubCategory.deleteOne();
    await category.save();
    return response.json({ category });
  } catch (error) { return next(error); }
});

export default router;

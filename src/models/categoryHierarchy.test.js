import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Category from './Category.js';
import Product from './Product.js';

test('sub-sub categories are embedded under the selected sub category', async () => {
  const category = new Category({
    name: 'Hardware',
    createdBy: new mongoose.Types.ObjectId(),
    subCategories: [
      { name: 'Bolts', subSubCategories: [{ name: 'Steel' }] },
      { name: 'Nuts' },
    ],
  });
  await category.validate();
  const bolts = category.subCategories.id(category.subCategories[0]._id);
  assert.equal(bolts.subSubCategories.id(bolts.subSubCategories[0]._id).name, 'Steel');
  assert.equal(category.subCategories[1].subSubCategories.length, 0);
});

test('products retain a sub-sub category value', async () => {
  const product = new Product({ category: 'Hardware', subCategory: 'Bolts', subSubCategory: 'Steel', createdBy: new mongoose.Types.ObjectId() });
  await product.validate();
  assert.equal(product.toObject().subSubCategory, 'Steel');
});

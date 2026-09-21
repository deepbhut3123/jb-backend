import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Quotation from './Quotation.js';

function quotationData(overrides = {}) {
  return {
    leadId: new mongoose.Types.ObjectId(),
    company: 'Acme Industries',
    items: [{
      productId: new mongoose.Types.ObjectId(),
      productName: 'Bearing',
      quantity: 1,
      unitPrice: 100,
      lineSubtotal: 100,
      lineTotal: 100,
    }],
    subtotal: 100,
    amount: 100,
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

test('quotation contact name is optional', async () => {
  const quotation = new Quotation(quotationData());
  await quotation.validate();
  assert.equal(quotation.contactName, undefined);
});

test('quotation stores a selected person snapshot', async () => {
  const quotation = new Quotation(quotationData({ contactName: 'Priya', contactRole: 'Buyer', email: 'priya@example.com', phone: '123' }));
  await quotation.validate();
  assert.equal(quotation.contactName, 'Priya');
  assert.equal(quotation.contactRole, 'Buyer');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import router from '../src/routes/quotationRoutes.js';
import Quotation from '../src/models/Quotation.js';
import Product from '../src/models/Product.js';

const updateStatus = router.stack.find((layer) => layer.route?.path === '/:id/status' && layer.route.methods.patch).route.stack[0].handle;

function responseRecorder() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('status updates preserve quotation details and enforce ownership', async (context) => {
  context.mock.method(Product, 'find', () => { throw new Error('Status updates must not reload or reprice products.'); });
  for (const role of [1, 2, 3]) {
    for (const status of ['Draft', 'Sent', 'Accepted', 'Rejected']) {
      const saved = { _id: 'quotation-1', customerName: 'Customer', amount: 123, items: [{ productName: 'Saved product', unitPrice: 123 }], status };
      const update = context.mock.method(Quotation, 'findOneAndUpdate', (filter, changes, options) => {
        assert.deepEqual(filter, role === 2 ? { _id: 'quotation-1', createdBy: 'owner-1' } : { _id: 'quotation-1' });
        assert.deepEqual(changes, { $set: { status } });
        assert.deepEqual(options, { new: true, runValidators: true });
        return { populate: async () => ({ toObject: () => saved }) };
      });
      const response = responseRecorder();
      await updateStatus({ params: { id: 'quotation-1' }, user: { _id: 'owner-1', role }, body: { status, amount: 0, items: [] } }, response, (error) => { throw error; });
      assert.equal(response.code, 200);
      assert.equal(response.body.quotation.status, status);
      assert.equal(response.body.quotation.amount, 123);
      assert.deepEqual(response.body.quotation.items, saved.items);
      assert.equal(update.mock.callCount(), 1);
      update.mock.restore();
    }
  }
});

test('invalid statuses are rejected before updating a quotation', async (context) => {
  context.mock.method(Quotation, 'findOneAndUpdate', () => { throw new Error('Unexpected database write'); });
  for (const status of [undefined, '', 'Invalid', { $ne: 'Draft' }]) {
    const response = responseRecorder();
    await updateStatus({ body: { status } }, response, (error) => { throw error; });
    assert.equal(response.code, 400);
  }
});

test('missing or inaccessible quotations return 404', async (context) => {
  context.mock.method(Quotation, 'findOneAndUpdate', (filter) => {
    assert.deepEqual(filter, { _id: 'quotation-1', createdBy: 'other-user' });
    return { populate: async () => null };
  });
  const response = responseRecorder();
  await updateStatus({ params: { id: 'quotation-1' }, user: { _id: 'other-user', role: 2 }, body: { status: 'Sent' } }, response, (error) => { throw error; });
  assert.equal(response.code, 404);
});

test('database failures reach the error handler', async (context) => {
  const failure = new Error('Database unavailable');
  context.mock.method(Quotation, 'findOneAndUpdate', () => ({ populate: async () => { throw failure; } }));
  let received;
  await updateStatus({ params: { id: 'quotation-1' }, user: { _id: 'owner-1', role: 2 }, body: { status: 'Sent' } }, responseRecorder(), (error) => { received = error; });
  assert.equal(received, failure);
});

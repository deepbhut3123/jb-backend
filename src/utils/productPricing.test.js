import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProductPricing } from './productPricing.js';

test('USD product price uses exchange rate, margin, and multiplier', () => {
  const result = calculateProductPricing({ currency: 'USD', priceAmount: 10, dollarRate: 80, marginPercent: 10, priceMultiplier: 1.2 });
  assert.equal(result.finalRate, 1056);
  assert.equal(result.convertedAmount, 800);
  assert.equal(result.currency, 'USD');
});

test('INR product price remains direct and ignores conversion settings', () => {
  const result = calculateProductPricing({ currency: 'INR', priceAmount: 1250, dollarRate: 80, marginPercent: 10, priceMultiplier: 1.2 });
  assert.equal(result.finalRate, 1250);
  assert.equal(result.convertedAmount, 1250);
  assert.equal(result.dollarAmount, 0);
  assert.equal(result.marginPercent, 0);
  assert.equal(result.currency, 'INR');
});

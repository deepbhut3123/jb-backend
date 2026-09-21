import assert from 'node:assert/strict';
import test from 'node:test';
import { hasInvalidCompanyPersonEmail, normalizeCompanyPersons, serializeCompanyPersons } from './companyPersons.js';

test('company persons are optional and blank rows are removed', () => {
  assert.deepEqual(normalizeCompanyPersons(undefined), []);
  assert.deepEqual(normalizeCompanyPersons([{ name: ' ', role: '', number: '', email: '' }]), []);
});

test('partial people and legacy contact fields are normalized', () => {
  assert.deepEqual(normalizeCompanyPersons([
    { name: '  Priya  ', email: 'PRIYA@EXAMPLE.COM' },
    { designation: 'Buyer', contactNumber: ' +91 99999 99999 ', department: 'Sales' },
  ]), [
    { name: 'Priya', role: '', number: '', email: 'priya@example.com' },
    { name: '', role: 'Buyer', number: '+91 99999 99999', email: '' },
  ]);
});

test('person email validation ignores blanks and rejects invalid values', () => {
  assert.equal(hasInvalidCompanyPersonEmail(normalizeCompanyPersons([{ name: 'Only a name' }])), false);
  assert.equal(hasInvalidCompanyPersonEmail(normalizeCompanyPersons([{ email: 'invalid' }])), true);
  assert.equal(hasInvalidCompanyPersonEmail(normalizeCompanyPersons([{ email: 'valid@example.com' }])), false);
});

test('serialized people expose their stable id with canonical fields', () => {
  assert.deepEqual(serializeCompanyPersons([{ _id: 'person-1', designation: 'Buyer', contactNumber: '123' }]), [
    { _id: 'person-1', name: '', role: 'Buyer', number: '123', email: '' },
  ]);
});

test('normalization retains valid ids without retaining blank rows', () => {
  assert.deepEqual(normalizeCompanyPersons([
    { _id: '507f1f77bcf86cd799439011', name: 'Priya' },
    { _id: '507f1f77bcf86cd799439012', name: ' ' },
  ]), [{ _id: '507f1f77bcf86cd799439011', name: 'Priya', role: '', number: '', email: '' }]);
});

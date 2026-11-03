import mongoose from 'mongoose';

const salesOrderSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: undefined },
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
  company: { type: String, required: true, trim: true, maxlength: 120 },
  contactName: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, required: true, trim: true, maxlength: 160 },
    productCode: { type: String, trim: true, maxlength: 40, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    unit: { type: String, trim: true, maxlength: 30, default: '' },
    quantity: { type: Number, required: true, min: 0.01 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, min: 0, max: 100, default: 18 },
    lineTotal: { type: Number, required: true, min: 0 },
  }],
  subtotal: { type: Number, min: 0, default: 0 },
  freightPacking: { type: Number, min: 0, default: 0 },
  amount: { type: Number, min: 0, default: 0 },
  orderDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Pending', 'Processing', 'Completed', 'Cancelled'], default: 'Pending' },
  notes: { type: String, trim: true, maxlength: 3000, default: '' },
  source: { type: String, enum: ['lead-stage', 'lead-action', 'quotation-accepted', 'manual'], default: 'manual' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

salesOrderSchema.index({ leadId: 1 }, { unique: true, partialFilterExpression: { leadId: { $type: 'objectId' } } });
salesOrderSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model('SalesOrder', salesOrderSchema);

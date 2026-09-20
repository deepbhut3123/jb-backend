import mongoose from 'mongoose';

const quotationSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    revisedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
    revisionRoot: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null, index: true },
    revisionNumber: { type: Number, min: 0, default: 0 },
    quotationYear: { type: Number, min: 2000 },
    serialNumber: { type: Number, min: 1 },
    creatorInitial: { type: String, trim: true, uppercase: true, maxlength: 1 },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 30 },
    items: [{
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      productName: { type: String, required: true, trim: true },
      productCode: { type: String, trim: true },
      description: { type: String, trim: true, maxlength: 1000 },
      unit: { type: String, trim: true },
      quantity: { type: Number, required: true, min: 0.01 },
      unitPrice: { type: Number, required: true, min: 0 },
      taxRate: { type: Number, min: 0, max: 100 },
      lineSubtotal: { type: Number, required: true, min: 0 },
      discountPercent: { type: Number, min: 0, max: 100, default: 0 },
      discountAmount: { type: Number, min: 0, default: 0 },
      lineTotal: { type: Number, required: true, min: 0 },
    }],
    subtotal: { type: Number, required: true, min: 0 },
    freightPacking: { type: Number, min: 0, default: 0 },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    generalDiscountPercent: { type: Number, min: 0, max: 100, default: 0 },
    generalDiscountAmount: { type: Number, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    quotationDate: { type: Date, required: true, default: Date.now, index: true },
    status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Rejected'], default: 'Draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export default mongoose.model('Quotation', quotationSchema);

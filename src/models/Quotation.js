import mongoose from 'mongoose';

const quotationSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 30 },
    items: [{
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      productName: { type: String, required: true, trim: true },
      productCode: { type: String, trim: true },
      unit: { type: String, trim: true },
      quantity: { type: Number, required: true, min: 0.01 },
      unitPrice: { type: Number, required: true, min: 0 },
      taxRate: { type: Number, min: 0, max: 100 },
      lineTotal: { type: Number, required: true, min: 0 },
    }],
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Rejected'], default: 'Draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export default mongoose.model('Quotation', quotationSchema);

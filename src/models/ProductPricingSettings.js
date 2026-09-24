import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'product-pricing' },
  dollarRate: { type: Number, min: 0, default: 1 },
  multiplier: { type: Number, min: 0, default: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('ProductPricingSettings', schema);

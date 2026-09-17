import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    partCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true, maxlength: 40 },
    code: { type: String, trim: true, uppercase: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 1000 },
    hsnCode: { type: String, trim: true, maxlength: 20 },
    brand: { type: String, trim: true, maxlength: 80 },
    category: { type: String, trim: true, maxlength: 80 },
    subCategory: { type: String, trim: true, maxlength: 80 },
    subSubCategory: { type: String, trim: true, maxlength: 80 },
    image: { type: String, trim: true, maxlength: 500 },
    taxRate: { type: Number, min: 0, enum: [0, 5, 12, 18, 28], default: 18 },
    mrp: { type: Number, min: 0 },
    unit: { type: String, trim: true },
    purchasePrice: { type: Number, min: 0 },
    salePrice: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export default mongoose.model('Product', productSchema);

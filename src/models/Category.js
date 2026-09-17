import mongoose from 'mongoose';

const subSubCategorySchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true, maxlength: 80 } },
  { _id: true },
);

const subCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    subSubCategories: { type: [subSubCategorySchema], default: [] },
  },
  { _id: true },
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80, unique: true },
    subCategories: { type: [subCategorySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export default mongoose.model('Category', categorySchema);

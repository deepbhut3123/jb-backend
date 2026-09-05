import mongoose from 'mongoose';

const leadOptionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['customerType', 'segment', 'leadSource'], required: true },
    value: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { timestamps: true },
);

leadOptionSchema.index({ type: 1, value: 1 }, { unique: true });

export default mongoose.model('LeadOption', leadOptionSchema);
